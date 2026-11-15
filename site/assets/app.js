// 首頁：讀資料、主結論、泡泡／表格、選股（最多 5 檔）、點選後的明細（一次一檔，用股票標籤切換）
// 只放美股，和 S&P 500（SPY）比、用美元（SPEC「主結論與參考分析」）；早期提及標出來、不算進主結論
"use strict";
(async () => {
  const params = new URLSearchParams(location.search);
  if (LANG === "zh" && params.get("lang") === "en") { location.replace("en/" + location.hash); return; }  // ?lang=en 也能開英文版
  const MAX = 5;
  const get = (p) => fetch(ROOT + p).then((r) => { if (!r.ok) throw new Error(p); return r.json(); });
  const [summary, events, bench] = await Promise.all(["data/summary.json", "data/events.json", "data/benchmarks.json"].map(get));
  const state = { view: "bubbles", days: 252, picked: [], focus: null };
  const prices = new Map();
  const bubbleOf = new Map(summary.bubbles.map((b) => [b.ticker, b]));
  const eventOf = new Map(events.filter((e) => e.kind === "個股").map((e) => [e.ticker, e]));
  const $ = (id) => document.getElementById(id);
  const color = (t) => Chart.STOCK_COLORS[state.picked.indexOf(t)];

  // 主結論：事先定好算法的研究結論，不跟著點選變動
  const m = summary.main, w = summary.worst;
  $("headline").innerHTML = T.headline(F.share(m.spy.win), m.done);
  $("worst").textContent = T.worst(w.done, F.share(w.spy.win));
  $("price-date").textContent = T.priceDate(F.date(summary.price_date));
  $("last-ep").textContent = T.lastEp(summary.last_ep);

  const items = summary.bubbles.map((b) => ({ ticker: b.ticker, date: b.date, ex: b.to_date.USD.vs_spy, early: b.early }));

  async function load(t) {
    if (!prices.has(t)) prices.set(t, await get(`data/prices/${encodeURIComponent(t)}.json`));
    return prices.get(t);
  }
  const loadAll = () => Promise.all(summary.bubbles.map((b) => load(b.ticker)));

  async function drawChart() {
    const stocks = await Promise.all(state.picked.map(async (t) => ({
      ticker: t, c: (await load(t)).c, entry_day: eventOf.get(t).entry_day, date: eventOf.get(t).date, color: color(t) })));
    Chart.render(bench, stocks, state.days);
  }

  // 已選股票的標籤：也是明細的切換鈕。正在顯示的實心、其他空心
  function chips() {
    $("chips").innerHTML = state.picked.map((t) => {
      const on = t === state.focus;
      return `<span class="chip${on ? " on" : ""}" style="--c:${color(t)}">${Chart.sample({ color: on ? "#fff" : color(t) })}` +
        `<button type="button" data-show="${F.esc(t)}" aria-pressed="${on}" aria-label="${F.esc(T.show(t))}">${F.esc(t)}</button>` +
        `<button type="button" class="x" data-drop="${F.esc(t)}" aria-label="${F.esc(T.remove(t))}">×</button></span>`;
    }).join("") + (state.picked.length > 1 ? `<button type="button" class="clear" id="clear">${T.clearAll}</button>` : "");
  }

  // 明細：一次一檔，和 S&P 500、費半同一段期間左右對照（每檔的 12 個月期間不同，大盤同期數字也不同）
  function detail() {
    const box = $("detail"), t = state.focus;
    if (!t) { box.innerHTML = `<p class="empty">${T.empty}</p>`; return; }
    const e = eventOf.get(t), b = bubbleOf.get(t), x = b.to_date.USD, p = b.paths.USD, win = b.window;
    const cols = [["stock", `${Chart.sample({ color: color(t) })} ${F.esc(t)}`],
                  ["spy", `${Chart.sample(Chart.BENCH[0])} ${T.spy}`], ["sox", `${Chart.sample(Chart.BENCH[1])} ${T.sox}`]];
    const td = (v, f, c = F.cls(v)) => `<td class="n ${c}">${f(v)}</td>`;
    const row = (name, f) => `<tr><th scope="row">${name}</th>${cols.map(([k]) => f(k)).join("")}</tr>`;
    const path = (name, f, c = () => "") => row(name, (k) => (p[k] ? td(p[k], f, c(p[k])) : `<td class="n">—</td>`));
    const at = (v, d) => `${F.pct(v)}<span class="u">${T.atDay(d)}</span>`;
    const span = win.end ? T.window12(F.date(win.start), F.date(win.end)) : T.window12Open(F.date(win.start), p.stock.days);
    const sec = (text) => `<tr class="sec"><th scope="colgroup" colspan="${cols.length + 1}">${text}</th></tr>`;
    const company = LANG === "en" ? e.company_en || e.company : e.company;
    const quote = `<blockquote><p lang="zh-Hant">${F.esc(e.quote)}</p>` + (LANG === "en" && e.quote_en
      ? `<p class="tr">${F.esc(e.quote_en)} <span class="tag">${T.aiTranslation}</span></p>` : "") + "</blockquote>";
    box.innerHTML = `
      <h2>${F.esc(t)} ${F.esc(company)}${e.early ? ` <span class="early-tag">${T.early}</span>` : ""}</h2>
      <p class="meta">${T.firstMention(e.ep, F.date(e.date), T.segment[e.segment] || e.segment)}｜${T.laterEps(e.later_episodes)}
        ${e.url ? `｜<a href="${F.esc(e.url)}" target="_blank" rel="noopener noreferrer">${T.listen(e.ep)}</a>` : ""}</p>
      ${quote}
      <div class="cmp-box"><table class="cmp">
        <thead><tr><th scope="col"><span class="visually-hidden">${T.item}</span></th>
          ${cols.map(([, n]) => `<th scope="col" class="n">${n}</th>`).join("")}</tr></thead>
        <tbody>
          ${sec(T.sinceEntry(F.date(win.start), F.date(summary.price_date)))}
          ${row(T.rowReturn, (k) => td(k === "stock" ? x.return : x.bench[k], F.pct))}
          ${row(T.rowVs, (k) => (k === "stock" ? `<td class="n"></td>` : td(x["vs_" + k], F.pct)))}
          ${sec(span)}
          ${path(T.rowUp10, (m) => F.day(m.days_to_up_10))}
          ${path(T.rowUp20, (m) => F.day(m.days_to_up))}
          ${path(T.rowMaxGain, (m) => at(m.max_gain, m.max_gain_day), (m) => F.cls(m.max_gain))}
          ${path(T.rowMaxLoss, (m) => at(m.max_loss, m.max_loss_day), (m) => F.cls(m.max_loss))}
        </tbody></table></div>`;
  }

  function note(text) { $("chart-note").textContent = text; }

  function pick(t) {
    if (!state.picked.includes(t)) {
      if (state.picked.length >= MAX) { note(T.maxPicked(MAX)); return; }
      state.picked.push(t);
    }
    state.focus = t;  // 新加的、或再點一次的，成為正在顯示的那檔
    note("");
    refresh();
  }

  function drop(t) {
    state.picked = state.picked.filter((x) => x !== t);
    if (state.focus === t) state.focus = state.picked[state.picked.length - 1] || null;
    note("");
    refresh();
  }

  function refresh() {
    chips(); detail(); drawChart(); Bubbles.refreshPicked(); Table.render();
  }

  function setView(v) {
    state.view = v;
    document.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === v)));
    $("table-tools").hidden = v !== "table";
    $("table-box").hidden = v !== "table";
    Bubbles.show(v === "bubbles");
    Table.render();
  }

  // 語言切換：網址跟著換，保留 #method 這類說明視窗的網址
  document.querySelectorAll("[data-lang-link]").forEach((a) => a.addEventListener("click", () => {
    a.href = a.getAttribute("href").split("#")[0] + location.hash;
  }));

  // 控制項
  document.querySelectorAll("[data-view]").forEach((btn) => btn.addEventListener("click", () => setView(btn.dataset.view)));
  $("ranges").innerHTML = Chart.RANGES.map((n, i) =>
    `<button type="button" data-days="${n}" aria-pressed="${n === state.days}">${T.ranges[i]}</button>`).join("");
  $("ranges").addEventListener("click", (e) => {
    const b = e.target.closest("[data-days]");
    if (!b) return;
    state.days = Number(b.dataset.days);
    $("ranges").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    drawChart();
  });
  $("chips").addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.drop) drop(t.dataset.drop);
    else if (t.dataset.show) { state.focus = t.dataset.show; chips(); detail(); }
    else if (t.id === "clear") { state.picked = []; state.focus = null; note(""); refresh(); }
  });

  Dialogs.init(summary, events, bench);
  Chart.init($("chart"), $("marks"));
  Bubbles.init($("bubbles"), items, pick, (t) => state.picked.includes(t));
  Table.init($("table-box"), $("upto"), $("table-filter"), { summary, bench, eventOf, prices, pick, loadAll,
                                                            isPicked: (t) => state.picked.includes(t) });
  detail(); drawChart();
})().catch((err) => {
  document.getElementById("chart-note").textContent = T.loadFail;
  console.error(err);
});
