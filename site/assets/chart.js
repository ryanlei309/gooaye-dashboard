// 走勢圖：S&P 500（SPY）、費半（^SOX 指數）與點選的個股（最多 5 檔），美元，從區間起點的 0% 開始；用 uPlot
// 色弱也分得出：大盤三條用不同的虛線、個股用實線；線尾直接標名稱；滑到某條線時那條變粗、其他變淡
"use strict";
const Chart = (() => {
  // 交易日數；Infinity＝全部（從 2020-02 節目開始）；"mention"＝首次提及（以最早被提到那檔的進場日為 0%）；
  // "each"＝各自起算（第二十一版：每檔從自己的首次提及起算，和 S&P 500 同期比）
  const RANGES = ["each", "mention", 5, 20, 60, 126, 252, 756, 1260, Infinity];
  // 各自起算：橫軸是距離首次提及的交易日，第 −21 天（提到前約 1 個月）到第 +252 天（1 年）
  const EACH_PRE = 21, EACH_POST = 252, EACH_TICKS = [-21, 0, 63, 126, 189, 252];
  const BAND_FILL = "rgba(110, 110, 110, 0.13)", BAND_LINE = "#8f8f8f", BG = "#fcfaf5";  // BG：走勢圖區塊的底色（style.css 的 --panel）
  const MENTION_PAD = 0.05, MENTION_PAD_MIN = 10;  // 首次提及：往前多顯示整段期間的 5%，最少 10 個交易日
  const BENCH = [
    // 第十八版：大盤線加粗約 40%、顏色加深；S&P 500 從點線改成間距大一點的虛線（13 吋螢幕、40–50 公分外也看得清楚）
    { key: "spy", name: T.spyLong, short: T.spy, color: "#2e2e2e", dash: [6, 4], priceCur: "USD" },
    { key: "sox", name: T.soxLong, short: T.sox, color: "#555555", dash: [10, 3, 2, 3], priceCur: "IDX" },
  ];
  const BENCH_W = 2.1, STOCK_W = 2.5;  // 第十八版：大盤 1.5 → 2.1、個股 2 → 2.5（個股仍然比大盤粗）
  const FONT_PX = 14;  // 軸上的字、線尾名稱（第十八版：12 → 14px）
  // 首次提及的標籤（第二十一版）：X 軸日期下方寫「代號 月/日」，一排的高度；放在 X 軸（預設 50px 高）下面
  const MARK_PX = 13, MARK_ROW = 18, X_AXIS = 50;
  const faded = (hex) => hex + "8c";  // 選了股票之後，大盤線變淡一點（約 55%）但不變細
  const STOCK_COLORS = ["#1f4e8c", "#a0631c", "#6b3fa0", "#2f6f7e", "#7a5c3e"];
  const FONT = '-apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  let u = null, el, marksEl, tip, view = null, focused = null, markRows = 0, placed = [], band = null;

  function rebase(vals, start, base = vals.slice(start).find((v) => v != null)) {
    return vals.slice(start).map((v) => (v == null || base == null ? null : (v / base - 1) * 100));
  }

  // 首次提及模式：以最早被提到那檔的進場日為 0%。那一檔和大盤用進場日的開盤價當基準（大盤的開盤價由明細的
  // 「至今報酬」反推：最後收盤 ÷ (1 + 至今報酬)），所以那一檔線上最後的數字等於明細表的至今報酬。
  // 其他股票用進場日前一天的收盤當基準（沒有那天的開盤價）；同一天進場的用自己的進場價。
  function mentionBases(b, stocks, ai) {
    const first = stocks.reduce((a, s) => (s.entry_day < a.entry_day ? s : a));
    const last = (arr) => arr[arr.length - 1];
    const bases = { spy: last(b.spy) / (1 + first.bench.spy), sox: last(b.sox) / (1 + first.bench.sox) };
    stocks.forEach((s) => {
      bases[s.ticker] = s.entry_day === first.entry_day ? s.open
        : s.c.slice(0, ai).reverse().find((v) => v != null) ?? s.c.slice(ai).find((v) => v != null);
    });
    return bases;
  }

  // 各自起算（第二十一版）：縱軸是和 S&P 500 同期比的報酬差（%）。數字由 update.py 算好（股價檔的 x：第 t 天＝
  // （個股第 t 天收盤 ÷ 進場日開盤 − 1）−（S&P 500 同樣算法），和數據觀察第 2 章同一個算法），這裡只畫。
  // S&P 500 是 0% 的虛線；背景是第 2 章那批股票每天的中位數（灰線）和中間 50%（灰帶），在 drawBand 畫（不是 uPlot 的線，
  // 滑過去不會變粗、小視窗也不列）。不畫費半，也不需要首次提及的垂直線。還沒滿一年的線尾寫「代號（第 N 天）」
  function buildEach(b, stocks) {
    const xs = Array.from({ length: EACH_PRE + EACH_POST + 1 }, (_, i) => i - EACH_PRE);
    const at = (arr, off) => xs.map((t) => { const v = arr ? arr[t + off] : null; return v == null ? null : v * 100; });
    const bg = band && band.median ? { med: at(band.median, band.pre), lo: at(band.q25, band.pre), hi: at(band.q75, band.pre) } : null;
    // S&P 500 的名稱寫在圖裡面、虛線右端的上方（寫在圖的右邊太長，手機上畫線的區域會被擠窄）
    const lines = [{ ...BENCH[0], name: T.each.spy, short: T.each.spy, width: BENCH_W, stroke: faded(BENCH[0].color), ys: xs.map(() => 0),
                     inside: true },
      ...stocks.map((s) => {
        const last = (s.x || []).length - 1 - EACH_PRE;  // 最新一天是第幾天
        const open = last < EACH_POST ? last : null;
        return { name: s.ticker, short: open == null ? s.ticker : T.each.tail(s.ticker, open), color: s.color, dash: null, width: STOCK_W,
                 ys: at(s.x, EACH_PRE), tailAt: open, own: { ai: b.dates.indexOf(s.entry_day), c: s.c, open: s.open } };
      })];
    return { each: true, xs, lines, bg, dates: b.dates };
  }

  function build(b, stocks, days) {
    if (days === "each" && stocks.length) return buildEach(b, stocks);
    const n = b.dates.length, mention = days === "mention" && stocks.length > 0;
    let start = Math.max(0, n - 1 - (days === "mention" ? 5 : days)), bases = {};
    if (mention) {
      const ai = b.dates.indexOf(stocks.reduce((a, s) => (s.entry_day < a.entry_day ? s : a)).entry_day);
      start = Math.max(0, ai - Math.max(MENTION_PAD_MIN, Math.round(MENTION_PAD * (n - 1 - ai))));
      bases = mentionBases(b, stocks, ai);
    }
    const xs = b.dates.slice(start).map((d) => Date.parse(d + "T00:00:00Z") / 1000);
    const lines = [
      ...BENCH.map((x) => ({ ...x, width: BENCH_W, stroke: stocks.length ? faded(x.color) : x.color, price: b[x.key] })),
      ...stocks.map((s) => ({ name: s.ticker, short: s.ticker, color: s.color, dash: null, width: STOCK_W, price: s.c,
                              priceCur: "USD", entry: s.entry_day, date: s.date })),
    ];
    lines.forEach((l) => {
      const base = bases[l.key || l.name];
      l.ys = base ? rebase(l.price, start, base) : rebase(l.price, start);
      l.prices = l.price.slice(start);
    });
    return { xs, lines, dates: b.dates.slice(start) };
  }

  // 線樣小圖；vertical 是首次提及的垂直虛線
  const sample = (l, vertical) => (vertical
    ? `<svg width="6" height="12" aria-hidden="true"><line x1="3" y1="0" x2="3" y2="12" stroke="${l.color}" stroke-width="1.5" stroke-dasharray="2 3"/></svg>`
    : `<svg width="18" height="6" aria-hidden="true"><line x1="0" y1="3" x2="18" y2="3" stroke="${l.color}" ` +
      `stroke-width="2"${l.dash ? ` stroke-dasharray="${l.dash.join(" ")}"` : ""}/></svg>`);

  // 游標旁的小視窗：日期，每條線的名稱、到那天的報酬率、一股的價格，依報酬率由高到低
  function showTip() {
    const { idx, left, top } = u.cursor;
    if (!view || idx == null || left == null || left < 0) { tip.hidden = true; return; }
    if (view.each) tip.innerHTML = eachTip(idx);
    else {
    const rows = view.lines.map((l) => ({ l, y: l.ys[idx], p: l.prices[idx] }))
      .sort((a, b) => (a.y == null) - (b.y == null) || b.y - a.y);
    tip.innerHTML = `<p class="tip-day">${F.date(view.dates[idx])}</p><table><tbody>` + rows.map(({ l, y, p }) =>
      `<tr><td>${sample(l)} ${F.esc(l.name)}</td><td class="n ${F.cls(y)}">${F.pct(y == null ? null : y / 100)}</td>` +
      `<td class="n">${F.price(p, l.priceCur)}</td></tr>`).join("") +
      `</tbody></table><p class="tip-note">${T.adjusted}</p>`;
    }
    tip.hidden = false;
    const o = u.over.getBoundingClientRect(), r = el.getBoundingClientRect();
    const x0 = o.left - r.left + left, y0 = o.top - r.top + top, w = tip.offsetWidth, h = tip.offsetHeight;
    const x = x0 + 16 + w <= el.clientWidth ? x0 + 16 : Math.max(0, x0 - 16 - w);
    tip.style.transform = `translate(${x}px, ${Math.min(Math.max(0, y0 - h / 2), el.clientHeight - h)}px)`;
  }

  // 各自起算的小視窗：第幾天；每一檔的報酬差、那天的日期、個股自己的報酬（收盤 ÷ 進場日開盤 − 1），依報酬差由高到低
  function eachTip(idx) {
    const t = view.xs[idx];
    const rows = view.lines.filter((l) => l.own).map((l) => {
      const i = l.own.ai + t, y = l.ys[idx], c = i >= 0 ? l.own.c[i] : null;
      return { l, y, d: y != null && i >= 0 ? view.dates[i] : null, r: y != null && c != null ? c / l.own.open - 1 : null };
    }).sort((a, b) => (a.y == null) - (b.y == null) || b.y - a.y);
    return `<p class="tip-day">${T.each.day(t)}</p><table><thead><tr><th></th><th class="n">${T.each.vs}</th><th>${T.each.date}</th>` +
      `<th class="n">${T.each.own}</th></tr></thead><tbody>` + rows.map(({ l, y, d, r }) =>
      `<tr><td>${sample(l)} ${F.esc(l.name)}</td><td class="n ${F.cls(y)}">${F.pct(y == null ? null : y / 100)}</td>` +
      `<td>${d ? F.date(d) : "—"}</td><td class="n ${F.cls(r)}">${F.pct(r)}</td></tr>`).join("") +
      `</tbody></table><p class="tip-note">${T.each.note}</p>`;
  }

  // 各自起算的背景（在線的下面）：灰帶＝中間 50%、灰線＝中位數；第 0 天一條直線
  function drawBand(plot) {
    if (!view.each) return;
    const ctx = plot.ctx, dpr = devicePixelRatio, X = (i) => plot.valToPos(view.xs[i], "x", true), Y = (v) => plot.valToPos(v, "y", true);
    ctx.save();
    ctx.beginPath(); ctx.rect(plot.bbox.left, plot.bbox.top, plot.bbox.width, plot.bbox.height); ctx.clip();
    if (view.bg) {
      const ok = view.xs.map((_, i) => view.bg.lo[i] != null && view.bg.hi[i] != null);
      const idx = view.xs.map((_, i) => i).filter((i) => ok[i]);
      if (idx.length) {
        ctx.beginPath();
        idx.forEach((i, j) => (j ? ctx.lineTo(X(i), Y(view.bg.hi[i])) : ctx.moveTo(X(i), Y(view.bg.hi[i]))));
        idx.slice().reverse().forEach((i) => ctx.lineTo(X(i), Y(view.bg.lo[i])));
        ctx.closePath(); ctx.fillStyle = BAND_FILL; ctx.fill();
        ctx.beginPath();
        idx.forEach((i, j) => (j ? ctx.lineTo(X(i), Y(view.bg.med[i])) : ctx.moveTo(X(i), Y(view.bg.med[i]))));
        ctx.strokeStyle = BAND_LINE; ctx.lineWidth = 1.6 * dpr; ctx.stroke();
      }
    }
    const x0 = Math.round(plot.valToPos(0, "x", true));
    ctx.strokeStyle = "#5c5c5c"; ctx.lineWidth = dpr;
    ctx.beginPath(); ctx.moveTo(x0, plot.bbox.top); ctx.lineTo(x0, plot.bbox.top + plot.bbox.height); ctx.stroke();
    ctx.restore();
  }

  // 背景的範圍也要放得進圖（縱軸照線和灰帶一起決定）
  function yRange(self, min, max) {
    if (view.each && view.bg) {
      const vs = [...view.bg.lo, ...view.bg.hi].filter((v) => v != null);
      if (vs.length) { min = Math.min(min, ...vs); max = Math.max(max, ...vs); }
    }
    return uPlot.rangeNum(min, max, 0.1, true);
  }

  // 各自起算的橫軸：刻度在第 −21、0、63、126、189、252 天。字由 eachTicks 自己畫（uPlot 只畫刻度線和格線）
  function eachAxis() {
    return { splits: () => EACH_TICKS, values: (self, splits) => splits.map(() => "") };
  }

  // 標籤排成幾排（X 軸的高度跟著變）：每個標籤放在第一個不會和前一個重疊的那一排；排數和預留的不同時，重新排版一次
  function rows(ctx, items, gap) {
    const rowEnd = [];
    items.forEach((g) => {
      let r = rowEnd.findIndex((end) => g.left >= end + gap);
      if (r < 0) { r = rowEnd.length; rowEnd.push(0); }
      rowEnd[r] = g.left + g.w;
      g.r = r;
    });
    if (rowEnd.length !== markRows) {
      markRows = rowEnd.length;
      el.style.setProperty("--mark-rows", markRows);  // 單欄時圖跟著加高（style.css）
      requestAnimationFrame(() => u && u.ctx === ctx && u.setSize(size()));
    }
    const dpr = devicePixelRatio;  // 給瀏覽器檢查用：文字、左右位置（CSS 像素）、第幾排
    placed = items.map((g) => ({ text: g.parts.map(([t]) => t).join(""), left: g.left / dpr, right: (g.left + g.w) / dpr, row: g.r,
                                 width: ctx.canvas.width / dpr }));
    return items;
  }

  // 各自起算的刻度文字（第二十一版）：「提到前 1 個月、提到（第 0 天）、3 個月、半年、9 個月、1 年」，置中在刻度下面，
  // 不超出圖；手機上太擠時錯開到下一排
  function eachTicks(plot) {
    const ctx = plot.ctx, dpr = devicePixelRatio;
    ctx.font = `${FONT_PX * dpr}px ${FONT}`;
    ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.fillStyle = "#5c5c5c";
    const items = rows(ctx, EACH_TICKS.map((v, i) => {
      const w = ctx.measureText(T.each.ticks[i]).width, cx = plot.valToPos(v, "x", true);
      return { parts: [[T.each.ticks[i], "#5c5c5c"]], w, left: Math.min(Math.max(0, cx - w / 2), ctx.canvas.width - w) };
    }), 10 * dpr);
    const top = plot.bbox.top + plot.bbox.height + 8 * dpr;
    items.forEach((g) => ctx.fillText(g.parts[0][0], g.left, top + (g.r + 0.5) * MARK_ROW * dpr));
  }

  function drawMarks(plot) {
    const ctx = plot.ctx, dpr = devicePixelRatio;
    ctx.save();
    const y0 = plot.valToPos(0, "y", true);
    ctx.strokeStyle = "#d8d3c4"; ctx.lineWidth = dpr;
    ctx.beginPath(); ctx.moveTo(plot.bbox.left, y0); ctx.lineTo(plot.bbox.left + plot.bbox.width, y0); ctx.stroke();
    ctx.setLineDash([2 * dpr, 3 * dpr]);  // 第一次提到那天（進場日）畫一條垂直線
    ctx.lineWidth = 1.5 * dpr;
    view.lines.forEach((l) => {
      const i = l.entry ? view.dates.indexOf(l.entry) : -1;
      if (i < 0) return;
      const x = Math.round(plot.valToPos(view.xs[i], "x", true));
      ctx.strokeStyle = l.color;
      ctx.beginPath(); ctx.moveTo(x, plot.bbox.top); ctx.lineTo(x, plot.bbox.top + plot.bbox.height); ctx.stroke();
    });
    ctx.setLineDash([]);
    entryLabels(plot);
    if (view.each) {  // 縱軸標題（各自起算）：圖的左上角
      ctx.font = `${MARK_PX * dpr}px ${FONT}`;
      ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.fillStyle = "#5c5c5c";
      ctx.fillText(T.each.y, 2 * dpr, plot.bbox.top - 14 * dpr);
    }
    // 線尾標名稱：照位置由上到下排，太近就往下推開
    const ends = view.lines.filter((l) => !l.inside).map((l) => {
      const k = view.lines.indexOf(l);
      let j = l.ys.length - 1;
      while (j >= 0 && l.ys[j] == null) j--;
      return j < 0 ? null : { l, k: k + 1, y: plot.valToPos(l.ys[j], "y", true),
                              at: l.tailAt != null ? plot.valToPos(view.xs[j], "x", true) + 6 * dpr : null };
    }).filter(Boolean).sort((a, b) => a.y - b.y);
    const gap = (FONT_PX + 2) * dpr;
    ends.forEach((e, i) => { if (i && e.y - ends[i - 1].y < gap) e.y = ends[i - 1].y + gap; });
    ctx.font = `${FONT_PX * dpr}px ${FONT}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";  // uPlot 畫座標軸時改成置右，這裡要設回來，名稱才會在線尾右邊
    const x = plot.bbox.left + plot.bbox.width + 6 * dpr;
    view.lines.filter((l) => l.inside).forEach((l) => {  // 各自起算的「S&P 500 同期」：虛線右端，靠右；上方或下方哪邊線少放哪邊
      const k = view.lines.indexOf(l) + 1, w = ctx.measureText(l.short).width;
      const lx = plot.bbox.left + plot.bbox.width - w - 4 * dpr, y0 = plot.valToPos(0, "y", true);
      const hits = (ly) => view.lines.filter((m) => m.own).reduce((n, m) => n + m.ys.filter((v, i) => {
        if (v == null) return false;
        const px = plot.valToPos(view.xs[i], "x", true), py = plot.valToPos(v, "y", true);
        return px >= lx - 4 * dpr && px <= lx + w + 4 * dpr && Math.abs(py - ly) < 10 * dpr;
      }).length, 0);
      const ly = hits(y0 + 10 * dpr) < hits(y0 - 10 * dpr) ? y0 + 10 * dpr : y0 - 10 * dpr;
      ctx.globalAlpha = focused == null || focused === k ? 1 : 0.3;
      ctx.strokeStyle = BG; ctx.lineWidth = 4 * dpr; ctx.lineJoin = "round"; ctx.strokeText(l.short, lx, ly);
      ctx.fillStyle = l.color; ctx.fillText(l.short, lx, ly);
    });
    ends.forEach((e) => {
      ctx.globalAlpha = focused == null || focused === e.k ? 1 : 0.3;
      ctx.fillStyle = e.l.color;
      // 還沒滿一年（各自起算）：名稱寫在線尾旁邊，不是圖的右邊；放不下就往左移
      const w = ctx.measureText(e.l.short).width, lx = e.at == null ? x : Math.min(e.at, ctx.canvas.width - w - 2 * dpr);
      if (e.at != null) {  // 在圖裡面的名稱：先描一圈底色，別的線穿過也看得清楚
        ctx.strokeStyle = BG; ctx.lineWidth = 4 * dpr; ctx.lineJoin = "round"; ctx.strokeText(e.l.short, lx, e.y);
      }
      ctx.fillText(e.l.short, lx, e.y);
    });
    ctx.restore();
  }

  // 首次提及的標籤（第二十一版）：每條垂直線在 X 軸下方標「代號 月/日」，用該股的顏色；圖的期間跨年才加年份（2025/9/6）。
  // 同一天進場的合併成一個（「RKLB・FLY 6/13」，代號各用自己的顏色、日期灰色）。太近會重疊就往下一排錯開；
  // 需要的排數和預留的不同時，重新排版一次（X 軸的高度跟著排數）
  function markGroups() {
    if (view.each) return [];
    const groups = new Map(), first = view.dates[0], last = view.dates[view.dates.length - 1];
    const year = first.slice(0, 4) !== last.slice(0, 4);
    const md = (d) => (year ? d.slice(0, 4) + "/" : "") + Number(d.slice(5, 7)) + "/" + Number(d.slice(8, 10));
    view.lines.forEach((l, k) => {
      const i = l.entry ? view.dates.indexOf(l.entry) : -1;
      if (i < 0) return;
      if (!groups.has(i)) groups.set(i, []);
      groups.get(i).push({ l, k: k + 1 });
    });
    return [...groups].sort((a, b) => a[0] - b[0]).map(([i, g]) => {
      const dates = [...new Set(g.map((x) => x.l.date))];
      // 同一天提到：代號・代號 日期；同一個進場日但提到的日子不同（例如週六和週日）：代號 日期・代號 日期
      const parts = dates.length === 1
        ? [...g.flatMap((x, j) => [[j ? "・" : "", "#5c5c5c"], [x.l.short, x.l.color]]), [" " + md(dates[0]), g.length > 1 ? "#5c5c5c" : g[0].l.color]]
        : g.flatMap((x, j) => [[j ? "・" : "", "#5c5c5c"], [x.l.short + " " + md(x.l.date), x.l.color]]);
      return { i, ks: g.map((x) => x.k), parts: parts.filter(([t]) => t) };
    });
  }

  function entryLabels(plot) {
    const ctx = plot.ctx, dpr = devicePixelRatio, gap = 8 * dpr;
    ctx.font = `${MARK_PX * dpr}px ${FONT}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    if (view.each) return eachTicks(plot);
    const items = rows(ctx, markGroups().map((g) => {
      const w = g.parts.reduce((a, [t]) => a + ctx.measureText(t).width, 0);
      const cx = plot.valToPos(view.xs[g.i], "x", true);
      return { ...g, w, left: Math.min(Math.max(0, cx - w / 2), ctx.canvas.width - w) };
    }), gap);
    const top = plot.bbox.top + plot.bbox.height + X_AXIS * dpr;
    items.forEach((g) => {
      ctx.globalAlpha = focused == null || g.ks.includes(focused) ? 1 : 0.3;
      let x = g.left;
      g.parts.forEach(([t, c]) => { ctx.fillStyle = c; ctx.fillText(t, x, top + (g.r + 0.5) * MARK_ROW * dpr); x += ctx.measureText(t).width; });
    });
    ctx.globalAlpha = 1;
  }

  function axisSize(self, values) {
    if (!values) return 60;
    const c = document.createElement("canvas").getContext("2d");
    c.font = `${FONT_PX}px ${FONT}`;
    return Math.max(48, Math.ceil(Math.max(...values.map((v) => c.measureText(v).width))) + 22);
  }

  // 時間軸只顯示日期（第十一版）：半年以內的區間，刻度放在真的交易日上、寫成「11/10」，第一個刻度和跨年時加上年份；
  // uPlot 自己挑刻度時，區間短會出現「12am」「12pm」這種小時。半年以上照 uPlot 的月份刻度（不會有小時）
  function dayAxis() {
    if (view.xs.length > 130) return {};
    return {
      splits: (u) => {
        const n = view.xs.length, want = Math.max(3, Math.floor(u.bbox.width / devicePixelRatio / 90));
        const step = Math.max(1, Math.ceil(n / want));
        return view.xs.filter((_, i) => i % step === 0);
      },
      values: (u, splits) => splits.map((ts, i) => {
        const d = new Date(ts * 1000), y = d.getUTCFullYear();
        const prev = i ? new Date(splits[i - 1] * 1000).getUTCFullYear() : null;
        return `${d.getUTCMonth() + 1}/${d.getUTCDate()}` + (prev !== y ? `\n${y}` : "");
      }),
    };
  }

  function labelRoom() {
    const c = document.createElement("canvas").getContext("2d");
    c.font = `${FONT_PX}px ${FONT}`;  // 線尾在圖中間的（還沒滿一年）不用留右邊的空間
    return Math.ceil(Math.max(0, ...view.lines.filter((l) => l.tailAt == null && !l.inside).map((l) => c.measureText(l.short).width))) + 12;
  }

  function size() {
    return { width: Math.max(200, el.clientWidth), height: Math.max(150, el.clientHeight) };
  }

  // 圖下方：只列首次提及不在目前期間的（「（不在此期間）」）；在期間裡的，日期標在 X 軸下方（第二十一版，原本圖上方每檔一個）
  function marks() {
    if (view.each) {  // 各自起算：圖下方說明灰線和灰帶
      marksEl.innerHTML = view.bg ? `<span><svg width="18" height="6" aria-hidden="true"><line x1="0" y1="3" x2="18" y2="3" stroke="${BAND_LINE}" stroke-width="2"/></svg> ${T.each.all}</span>` +
        `<span><svg width="14" height="10" aria-hidden="true"><rect width="14" height="10" fill="${BAND_FILL}"/></svg> ${T.each.band(band.n)}</span>` : "";
      return;
    }
    const first = view.dates[0];
    marksEl.innerHTML = view.lines.filter((l) => l.entry && l.entry < first).map((l) =>
      `<span>${sample(l, true)} ${T.firstMark(F.esc(l.name), F.date(l.date))}${T.outside}</span>`).join("");
  }

  function render(b, stocks, days) {
    view = build(b, stocks, days);
    focused = null;
    marks();
    markRows = view.each ? 1 : Math.min(1, markGroups().length);  // 先預留一排；畫的時候發現要兩排再重新排版
    el.style.setProperty("--mark-rows", markRows);
    const opts = {
      ...size(),
      padding: [view.each ? 30 : 12, labelRoom(), 0, 0],  // 各自起算：上面留縱軸標題的位置
      tzDate: (ts) => uPlot.tzDate(new Date(ts * 1e3), "Etc/UTC"),
      legend: { show: false },
      focus: { alpha: 0.3 },
      cursor: { drag: { x: false, y: false }, points: { size: 6 }, focus: { prox: 16 } },
      scales: view.each ? { x: { time: false, range: [-EACH_PRE, EACH_POST] }, y: { range: yRange } } : { x: { time: true } },
      axes: [
        { stroke: "#5c5c5c", font: `${FONT_PX}px ${FONT}`, grid: { stroke: "#e6e1d3", width: 1 }, ticks: { stroke: "#d8d3c4" },
          size: () => (view.each ? 10 : X_AXIS) + markRows * MARK_ROW, ...(view.each ? eachAxis() : dayAxis()) },
        // 寬度照最長的刻度文字算（固定 56px 時「3000%」會壓到刻度線）
        { stroke: "#5c5c5c", font: `${FONT_PX}px ${FONT}`, grid: { stroke: "#e6e1d3", width: 1 }, ticks: { stroke: "#d8d3c4" },
          size: axisSize,
          values: (_, vals) => vals.map((v) => F.pct(v / 100, 0)) },
      ],
      // S&P 500 的虛線長度照螢幕倍率放大（uPlot 的虛線是畫布像素，高解析度螢幕上會縮成點線）
      series: [{}, ...view.lines.map((l) => ({ label: l.name, stroke: l.stroke || l.color, width: l.width,
                                               dash: l.key === "spy" ? l.dash.map((v) => v * devicePixelRatio) : l.dash || undefined,
                                               spanGaps: false, points: { show: false } }))],
      hooks: {
        setCursor: [showTip],
        drawAxes: [drawBand],
        draw: [drawMarks],
        setSeries: [(p, i) => {  // 滑到的那條變粗
          focused = i;
          p.series.forEach((s, k) => { if (k) s.width = view.lines[k - 1].width * (k === i ? 2 : 1); });
          p.redraw(false);
        }],
      },
    };
    const data = [view.xs, ...view.lines.map((l) => l.ys)];
    if (u) u.destroy();
    el.innerHTML = "";
    u = new uPlot(opts, data, el);
    el.appendChild(tip);
    tip.hidden = true;
  }

  // ch2：數據觀察第 2 章已經算好的資料（各自起算的背景）
  function init(chartEl, marksBox, ch2) {
    el = chartEl; marksEl = marksBox; band = ch2 || null;
    tip = document.createElement("div");
    tip.className = "tip";
    tip.hidden = true;
    new ResizeObserver(() => u && u.setSize(size())).observe(el);
    const touch = (e) => {  // 手指按住或拖曳時顯示那一天，放開就收起
      if (!u) return;
      const t = e.touches[0], r = u.over.getBoundingClientRect();
      u.setCursor({ left: t.clientX - r.left, top: t.clientY - r.top });
    };
    el.addEventListener("touchstart", touch, { passive: true });
    el.addEventListener("touchmove", touch, { passive: true });
    el.addEventListener("touchend", () => u && u.setCursor({ left: -10, top: -10 }));
  }

  return { init, render, sample, RANGES, BENCH, STOCK_COLORS, placed: () => placed };
})();
