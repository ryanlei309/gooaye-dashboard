// 數據觀察（2026-11-18 第十八版，SPEC「數據觀察（Insights）與搜尋」）：四章，每章「問題 → 一張圖 → 一兩句白話結論」。
// 數字全部來自 data/summary.json 的 insights（和主結論同一段程式、每天重算；第 4 章跟著每月同步），結論裡的數字由程式帶入。
// 圖是自己畫的 SVG（照容器的實際寬度畫，手機上字不會縮小），不載入外部套件、不向其他網站發請求。顏色照各語言（中文紅贏綠輸、英文綠贏紅輸）。
"use strict";
(async () => {
  const pct = (x, d = 1) => F.pct(x, d), share = (x) => F.share(x);
  const TEXT = {
    zh: {
      n: (n) => `n = ${n} 檔`,
      ch1: {
        q: "為什麼只有 42% 贏過大盤？", qf: (w) => `為什麼只有 ${w} 贏過大盤？`,
        note: (n) => `主結論那組 ${n} 檔（2022 年起首次提及、已滿 12 個月），每一條是一檔的 12 個月超額報酬（對 S&amp;P 500），由高到低。超過圖右邊的，數字寫在旁邊。`,
        text: (c, t) => `${c.n} 檔裡只有 ${t.wins} 檔（${share(t.wins / t.n)}）贏過 S&amp;P 500。` +
          `超額報酬的中位數是 ${pct(t.median)}（95% 區間 ${pct(t.median_ci[0])}～${pct(t.median_ci[1])}），平均數卻是 ${pct(t.mean)}（${pct(t.mean_ci[0])}～${pct(t.mean_ci[1])}）。` +
          (c.top_share == null ? "" : c.top_share > 1
            ? `前 ${c.top} 名的超額報酬加起來，是全部 ${c.n} 檔總和的 ${share(c.top_share)}，也就是其他 ${c.n - c.top} 檔合起來是輸的。`
            : `前 ${c.top} 名的超額報酬加起來，佔全部 ${c.n} 檔總和的 ${share(c.top_share)}。`) +
          "大部分輸一點、少數大贏，所以平均很好看，典型的一檔卻輸。研究發現，大部分個股長期本來就跑輸大盤，50% 不是公平的標準。",
      },
      ch2: {
        q: "他提到之前，股價已經漲了嗎？",
        note: (n, pre, post) => `主結論那組裡，第 −${pre} 天就有股價的 ${n} 檔。第 0 天是首次提及後的進場日；每一天的超額報酬＝（當天收盤 ÷ 進場日開盤 − 1）減去 S&amp;P 500 同樣算法，看第 −${pre} 到第 +${post} 個交易日。`,
        median: "中位數", mean: "平均數", band: "中間 50% 的股票", mention: "首次提及", day: (d) => `第 ${d} 天`,
        // 第 −60 天中位數的相反數：負的＝提到前已經比大盤多漲；變成正的就自動改成「少漲」（2026-11-19 使用者定）
        text: (c, m) => `典型的一檔，在他提到前的 ${c.pre} 個交易日裡，已經比大盤${m.pre <= 0 ? "多" : "少"}漲了約 ${pct(Math.abs(m.pre)).replace("+", "")}。` +
          `之後中位數在第 ${m.peakDay} 天最高（${pct(m.peak)}），到第 ${c.post} 天是 ${pct(m.end)}；平均數是 ${pct(m.endMean)}，被少數大漲的拉高。` +
          "這只能說明提及前後股價怎麼走，不能說是因為他提到才漲或才跌。",
      },
      ch3: {
        q: "一年內，有多少股票翻倍？多少腰斬？",
        note: (n) => `主結論那組 ${n} 檔，首次提及後 12 個月內，到第 N 個交易日為止曾經碰到門檻的比例。上半部是漲、下半部是跌；虛線是同一段期間的 S&amp;P 500（只畫 ±10%、±20%）。`,
        up: { 10: "+10%", 20: "+20%", 100: "翻倍" }, down: { 10: "−10%", 20: "−20%", 50: "腰斬" }, spy: (k) => `S&amp;P 500 ${k}`,
        day: (d) => `第 ${d} 天`,
        text: (c) => `一年內，${c.n} 檔裡有 ${c.doubled} 檔（${share(c.doubled / c.n)}）曾經翻倍，${c.halved} 檔（${share(c.halved / c.n)}）曾經腰斬。` +
          `曾跌 20% 的有 ${share(c.down["20"][c.days])}，同一段期間的 S&amp;P 500 只有 ${share(c.spy_down["20"][c.days])}。` +
          "翻倍（變 2 倍）和腰斬（變一半）是對稱的。",
      },
      ch4: {
        q: "他聊過多少股票？",
        note: "網站上的美股個股（早期提及加 2022 年起），依首次提及的日期累計。ETF 和台股不在這裡。",
        early: "暖身期（2020–2021）", since: "2022 年起",
        text: (c) => `網站上一共有 ${c.n} 檔美股個股：暖身期（2020–2021）${c.early} 檔，2022 年起 ${c.since_2022} 檔，` +
          `2022 年起平均每季新增 ${c.per_quarter == null ? "—" : c.per_quarter.toFixed(1)} 檔。ETF 和台股不在這裡。`,
      },
    },
    en: {
      n: (n) => `n = ${n} stocks`,
      ch1: {
        q: "Why did only 42% beat the market?", qf: (w) => `Why did only ${w} beat the market?`,
        note: (n) => `The ${n} stocks in the main result (first mentioned from 2022, 12 months done). Each bar is one stock’s 12-month excess return over the S&amp;P 500, highest first. Bars past the right edge show their number.`,
        text: (c, t) => `Only ${t.wins} of ${c.n} stocks (${share(t.wins / t.n)}) beat the S&amp;P 500. ` +
          `The median excess return was ${pct(t.median)} (95% interval ${pct(t.median_ci[0])} to ${pct(t.median_ci[1])}), yet the mean was ${pct(t.mean)} (${pct(t.mean_ci[0])} to ${pct(t.mean_ci[1])}). ` +
          (c.top_share == null ? "" : c.top_share > 1
            ? `The top ${c.top} add up to ${share(c.top_share)} of the total excess return of all ${c.n}, so the other ${c.n - c.top} lost money together. `
            : `The top ${c.top} make up ${share(c.top_share)} of the total excess return of all ${c.n}. `) +
          "Most trailed a little and a few won big, so the average looks good while the typical stock lost. Research has found that most individual stocks trail the market over time anyway, so 50% isn’t a fair bar.",
      },
      ch2: {
        q: "Had the price already moved before he mentioned it?",
        note: (n, pre, post) => `The ${n} stocks in the main result with a price on day −${pre}. Day 0 is the entry day after the first mention; each day’s excess return = (that day’s close ÷ the entry-day open − 1) minus the same for the S&amp;P 500, from trading day −${pre} to +${post}.`,
        median: "Median", mean: "Mean", band: "Middle 50% of stocks", mention: "First mention", day: (d) => `Day ${d}`,
        text: (c, m) => `For the typical stock, in the ${c.pre} trading days before he mentioned it, it had already ${m.pre <= 0 ? "outrun" : "lagged"} the market by about ${pct(Math.abs(m.pre)).replace("+", "")}. ` +
          `Afterward the median peaked on day ${m.peakDay} (${pct(m.peak)}) and was ${pct(m.end)} by day ${c.post}; the mean was ${pct(m.endMean)}, pulled up by a few big winners. ` +
          "This only shows how prices moved around the mention; it doesn’t mean they rose or fell because he mentioned them.",
      },
      ch3: {
        q: "Within a year, how many doubled, and how many halved?",
        note: (n) => `The ${n} stocks in the main result: the share that had touched each level by trading day N in the 12 months after the first mention. Gains on top, losses below; dashed lines are the S&amp;P 500 over the same windows (±10% and ±20% only).`,
        up: { 10: "+10%", 20: "+20%", 100: "Doubled" }, down: { 10: "−10%", 20: "−20%", 50: "Halved" }, spy: (k) => `S&amp;P 500 ${k}`,
        day: (d) => `Day ${d}`,
        text: (c) => `Within a year, ${c.doubled} of ${c.n} stocks (${share(c.doubled / c.n)}) doubled at some point and ${c.halved} (${share(c.halved / c.n)}) halved. ` +
          `${share(c.down["20"][c.days])} fell 20% at some point, against ${share(c.spy_down["20"][c.days])} for the S&amp;P 500 over the same windows. ` +
          "Doubling (2×) and halving (½×) are mirror images.",
      },
      ch4: {
        q: "How many stocks has he talked about?",
        note: "US stocks on this site (early mentions plus 2022 on), counted by first-mention date. ETFs and Taiwan stocks aren’t included.",
        early: "Warm-up (2020–2021)", since: "From 2022",
        text: (c) => `This site has ${c.n} US stocks: ${c.early} from the warm-up years (2020–2021) and ${c.since_2022} from 2022 on, ` +
          `an average of ${c.per_quarter == null ? "—" : c.per_quarter.toFixed(1)} new stocks a quarter since 2022. ETFs and Taiwan stocks aren’t included.`,
      },
    },
  }[LANG];

  const s = await fetch(ROOT + "data/summary.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  const $ = (id) => document.getElementById(id);
  $("headline").innerHTML = T.headline(F.share(s.main.spy.win), s.main.done);
  $("price-date").textContent = T.priceDate(F.date(s.price_date));
  $("last-ep").textContent = T.lastEp(s.last_ep);
  const I = s.insights;

  // ---- SVG 小工具 ----
  const svg = (w, h, body, label) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}">${body}</svg>`;
  const txt = (x, y, s, a = {}) => `<text x="${x}" y="${y}"${Object.entries(a).map(([k, v]) => ` ${k}="${v}"`).join("")}>${s}</text>`;
  const scale = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
  const ticks = (lo, hi, n) => {
    const raw = (hi - lo) / n, p = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= raw);
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  };
  const line = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");

  // 第 1 章：每一檔一條橫條，由高到低；贏＝實心、輸＝空心（顏色照各語言）
  function ch1(w) {
    const c = I.ch1, bars = c.bars, row = 6, top = 22, h = top + bars.length * row + 26, left = 24, right = w - 128;
    const lo = Math.min(-1, ...bars.map((b) => b.x)), hi = 3;  // 右邊到 +300%，超過的寫數字
    const x = scale(lo, hi, left, right), x0 = x(0);
    let body = ticks(lo, hi, 5).map((v) => `<line x1="${x(v)}" x2="${x(v)}" y1="${top - 4}" y2="${h - 22}" class="grid"/>` +
      txt(x(v), h - 6, pct(v, 0), { class: "tick", "text-anchor": "middle" })).join("");
    let ly = top + 4;  // 前幾名的標籤排在右邊一欄，細線連到橫條的末端（橫條只有 6px 高，直接標會重疊）
    bars.forEach((b, i) => {
      const y = top + i * row, xe = x(Math.min(b.x, hi)), win = b.x > 0;
      body += `<rect x="${Math.min(x0, xe).toFixed(1)}" y="${y + 0.5}" width="${Math.max(0.8, Math.abs(xe - x0)).toFixed(1)}" height="${row - 1.5}" class="${win ? "bar-win" : "bar-lose"}"/>`;
      if (i < c.top) {
        ly = Math.max(ly, y + row / 2);
        body += `<path d="M${(xe + 2).toFixed(1)},${(y + row / 2).toFixed(1)}L${right + 4},${ly.toFixed(1)}" class="leader"/>` +
          txt(right + 8, ly + 4, `${b.t} ${pct(b.x, 0)}`, { class: "lab" });
        ly += 16;
      }
    });
    body += `<line x1="${x0}" x2="${x0}" y1="${top - 6}" y2="${h - 22}" class="axis0"/>`;
    return svg(w, h, body, TEXT.ch1.qf(share(c.tests.wins / c.tests.n)));
  }

  // 第 2 章：中位數（主線）、平均數（細線）、中間 50%（淺色帶）；第 0 天畫直線
  function ch2(w) {
    const c = I.ch2, n = c.median.length, h = Math.round(Math.min(420, Math.max(300, w * 0.55))), m = { l: 52, r: 16, t: 26, b: 34 };
    const days = Array.from({ length: n }, (_, i) => i - c.pre);
    const all = [...c.q25, ...c.q75, ...c.mean, ...c.median], lo = Math.min(...all), hi = Math.max(...all);
    const x = scale(-c.pre, c.post, m.l, w - m.r), y = scale(lo, hi, h - m.b, m.t);
    let body = ticks(lo, hi, 5).map((v) => `<line x1="${m.l}" x2="${w - m.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/>` +
      txt(m.l - 6, y(v) + 4, pct(v, 0), { class: "tick", "text-anchor": "end" })).join("");
    const narrow = w < 560;  // 窄的時候日期只寫數字，不寫「第…天」，才不會擠在一起
    [-c.pre, 0, 60, 120, 180, c.post].forEach((d) => {
      const v = d > 0 ? `+${d}` : d === 0 ? "0" : `−${-d}`;
      body += txt(x(d), h - 10, narrow ? v : TEXT.ch2.day(v), { class: "tick", "text-anchor": d === -c.pre ? "start" : d === c.post ? "end" : "middle" });
    });
    body += `<path d="${line(days.map((d, i) => [x(d), y(c.q75[i])]))}${line(days.map((d, i) => [x(d), y(c.q25[i])]).reverse()).replace("M", "L")}Z" class="band"/>`;
    body += `<line x1="${m.l}" x2="${w - m.r}" y1="${y(0)}" y2="${y(0)}" class="axis0"/>`;
    body += `<line x1="${x(0)}" x2="${x(0)}" y1="${m.t - 10}" y2="${h - m.b}" class="mark"/>` + txt(x(0) + 5, m.t - 12, TEXT.ch2.mention, { class: "lab" });
    body += `<path d="${line(days.map((d, i) => [x(d), y(c.mean[i])]))}" class="mean"/>`;
    body += `<path d="${line(days.map((d, i) => [x(d), y(c.median[i])]))}" class="median"/>`;
    return svg(w, h, body, TEXT.ch2.q);
  }

  // 第 3 章：上半部漲（+10%、+20%、翻倍）、下半部跌（−10%、−20%、腰斬），像鏡子；S&P 500 只畫 ±10%、±20%（虛線）
  function ch3(w) {
    const c = I.ch3, h = Math.round(Math.min(460, Math.max(340, w * 0.6))), m = { l: 46, r: 122, t: 14, b: 30 };
    const x = scale(0, c.days, m.l, w - m.r), y = scale(-1, 1, h - m.b, m.t);
    let body = [-1, -0.5, 0, 0.5, 1].map((v) => `<line x1="${m.l}" x2="${w - m.r}" y1="${y(v)}" y2="${y(v)}" class="${v ? "grid" : "axis0"}"/>` +
      txt(m.l - 6, y(v) + 4, share(Math.abs(v)), { class: "tick", "text-anchor": "end" })).join("");
    [0, 63, 126, 189, 252].forEach((d) => { body += txt(x(d), h - 8, w < 560 ? d : TEXT.ch3.day(d), { class: "tick", "text-anchor": d ? (d === 252 ? "end" : "middle") : "start" }); });
    const ends = [];
    const curve = (vals, sign, cls, label) => {
      body += `<path d="${line(vals.map((v, i) => [x(i), y(sign * v)]))}" class="${cls}"/>`;
      ends.push({ y: y(sign * vals[vals.length - 1]), label, cls });
    };
    Object.entries(c.spy_up).forEach(([k, v]) => curve(v, 1, "spy", TEXT.ch3.spy(TEXT.ch3.up[k])));
    Object.entries(c.spy_down).forEach(([k, v]) => curve(v, -1, "spy", TEXT.ch3.spy(TEXT.ch3.down[k])));
    Object.entries(c.up).forEach(([k, v]) => curve(v, 1, `up up${k}`, TEXT.ch3.up[k]));
    Object.entries(c.down).forEach(([k, v]) => curve(v, -1, `down down${k}`, TEXT.ch3.down[k]));
    ends.sort((a, b) => a.y - b.y).forEach((e, i, arr) => { if (i && e.y - arr[i - 1].y < 15) e.y = arr[i - 1].y + 15; });
    ends.forEach((e) => { body += txt(w - m.r + 6, e.y + 4, e.label, { class: `lab end-${e.cls.split(" ")[0]}` }); });
    return svg(w, h, body, TEXT.ch3.q);
  }

  // 第 4 章：累計提過的不同股票數（階梯線），標出 2022-01-01 的分界
  function ch4(w) {
    const c = I.ch4, h = Math.round(Math.min(380, Math.max(280, w * 0.5))), m = { l: 44, r: 16, t: 28, b: 30 };
    const t = (d) => Date.parse(d + "T00:00:00Z"), t0 = t("2020-02-01"), t1 = t(c.last_ep_date || c.steps[c.steps.length - 1].date);
    const x = scale(t0, t1, m.l, w - m.r), y = scale(0, c.n, h - m.b, m.t);
    let body = ticks(0, c.n, 4).map((v) => `<line x1="${m.l}" x2="${w - m.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/>` +
      txt(m.l - 6, y(v) + 4, v, { class: "tick", "text-anchor": "end" })).join("");
    for (let yr = 2021; yr <= new Date(t1).getUTCFullYear(); yr++) body += txt(x(t(`${yr}-01-01`)), h - 8, yr, { class: "tick", "text-anchor": "middle" });
    const xs = x(t("2022-01-01"));
    body += `<rect x="${m.l}" y="${m.t}" width="${xs - m.l}" height="${h - m.b - m.t}" class="warm"/>`;
    body += `<line x1="${xs}" x2="${xs}" y1="${m.t - 12}" y2="${h - m.b}" class="mark"/>` +
      txt(xs - 6, m.t - 14, TEXT.ch4.early, { class: "lab", "text-anchor": "end" }) + txt(xs + 6, m.t - 14, TEXT.ch4.since, { class: "lab" });
    const pts = [[x(t0), y(0)]];
    c.steps.forEach((p) => { const xx = x(t(p.date)); pts.push([xx, pts[pts.length - 1][1]], [xx, y(p.n)]); });
    pts.push([x(t1), pts[pts.length - 1][1]]);
    body += `<path d="${line(pts)}" class="median"/>`;
    return svg(w, h, body, TEXT.ch4.q);
  }

  // 第 2 章的結論用的幾個數字（都從資料算，不寫死）
  const c2 = I.ch2, at = (d) => c2.median[d + c2.pre];
  let peakDay = 1;
  for (let d = 1; d <= c2.post; d++) if (at(d) > at(peakDay)) peakDay = d;
  const m2 = { pre: at(-c2.pre), peakDay, peak: at(peakDay), end: at(c2.post), endMean: c2.mean[c2.post + c2.pre] };

  const chapters = [
    { id: "ch1", q: TEXT.ch1.qf(share(I.ch1.tests.wins / I.ch1.tests.n)), n: I.ch1.n, note: TEXT.ch1.note(I.ch1.n), draw: ch1, text: TEXT.ch1.text(I.ch1, I.ch1.tests) },
    { id: "ch2", q: TEXT.ch2.q, n: c2.n, note: TEXT.ch2.note(c2.n, c2.pre, c2.post), draw: ch2, text: TEXT.ch2.text(c2, m2),
      legend: [["median", TEXT.ch2.median], ["mean", TEXT.ch2.mean], ["band", TEXT.ch2.band]] },
    { id: "ch3", q: TEXT.ch3.q, n: I.ch3.n, note: TEXT.ch3.note(I.ch3.n), draw: ch3, text: TEXT.ch3.text(I.ch3) },
    { id: "ch4", q: TEXT.ch4.q, n: I.ch4.n, note: TEXT.ch4.note, draw: ch4, text: TEXT.ch4.text(I.ch4) },
  ];
  $("chapters").innerHTML = chapters.map((c, i) => `<section class="chapter" id="${c.id}" aria-labelledby="${c.id}-q">
      <h2 id="${c.id}-q"><span class="no">${i + 1}</span>${c.q}</h2>
      <figure><div class="fig" data-ch="${i}"></div>
        <figcaption><span class="n">${TEXT.n(c.n)}</span>${c.legend ? c.legend.map(([k, v]) => `<span class="key key-${k}">${v}</span>`).join("") : ""}
          <span class="note">${c.note}</span></figcaption></figure>
      <p class="takeaway">${c.text}</p></section>`).join("");
  const figs = [...document.querySelectorAll(".fig")];
  const draw = () => figs.forEach((f) => { const w = Math.round(f.clientWidth); if (w && Number(f.dataset.w) !== w) { f.dataset.w = w; f.innerHTML = chapters[f.dataset.ch].draw(w); } });
  draw();
  new ResizeObserver(draw).observe(document.getElementById("chapters"));
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
})().catch((err) => {
  document.getElementById("chapters").textContent = T.loadFail;
  console.error(err);
});
