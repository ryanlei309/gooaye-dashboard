// 表格：每一檔第一次提到之後至今的報酬（美元，和 S&P 500 比）；點表頭排序（再點反向）、點一列＝點泡泡；
// 可選「到指定日期」；可篩選全部／2022 起／早期提及
"use strict";
const Table = (() => {
  let box, input, filterEl, ctx, sort = { key: "date", dir: -1 }, upto = "", filter = "all";

  const COLS = [
    { key: "ticker", name: () => T.colTicker, text: true },
    { key: "date", name: () => T.colDate, text: true, cls: "col-date" },
    { key: "ret", name: () => T.colRet },
    { key: "vs", name: () => T.colVs },
    { key: "upto", name: () => T.colUpto(upto && F.date(upto)) },
  ];

  // 從首次提及的進場日開盤，持有到選的那天（那天沒有股價就用之前最近一天的收盤）；選的日期早於進場日是 null
  function uptoReturn(b, day, bench, closes) {
    if (!day || !closes || day < b.window.start) return null;
    let k = bench.dates.length - 1;
    while (k >= 0 && bench.dates[k] > day) k--;
    while (k >= 0 && closes[k] == null && bench.dates[k] >= b.window.start) k--;
    if (k < 0 || bench.dates[k] < b.window.start || closes[k] == null) return null;
    return closes[k] / b.entry_open - 1;
  }

  function rows() {
    const { summary, bench, eventOf, prices } = ctx;
    return summary.bubbles.filter((b) => filter === "all" || (filter === "early") === b.early).map((b) => {
      const x = b.to_date.USD, p = prices.get(b.ticker), e = eventOf.get(b.ticker);
      return { ticker: b.ticker, company: LANG === "en" ? e.company_en || e.company : e.company, date: b.date,
               early: b.early, ret: x.return, vs: x.vs_spy, upto: uptoReturn(b, upto, bench, p && p.c) };
    });
  }

  function sorted(list) {
    const { key, dir } = sort;
    return list.sort((a, b) => {
      const x = a[key], y = b[key];
      if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;  // 「—」一律排最後
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
        cell(r.ret) + cell(r.vs) + cell(r.upto) + "</tr>";
    }).join("");
    box.innerHTML = `<table class="list"><caption class="visually-hidden">${T.tableCaption}</caption>` +
      `<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    box.scrollTop = top;
    if (focus) box.querySelector(focus)?.focus({ preventScroll: true });  // 重畫後焦點留在原本的按鈕
  }

  function init(el, dateInput, filterBox, context) {
    box = el; input = dateInput; filterEl = filterBox; ctx = context;
    const days = ctx.summary.bubbles.map((b) => b.window.start).sort();
    input.min = days[0];
    input.max = ctx.summary.price_date;
    filterEl.innerHTML = [["all", T.filterAll], ["main", T.filterMain], ["early", T.filterEarly]].map(([k, n]) =>
      `<button type="button" data-filter="${k}" aria-pressed="${k === filter}">${n}</button>`).join("");
    filterEl.addEventListener("click", (e) => {
      const b = e.target.closest("[data-filter]");
      if (!b) return;
      filter = b.dataset.filter;
      filterEl.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      render();
    });
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
    input.addEventListener("change", async () => {
      upto = input.value && input.value > input.max ? input.max : input.value;
      if (upto) await ctx.loadAll();
      render();
    });
  }

  return { init, render, uptoReturn };
})();
