"""P/E probe: fetch trailing and forward P/E from Yahoo Finance for every stock on the site and count the outcomes."""
import json, sys, time
import yfinance as yf
cfg = json.load(open(sys.argv[1]))
tickers = [s["ticker"] for s in cfg["stocks"]]
res, t0 = {}, time.time()
for t in tickers:
    for k in range(2):
        try:
            i = yf.Ticker(t).info
            res[t] = {"pe": i.get("trailingPE"), "fpe": i.get("forwardPE"), "eps": i.get("trailingEps"), "type": i.get("quoteType")}
            break
        except Exception as e:
            res[t] = {"error": type(e).__name__ + ": " + str(e)[:80]}
            time.sleep(2)
pe = [t for t, v in res.items() if isinstance(v.get("pe"), (int, float))]
fpe = [t for t, v in res.items() if isinstance(v.get("fpe"), (int, float))]
loss = [t for t, v in res.items() if not isinstance(v.get("pe"), (int, float)) and isinstance(v.get("eps"), (int, float)) and v["eps"] <= 0]
err = [t for t, v in res.items() if "error" in v]
nodata = [t for t in tickers if t not in pe and t not in loss and t not in err]
print(f"stocks {len(tickers)} | P/E {len(pe)} | forward P/E {len(fpe)} | loss (EPS<=0, no P/E) {len(loss)} | no P/E and no EPS {len(nodata)} | errors {len(err)} | {time.time()-t0:.0f}s")
print("loss:", loss); print("no data:", nodata); print("errors:", err[:10])
if len(sys.argv) > 2: json.dump(res, open(sys.argv[2], "w"))
