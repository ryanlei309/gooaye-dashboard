// 數字與日期格式：百分比一律帶正負號（負號用 −），贏紅輸綠的 class；英文版日期照英文習慣（Mar 30, 2022）
"use strict";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const F = {
  pct(x, digits = 1) {
    if (x == null || !isFinite(x)) return "—";
    const v = Number((x * 100).toFixed(digits));
    if (v === 0) return (0).toFixed(digits) + "%";
    return (v > 0 ? "+" : "−") + Math.abs(v).toFixed(digits) + "%";
  },
  share(x) {
    return x == null ? "—" : Math.round(x * 100) + "%";
  },
  cls(x) {
    return x > 0 ? "win" : x < 0 ? "lose" : "";
  },
  // 一股的價格（美元）；指數（費半）只寫點數
  price(x, cur) {
    if (x == null) return "—";
    const digits = x >= 1000 ? 0 : 2;
    const n = x.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    return cur === "USD" ? "US$" + n : n;
  },
  esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  },
  day(d) {
    return d == null ? T.neverHit : T.dayN(d);
  },
  // ISO 日期（2022-03-30）→ 中文版照原樣、英文版「Mar 30, 2022」
  date(iso) {
    if (!iso || LANG !== "en") return iso || "—";
    const [y, m, d] = iso.split("-").map(Number);
    return `${MONTHS[m - 1]} ${d}, ${y}`;
  },
  // 年月：中文版「2023-05」、英文版「May 2023」
  month(iso) {
    if (LANG !== "en") return iso.slice(0, 7);
    const [y, m] = iso.split("-").map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  },
};
