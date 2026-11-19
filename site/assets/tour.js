// 第一次進站的導覽（2026-11-16 第九版；第十四版改成聚光燈式）：在真的網頁上進行，整個畫面變暗，只把要介紹的區域挖亮，
// 旁邊放說明卡片（Driver.js 1.3.1，MIT，放在 assets/vendor/，不向其他網站發請求）。
// 第 1、2、7 頁：畫面中間的卡片、不挖亮；第 3 頁左欄（泡泡和表格）、第 4 頁走勢圖、第 5 頁明細表、第 6 頁右上角的連結
// （2026-11-17 插入第 2 頁，原本的第 2～5 頁變成第 3～6 頁；第十七版標題改成「為什麼分析「第一次」？」）。
// 導覽開始時暫時選 SMTC 和 TEAM（明細顯示 TEAM），結束或關掉後恢復訪客原本的狀態（app.js 提供 save／demo／restore）。
// 只在第一次自動打開，看完或關掉後記在瀏覽器裡（localStorage，只存兩個「看過了」的記號，不送出任何資料；瀏覽器不讓存時照樣能用，
// 只是每次都會打開）。語言：第一次進中文版首頁、瀏覽器語言不是中文時，自動轉到英文版（只轉一次）。導覽裡切換語言＝整個網站切換，
// 切過去後導覽停在同一頁（網址 #tour-頁數）。
"use strict";
const Tour = (() => {
  const KEY_DONE = "gooaye.tour.done", KEY_LANG = "gooaye.lang.checked", PAGES = 7;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  };
  const TEXT = {
    zh: {
      label: "導覽", next: "下一頁", back: "上一頁", start: "來看看吧！", close: "關閉導覽",
      page: (i) => `第 ${i} 頁，共 ${PAGES} 頁`,
      // 2026-11-17 第十七版：每一行照使用者給的換行（lines 的每一項是一行）；數字由程式帶入（summary.main.up10、summary.main.spy.win）
      pages: [
        { title: "謝孟恭提到的股票，後來贏過大盤嗎？",
          lines: ["我找出他在節目中第一次提到每檔標的的日期，", "算出之後的報酬，", "和 S&amp;P 500 比較。"] },
        { title: "為什麼分析「第一次」？", lines: (f) => [
          "孟恭一集常提到很多股票，", "而且標的的情況是帶狀分享，", "事後很難記得哪些真的漲了。",
          "只看「第一次」提到，因為那是最新的消息；", "之後再提，股價可能早就反映了。",
          ...(f.days != null ? [`一半的標的在 ${f.days} 天內曾漲到 +10%，`, `但持有一年後，只有 ${f.win} 贏過 S&amp;P 500 的報酬率。`] : []),
          "本網站適合當研究的起點，", "不適合當買賣訊號。"] },
        { lines: ["每個泡泡是一檔股票：代號、第一次提到的日期，", "以及從那天到今天贏或輸 S&amp;P 500 多少。", "實心紅色是贏，空心綠色是輸。",
                  "切換到『表格』可以看完整清單、排序，", "也可以切換看報酬或本益比。"], keep: ["多少", "也可以"] },
        { lines: ["點一下股票，走勢圖會加上它的線，", "和 S&amp;P 500、費半一起比較。", "虛線是第一次提到的那天。"], keep: ["和 S&amp;P 500"] },
        { lines: ["走勢圖下方是這檔股票的成績單："], items: ["第一次提到後買進至今日的報酬", "一年內，多久漲到 +10%，以及最大漲跌幅"] },
        // 第 6 頁（第十八版）：挖亮右上角那一排連結，卡片在它下方；勝率由程式帶入
        { lines: ["右上角可以找到："], items: ["方法與限制：資料怎麼算、有哪些限制", "製作過程：這個網站怎麼做出來的",
          (f) => `數據觀察：為什麼只有 ${f.win}？更多統計`, "導覽：隨時再看一次", "中文｜English：切換語言"] },
        { title: "那，謝孟恭提到的股票，後來贏過大盤嗎？", note: ["此為非官方網站，與節目及主持人無關，內容不構成投資建議。"] },
      ],
    },
    en: {
      label: "Tour", next: "Next", back: "Back", start: "Let’s find out!", close: "Close the tour",
      page: (i) => `Page ${i} of ${PAGES}`,
      pages: [
        { title: "Did the stocks mentioned on the Gooaye podcast beat the market?",
          lines: ["We found the first time each stock came up on the show,", "tracked how it did afterward,", "and compared it with the S&amp;P 500."] },
        { title: "Why the first mention?", lines: (f) => [
          "The host mentions many stocks each episode,", "often following the same one across several episodes,",
          "so it’s hard to remember which ones actually went up.", "I only look at the first mention, when the news was fresh;",
          "by later mentions, the price may have already moved.",
          ...(f.days != null ? [`Half the stocks touched +10% within ${f.days} days,`, `yet after a year, only ${f.win} beat the S&amp;P 500.`] : []),
          "Use this site as a starting point for research,", "not as a buy or sell signal."] },
        { lines: ["Each bubble is one stock: its ticker, the date it was first mentioned,", "and how far it is ahead of or behind the S&amp;P 500 since then.",
                  "Solid green beat the index; outlined red trailed it.", "Switch to Table for the full, sortable list,", "with returns or P/E."] },
        { lines: ["Click a stock to add its line to the chart,", "alongside the S&amp;P 500 and the semiconductor index.", "The dotted line marks the day it was first mentioned."] },
        { lines: ["Below the chart is the stock’s report card:"],
          items: ["Its return from the first mention to today", "Within a year: how fast it rose 10%, and its biggest gain and drop"] },
        { lines: ["In the top right:"], items: ["Method: how the numbers are made, and their limits", "How I built this: how this site was made",
          (f) => `Insights: why only ${f.win}? More statistics`, "Tour: replay this tour anytime", "中文｜English: switch language"] },
        { title: "So, did they beat the market?", note: ["Unofficial site, not affiliated with the show or its host.", "Not investment advice."] },
      ],
    },
  }[LANG];
  // 挖亮的區域與卡片的位置（電腦；手機的卡片固定在畫面底部，見 style.css）。手機第 4 頁只挖亮明細的對照表（整個明細比畫面高）
  const AREA = { 3: { element: ".bubbles-panel", side: "right" }, 4: { element: ".chart-panel", side: "left" },
                 5: { element: "#detail", phone: "#detail .cmp-box", side: "left" },
                 6: { element: ".controls", side: "bottom", align: "end" } };  // 第十八版：右上角那一排連結
  const phone = matchMedia("(max-width: 600px), (max-height: 500px)");
  let drv = null, ctx = null, saved = null, opener = null;

  // 每一行的最後不要只剩一個字（第十五版）：中文最後兩個字（連同後面的標點）、英文最後兩個字不拆開。手機上一行放不下時瀏覽器會再換行
  const glue = (s) => (LANG === "zh" ? s.replace(/([\u3400-\u9fff]{2}[，。、：；！？』）]*)$/, '<span class="nw">$1</span>')
    : s.replace(/ (?=[^ <>]*(?:<[^>]*>[^ <>]*)*$)/, "\u00a0"));
  // 不能拆開的詞（第十五版）：每一頁的「S&P 500」，加上那一頁指定的詞；長的先比對，不會包兩層
  const keep = (s, words) => {
    const all = [...new Set([...(words || []), "S&amp;P 500"])].sort((a, b) => b.length - a.length);
    return s.replace(new RegExp(all.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g"), (w) => `<span class="nw">${w}</span>`);
  };
  // 照使用者給的換行（第十七版，取代「遇到句號就換行」）：每一項是一行
  const rows = (xs, words) => xs.map((x) => glue(keep(x, words))).join("<br>");
  // 卡片內文：幾行、條列（第 5 頁）、灰色斜體的聲明（最後一頁）
  const content = (p) => (p.lines ? `<p>${rows(typeof p.lines === "function" ? p.lines(ctx.facts) : p.lines, p.keep)}</p>` : "") +
    (p.items ? `<ul class="tour-list">${p.items.map((x) => `<li>${glue(keep(typeof x === "function" ? x(ctx.facts) : x, p.keep))}</li>`).join("")}</ul>` : "") +
    (p.note ? `<p class="tour-note">${rows(p.note)}</p>` : "");

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
    if (!p.title) {  // 沒有標題的頁：標題念「第 n 頁，共 6 頁」（讀屏軟體用），畫面上不顯示
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
          side: area?.side, align: area?.align || "start", popoverClass: `tour-pop ${area ? "tour-side" : "tour-center"}${n === 1 ? " tour-first" : n === 2 ? " tour-why" : ""}`,
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

    const m = /^#tour-([1-7])$/.exec(location.hash);  // 從另一個語言的導覽切過來
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
