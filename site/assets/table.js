// 表格：每一檔第一次提到之後的報酬（美元，和 S&P 500 比）或本益比；點表頭排序（再點反向）、點一列＝點泡泡；
// 年份由上方的下拉選單決定（和泡泡共用，第九版）。第十一版：上方切換「報酬｜本益比」兩種欄位
"use strict";
const Table = (() => {
  let box, ctx, mode = "ret", sort = { key: "date", dir: -1 }, inYear = () => true;

  const BASE = [
    { key: "ticker", name: () => T.colTicker, text: true },
    { key: "date", name: () => T.colDate, text: true, cls: "col-date" },
  ];
  const MODES = {
    ret: [{ key: "ret", name: () => T.colRet }, { key: "vs", name: () => T.colVs }],
    pe: [{ key: "peM", name: () => T.colPeMention, info: "mention" }, { key: "peN", name: () => T.colPeNow, info: "now" },
         { key: "peF", name: () => T.colPeFwd + `<span class="sub">${T.peFwdSub}</span>`, info: "fwd" }],
  };
  const cols = () => [...BASE, ...MODES[mode]];
  const PE = new Set(["peM", "peN", "peF"]);

  function rows() {
    const { summary, eventOf } = ctx;
    return summary.bubbles.filter(inYear).map((b) => {
      const x = b.to_date.USD, e = eventOf.get(b.ticker), pe = b.pe || {};
      return { ticker: b.ticker, company: LANG === "en" ? e.company_en || e.company : e.company, date: b.date,
               early: b.early, ret: x.return, vs: x.vs_spy, peM: pe.mention ?? null, peN: pe.now ?? null, peF: pe.fwd ?? null };
    });
  }

  // 排序：數字照大小；本益比的「虧損」和「—」不管升冪降冪都排最後（虧損在「—」前面）；其他欄的「—」也排最後
  const rank = (v) => (typeof v === "number" ? 0 : v === "loss" ? 1 : 2);
  function sorted(list) {
    const { key, dir } = sort;
    return list.sort((a, b) => {
      const x = a[key], y = b[key];
      if (PE.has(key) || x == null || y == null) {
        const r = rank(x) - rank(y);
        if (r || rank(x)) return r || a.ticker.localeCompare(b.ticker);
      }
      return (typeof x === "string" ? x.localeCompare(y) : x - y) * dir || a.ticker.localeCompare(b.ticker);
    });
  }

  function render() {
    if (!ctx || box.hidden) return;
    const top = box.scrollTop, picked = ctx.isPicked, a = document.activeElement;
    const focus = box.contains(a) && a.dataset ? (a.dataset.sort ? `[data-sort="${a.dataset.sort}"]`
      : a.dataset.pick ? `[data-pick="${CSS.escape(a.dataset.pick)}"]` : null) : null;
    const head = cols().map((c) => {
      const on = sort.key === c.key, aria = on ? ` aria-sort="${sort.dir > 0 ? "ascending" : "descending"}"` : "";
      const arrow = on ? `<span aria-hidden="true">${sort.dir > 0 ? "↑" : "↓"}</span>` : "";
      return `<th scope="col" class="${c.text ? "" : "n"} ${c.cls || ""}"${aria}>` +
        `<button type="button" data-sort="${c.key}">${c.name()}${arrow}</button>${c.info ? Info.button(c.info) : ""}</th>`;
    }).join("");
    const body = sorted(rows()).map((r) => {
      const on = picked(r.ticker), cell = (v) => `<td class="n ${F.cls(v)}">${F.pct(v)}</td>`;
      const vals = mode === "ret" ? cell(r.ret) + cell(r.vs)
        : [r.peM, r.peN, r.peF].map((v) => `<td class="n">${F.pe(v)}</td>`).join("");
      return `<tr data-ticker="${F.esc(r.ticker)}" class="${on ? "picked" : ""}">` +
        `<th scope="row"><button type="button" data-pick="${F.esc(r.ticker)}" aria-pressed="${on}">${F.esc(r.ticker)}</button>` +
        (r.early ? ` <span class="early-tag" title="${T.early}">${T.earlyShort}</span>` : "") +
        `<span class="co">${F.esc(r.company)}</span></th><td class="col-date">${F.date(r.date)}</td>` + vals + "</tr>";
    }).join("");
    box.innerHTML = `<table class="list ${mode === "pe" ? "pe-mode" : ""}"><caption class="visually-hidden">${T.tableCaption}</caption>` +
      `<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    box.scrollTop = top;
    if (focus) box.querySelector(focus)?.focus({ preventScroll: true });  // 重畫後焦點留在原本的按鈕
  }

  function setYear(fn) { inYear = fn; render(); }

  // 切換「報酬｜本益比」：已選的股票和年份不變；目前排序的欄位被藏起來了，就改回照首次提及排序
  function setMode(m) {
    mode = m;
    if (!cols().some((c) => c.key === sort.key)) sort = { key: "date", dir: -1 };
    render();
  }

  function init(el, context) {
    box = el; ctx = context;
    box.addEventListener("click", (e) => {
      if (e.target.closest("[data-info]")) return;  // 本益比的 ⓘ 說明：不排序
      const s = e.target.closest("[data-sort]");
      if (s) {
        const c = cols().find((x) => x.key === s.dataset.sort);
        sort = sort.key === c.key ? { key: c.key, dir: -sort.dir } : { key: c.key, dir: c.text && c.key !== "date" ? 1 : -1 };
        render();
        return;
      }
      const row = e.target.closest("tr[data-ticker]");
      if (row) ctx.pick(row.dataset.ticker);
    });
  }

  return { init, render, setYear, setMode };
})();
