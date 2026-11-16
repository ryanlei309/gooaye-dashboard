// 表格：每一檔第一次提到之後至今的報酬（美元，和 S&P 500 比）與現在本益比；點表頭排序（再點反向）、點一列＝點泡泡；
// 年份由上方的下拉選單決定（和泡泡共用，第九版）。「到指定日期的報酬」第十版換成「現在本益比」
"use strict";
const Table = (() => {
  let box, ctx, sort = { key: "date", dir: -1 }, inYear = () => true;

  const COLS = [
    { key: "ticker", name: () => T.colTicker, text: true },
    { key: "date", name: () => T.colDate, text: true, cls: "col-date" },
    { key: "ret", name: () => T.colRet },
    { key: "vs", name: () => T.colVs },
    { key: "pe", name: () => T.colPe },
  ];

  function rows() {
    const { summary, eventOf } = ctx;
    return summary.bubbles.filter(inYear).map((b) => {
      const x = b.to_date.USD, e = eventOf.get(b.ticker), pe = b.pe && b.pe.now;
      // 排序用數字；虧損和「—」排最後（虧損在「—」前面）
      return { ticker: b.ticker, company: LANG === "en" ? e.company_en || e.company : e.company, date: b.date,
               early: b.early, ret: x.return, vs: x.vs_spy, pe: typeof pe === "number" ? pe : null,
               peRank: typeof pe === "number" ? 0 : pe === "loss" ? 1 : 2, peShow: pe };
    });
  }

  function sorted(list) {
    const { key, dir } = sort;
    return list.sort((a, b) => {
      const x = a[key], y = b[key];
      if (x == null || y == null) return x == null ? (y == null ? a.peRank - b.peRank || a.ticker.localeCompare(b.ticker) : 1) : -1;  // 「—」一律排最後
      return (typeof x === "string" ? x.localeCompare(y) : x - y) * dir || a.ticker.localeCompare(b.ticker);
    });
  }

  function render() {
    if (!ctx || box.hidden) return;
    const top = box.scrollTop, picked = ctx.isPicked, a = document.activeElement;
    const focus = box.contains(a) && a.dataset ? (a.dataset.sort ? `[data-sort="${a.dataset.sort}"]`
      : a.dataset.pick ? `[data-pick="${CSS.escape(a.dataset.pick)}"]` : null) : null;
    const head = COLS.map((c) => {
      const on = sort.key === c.key, aria = on ? ` aria-sort="${sort.dir > 0 ? "ascending" : "descending"}"` : "";
      const arrow = on ? `<span aria-hidden="true">${sort.dir > 0 ? "↑" : "↓"}</span>` : "";
      return `<th scope="col" class="${c.text ? "" : "n"} ${c.cls || ""}"${aria}>` +
        `<button type="button" data-sort="${c.key}">${c.name()}${arrow}</button></th>`;
    }).join("");
    const body = sorted(rows()).map((r) => {
      const on = picked(r.ticker), cell = (v) => `<td class="n ${F.cls(v)}">${F.pct(v)}</td>`;
      return `<tr data-ticker="${F.esc(r.ticker)}" class="${on ? "picked" : ""}">` +
        `<th scope="row"><button type="button" data-pick="${F.esc(r.ticker)}" aria-pressed="${on}">${F.esc(r.ticker)}</button>` +
        (r.early ? ` <span class="early-tag" title="${T.early}">${T.earlyShort}</span>` : "") +
        `<span class="co">${F.esc(r.company)}</span></th><td class="col-date">${F.date(r.date)}</td>` +
        cell(r.ret) + cell(r.vs) + `<td class="n">${F.pe(r.peShow)}</td></tr>`;
    }).join("");
    box.innerHTML = `<table class="list"><caption class="visually-hidden">${T.tableCaption}</caption>` +
      `<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    box.scrollTop = top;
    if (focus) box.querySelector(focus)?.focus({ preventScroll: true });  // 重畫後焦點留在原本的按鈕
  }

  function setYear(fn) { inYear = fn; render(); }

  function init(el, context) {
    box = el; ctx = context;
    box.addEventListener("click", (e) => {
      const s = e.target.closest("[data-sort]");
      if (s) {
        const c = COLS.find((x) => x.key === s.dataset.sort);
        sort = sort.key === c.key ? { key: c.key, dir: -sort.dir } : { key: c.key, dir: c.text && c.key !== "date" ? 1 : -1 };
        render();
        return;
      }
      const row = e.target.closest("tr[data-ticker]");
      if (row) ctx.pick(row.dataset.ticker);
    });
  }

  return { init, render, setYear };
})();
