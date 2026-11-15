// 泡泡：個股第一次提到之後至今贏輸 S&P 500。打開時最新提到的在最上面，越往下越舊（2026-11-15 第四版）
// 所有泡泡一樣的速度往上，彼此的相對位置不變：先把全部泡泡照日期由新到舊排在一條「捲軸」上（不重疊），
// 播放＝捲軸往上走（往舊的方向）；滾輪往下、手指往上滑、方向鍵往下＝往舊，反過來＝往新，飄過的可以捲回來。
// 早期提及（2020–2021）的泡泡加一個「早期」小標記（文字，不只靠顏色）。
"use strict";
const Bubbles = (() => {
  let root, items = [], onPick, isPicked, laid = [], pos = 0, lo = 0, hi = 0, start0 = 0;
  let playing = true, hovering = false, last = null, frame = null, reduced = false, playBtn, whenEl;
  const shown = new Map();  // ticker → 畫面上的按鈕
  const motion = matchMedia("(prefers-reduced-motion: reduce)");

  const compact = () => Math.min(innerWidth, innerHeight) < 500;
  const speed = () => (compact() ? 17 : 21);  // 每秒約 20 像素（第二版定的速度）
  // 大小用超額報酬絕對值的平方根，設上限；最小要放得下代號、日期、數字三行
  const diameter = (x) => 1.3 * (compact() ? Math.min(70 + 18 * Math.sqrt(Math.abs(x)), 96)
                                           : Math.min(64 + 26 * Math.sqrt(Math.abs(x)), 118));

  // 同時看得到幾個：第二版是泡泡總面積約佔 30%；第三版再多約 40%
  function target(w, h, dAvg) {
    const before = Math.max(2, Math.min(Math.round((0.3 * w * h) / ((Math.PI / 4) * dAvg * dAvg)), 12));
    return Math.max(3, Math.round(before * 1.4));
  }

  function rng(seed) {  // 固定種子的亂數：每次打開位置都一樣
    return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  }

  // 排捲軸：e＝泡泡上緣進到泡泡區底部時的捲動位置。照日期依序，每顆至少隔 step，和前面的都不重疊（留空隙給滑過時放大）
  function layout() {
    const w = root.clientWidth, h = root.clientHeight, rand = rng(20261115);
    const ds = items.map((it) => diameter(it.ex)), dAvg = ds.reduce((a, b) => a + b, 0) / Math.max(1, ds.length);
    const step = (h + dAvg) / target(w, h, dAvg);
    laid = [];
    let prev = 0;
    items.forEach((it, k) => {
      const d = ds[k], m = 0.08 * d;
      let best = null;
      for (let c = 0; c < 10; c++) {
        const x = m + rand() * Math.max(1, w - d - 2 * m);
        let e = k ? prev + step : 0;
        for (const o of laid) {
          const dx = o.x + o.d / 2 - (x + d / 2), r = (o.d + d) / 2 + 0.08 * (o.d + d);
          if (Math.abs(dx) < r) e = Math.max(e, o.e + o.d / 2 + Math.sqrt(r * r - dx * dx) - d / 2);
        }
        if (!best || e < best.e) best = { it, d, x, e };
      }
      laid.push(best);
      prev = best.e;
    });
    const first = laid[0], end = laid[laid.length - 1];
    lo = first ? first.e + first.d : 0;                  // 最早：第一顆剛完整出現
    hi = end ? Math.max(lo, end.e + 0.85 * h) : 0;       // 最晚：最後一顆飄到接近頂端
    start0 = first ? Math.min(lo + h - first.d - 0.06 * h, hi) : 0;  // 剛打開：最新的在最上面，往下鋪滿
  }

  function button(it) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "bubble " + (it.ex > 0 ? "win" : "lose");
    b.dataset.ticker = it.ticker;
    b.setAttribute("aria-pressed", String(isPicked(it.ticker)));
    b.setAttribute("aria-label", T.bubbleLabel(it.ticker, F.date(it.date), F.pct(it.ex), it.early));
    b.innerHTML = (it.early ? `<span class="e" aria-hidden="true">${T.earlyShort}</span>` : "") +
                  `<span class="t">${F.esc(it.ticker)}</span><span class="d">${F.date(it.date)}</span>` +
                  `<span class="x">${F.pct(it.ex)}</span>`;
    b.addEventListener("click", () => onPick(it.ticker));
    return b;
  }

  // 依目前的捲動位置放泡泡：看得到的才放進畫面，飄出去的拿掉（焦點在它上面就先移到泡泡區）
  function draw() {
    const h = root.clientHeight, seen = [];
    laid.forEach((o) => {
      const top = h - (pos - o.e), visible = top < h && top + o.d > 0;
      if (visible) seen.push(o.it.date);
      let b = shown.get(o.it.ticker);
      if (visible && !b) {
        b = button(o.it);
        b.style.width = b.style.height = o.d + "px";
        root.appendChild(b);
        shown.set(o.it.ticker, b);
      } else if (!visible && b) {
        if (b === document.activeElement) root.focus({ preventScroll: true });
        b.remove();
        shown.delete(o.it.ticker);
      }
      if (visible) b.style.transform = `translate(${o.x}px, ${top}px)`;
    });
    // 角落：畫面上最上面那顆（最新）到最下面那顆（最舊）的年月，和泡泡由上到下的順序一致
    if (seen.length) {
      const a = F.month(seen.reduce((x, y) => (x > y ? x : y))), b = F.month(seen.reduce((x, y) => (x < y ? x : y)));
      whenEl.textContent = a === b ? a : `${a} – ${b}`;
    }
  }

  function setPlaying(on) {
    playing = on;
    playBtn.setAttribute("aria-pressed", String(on));
  }

  function moveTo(p) {
    pos = Math.min(Math.max(p, lo), hi);
    draw();
  }

  function scrub(delta) {  // 使用者自己捲動時間：自動暫停，按播放才繼續
    setPlaying(false);
    moveTo(pos + delta);
  }

  function tick(t) {
    const dt = last == null ? 0 : Math.min(t - last, 100);
    last = t;
    if (playing && !hovering) {
      pos += (speed() * dt) / 1000;
      if (pos > hi) pos = start0;  // 播完從頭再來
      draw();
    }
    frame = requestAnimationFrame(tick);
  }

  function start() {
    cancelAnimationFrame(frame);
    shown.clear();
    root.innerHTML = "";
    reduced = motion.matches;
    root.classList.toggle("static", reduced);
    playBtn.hidden = whenEl.hidden = reduced;
    if (reduced) {  // 減少動態效果：不飄，照首次提及日期排好
      items.forEach((it) => root.appendChild(button(it)));
      return;
    }
    const at = laid.length && hi > lo ? (pos - lo) / (hi - lo) : null;  // 版面變了：停在差不多的時間
    layout();
    pos = at == null ? start0 : lo + at * (hi - lo);
    draw();
    last = null;
    frame = requestAnimationFrame(tick);
  }

  function refreshPicked() {
    root.querySelectorAll(".bubble").forEach((b) => b.setAttribute("aria-pressed", String(isPicked(b.dataset.ticker))));
  }

  // 表格模式時泡泡區藏起來：停住動畫，回來時接著原本的位置
  function show(on) {
    root.parentElement.hidden = !on;
    cancelAnimationFrame(frame);
    if (on && !reduced) { last = null; frame = requestAnimationFrame(tick); }
  }

  function controls() {
    root.addEventListener("wheel", (e) => {  // 滾輪只控制泡泡區，不讓整頁捲動
      if (reduced) return;
      e.preventDefault();
      scrub((e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? root.clientHeight : 1) * e.deltaY);
    }, { passive: false });
    let y0 = null, dragged = false;  // 手指上下滑動：往上滑＝往後的時間
    root.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") { y0 = e.clientY; dragged = false; } });
    root.addEventListener("pointermove", (e) => {
      if (y0 == null || reduced) return;
      if (!dragged && Math.abs(e.clientY - y0) < 6) return;
      dragged = true;
      scrub(y0 - e.clientY);
      y0 = e.clientY;
    });
    const up = () => (y0 = null);
    root.addEventListener("pointerup", up);
    root.addEventListener("pointercancel", up);
    root.addEventListener("click", (e) => { if (dragged) { e.stopPropagation(); dragged = false; } }, true);
    root.addEventListener("keydown", (e) => {  // 鍵盤：上下（左右）方向鍵、PageUp／PageDown、Home／End
      if (reduced) return;
      const one = (root.clientHeight + 100) / 8, page = root.clientHeight * 0.8;
      const move = { ArrowDown: one, ArrowRight: one, ArrowUp: -one, ArrowLeft: -one, PageDown: page, PageUp: -page,
                     Home: -Infinity, End: Infinity }[e.key];
      if (move === undefined) return;
      e.preventDefault();
      setPlaying(false);
      moveTo(Math.abs(move) === Infinity ? (move < 0 ? lo : hi) : pos + move);
    });
    root.addEventListener("pointerover", (e) => (hovering = !!e.target.closest(".bubble")));
    root.addEventListener("pointerleave", () => (hovering = false));
    root.addEventListener("focusin", (e) => (hovering = e.target !== root));  // 鍵盤移到泡泡上時停住，才按得到
    root.addEventListener("focusout", () => (hovering = false));
    playBtn.addEventListener("click", () => setPlaying(!playing));
  }

  function init(el, newItems, pick, picked) {
    root = el; onPick = pick; isPicked = picked;
    items = [...newItems].sort((a, b) => b.date.localeCompare(a.date) || a.ticker.localeCompare(b.ticker));  // 由新到舊
    playBtn = document.getElementById("play");
    whenEl = document.getElementById("when");
    controls();
    motion.addEventListener("change", start);
    let w = root.clientWidth, h = root.clientHeight;
    new ResizeObserver(() => {
      if (root.parentElement.hidden || (Math.abs(root.clientWidth - w) < 40 && Math.abs(root.clientHeight - h) < 40)) return;
      w = root.clientWidth; h = root.clientHeight;
      start();
    }).observe(root);
    start();
  }

  return { init, refreshPicked, show };
})();
