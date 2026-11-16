// 第一次進站的導覽（2026-11-16 第九版）：五頁的對話視窗。只在第一次自動打開，看完或關掉後記在瀏覽器裡
// （localStorage，只存兩個「看過了」的記號，不送出任何資料；瀏覽器不讓存時照樣能用，只是每次都會打開）。
// 語言：第一次進中文版首頁、瀏覽器語言不是中文時，自動轉到英文版（只轉一次）。導覽裡切換語言＝整個網站切換，
// 切過去後導覽停在同一頁（網址 #tour-頁數）。
"use strict";
const Tour = (() => {
  const KEY_DONE = "gooaye.tour.done", KEY_LANG = "gooaye.lang.checked", PAGES = 5;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  };
  const TEXT = {
    zh: {
      label: "導覽", next: "下一頁", back: "上一頁", start: "開始", close: "關閉導覽", illustration: "示意圖",
      page: (i) => `第 ${i} 頁，共 ${PAGES} 頁`,
      pages: [
        { title: "謝孟恭提到的股票，後來贏過大盤嗎？", body: "我們找出他在節目中第一次提到每檔美股的日期，算出之後的報酬，和 S&amp;P 500 比較。" },
        { body: "每個泡泡是一檔股票：代號、第一次提到的日期，以及從那天到今天贏或輸 S&amp;P 500 多少。實心紅色是贏，空心綠色是輸。切換到『表格』可以看完整清單、排序，也可以切換看報酬或本益比。", img: 2 },
        { body: "點一下股票，走勢圖會加上它的線，和 S&amp;P 500、費半一起比較。虛線是第一次提到的那天。", img: 3 },
        { body: "走勢圖下方是這檔股票的成績單：第一次提到後買進，到今天的報酬，和同期的 S&amp;P 500、費半比較；以及前 12 個月內，多久漲到 +10%、+20%，最大漲幅和最大跌幅。", img: 4 },
        { title: "那，謝孟恭提到的股票，後來贏過大盤嗎？", note: "此為非官方網站，與節目及主持人無關，內容不構成投資建議。" },
      ],
    },
    en: {
      label: "Tour", next: "Next", back: "Back", start: "Start", close: "Close the tour", illustration: "Illustration",
      page: (i) => `Page ${i} of ${PAGES}`,
      pages: [
        { title: "Did the stocks mentioned on the Gooaye podcast beat the market?", body: "We found the first time each US stock came up on the show, then tracked how it did against the S&amp;P 500." },
        { body: "Each bubble is one stock: its ticker, the date it was first mentioned, and how far it is ahead of or behind the S&amp;P 500 since then. Solid green beat the index; outlined red trailed it. Switch to Table for the full, sortable list, with returns or P/E.", img: 2 },
        { body: "Click a stock to add its line to the chart, alongside the S&amp;P 500 and the semiconductor index. The dotted line marks the day it was first mentioned.", img: 3 },
        { body: "Below the chart is the stock’s report card: its return if you bought right after the first mention, against the S&amp;P 500 and the semiconductor index over the same period, plus how fast it rose 10% and 20%, and its biggest gain and drop in the first 12 months.", img: 4 },
        { title: "So, did they beat the market?", note: "Unofficial site, not affiliated with the show or its host. Not investment advice." },
      ],
    },
  }[LANG];
  let dlg, body, back, next, dots, page = 1, opener = null;

  function render() {
    const p = TEXT.pages[page - 1];
    const img = p.img ? `<figure class="tour-fig"><img src="${ROOT}assets/tour/${LANG}-${p.img}.webp" alt="${TEXT.illustration}" ` +
      `width="1100" height="660"></figure>` : "";
    body.innerHTML = img + (p.title ? `<h2 id="tour-title">${p.title}</h2>` : `<h2 id="tour-title" class="visually-hidden">${TEXT.page(page)}</h2>`) +
      (p.body ? `<p>${p.body}</p>` : "") + (p.note ? `<p class="tour-note">${p.note}</p>` : "");
    back.hidden = page === 1;
    next.textContent = page === PAGES ? TEXT.start : TEXT.next;
    next.classList.toggle("start", page === PAGES);
    dots.innerHTML = Array.from({ length: PAGES }, (_, i) => `<span class="${i + 1 === page ? "on" : ""}"></span>`).join("") +
      `<span class="visually-hidden">${TEXT.page(page)}</span>`;
    dlg.querySelectorAll("[data-tour-lang]").forEach((a) => {  // 切換語言後停在同一頁
      a.href = a.getAttribute("href").split("#")[0] + `#tour-${page}`;
    });
  }

  function open(at = 1, from = null) {
    page = at; opener = from;
    render();
    if (!dlg.open) dlg.showModal();
    next.focus();
  }

  function init() {
    dlg = document.getElementById("tour");
    body = document.getElementById("tour-body");
    back = document.getElementById("tour-back");
    next = document.getElementById("tour-next");
    dots = document.getElementById("tour-dots");
    back.addEventListener("click", () => { page -= 1; render(); (page === 1 ? next : back).focus(); });
    next.addEventListener("click", () => (page === PAGES ? dlg.close() : (page += 1, render())));
    dlg.querySelector("[data-tour-close]").addEventListener("click", () => dlg.close());
    dlg.addEventListener("close", () => { store.set(KEY_DONE, "1"); if (opener) opener.focus(); });
    const btn = document.getElementById("tour-open");
    btn.addEventListener("click", () => open(1, btn));

    const m = /^#tour-([1-5])$/.exec(location.hash);  // 從另一個語言的導覽切過來
    if (m) {
      history.replaceState(null, "", location.pathname + location.search);
      store.set(KEY_LANG, "1");
      return open(Number(m[1]));
    }
    if (!store.get(KEY_DONE) && !location.hash) open(1);
  }

  // 第一次進中文版、瀏覽器語言不是中文：轉到英文版（只轉一次；瀏覽器不讓記就不轉，免得每次都被轉走）
  function redirectOnce() {
    const first = !store.get(KEY_LANG);
    if (!store.set(KEY_LANG, "1") || !first || LANG !== "zh") return false;
    const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    if (!langs[0] || langs.some((l) => /^zh\b/i.test(l || ""))) return false;
    location.replace("en/" + location.hash);
    return true;
  }

  return { init, redirectOnce };
})();
