// 手機的 ☰ 選單（2026-11-20 第二十一版）：手機上右上角的「方法與限制、製作過程、數據觀察、導覽」收進 ☰，「中文｜English」留在外面；
// 電腦和平板照舊外露（style.css 決定顯示哪一種）。☰ 的可存取名稱是「選單」／Menu；點一下或 Enter 打開、再按一次關閉，
// 打開時焦點移到第一項，Esc 關閉並回到 ☰；點選單外面、焦點離開選單、點了其中一項都會關閉。
// 焦點要回到收在選單裡、看不見的按鈕時（例如關掉「方法與限制」視窗後），改回 ☰（Menu.focus）。
"use strict";
const Menu = (() => {
  const btn = document.getElementById("menu-btn"), box = document.getElementById("menu-items");
  const isOpen = () => btn.getAttribute("aria-expanded") === "true";

  function set(open, focusBtn) {
    btn.setAttribute("aria-expanded", String(open));
    box.classList.toggle("open", open);
    if (open) box.querySelector("a, button")?.focus();
    else if (focusBtn) btn.focus();
  }

  btn.addEventListener("click", () => set(!isOpen()));
  btn.parentElement.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) { e.preventDefault(); set(false, true); }
  });
  box.addEventListener("click", (e) => { if (isOpen() && e.target.closest("a, button")) set(false); });
  document.addEventListener("click", (e) => { if (isOpen() && !btn.contains(e.target) && !box.contains(e.target)) set(false); });
  box.addEventListener("focusout", (e) => {
    if (isOpen() && e.relatedTarget && !box.contains(e.relatedTarget) && e.relatedTarget !== btn) set(false);
  });
  matchMedia("(max-width: 600px), (max-height: 500px)").addEventListener("change", () => set(false));

  return { focus: () => btn.focus() };
})();
