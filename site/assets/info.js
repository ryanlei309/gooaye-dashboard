// 本益比欄名旁的 ⓘ 說明（2026-11-16 第十一版；第十二版起只在表格，說明視窗共用同一份文字）。
// 電腦：滑過顯示、點一下固定；手機：點一下顯示、再點一次或點別處關閉；鍵盤：Enter／空白鍵打開、Esc 關閉並回到按鈕。
// 每個按鈕有自己的可存取名稱（例如「現在本益比說明」），打開時用 aria-describedby 連到說明文字。
"use strict";
const Info = (() => {
  let pop, current = null, pinned = false;
  const hover = matchMedia("(hover: hover) and (pointer: fine)");

  // 說明文字：第一行標題（粗體），之後每一行一段（公式、說明）；文字是網站自己的，沒有外來內容
  const peInfoHtml = (kind) => T.peInfo[kind].split("\n").map((line, i) => (i ? `<span>${line}</span>` : `<strong>${line}</strong>`)).join("");

  const button = (kind) => `<button type="button" class="info" data-info="${kind}" aria-label="${T.peInfoLabel[kind]}" ` +
    `aria-expanded="false" aria-controls="info-pop">ⓘ</button>`;

  function place(btn) {
    const r = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    const x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
    const below = r.bottom + 8 + h <= innerHeight;
    pop.style.transform = `translate(${x}px, ${below ? r.bottom + 8 : Math.max(8, r.top - 8 - h)}px)`;
  }

  function show(btn, pin) {
    if (current && current !== btn) hide();
    current = btn; pinned = pinned || pin;
    pop.innerHTML = peInfoHtml(btn.dataset.info);
    pop.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    btn.setAttribute("aria-describedby", "info-pop");
    place(btn);
  }

  function hide(returnFocus = false) {
    if (!current) return;
    const btn = current;
    btn.setAttribute("aria-expanded", "false");
    btn.removeAttribute("aria-describedby");
    pop.hidden = true;
    current = null; pinned = false;
    if (returnFocus) btn.focus();
  }

  function init() {
    pop = document.createElement("div");
    pop.id = "info-pop";
    pop.className = "info-pop";
    pop.hidden = true;
    document.body.appendChild(pop);
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-info]");
      if (!btn) { if (current && !pop.contains(e.target)) hide(); return; }  // 點別處關閉
      e.stopPropagation();
      if (current === btn && pinned) hide(); else show(btn, true);  // 再點一次關閉
    }, true);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && current) { e.preventDefault(); hide(true); } });
    document.addEventListener("pointerover", (e) => {
      if (!hover.matches) return;
      const btn = e.target.closest("[data-info]");
      if (btn && !pinned) show(btn, false);
    });
    document.addEventListener("pointerout", (e) => {
      const btn = e.target.closest("[data-info]");
      if (btn && hover.matches && !pinned && current === btn) hide();
    });
    addEventListener("scroll", () => current && place(current), true);
    addEventListener("resize", () => current && place(current));
  }

  return { init, button, peInfoHtml };
})();
