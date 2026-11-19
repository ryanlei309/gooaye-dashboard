// 搜尋（2026-11-18 第十八版）：泡泡區那一列最右邊的放大鏡，點了展開搜尋框（泡泡和表格模式都有）。
// 只用現有資料（assets/search.json，私人匯出產生）：網站上每一檔的代號、已核准字典的寫法、公司中英文名；不分大小寫、打一部分也找得到。
// 有提到但不在網站上的，列出原因；完全沒提過的才顯示「沒有找到」。第一次打開才下載索引（約 50 KB），不向其他網站發請求。
// 鍵盤：Enter／空白鍵打開，輸入框裡上下方向鍵選結果、Enter 選、Esc 關閉並回到放大鏡。
"use strict";
const Search = (() => {
  const MAX = 8;
  let data = null, btn, box, input, list, results = [], active = -1, reveal;
  const norm = (s) => String(s).normalize("NFKC").toLowerCase().trim();

  // 比對：代號或寫法完全一樣 0、開頭一樣 1、包含 2；網站上的排前面
  function rank(row, q) {
    let best = null, hit = null;
    for (const name of [row.t, ...row.n]) {
      const k = norm(name), s = k === q ? 0 : k.startsWith(q) ? 1 : k.includes(q) ? 2 : null;
      if (s != null && (best == null || s < best)) { best = s; hit = name; }
    }
    return best == null ? null : { row, score: best, hit };
  }

  function find(text) {
    const q = norm(text);
    if (!q) return [];
    const pick = (rows, site) => rows.map((r) => rank(r, q)).filter(Boolean)
      .sort((a, b) => a.score - b.score || a.row.t.localeCompare(b.row.t)).map((x) => ({ ...x, site }));
    return [...pick(data.site, true), ...pick(data.other, false)].slice(0, MAX);
  }

  // 網站上的：「NVDA NVIDIA（輝達）」；不在網站上的：「聯發科（2454）— 台股，12 月加入」
  function label(x) {
    const r = x.row;
    if (x.site) {
      const name = (LANG === "en" ? r.en || r.zh : r.zh || r.en) || "";
      const extra = x.hit !== r.t && x.hit !== name ? (LANG === "en" ? ` (${x.hit})` : `（${x.hit}）`) : "";
      return `<strong>${F.esc(r.t)}</strong> ${F.esc(name)}${F.esc(extra)}`;
    }
    const name = x.hit === r.t ? r.t : `${x.hit}${LANG === "en" ? ` (${r.t})` : `（${r.t}）`}`;
    return `${F.esc(name)} <span class="why">— ${T.searchWhy[r.why] || ""}</span>`;
  }

  function show() {
    results = find(input.value);
    active = results.findIndex((x) => x.site);
    if (!input.value.trim()) list.innerHTML = "";
    else if (!results.length) list.innerHTML = `<li class="none" role="presentation">${T.searchNone}</li>`;
    else list.innerHTML = results.map((x, i) => `<li id="sr-${i}" role="option" class="${x.site ? "" : "off"}"` +
      ` aria-selected="${i === active}"${x.site ? "" : ' aria-disabled="true"'} data-i="${i}">${label(x)}</li>`).join("");
    input.setAttribute("aria-expanded", String(results.length > 0));
    mark();
  }

  function mark() {
    list.querySelectorAll("[role=option]").forEach((li) => li.setAttribute("aria-selected", String(Number(li.dataset.i) === active)));
    if (active >= 0) { input.setAttribute("aria-activedescendant", `sr-${active}`); list.querySelector(`#sr-${active}`)?.scrollIntoView({ block: "nearest" }); }
    else input.removeAttribute("aria-activedescendant");
  }

  function choose(i) {
    const x = results[i];
    if (!x || !x.site) return;
    close();
    reveal(x.row.t);
  }

  async function open() {
    box.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    input.focus();
    if (!data) {
      try { data = await fetch(ROOT + "assets/search.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }); }
      catch { list.innerHTML = `<li class="none" role="presentation">${T.loadFail}</li>`; return; }
    }
    show();
  }

  function close(focusBtn = true) {
    box.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-expanded", "false");
    if (focusBtn) btn.focus();
  }

  function init(ctx) {
    reveal = ctx.reveal;
    btn = document.getElementById("search-open");
    box = document.getElementById("search-box");
    input = document.getElementById("search-input");
    list = document.getElementById("search-results");
    btn.addEventListener("click", () => (box.hidden ? open() : close()));
    input.addEventListener("input", () => data && show());
    input.addEventListener("keydown", (e) => {
      const on = results.map((x, i) => (x.site ? i : -1)).filter((i) => i >= 0);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!on.length) return;
        const k = on.indexOf(active), down = e.key === "ArrowDown";
        active = k < 0 ? on[down ? 0 : on.length - 1] : on[(k + (down ? 1 : on.length - 1)) % on.length];
        mark();
      } else if (e.key === "Enter") { e.preventDefault(); choose(active); }
      else if (e.key === "Escape") { e.preventDefault(); close(); }
    });
    list.addEventListener("click", (e) => { const li = e.target.closest("[role=option]"); if (li) choose(Number(li.dataset.i)); });
  }

  return { init, find: (q) => (data ? find(q) : []) };
})();
