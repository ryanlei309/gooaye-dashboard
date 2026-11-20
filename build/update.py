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
import os
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
    """A reason not to deploy today. zh: a plain-language Chinese explanation for the Actions summary page."""

    def __init__(self, msg, zh=None):
        super().__init__(msg)
        self.zh = zh


NOTES: list[str] = []  # plain-language notes for the Actions summary (e.g. a stock that used Nasdaq today)


def step_summary(text: str) -> None:
    """Write to the GitHub Actions summary page (what the owner sees after clicking a failure email)."""
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(text + "\n")


def explain(t: str, exc: Exception) -> str:
    """One plain-language Chinese line per problem (2026-11-19)."""
    if getattr(exc, "zh", None):
        return exc.zh
    msg = str(exc)
    if "close/open" in msg:
        return (f"{t}：{msg.split(':')[0]} 這一天的收盤和開盤差超過一倍，可能是資料錯誤。要用 Nasdaq 核對：真的就加進放行清單"
                f"（price_exceptions），資料錯誤就照規則處理。")
    if "returned no data" in msg:
        return f"{t}：Yahoo（和 Nasdaq）都抓不到股價。可能是網路問題或這一檔停止交易；明天會自動再試，連續幾天都失敗就要查是不是下市。"
    if "far behind" in msg:
        return f"{t}：最新股價比 S&P 500 晚兩週以上，可能停止交易或下市。查證後照下市規則處理。"
    return f"{t}：{msg}"


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


def incomplete(s: Series, spy: Series, entry) -> str | None:
    """Why a stock's history looks incomplete, or None: it must have the entry day and almost every S&P 500 trading day
    from the entry day on (a few missing days are normal halts; more than 5 means the source lost part of the history)."""
    have = set(s.dates)
    if entry not in have:
        return f"沒有進場日 {entry} 的股價（Yahoo 只給了 {len(s.dates)} 天，從 {s.dates[0]} 起）"
    missing = [d for d in spy.dates if d >= entry and d <= s.dates[-1] and d not in have]
    return f"從進場日起少了 {len(missing)} 個交易日" if len(missing) > 5 else None


def nasdaq_fallback(t: str, yahoo: Series, why: str, entry, jumps, now) -> Series:
    """Use Nasdaq for one stock when Yahoo's history is incomplete, only if it checks out: it has the entry day, its
    closes match Yahoo's within 1% on the days both have, and there is no split-like overnight jump after the entry day
    (Nasdaq prices are not split-adjusted). Otherwise stop with a plain explanation."""
    try:
        s = frame_to_series(fetch_nasdaq(t), now, jumps)
    except (BuildError, ValueError, OSError) as exc:
        raise BuildError(f"{t}: Yahoo incomplete ({why}); Nasdaq failed: {exc}",
                         f"{t}：Yahoo 的歷史股價不完整（{why}），Nasdaq 也抓不到（{exc}）。明天會自動再試。")
    ny = dict(zip(s.dates, s.closes))
    off = [d for d, c in zip(yahoo.dates, yahoo.closes) if d in ny and abs(ny[d] / c - 1) > 0.01]
    i = bisect_left(s.dates, entry)
    jump = next((s.dates[k] for k in range(max(i, 1), len(s.dates))
                 if not 0.6 < s.closes[k] / s.closes[k - 1] < 1.8 and s.dates[k] not in jumps), None)
    problem = ("Nasdaq 沒有進場日的股價" if i >= len(s.dates) or s.dates[i] != entry
               else f"兩邊的收盤價在 {off[0]} 差超過 1%" if off
               else f"Nasdaq 在 {jump} 有像股票分割的大跳動（Nasdaq 的價格沒有調整分割）" if jump else None)
    if problem:
        raise BuildError(f"{t}: Yahoo incomplete ({why}); Nasdaq check failed ({problem})",
                         f"{t}：Yahoo 的歷史股價不完整（{why}），改用 Nasdaq 但核對沒過（{problem}）。要人工查證後處理。")
    NOTES.append(f"- {t}：Yahoo 的歷史股價不完整（{why}），今天改用 Nasdaq 的股價（核對過：有進場日、和 Yahoo 重疊的日子收盤差不到 1%、"
                 f"沒有像分割的大跳動）。Nasdaq 的價格沒有調整配息，有配息的股票報酬會略低一點。")
    print(f"note: {t} used Nasdaq ({why})", file=sys.stderr)
    return s


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


def up10_half(bubbles: list[dict]) -> dict:
    """For the tour (2026-11-17): the main-result stocks (2022 on, 12 months done, USD). "Half the stocks touched +10%
    within X trading days": a stock that never reached +10% in its 12 months counts as infinitely long; X is the median,
    rounded up. median_days is None when fewer than half reached +10% (the tour sentence then needs rewording)."""
    main = [b for b in bubbles if not b["early"] and b["paths"]["USD"]["stock"]["done"] and b["paths"]["USD"]["spy"]["done"]]
    if not main:
        return {"n": 0, "hit_share": None, "median_days": None}
    days = sorted(math.inf if (d := b["paths"]["USD"]["stock"]["days_to_up_10"]) is None else d for b in main)
    n = len(days)
    mid = days[n // 2] if n % 2 else (days[n // 2 - 1] + days[n // 2]) / 2
    return {"n": n, "hit_share": r6(sum(d != math.inf for d in days) / n),
            "median_days": None if mid == math.inf else math.ceil(mid)}


# ---- Insights page (2026-11-18; definitions fixed in the research spec before computing) -----------------

PRE, POST = 60, 250            # chapter 2: trading days before and after the entry day
UP_TH = (0.10, 0.20, 1.00)     # chapter 3: rose +10%, +20%, doubled
DOWN_TH = (0.10, 0.20, 0.50)   # fell -10%, -20%, halved
SPY_TH = (0.10, 0.20)          # the S&P 500 over the same windows: only ±10%, ±20%
TOP = 5                        # chapter 1: share of the total excess return from the top 5


def quantile(xs, q):
    """Linear interpolation between order statistics (the usual definition; quantile(xs, 0.5) is the median)."""
    v = sorted(xs)
    k = (len(v) - 1) * q
    i = math.floor(k)
    return v[i] if i + 1 >= len(v) else v[i] + (v[i + 1] - v[i]) * (k - i)


def event_path(s: Series, spy: Series, entry, days):
    """Chapter 2: excess return on trading days -60..+250 (trading days = S&P 500 days). Day t =
    (stock close on day t / stock open on the entry day - 1) - (same for the S&P 500). None if any day is missing."""
    k = bisect_left(days, entry)
    if k - PRE < 0 or k + POST >= len(days):
        return None
    so, po = s.opens[s.index(entry)], spy.opens[spy.index(entry)]
    out = []
    for t in range(-PRE, POST + 1):
        d = days[k + t]
        i = bisect_left(s.dates, d)
        if i >= len(s.dates) or s.dates[i] != d:
            return None
        out.append((s.closes[i] / so - 1) - (spy.closes[spy.index(d)] / po - 1))
    return out


EACH_PRE, EACH_POST = 21, HORIZON  # the chart's "since each mention" mode (2026-11-20): trading days -21..+252


def each_path(s: Series, spy: Series, entry) -> list:
    """The chart's "since each mention" mode: excess return on trading days -21..+252 (trading days = S&P 500 days).
    Day t = (stock close on day t / stock open on the entry day - 1) - (same for the S&P 500), the same formula as
    chapter 2 (event_path). Unlike chapter 2 it may be partial: it stops at the latest day (not a full year yet), days
    before the S&P 500 history are None, and so is a day the stock has no close."""
    days = spy.dates
    k = spy.index(entry)
    so, po = s.opens[s.index(entry)], spy.opens[k]
    closes = dict(zip(s.dates, s.closes))
    out = []
    for t in range(-EACH_PRE, EACH_POST + 1):
        if k + t >= len(days):
            break
        c = closes.get(days[k + t]) if k + t >= 0 else None
        out.append(None if c is None else r6((c / so - 1) - (spy.closes[k + t] / po - 1)))
    return out


def each_paths(stocks: list[dict], series: dict, spy: Series) -> dict:
    """Ticker -> each_path for every stock on the site (its own entry day)."""
    return {st["ticker"]: each_path(series[st["ticker"]], spy, date.fromisoformat(st["entry_day"])) for st in stocks}


def hit_curve(day_lists, n):
    """Share of the n stocks that had reached the threshold by trading day N (N = 0..252); None = never in 12 months."""
    return [r6(sum(d is not None and d <= N for d in day_lists) / n) for N in range(HORIZON + 1)]


def company_names(events: list[dict]) -> dict:
    """Ticker -> (Chinese name, English name) from the site's events (first one per ticker)."""
    out = {}
    for e in events:
        out.setdefault(e["ticker"], (e.get("company") or e["ticker"], e.get("company_en") or e.get("company") or e["ticker"]))
    return out


def insight_rows(stocks: list[dict], series: dict, spy: Series) -> list[dict]:
    """The main-result stocks (2022 on, 12 months done, USD), the same set and entry as the headline: one row each with
    everything the Insights page and its CSV download use."""
    days, rows = spy.dates, []
    for st in stocks:
        if st["early"]:
            continue
        t, entry = st["ticker"], date.fromisoformat(st["entry_day"])
        s = series[t]
        end = exit_day(entry, HORIZON, days)
        if end is None or s.dates[-1] < end:
            continue
        ret, bench = hold_return(s, entry, end), hold_return(spy, entry, end)
        rows.append({"t": t, "ep": st.get("ep"), "date": st["date"], "entry": entry, "exit": end,
                     "buy": s.opens[s.index(entry)], "sell": s.closes[s.index(end)], "ret": ret, "spy_ret": bench, "x": ret - bench,
                     "path": event_path(s, spy, entry, days),
                     "up": {th: path_metrics(s, entry, end, th)["days_to_up"] for th in UP_TH},
                     "down": {th: path_metrics(s, entry, end, th)["days_to_down"] for th in DOWN_TH},
                     "spy_up": {th: path_metrics(spy, entry, end, th)["days_to_up"] for th in SPY_TH},
                     "spy_down": {th: path_metrics(spy, entry, end, th)["days_to_down"] for th in SPY_TH}})
    return rows


def tenths(share):
    """0.42 -> 4 ("about four in ten"); halves round up (0.45 -> 5)."""
    return math.floor(share * 10 + 0.5)


def insights(stocks: list[dict], series: dict, spy: Series, last_ep_date: str | None, names: dict | None = None) -> dict:
    """The Insights page. Chapters 1-3 use the main-result stocks (insight_rows); chapter 4 counts every stock on the site
    by its first-mention date. names: ticker -> (zh, en) company names (company_names). "takeaways" holds the numbers and
    conditions for the closing summary (2026-11-19); insight_warnings turns failed conditions into reminders."""
    names = names or {}
    rows = insight_rows(stocks, series, spy)
    n = len(rows)
    xs = [r["x"] for r in rows]
    ranked = sorted(rows, key=lambda r: (-r["x"], r["t"]))
    total = sum(xs)
    who = lambda r: {"t": r["t"], "zh": names.get(r["t"], (r["t"], r["t"]))[0], "en": names.get(r["t"], (r["t"], r["t"]))[1],
                     "x": r6(r["x"])}
    ch1 = {"n": n, "bars": [{"t": r["t"], "x": r6(r["x"])} for r in ranked],
           "top": TOP, "top_share": r6(sum(r["x"] for r in ranked[:TOP]) / total) if n and total > 0 else None,
           "tests": tests(xs) if xs else None,
           "best": who(ranked[0]) if n else None, "worst": who(ranked[-1]) if n else None,
           "first_date": min(r["date"] for r in rows) if n else None, "last_date": max(r["date"] for r in rows) if n else None}
    paths = [r["path"] for r in rows if r["path"] is not None]
    by_day = list(zip(*paths)) if paths else []
    med = [r6(median(v)) for v in by_day]
    peak = max(range(PRE + 1, PRE + POST + 1), key=lambda i: (med[i], -i)) - PRE if med else None  # first highest day after 0
    ch2 = {"n": len(paths), "pre": PRE, "post": POST,
           "median": med, "mean": [r6(sum(v) / len(v)) for v in by_day],
           "q25": [r6(quantile(v, 0.25)) for v in by_day], "q75": [r6(quantile(v, 0.75)) for v in by_day],
           "peak_day": peak,
           # the "it often rose first, kept rising briefly, then fell behind" sentence holds only in this direction
           "story": bool(med) and med[0] < 0 and med[PRE + peak] > 0 and med[-1] < 0}
    key = lambda th: str(round(th * 100))
    ch3 = {"n": n, "days": HORIZON,
           "up": {key(th): hit_curve([r["up"][th] for r in rows], n) for th in UP_TH} if n else {},
           "down": {key(th): hit_curve([r["down"][th] for r in rows], n) for th in DOWN_TH} if n else {},
           "spy_up": {key(th): hit_curve([r["spy_up"][th] for r in rows], n) for th in SPY_TH} if n else {},
           "spy_down": {key(th): hit_curve([r["spy_down"][th] for r in rows], n) for th in SPY_TH} if n else {},
           "doubled": sum(r["up"][1.00] is not None for r in rows), "halved": sum(r["down"][0.50] is not None for r in rows)}
    dates = sorted(st["date"] for st in stocks)
    steps = [{"date": d, "n": i + 1} for i, d in enumerate(dates) if i + 1 == len(dates) or dates[i + 1] != d]
    since = sum(d >= "2022-01-01" for d in dates)
    quarters = ((date.fromisoformat(last_ep_date) - date(2022, 1, 1)).days / (365.25 / 4)) if last_ep_date else None
    ch4 = {"n": len(dates), "early": len(dates) - since, "since_2022": since, "steps": steps, "last_ep_date": last_ep_date,
           "per_quarter": r6(since / quarters) if quarters and quarters > 0 else None}
    t = ch1["tests"]
    takeaways = None if not n else {
        "win_tenths": tenths(t["wins"] / n), "coin_flip": t["p_value"] >= 0.05, "beat_more": t["wins"] / n > 0.5,
        "pre_outran": bool(med) and med[0] < 0,
        "fell20": ch3["down"]["20"][-1], "fell20_tenths": tenths(ch3["down"]["20"][-1]), "doubled": r6(ch3["doubled"] / n)}
    return {"ch1": ch1, "ch2": ch2, "ch3": ch3, "ch4": ch4, "takeaways": takeaways}


def insight_warnings(ins: dict) -> list[str]:
    """Reminders when a fixed sentence on the Insights page no longer fits the data (shown at export and on the Actions
    summary page). The page itself already rewrites or hides those sentences."""
    out, k = [], ins.get("takeaways")
    if not k:
        return ["數據觀察：沒有滿一年的股票，第 1～3 章和總結都沒有數字"]
    t = ins["ch1"]["tests"]
    if not k["coin_flip"]:
        out.append(f"數據觀察總結第 1 點：勝率 {t['wins']}/{t['n']}，和 50% 比的 p＝{t['p_value']:.3f}（小於 0.05），"
                   f"不能再寫「和擲銅板沒有明顯差別」，頁面已自動改成「明顯比擲銅板{'好' if k['beat_more'] else '差'}」，請確認文字")
    if not k["pre_outran"]:
        out.append("數據觀察總結第 2 點：第 2 章提到前 60 天的中位數變成「比大盤少漲」，「孟恭常在股票已經漲了一段之後才聊到」已自動不顯示")
    if not ins["ch2"]["story"]:
        out.append("數據觀察第 2 章：方向不再是「提到前多漲、提到後短暫續漲、一年後輸大盤」，「也就是說…」那句已自動不顯示，要改寫")
    return out


# ---- CSV download (2026-11-19): numbers only, no quotes; one row per main-result stock ----------------


# Column names say what each column is (2026-11-19 v20); the full definitions are in the "Column guide" dialog on the
# Insights page (site/assets/insights.js, COLUMNS), which must use these exact names.
CSV_HEAD = {
    "zh": ["代號", "公司名稱", "第一次提到的集數", "第一次提到的日期", "買進日（提到後第一個交易日）", "出場日（買進後第 252 個交易日）",
           "買進價（買進日開盤，美元）", "出場價（出場日收盤，美元）", "個股一年報酬（%）", "S&P 500 同期報酬（%）",
           "一年後比大盤多漲（%）", "是否贏過大盤", "提到前 60 個交易日比大盤多漲（%）",
           "第幾個交易日首次漲到 +10%", "第幾個交易日首次漲到 +20%", "第幾個交易日首次漲到 +100%（翻倍）",
           "第幾個交易日首次跌到 -10%", "第幾個交易日首次跌到 -20%", "第幾個交易日首次跌到 -50%（腰斬）"],
    "en": ["Ticker", "Company", "First-mention episode", "First-mention date", "Entry day (first trading day after the mention)",
           "Exit day (252nd trading day after entry)", "Entry price (entry-day open, USD)", "Exit price (exit-day close, USD)",
           "Stock 1-year return (%)", "S&P 500 return, same days (%)", "1-year return above the market (%)", "Beat the market",
           "Rise above the market in the 60 trading days before the mention (%)",
           "Trading day it first rose +10%", "Trading day it first rose +20%", "Trading day it first rose +100% (doubled)",
           "Trading day it first fell -10%", "Trading day it first fell -20%", "Trading day it first fell -50% (halved)"],
}
CSV_YES = {"zh": ("是", "否"), "en": ("yes", "no")}
CSV_FILES = {"zh": "data/insights-data.csv", "en": "data/insights-data-en.csv"}


def downloads(stocks: list[dict], series: dict, spy: Series, names: dict) -> dict:
    """The Insights CSV downloads, Chinese and English: {site path: text}. Sorted by first
    mention. Percentages have 4 decimals (the page's numbers are rounded to 6 decimals as fractions, the same precision)."""
    import csv
    import io
    rows = sorted(insight_rows(stocks, series, spy), key=lambda r: (r["date"], r["t"]))
    pct = lambda v: "" if v is None else f"{v * 100:.4f}"
    day = lambda v: "" if v is None else str(v)
    out = {}
    for lang in ("zh", "en"):
        buf = io.StringIO()
        w = csv.writer(buf, lineterminator="\r\n")
        w.writerow(CSV_HEAD[lang])
        for r in rows:
            name = names.get(r["t"], (r["t"], r["t"]))[0 if lang == "zh" else 1]
            w.writerow([r["t"], name, f"EP{r['ep']}", r["date"], r["entry"].isoformat(), r["exit"].isoformat(),
                        f"{r['buy']:.4f}", f"{r['sell']:.4f}", pct(r["ret"]), pct(r["spy_ret"]), pct(r["x"]),
                        CSV_YES[lang][0 if r["x"] > 0 else 1], pct(None if r["path"] is None else -r["path"][0]),
                        *(day(r["up"][th]) for th in UP_TH), *(day(r["down"][th]) for th in DOWN_TH)])
        out[CSV_FILES[lang]] = "\ufeff" + buf.getvalue()  # the BOM lets Excel read the Chinese correctly
    return out


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
    summary["main"]["up10"] = up10_half(bubbles)  # 導覽「為什麼做這個」那一頁的數字
    names = company_names(cfg["events"])
    summary["insights"] = insights(cfg["stocks"], series, spy, cfg.get("last_ep_date"), names)  # 數據觀察（2026-11-18）
    chart_days = [d for d in days if d >= CHART_START]
    aligned = lambda x: [round(c, 4) if c is not None else None
                         for c in (dict(zip(x.dates, x.closes)).get(d) for d in chart_days)]
    benchmarks = {"dates": [d.isoformat() for d in chart_days], "spy": aligned(spy), "sox": aligned(sox)}
    each = each_paths(cfg["stocks"], series, spy)  # 走勢圖「各自起算」（2026-11-20）
    prices = {t: {"c": aligned(series[t]), "x": each[t]} for t in {s["ticker"] for s in cfg["stocks"]}}
    return {"summary": summary, "benchmarks": benchmarks, "prices": prices, "events": cfg["events"],
            "downloads": downloads(cfg["stocks"], series, spy, names)}


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

    def get_stock(st, spy):
        """Yahoo sometimes returns an incomplete history for one stock (2026-11-19: SNDK came back with only its last
        two days). Retry, and if it is still incomplete, use Nasdaq after checking it (see nasdaq_fallback)."""
        t, src, entry = st["ticker"], st.get("source", "yahoo"), date.fromisoformat(st["entry_day"])
        if src == "nasdaq":
            return get(t, src)
        for attempt in range(3):
            s = get(t, src)
            short = incomplete(s, spy, entry)
            if not short:
                return s
            if attempt < 2:
                import time as _t
                _t.sleep(20 * (attempt + 1))
        return nasdaq_fallback(t, s, short, entry, jumps.get(t, frozenset()), now)

    errors, series = [], {}
    spy, sox = get("SPY", "yahoo"), get("^SOX", "yahoo")
    if spy.dates[-1] < now.date() - timedelta(days=MAX_STALE_DAYS):
        raise BuildError(f"SPY's latest close is {spy.dates[-1]}: data looks stale")
    if sox.dates[-1] != spy.dates[-1]:
        raise BuildError(f"^SOX latest {sox.dates[-1]} differs from SPY {spy.dates[-1]}")
    zh = []
    for st in cfg["stocks"]:
        try:
            series[st["ticker"]] = get_stock(st, spy)
        except (BuildError, KeyError, ValueError) as exc:
            errors.append(f"{st['ticker']}: {exc}")
            zh.append(explain(st["ticker"], exc))
    if errors:
        raise BuildError("price problems:\n  " + "\n  ".join(errors), "\n".join(f"- {z}" for z in zh))
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
    for path, body in data.get("downloads", {}).items():  # 數據觀察的 CSV 下載檔和欄位說明（2026-11-19）
        (out / path).write_text(body, encoding="utf-8")
    (out / ".nojekyll").write_text("")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Fetch prices and build the static site")
    ap.add_argument("--out", type=Path, default=ROOT / "_site")
    args = ap.parse_args(argv)
    cfg = load_config()
    try:
        series, spy, sox, split_map = fetch_all(cfg, datetime.now(timezone.utc))
        fwd = {st["ticker"]: fetch_forward_pe(st["ticker"]) for st in cfg["stocks"]}  # reference only; never fails
        try:
            data = compute(cfg, series, spy, sox, split_map, fwd)
        except (KeyError, ValueError) as exc:  # 2026-11-19: a missing price used to end in a bare traceback
            raise BuildError(f"computing failed: {exc}", f"計算時缺股價：{exc}。通常是某一檔的資料來源少了幾天，要查是哪一檔。")
    except BuildError as exc:
        print(f"BUILD FAILED, nothing deployed: {exc}", file=sys.stderr)
        step_summary("## ❌ 今天沒有更新網站\n\n網站維持上一次成功更新的版本，明天早上會自動再試。原因：\n\n"
                     + (exc.zh or f"- {exc}") + "\n\n<details><summary>技術細節</summary>\n\n```\n" + str(exc) + "\n```\n</details>")
        return 1
    write_site(data, args.out)
    s = data["summary"]
    NOTES.extend(f"- {w}" for w in insight_warnings(s["insights"]))
    print(f"prices through {s['price_date']}; main {s['main']['spy']['win']:.0%} of {s['main']['done']} beat SPY; "
          f"{len(s['bubbles'])} stocks")
    step_summary(f"## ✅ 網站已更新\n\n股價更新到 {s['price_date']}，{len(s['bubbles'])} 檔；主結論 {s['main']['spy']['win']:.0%} 贏過 S&P 500"
                 f"（{s['main']['done']} 檔）。" + ("\n\n要注意：\n\n" + "\n".join(NOTES) if NOTES else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
