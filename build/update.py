"""Daily site build for the public repo (GitHub Actions).

Fetches adjusted daily prices (Yahoo Finance; Nasdaq for the few tickers marked "nasdaq"), checks them,
recomputes every price-based number on the site, and writes a complete static site to --out.
The episode list, first mentions, entry days, quotes and translations are fixed inputs in
config/site_config.json (exported from the private research repo; transcripts and the database are not public).

Any problem (a ticker with no data, a suspicious price jump, stale data) stops the build with an error,
so GitHub Pages keeps serving the previous day's site and GitHub emails the repo owner.

Formulas (same as the research code):
- Entry: open price on the entry day (first US trading day after the episode is published).
- 12 months = 252 US trading days (SPY's trading days); exit at that day's close.
- Return = exit close / entry open - 1. Excess return = stock return - index return over the same days.
- "To date": entry open to the latest close.
- Path metrics (+/-10%, +/-20%): daily closes vs the entry open over the 12-month window.
"""

import argparse
import json
import math
import shutil
import sys
from bisect import bisect_left, bisect_right
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from statistics import median
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config" / "site_config.json"
SITE = ROOT / "site"
START = date(2019, 6, 1)
CHART_START = date(2020, 2, 1)
HORIZON = 252
THRESHOLDS = (0.10, 0.20)
NEW_YORK = ZoneInfo("America/New_York")
MAX_STALE_DAYS = 6  # SPY's latest close must be this recent, or the data is stale
EPS = 1e-9


class BuildError(Exception):
    pass


# ---- prices ---------------------------------------------------------------------------------------

@dataclass
class Series:
    dates: list
    opens: list
    closes: list
    allowed_jumps: frozenset = frozenset()

    def __post_init__(self):
        if not self.dates:
            raise BuildError("no data")
        if any(a >= b for a, b in zip(self.dates, self.dates[1:])):
            raise BuildError("dates out of order or duplicated")
        for d, o, c in zip(self.dates, self.opens, self.closes):
            if not (o > 0 and c > 0) or math.isnan(o) or math.isnan(c):
                raise BuildError(f"{d}: price not positive (open {o}, close {c})")
            if not 0.5 < c / o < 2.0 and d not in self.allowed_jumps:
                raise BuildError(f"{d}: close/open = {c / o:.2f}, likely mixed raw and adjusted prices")

    def index(self, d):
        i = bisect_left(self.dates, d)
        if i >= len(self.dates) or self.dates[i] != d:
            raise KeyError(f"no price on {d}")
        return i

    def close_on_or_before(self, d):
        i = bisect_right(self.dates, d)
        return self.closes[i - 1] if i > 0 else None


def last_closed_day(now: datetime) -> date:
    """Only use sessions that closed at least an hour ago (vendors finalize closes a bit late)."""
    ny = now.astimezone(NEW_YORK)
    day = ny.date()
    return day if ny.time() >= time(17, 0) else day - timedelta(days=1)


def frame_splits(df) -> dict:
    """Split ratios by date from a Yahoo history frame (empty for sources without that column)."""
    if "Stock Splits" not in getattr(df, "columns", []):
        return {}
    return {ts.date(): float(r) for ts, r in df["Stock Splits"].items() if r and float(r) > 0}


def fetch_forward_pe(ticker: str):
    """Forward P/E from Yahoo (analysts' estimate, now only). Any problem gives None; it never stops the build.
    Zero or negative means analysts expect a loss next fiscal year: "est_loss" (shown as an estimated loss)."""
    try:
        import yfinance as yf

        v = yf.Ticker(ticker).info.get("forwardPE")
        if not (isinstance(v, (int, float)) and math.isfinite(v)):
            return None
        return "est_loss" if v <= 0 else round(float(v), 2)
    except Exception:
        return None


def pe_now(price, eps, basis_date, splits):
    """P/E now = latest close / trailing-12-month diluted EPS (SEC, stored). A split after the EPS date divides the EPS.
    Loss (EPS <= 0) is "loss"; no EPS is None."""
    if eps is None:
        return None
    if eps <= 0:
        return "loss"
    basis = date.fromisoformat(basis_date) if basis_date else date.min
    for d, r in (splits or {}).items():
        if d > basis:
            eps /= r
    return None if not price else round(price / eps, 2)


def frame_to_series(df, now: datetime, jumps=frozenset()) -> Series:
    last = last_closed_day(now)
    rows = [(ts.date(), float(o), float(c)) for ts, o, c in zip(df.index, df["Open"], df["Close"])
            if START <= ts.date() <= last and not (math.isnan(float(o)) or math.isnan(float(c)))]
    return Series([r[0] for r in rows], [r[1] for r in rows], [r[2] for r in rows], jumps)


def fetch_yahoo(ticker: str):
    import yfinance as yf

    for attempt in range(3):
        try:
            df = yf.Ticker(ticker).history(start=START.isoformat(), auto_adjust=True)
            if len(df):
                return df
        except Exception as exc:  # network hiccups: retry, then fail the build
            err = exc
        import time as _t
        _t.sleep(3 * (attempt + 1))
    raise BuildError(f"{ticker}: Yahoo Finance returned no data" + (f" ({err})" if "err" in locals() else ""))


def fetch_nasdaq(ticker: str):
    import urllib.request

    import pandas as pd

    url = ("https://api.nasdaq.com/api/quote/{t}/historical?assetclass=stocks&fromdate={s}&todate={e}&limit=9999"
           .format(t=ticker, s=START.isoformat(), e=date.today().isoformat()))
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8")).get("data") or {}
    rows = (data.get("tradesTable") or {}).get("rows") or []
    if not rows:
        raise BuildError(f"{ticker}: Nasdaq returned no data")
    num = lambda x: float(x.replace("$", "").replace(",", "")) if x and x != "N/A" else float("nan")
    rows = sorted(rows, key=lambda r: pd.Timestamp(r["date"]))
    idx = pd.DatetimeIndex([pd.Timestamp(r["date"]) for r in rows])
    return pd.DataFrame({"Open": [num(r["open"]) for r in rows], "Close": [num(r["close"]) for r in rows]}, index=idx)


# ---- formulas ---------------------------------------------------------------------------------------

def exit_day(entry, n, days):
    i = bisect_left(days, entry)
    if i >= len(days) or days[i] != entry:
        raise BuildError(f"entry day {entry} is not a trading day")
    j = i + n
    return days[j] if j < len(days) else None


def hold_return(s: Series, entry, exit_):
    return s.closes[s.index(exit_)] / s.opens[s.index(entry)] - 1


def path_metrics(s: Series, entry, end, threshold):
    i = s.index(entry)
    j = (bisect_right(s.dates, end) if end is not None else len(s.dates)) - 1
    base = s.opens[i]
    rets = [s.closes[k] / base - 1 for k in range(i, j + 1)]
    up = next((t for t, r in enumerate(rets) if r >= threshold - EPS), None)
    down = next((t for t, r in enumerate(rets) if r <= -threshold + EPS), None)
    p = round(threshold * 100)
    first = ("neither" if up is None and down is None
             else f"+{p}%" if down is None or (up is not None and up < down) else f"-{p}%")
    hi = max(range(len(rets)), key=lambda t: (rets[t], -t))
    lo = min(range(len(rets)), key=lambda t: (rets[t], t))
    done = end is not None and s.dates[-1] >= end
    return {"first_hit": first, "days_to_up": up, "days_to_down": down, "max_gain": rets[hi], "max_gain_day": hi,
            "max_loss": rets[lo], "max_loss_day": lo, "days": len(rets) - 1, "done": done}


# ---- statistical tests (reference only; method fixed in the research spec before computing) ----------

BOOT_N, BOOT_SEED = 10_000, 20261115


def binom_pmf(n, k, p):
    return math.comb(n, k) * p ** k * (1 - p) ** (n - k)


def binom_test(k, n, p=0.5):
    """Exact two-sided p-value: sum of probabilities of outcomes no more likely than the observed one."""
    obs = binom_pmf(n, k, p)
    return min(1.0, sum(binom_pmf(n, i, p) for i in range(n + 1) if binom_pmf(n, i, p) <= obs * (1 + 1e-7)))


def clopper_pearson(k, n, alpha=0.05):
    """Exact 95% confidence interval for a proportion (bisection on the binomial tails).
    Lower bound: P(X >= k | p) = alpha/2. Upper bound: P(X <= k | p) = alpha/2."""
    def solve(tail, rising):  # tail(p) is monotone in p; find p where it equals alpha / 2
        lo, hi = 0.0, 1.0
        for _ in range(100):
            mid = (lo + hi) / 2
            below = tail(mid) < alpha / 2
            lo, hi = (mid, hi) if below == rising else (lo, mid)
        return (lo + hi) / 2
    lower = 0.0 if k == 0 else solve(lambda q: sum(binom_pmf(n, i, q) for i in range(k, n + 1)), rising=True)
    upper = 1.0 if k == n else solve(lambda q: sum(binom_pmf(n, i, q) for i in range(k + 1)), rising=False)
    return lower, upper


def bootstrap_ci(xs, stat, n_boot=BOOT_N, seed=BOOT_SEED):
    """Percentile 95% interval: resample with replacement n_boot times, fixed seed (same result every run)."""
    import random

    rng, n = random.Random(seed), len(xs)
    vals = sorted(stat([xs[rng.randrange(n)] for _ in range(n)]) for _ in range(n_boot))
    return vals[int(0.025 * n_boot)], vals[int(0.975 * n_boot) - 1]


def tests(xs):
    """Win-rate binomial test vs 50% with a Clopper-Pearson interval; bootstrap intervals for the mean and median."""
    if not xs:
        return None
    xs = sorted(xs)  # the bootstrap depends on order; sorting makes every caller get the same result
    n, k = len(xs), sum(x > 0 for x in xs)
    lo, hi = clopper_pearson(k, n)
    mean = sum(xs) / n
    return {"n": n, "wins": k, "p_value": r6(binom_test(k, n)), "win_ci": [r6(lo), r6(hi)],
            "mean": r6(mean), "mean_ci": [r6(v) for v in bootstrap_ci(xs, lambda v: sum(v) / len(v))],
            "median": r6(median(xs)), "median_ci": [r6(v) for v in bootstrap_ci(xs, median)],
            "boot_n": BOOT_N, "boot_seed": BOOT_SEED}


def win_median(xs):
    return {"win": sum(x > 0 for x in xs) / len(xs), "median": median(xs)} if xs else None


def r6(x):
    return None if x is None else round(x, 6)


def compute(cfg: dict, series: dict, spy: Series, sox: Series, splits: dict | None = None, fwd: dict | None = None) -> dict:
    """All price-based numbers. series: ticker -> Series (adjusted). splits/fwd: optional per-ticker split ratios and
    forward P/E (reference only). Returns the site's data files."""
    splits, fwd = splits or {}, fwd or {}
    price_date = spy.dates[-1]
    days = spy.dates
    bubbles, main_x, early_x, worst_x, paths_all = [], [], [], [], {0.10: [], 0.20: []}
    for st in cfg["stocks"]:
        t, entry = st["ticker"], date.fromisoformat(st["entry_day"])
        s = series[t]
        if s.dates[-1] < price_date - timedelta(days=14):
            raise BuildError(f"{t}: latest price {s.dates[-1]} is far behind {price_date} (halted or delisted?)")
        end = exit_day(entry, HORIZON, days)
        open_ = s.opens[s.index(entry)]
        ret = s.close_on_or_before(price_date) / open_ - 1
        bench = {k: b.close_on_or_before(price_date) / b.opens[b.index(entry)] - 1 for k, b in (("spy", spy), ("sox", sox))}
        paths = {}
        for th in THRESHOLDS:
            m = {who: path_metrics(x, entry, end, th) for who, x in (("stock", s), ("spy", spy), ("sox", sox))}
            paths[th] = m
            if not st["early"]:
                paths_all[th].append(m)
        p = {who: {**{k: r6(v) if isinstance(v, float) else v for k, v in paths[0.20][who].items()},
                   "first_hit_10": paths[0.10][who]["first_hit"], "days_to_up_10": paths[0.10][who]["days_to_up"],
                   "days_to_down_10": paths[0.10][who]["days_to_down"]} for who in ("stock", "spy", "sox")}
        if end is not None and s.dates[-1] >= end:
            x = hold_return(s, entry, end) - hold_return(spy, entry, end)
            (early_x if st["early"] else main_x).append(x)
            if not st["early"] and not st.get("delisted_later"):
                worst_x.append(x)
        bubbles.append({"ticker": t, "ep": st["ep"], "date": st["date"], "early": st["early"], "entry_open": r6(open_),
                        "to_date": {"USD": {"return": r6(ret), **{f"vs_{k}": r6(ret - v) for k, v in bench.items()},
                                            "bench": {k: r6(v) for k, v in bench.items()}}},
                        "window": {"start": entry.isoformat(), "end": end.isoformat() if end else None},
                        "paths": {"USD": p},
                        "pe": {"mention": st.get("pe_mention"),
                               "now": pe_now(s.close_on_or_before(price_date), st.get("eps_ttm"), st.get("eps_basis_date"),
                                             splits.get(t)),
                               "fwd": fwd.get(t)}})
    # worst case: excluded and later-delisted stocks count as -100% over their 12 months
    for w in cfg["wipeouts"]:
        entry = date.fromisoformat(w["entry_day"])
        end = exit_day(entry, HORIZON, days)
        if end is not None:
            worst_x.append(-1.0 - hold_return(spy, entry, end))

    def summary_paths(th):
        done = [m for m in paths_all[th] if m["stock"]["done"] and m["spy"]["done"]]
        out = {"n": len(done)}
        for who in ("stock", "spy") if done else ():
            ms = [d[who] for d in done]
            hit = [m["days_to_up"] for m in ms if m["days_to_up"] is not None]
            p = round(th * 100)
            out[who] = {"up_first": sum(m["first_hit"] == f"+{p}%" for m in ms) / len(ms),
                        "down_first": sum(m["first_hit"] == f"-{p}%" for m in ms) / len(ms),
                        "neither": sum(m["first_hit"] == "neither" for m in ms) / len(ms),
                        "no_up": 1 - len(hit) / len(ms), "days_to_up_median": median(hit) if hit else None,
                        "max_gain_median": median(m["max_gain"] for m in ms),
                        "max_loss_median": median(m["max_loss"] for m in ms)}
        return out

    n_main = sum(not s["early"] for s in cfg["stocks"])
    n_early = sum(s["early"] for s in cfg["stocks"])
    summary = {
        "price_date": price_date.isoformat(), "last_ep": cfg["last_ep"], "main_horizon": "12 個月",
        "main": {"n_stocks": cfg["n_stocks"], "computed": n_main, "done": len(main_x), "spy": win_median(main_x),
                 "0050": cfg["snapshot_0050"], "tests": tests(main_x)},
        "worst": {"done": len(worst_x), "spy": win_median(worst_x),
                  "missing": sum(w.get("kind") != "delisted" for w in cfg["wipeouts"]),
                  "delisted": sum(w.get("kind") == "delisted" for w in cfg["wipeouts"])},
        "early": {"n": n_early, "computed": n_early, "done": len(early_x), "spy": win_median(early_x)},
        "etfs": cfg["etfs"], "reclassified": cfg.get("reclassified", []), "bubbles": bubbles,
        "path_summary": {str(round(th * 100)): {"USD": summary_paths(th)} for th in THRESHOLDS},
    }
    chart_days = [d for d in days if d >= CHART_START]
    aligned = lambda x: [round(c, 4) if c is not None else None
                         for c in (dict(zip(x.dates, x.closes)).get(d) for d in chart_days)]
    benchmarks = {"dates": [d.isoformat() for d in chart_days], "spy": aligned(spy), "sox": aligned(sox)}
    prices = {t: {"c": aligned(series[t])} for t in {s["ticker"] for s in cfg["stocks"]}}
    return {"summary": summary, "benchmarks": benchmarks, "prices": prices, "events": cfg["events"]}


# ---- build ------------------------------------------------------------------------------------------

def load_config(path: Path = CONFIG) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def fetch_all(cfg: dict, now: datetime) -> tuple[dict, Series, Series, dict]:
    jumps = {t: frozenset(date.fromisoformat(d) for d in ds) for t, ds in cfg["price_exceptions"].items()}
    split_map = {}

    def get(t, src):
        df = (fetch_nasdaq if src == "nasdaq" else fetch_yahoo)(t)
        split_map[t] = frame_splits(df)
        return frame_to_series(df, now, jumps.get(t, frozenset()))

    errors, series = [], {}
    spy, sox = get("SPY", "yahoo"), get("^SOX", "yahoo")
    if spy.dates[-1] < now.date() - timedelta(days=MAX_STALE_DAYS):
        raise BuildError(f"SPY's latest close is {spy.dates[-1]}: data looks stale")
    if sox.dates[-1] != spy.dates[-1]:
        raise BuildError(f"^SOX latest {sox.dates[-1]} differs from SPY {spy.dates[-1]}")
    for st in cfg["stocks"]:
        try:
            series[st["ticker"]] = get(st["ticker"], st.get("source", "yahoo"))
        except (BuildError, KeyError, ValueError) as exc:
            errors.append(f"{st['ticker']}: {exc}")
    if errors:
        raise BuildError("price problems:\n  " + "\n  ".join(errors))
    return series, spy, sox, split_map


def write_site(data: dict, out: Path) -> None:
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(SITE, out)
    (out / "data" / "prices").mkdir(parents=True)
    dump = lambda p, obj: p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for name in ("summary", "benchmarks", "events"):
        dump(out / "data" / f"{name}.json", data[name])
    for t, p in data["prices"].items():
        dump(out / "data" / "prices" / f"{t}.json", p)
    (out / ".nojekyll").write_text("")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Fetch prices and build the static site")
    ap.add_argument("--out", type=Path, default=ROOT / "_site")
    args = ap.parse_args(argv)
    cfg = load_config()
    try:
        series, spy, sox, split_map = fetch_all(cfg, datetime.now(timezone.utc))
        fwd = {st["ticker"]: fetch_forward_pe(st["ticker"]) for st in cfg["stocks"]}  # reference only; never fails
        data = compute(cfg, series, spy, sox, split_map, fwd)
    except BuildError as exc:
        print(f"BUILD FAILED, nothing deployed: {exc}", file=sys.stderr)
        return 1
    write_site(data, args.out)
    s = data["summary"]
    print(f"prices through {s['price_date']}; main {s['main']['spy']['win']:.0%} of {s['main']['done']} beat SPY; "
          f"{len(s['bubbles'])} stocks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
