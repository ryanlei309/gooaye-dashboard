// 走勢圖：S&P 500（SPY）、費半（^SOX 指數）與點選的個股（最多 5 檔），美元，從區間起點的 0% 開始；用 uPlot
// 色弱也分得出：大盤三條用不同的虛線、個股用實線；線尾直接標名稱；滑到某條線時那條變粗、其他變淡
"use strict";
const Chart = (() => {
  // 交易日數；Infinity＝全部（從 2020-02 節目開始）；"mention"＝首次提及（以最早被提到那檔的進場日為 0%）
  const RANGES = ["mention", 5, 20, 60, 126, 252, 756, 1260, Infinity];
  const MENTION_PAD = 0.05, MENTION_PAD_MIN = 10;  // 首次提及：往前多顯示整段期間的 5%，最少 10 個交易日
  const BENCH = [
    { key: "spy", name: T.spyLong, short: T.spy, color: "#4d4d4d", dash: [2, 3], priceCur: "USD" },
    { key: "sox", name: T.soxLong, short: T.sox, color: "#767676", dash: [10, 3, 2, 3], priceCur: "IDX" },
  ];
  const STOCK_COLORS = ["#1f4e8c", "#a0631c", "#6b3fa0", "#2f6f7e", "#7a5c3e"];
  const FONT = '-apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  let u = null, el, marksEl, tip, view = null, focused = null;

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

  function build(b, stocks, days) {
    const n = b.dates.length, mention = days === "mention" && stocks.length > 0;
    let start = Math.max(0, n - 1 - (days === "mention" ? 5 : days)), bases = {};
    if (mention) {
      const ai = b.dates.indexOf(stocks.reduce((a, s) => (s.entry_day < a.entry_day ? s : a)).entry_day);
      start = Math.max(0, ai - Math.max(MENTION_PAD_MIN, Math.round(MENTION_PAD * (n - 1 - ai))));
      bases = mentionBases(b, stocks, ai);
    }
    const xs = b.dates.slice(start).map((d) => Date.parse(d + "T00:00:00Z") / 1000);
    const lines = [
      ...BENCH.map((x) => ({ ...x, width: 1.5, price: b[x.key] })),
      ...stocks.map((s) => ({ name: s.ticker, short: s.ticker, color: s.color, dash: null, width: 2, price: s.c,
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
    const rows = view.lines.map((l) => ({ l, y: l.ys[idx], p: l.prices[idx] }))
      .sort((a, b) => (a.y == null) - (b.y == null) || b.y - a.y);
    tip.innerHTML = `<p class="tip-day">${F.date(view.dates[idx])}</p><table><tbody>` + rows.map(({ l, y, p }) =>
      `<tr><td>${sample(l)} ${F.esc(l.name)}</td><td class="n ${F.cls(y)}">${F.pct(y == null ? null : y / 100)}</td>` +
      `<td class="n">${F.price(p, l.priceCur)}</td></tr>`).join("") +
      `</tbody></table><p class="tip-note">${T.adjusted}</p>`;
    tip.hidden = false;
    const o = u.over.getBoundingClientRect(), r = el.getBoundingClientRect();
    const x0 = o.left - r.left + left, y0 = o.top - r.top + top, w = tip.offsetWidth, h = tip.offsetHeight;
    const x = x0 + 16 + w <= el.clientWidth ? x0 + 16 : Math.max(0, x0 - 16 - w);
    tip.style.transform = `translate(${x}px, ${Math.min(Math.max(0, y0 - h / 2), el.clientHeight - h)}px)`;
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
    // 線尾標名稱：照位置由上到下排，太近就往下推開
    const ends = view.lines.map((l, k) => {
      let j = l.ys.length - 1;
      while (j >= 0 && l.ys[j] == null) j--;
      return j < 0 ? null : { l, k: k + 1, y: plot.valToPos(l.ys[j], "y", true) };
    }).filter(Boolean).sort((a, b) => a.y - b.y);
    const gap = 14 * dpr;
    ends.forEach((e, i) => { if (i && e.y - ends[i - 1].y < gap) e.y = ends[i - 1].y + gap; });
    ctx.font = `${12 * dpr}px ${FONT}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";  // uPlot 畫座標軸時改成置右，這裡要設回來，名稱才會在線尾右邊
    const x = plot.bbox.left + plot.bbox.width + 6 * dpr;
    ends.forEach((e) => {
      ctx.globalAlpha = focused == null || focused === e.k ? 1 : 0.3;
      ctx.fillStyle = e.l.color;
      ctx.fillText(e.l.short, x, e.y);
    });
    ctx.restore();
  }

  function labelRoom() {
    const c = document.createElement("canvas").getContext("2d");
    c.font = `12px ${FONT}`;
    return Math.ceil(Math.max(...view.lines.map((l) => c.measureText(l.short).width))) + 12;
  }

  function size() {
    return { width: Math.max(200, el.clientWidth), height: Math.max(150, el.clientHeight) };
  }

  // 圖下方：每檔的首次提及日；不在目前期間的寫「（不在此期間）」
  function marks() {
    const first = view.dates[0];
    marksEl.innerHTML = view.lines.filter((l) => l.entry).map((l) =>
      `<span>${sample(l, true)} ${T.firstMark(F.esc(l.name), F.date(l.date))}${l.entry < first ? T.outside : ""}</span>`).join("");
  }

  function render(b, stocks, days) {
    view = build(b, stocks, days);
    focused = null;
    marks();
    const opts = {
      ...size(),
      padding: [12, labelRoom(), 0, 0],
      tzDate: (ts) => uPlot.tzDate(new Date(ts * 1e3), "Etc/UTC"),
      legend: { show: false },
      focus: { alpha: 0.3 },
      cursor: { drag: { x: false, y: false }, points: { size: 6 }, focus: { prox: 16 } },
      scales: { x: { time: true } },
      axes: [
        { stroke: "#5c5c5c", grid: { stroke: "#e6e1d3", width: 1 }, ticks: { stroke: "#d8d3c4" } },
        { stroke: "#5c5c5c", grid: { stroke: "#e6e1d3", width: 1 }, ticks: { stroke: "#d8d3c4" }, size: 56,
          values: (_, vals) => vals.map((v) => F.pct(v / 100, 0)) },
      ],
      series: [{}, ...view.lines.map((l) => ({ label: l.name, stroke: l.color, width: l.width, dash: l.dash || undefined,
                                               spanGaps: false, points: { show: false } }))],
      hooks: {
        setCursor: [showTip],
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

  function init(chartEl, marksBox) {
    el = chartEl; marksEl = marksBox;
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

  return { init, render, sample, RANGES, BENCH, STOCK_COLORS };
})();
