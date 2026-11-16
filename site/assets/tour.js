// 第一次進站的導覽（2026-11-16 第九版；第十四版改成聚光燈式）：在真的網頁上進行，整個畫面變暗，只把要介紹的區域挖亮，
// 旁邊放說明卡片（Driver.js 1.3.1，MIT，放在 assets/vendor/，不向其他網站發請求）。
// 第 1、5 頁：畫面中間的卡片、不挖亮；第 2 頁左欄（泡泡和表格）、第 3 頁走勢圖、第 4 頁明細表。
// 導覽開始時暫時選 SMTC 和 TEAM（明細顯示 TEAM），結束或關掉後恢復訪客原本的狀態（app.js 提供 save／demo／restore）。
// 只在第一次自動打開，看完或關掉後記在瀏覽器裡（localStorage，只存兩個「看過了」的記號，不送出任何資料；瀏覽器不讓存時照樣能用，
// 只是每次都會打開）。語言：第一次進中文版首頁、瀏覽器語言不是中文時，自動轉到英文版（只轉一次）。導覽裡切換語言＝整個網站切換，
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
      label: "導覽", next: "下一頁", back: "上一頁", start: "來看看吧！", close: "關閉導覽",
      page: (i) => `第 ${i} 頁，共 ${PAGES} 頁`,
      pages: [
        { title: "謝孟恭提到的股票，後來贏過大盤嗎？", body: "我們找出他在節目中第一次提到每檔美股的日期，算出之後的報酬，和 S&amp;P 500 比較。" },
        { body: "每個泡泡是一檔股票：代號、第一次提到的日期，以及從那天到今天贏或輸 S&amp;P 500 多少。實心紅色是贏，空心綠色是輸。切換到『表格』可以看完整清單、排序，也可以切換看報酬或本益比。",
          keep: ["多少", "也可以"] },
        { body: "點一下股票，走勢圖會加上它的線，和 S&amp;P 500、費半一起比較。虛線是第一次提到的那天。", keep: ["和 S&amp;P 500"] },
        { body: "走勢圖下方是這檔股票的成績單：",
          items: ["第一次提到後買進，到今天的報酬，和同期大盤比較", "前 12 個月內，多久漲到 +10%、+20%，以及最大漲跌幅"] },
        { title: "那，謝孟恭提到的股票，後來贏過大盤嗎？", note: "此為非官方網站，與節目及主持人無關，內容不構成投資建議。" },
      ],
    },
    en: {
      label: "Tour", next: "Next", back: "Back", start: "Let’s find out!", close: "Close the tour",
      page: (i) => `Page ${i} of ${PAGES}`,
      pages: [
        { title: "Did the stocks mentioned on the Gooaye podcast beat the market?", body: "We found the first time each US stock came up on the show, then tracked how it did against the S&amp;P 500." },
        { body: "Each bubble is one stock: its ticker, the date it was first mentioned, and how far it is ahead of or behind the S&amp;P 500 since then. Solid green beat the index; outlined red trailed it. Switch to Table for the full, sortable list, with returns or P/E." },
        { body: "Click a stock to add its line to the chart, alongside the S&amp;P 500 and the semiconductor index. The dotted line marks the day it was first mentioned." },
        { body: "Below the chart is the stock’s report card:",
          items: ["Its return if bought right after the first mention, against the market over the same period",
                  "In the first 12 months: how fast it rose 10% and 20%, and its biggest gain and drop"] },
        { title: "So, did they beat the market?", note: "Unofficial site, not affiliated with the show or its host. Not investment advice." },
      ],
    },
  }[LANG];
  // 挖亮的區域與卡片的位置（電腦；手機的卡片固定在畫面底部，見 style.css）。手機第 4 頁只挖亮明細的對照表（整個明細比畫面高）
  const AREA = { 2: { element: ".bubbles-panel", side: "right" }, 3: { element: ".chart-panel", side: "left" },
                 4: { element: "#detail", phone: "#detail .cmp-box", side: "left" } };
  const phone = matchMedia("(max-width: 600px), (max-height: 500px)");
  let drv = null, ctx = null, saved = null, opener = null;

  // 每一句的最後不要只剩一個字（第十五版）：中文最後兩個字（連同後面的標點）、英文最後兩個字不拆開；換行位置仍由瀏覽器決定
  const glue = (s) => (LANG === "zh" ? s.replace(/([\u3400-\u9fff]{2}[，。、：；！？』）]*)$/, '<span class="nw">$1</span>')
    : s.replace(/ (?=[^ <>]*(?:<[^>]*>[^ <>]*)*$)/, "\u00a0"));
  // 每句一行（第十三版）：中文遇到「。」、英文遇到句點加空白就換行
  const lines = (s) => s.split(/(?<=。)|(?<=\.)\s+/).filter(Boolean).map(glue).join("<br>");
  // 不能拆開的詞（第十五版）：每一頁的「S&P 500」，加上那一頁指定的詞；長的先比對，不會包兩層。換行位置交給瀏覽器
  const keep = (s, words) => {
    const all = [...new Set([...(words || []), "S&amp;P 500"])].sort((a, b) => b.length - a.length);
    return s.replace(new RegExp(all.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g"), (w) => `<span class="nw">${w}</span>`);
  };
  // 卡片內文：一段（每句一行）、條列（第 4 頁，第十五版）、灰色斜體的聲明（第 5 頁）
  const content = (p) => (p.body ? `<p>${lines(keep(p.body, p.keep))}</p>` : "") +
    (p.items ? `<ul class="tour-list">${p.items.map((x) => `<li>${glue(keep(x, p.keep))}</li>`).join("")}</ul>` : "") +
    (p.note ? `<p class="tour-note">${lines(p.note)}</p>` : "");

  // 手機：卡片在畫面底部，把亮的區域捲到畫面上方、不被卡片蓋住
  function scrollAbove(el) {
    if (!el || !phone.matches) return;
    window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 12), behavior: "instant" });
  }

  // 卡片：左上角中文｜English、右上角 ×、第 2 頁起左下角上一頁、右下角下一頁、最下面五個小點
  function decorate(pop, { state }) {
    const n = (state.activeIndex ?? 0) + 1, p = TEXT.pages[n - 1];
    const lang = document.getElementById("tour-lang").content.firstElementChild.cloneNode(true);
    lang.querySelectorAll("a").forEach((a) => { a.href = a.getAttribute("href").split("#")[0] + `#tour-${n}`; });
    pop.wrapper.prepend(lang);
    pop.closeButton.setAttribute("aria-label", TEXT.close);
    if (!p.title) {  // 沒有標題的頁：標題念「第 n 頁，共 5 頁」（讀屏軟體用），畫面上不顯示
      pop.title.textContent = TEXT.page(n);
      pop.title.style.display = "block";
      pop.title.classList.add("visually-hidden");
    }
    pop.previousButton.hidden = n === 1;
    pop.nextButton.classList.toggle("start", n === PAGES);
    const dots = document.createElement("div");
    dots.className = "tour-dots";
    dots.innerHTML = Array.from({ length: PAGES }, (_, i) => `<span class="${i + 1 === n ? "on" : ""}" aria-hidden="true"></span>`).join("") +
      `<span class="visually-hidden">${TEXT.page(n)}</span>`;
    pop.wrapper.append(dots);
  }

  function steps() {
    return TEXT.pages.map((p, i) => {
      const n = i + 1, area = AREA[n];
      return {
        element: area && (phone.matches && area.phone ? area.phone : area.element),
        onHighlightStarted: (el) => scrollAbove(el),
        popover: {
          title: p.title ? glue(p.title) : "", description: content(p),
          side: area?.side, align: "start", popoverClass: `tour-pop ${area ? "tour-side" : "tour-center"}${n === 1 ? " tour-first" : ""}`,
          showButtons: n === 1 ? ["next", "close"] : ["previous", "next", "close"],
        },
      };
    });
  }

  function finish() {
    store.set(KEY_DONE, "1");
    drv = null;
    if (saved) ctx.restore(saved);  // 恢復訪客原本的狀態
    saved = null;
    if (opener) opener.focus();
  }

  function open(at = 1, from = null) {
    if (drv) return;
    opener = from;
    saved = ctx.save();
    ctx.demo();  // 暫時選 SMTC 和 TEAM（明細顯示 TEAM）
    drv = window.driver.js.driver({
      steps: steps(), animate: !matchMedia("(prefers-reduced-motion: reduce)").matches, smoothScroll: false,
      overlayColor: "#000", overlayOpacity: 0.6, stagePadding: 6, stageRadius: 4, popoverOffset: 14,
      allowClose: true, allowKeyboardControl: true, disableActiveInteraction: true, showProgress: false,
      nextBtnText: TEXT.next, prevBtnText: TEXT.back, doneBtnText: TEXT.start,
      onPopoverRender: decorate, onDestroyed: finish,
      // 每一頁打開時焦點在「下一頁」（和第九版一樣；Driver.js 預設放在卡片裡第一個連結，也就是「中文」）
      onHighlighted: () => requestAnimationFrame(() => document.querySelector(".driver-popover-next-btn")?.focus()),
    });
    drv.drive(at - 1);
  }

  function init(context) {
    ctx = context;
    const btn = document.getElementById("tour-open");
    btn.addEventListener("click", () => open(1, btn));
    // 手機轉向、視窗大小改變：亮的位置要重算（Driver.js 自己會跟著 resize 重算，手機另外要重新捲到亮的區域上方）
    addEventListener("orientationchange", () => setTimeout(() => { if (drv) { scrollAbove(drv.getActiveElement()); drv.refresh(); } }, 300));
    phone.addEventListener("change", () => { if (drv) { scrollAbove(drv.getActiveElement()); drv.refresh(); } });

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
