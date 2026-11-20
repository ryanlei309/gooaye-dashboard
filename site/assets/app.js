// 首頁：讀資料、主結論、泡泡／表格、選股（最多 5 檔）、點選後的明細（一次一檔，用股票標籤切換）
// 只放美股，和 S&P 500（SPY）比、用美元（SPEC「主結論與參考分析」）；早期提及標出來、不算進主結論
"use strict";
(async () => {
  const params = new URLSearchParams(location.search);
  if (LANG === "zh" && params.get("lang") === "en") { location.replace("en/" + location.hash); return; }  // ?lang=en 也能開英文版
  if (Tour.redirectOnce()) return;  // 第一次進中文版、瀏覽器不是中文：轉到英文版（只轉一次）
  const MAX = 5;
  const get = (p) => fetch(ROOT + p).then((r) => { if (!r.ok) throw new Error(p); return r.json(); });
  const [summary, events, bench] = await Promise.all(["data/summary.json", "data/events.json", "data/benchmarks.json"].map(get));
  // 時間區間：還沒選股票時 1 週；選了 1 檔自動切到「首次提及」、2 檔以上切到「各自起算」（第二十一版），
  // 除非使用者自己選過區間（rangeSet：之後加減股票都不再自動切換）
  const state = { view: "bubbles", days: 5, rangeSet: false, picked: [], focus: null };
  const prices = new Map();
  const bubbleOf = new Map(summary.bubbles.map((b) => [b.ticker, b]));
  const eventOf = new Map(events.filter((e) => e.kind === "個股").map((e) => [e.ticker, e]));
  const $ = (id) => document.getElementById(id);
  const color = (t) => Chart.STOCK_COLORS[state.picked.indexOf(t)];

  // 主結論：事先定好算法的研究結論，不跟著點選變動
  // 最壞情況（2026-11-16 第十版）移到方法與限制，首頁只留主結論一句
  const m = summary.main;
  $("headline").innerHTML = T.headline(F.share(m.spy.win), m.done) +  // 第十八版：連到數據觀察第 1 章
    ` <a class="why-link" href="insights/#ch1">${T.whyLink(F.share(m.spy.win))}</a>`;
  $("price-date").textContent = T.priceDate(F.date(summary.price_date));
  $("last-ep").textContent = T.lastEp(summary.last_ep);

  const items = summary.bubbles.map((b) => ({ ticker: b.ticker, date: b.date, ex: b.to_date.USD.vs_spy, early: b.early }));

  // 讀一檔的股價；失敗就重試一次（GitHub Pages 偶爾回 503）
  async function load(t) {
    if (!prices.has(t)) {
      const path = `data/prices/${encodeURIComponent(t)}.json`;
      prices.set(t, await get(path).catch(() => new Promise((r) => setTimeout(r, 800)).then(() => get(path))));
    }
    return prices.get(t);
  }

  async function drawChart() {
    const stocks = await Promise.all(state.picked.map(async (t) => ({
      ticker: t, ...(({ c, x }) => ({ c, x }))(await load(t)), entry_day: eventOf.get(t).entry_day, date: eventOf.get(t).date, color: color(t),
      open: bubbleOf.get(t).entry_open, bench: bubbleOf.get(t).to_date.USD.bench })));
    Chart.render(bench, stocks, state.days);
  }

  // 已選股票的標籤：也是明細的切換鈕。正在顯示的實心、其他空心。
  // 沒選股票時顯示淡灰色提示（第十四版）：這一列一開始就佔好高度，點了之後版面不跳動
  function chips() {
    if (!state.picked.length) { $("chips").innerHTML = `<span class="chips-hint">${T.chipsHint}</span>`; return; }
    $("chips").innerHTML = state.picked.map((t) => {
      const on = t === state.focus;
      return `<span class="chip${on ? " on" : ""}" style="--c:${color(t)}">${Chart.sample({ color: on ? "#fff" : color(t) })}` +
        // 早期提及：框框裡一個「E」，滑過顯示「早期提及（2020–2021）」，可存取名稱也念得出來
        `<button type="button" data-show="${F.esc(t)}" aria-pressed="${on}" ` +
        `aria-label="${F.esc(T.show(t))}${eventOf.get(t).early ? (LANG === "en" ? ", " : "，") + T.early : ""}">${F.esc(t)}` +
        (eventOf.get(t).early ? ` <span class="early-tag" title="${T.early}" aria-hidden="true">E</span>` : "") + `</button>` +
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
      <p class="meta">${T.firstMention(e.ep, F.date(e.date), T.segment[e.segment] || e.segment)}｜${T.laterEps(e.later_episodes)}｜<a href="https://finance.yahoo.com/quote/${encodeURIComponent(t)}/profile/" target="_blank" rel="noopener noreferrer">${T.profile}</a>
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

  // 時間區間按鈕：選中的 aria-pressed；「各自起算」「首次提及」在還沒選股票時不能按
  function syncRanges() {
    $("ranges").querySelectorAll("button").forEach((x) => {
      x.setAttribute("aria-pressed", String(x.dataset.days === String(state.days)));
      if (x.dataset.days === "mention" || x.dataset.days === "each") x.disabled = !state.picked.length;
    });
  }

  // 預設的區間（使用者沒自己選過時）：沒選股票 1 週、1 檔「首次提及」、2 檔以上「各自起算」
  function autoRange() {
    if (!state.rangeSet) state.days = !state.picked.length ? 5 : state.picked.length === 1 ? "mention" : "each";
  }

  // 點泡泡或表格的一列：沒選的加進來；已經選了的再點一次就取消（第七版）
  function pick(t) {
    if (state.picked.includes(t)) { drop(t); return; }
    if (state.picked.length >= MAX) { note(T.maxPicked(MAX)); return; }
    state.picked.push(t);
    autoRange();
    state.focus = t;  // 新加的成為正在顯示的那檔
    note("");
    refresh();
  }

  function drop(t) {
    state.picked = state.picked.filter((x) => x !== t);
    autoRange();
    if (state.focus === t) state.focus = state.picked[state.picked.length - 1] || null;
    note("");
    refresh();
  }

  function refresh() {
    if (!state.picked.length && (state.days === "mention" || state.days === "each")) state.days = 5;  // 沒有股票就沒有這兩種，回到 1 週
    syncRanges(); chips(); detail(); drawChart(); Bubbles.refreshPicked(); Table.render();
  }

  function setView(v) {
    state.view = v;
    document.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === v)));
    $("table-box").hidden = v !== "table";
    $("table-mode").hidden = v !== "table";  // 「報酬｜本益比」只在表格模式
    Bubbles.show(v === "bubbles");
    Table.render();
  }

  // 語言切換：網址跟著換，保留 #method 這類說明視窗的網址
  document.querySelectorAll("[data-lang-link]").forEach((a) => a.addEventListener("click", () => {
    a.href = a.getAttribute("href").split("#")[0] + location.hash;
  }));

  // 控制項
  document.querySelectorAll("[data-view]").forEach((btn) => btn.addEventListener("click", () => setView(btn.dataset.view)));
  function setMode(mode) {
    document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
    Table.setMode(mode);
  }
  document.querySelectorAll("[data-mode]").forEach((btn) => btn.addEventListener("click", () => setMode(btn.dataset.mode)));
  Info.init();
  $("ranges").innerHTML = Chart.RANGES.map((n, i) =>
    `<button type="button" data-days="${n}" aria-pressed="false">${T.ranges[i]}</button>`).join("");
  syncRanges();
  $("ranges").addEventListener("click", (e) => {
    const b = e.target.closest("[data-days]");
    if (!b || b.disabled) return;
    state.days = b.dataset.days === "mention" || b.dataset.days === "each" ? b.dataset.days : Number(b.dataset.days);
    state.rangeSet = true;  // 使用者自己選過：之後加新股票不再自動切換區間
    syncRanges();
    drawChart();
  });
  $("chips").addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.drop) drop(t.dataset.drop);
    else if (t.dataset.show) { state.focus = t.dataset.show; chips(); detail(); }
    else if (t.id === "clear") { state.picked = []; state.focus = null; autoRange(); note(""); refresh(); }
  });

  // 年份選單（第九版）：全部、各年份（照資料自動產生，新的在前）、早期（2020–2021）；泡泡和表格共用
  const years = [...new Set(summary.bubbles.filter((b) => !b.early).map((b) => b.date.slice(0, 4)))].sort().reverse();
  $("year").innerHTML = [["all", T.yearAll], ...years.map((y) => [y, y]), ["early", T.yearEarly]]
    .map(([v, n]) => `<option value="${v}">${n}</option>`).join("");
  const inYear = (y) => (b) => (y === "all" ? true : y === "early" ? b.early : !b.early && b.date.startsWith(y));
  // 年份選單的寬度跟著目前選的那一項（原生 select 預設是最長選項的寬度，▾ 會離文字很遠）
  const fitYear = () => {
    const sel = $("year"), c = document.createElement("canvas").getContext("2d");
    c.font = getComputedStyle(sel).font;
    sel.style.width = Math.ceil(c.measureText(sel.options[sel.selectedIndex].text).width) + 26 + "px";  // 文字＋▾ 的空間
  };
  fitYear();
  $("year").addEventListener("change", fitYear);
  $("year").addEventListener("change", () => {
    const f = inYear($("year").value);
    Bubbles.setItems(items.filter(f));
    Table.setYear(f);
  });
  const setYear = (y) => { if ($("year").value !== y) { $("year").value = y; $("year").dispatchEvent(new Event("change")); } };

  Dialogs.init(summary, events, bench);
  Chart.init($("chart"), $("marks"), summary.insights && summary.insights.ch2);  // 各自起算的背景用數據觀察第 2 章的資料
  Bubbles.init($("bubbles"), items, pick, (t) => state.picked.includes(t));
  Table.init($("table-box"), { summary, bench, eventOf, prices, pick,
                                                            isPicked: (t) => state.picked.includes(t) });
  chips(); detail(); drawChart();
  // 搜尋選了一檔（第十八版）：加進走勢圖、顯示明細；被年份篩掉的就切回「全部」；泡泡模式把時間捲到那一檔並亮起來，表格捲到那一列
  Search.init({
    reveal: (t) => {
      const b = bubbleOf.get(t);
      if (!b) return;
      if (!inYear($("year").value)(b)) setYear("all");
      if (!state.picked.includes(t)) pick(t);
      if (state.picked.includes(t)) { state.focus = t; chips(); detail(); }
      if (state.view === "bubbles") Bubbles.reveal(t); else Table.reveal(t);
    },
  });
  // 導覽（第十四版聚光燈）：開始時暫時選 SMTC 和 TEAM（明細顯示 TEAM），結束或關掉後恢復訪客原本的狀態
  // （已選的股票、正在看的那檔、泡泡／表格、報酬／本益比、年份、時間區間）
  Tour.init({
    facts: { days: m.up10?.median_days ?? null, win: F.share(m.spy.win) },  // 導覽第 2 頁的數字（和主結論同一組）
    save: () => ({ picked: [...state.picked], focus: state.focus, days: state.days, rangeSet: state.rangeSet, view: state.view,
                   mode: document.querySelector('[data-mode][aria-pressed="true"]')?.dataset.mode || "ret", year: $("year").value }),
    demo: () => {
      setYear("all"); setView("bubbles");
      state.picked = ["SMTC", "TEAM"].filter((t) => eventOf.has(t));
      Object.assign(state, { focus: state.picked[state.picked.length - 1] || null, days: "mention", rangeSet: false });
      note(""); refresh();
    },
    restore: (s) => {
      setYear(s.year); setMode(s.mode); setView(s.view);
      Object.assign(state, { picked: s.picked, focus: s.focus, days: s.days, rangeSet: s.rangeSet });
      note(""); refresh();
    },
  });
})().catch((err) => {
  document.getElementById("chart-note").textContent = T.loadFail;
  console.error(err);
});
