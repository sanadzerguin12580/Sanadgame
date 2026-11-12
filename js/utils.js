/* ============================================================
   utils.js — مساحة الاسم DG والإعدادات العامة ودوال مساعدة
   كل الملفات تضيف إلى window.DG حتى تعمل كوحدات منفصلة
   دون الحاجة إلى نظام Modules (فتعمل بفتح index.html مباشرة).
   ============================================================ */
window.DG = window.DG || {};

(function (DG) {
  'use strict';

  /* إعدادات اللعبة العامة — عدّل الأرقام هنا لضبط التوازن */
  DG.CONFIG = {
    W: 1280,               // عرض ساحة الرسم المنطقي
    H: 720,                // ارتفاع ساحة الرسم المنطقي
    GROUND: 598,           // ارتفاع سطح الأرض (موضع أقدام الشخصيات)
    GRAVITY: 2500,         // الجاذبية بالبكسل/ثانية²
    ARENA_LEFT: 56,        // حدود الحركة
    ARENA_RIGHT: 1224
  };

  /* ---------- رياضيات ومساعدة ---------- */
  DG.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  DG.lerp = function (a, b, t) { return a + (b - a) * t; };
  DG.rand = function (a, b) { return a + Math.random() * (b - a); };
  DG.randInt = function (a, b) { return Math.floor(DG.rand(a, b + 1)); };
  DG.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  DG.sign = function (n) { return n < 0 ? -1 : n > 0 ? 1 : 0; };
  DG.dist = function (x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); };
  DG.easeOutCubic = function (t) { return 1 - Math.pow(1 - t, 3); };
  DG.easeInOut = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };

  /* تداخل مستطيلين */
  DG.rectsOverlap = function (a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  };

  /* تداخل دائرة مع مستطيل (تُستخدم لاصطدام المقذوفات باللاعب) */
  DG.circleRect = function (cx, cy, r, rect) {
    const nx = DG.clamp(cx, rect.x, rect.x + rect.w);
    const ny = DG.clamp(cy, rect.y, rect.y + rect.h);
    return (cx - nx) * (cx - nx) + (cy - ny) * (cy - ny) <= r * r;
  };

  /* مستطيل بحواف دائرية — يعمل حتى بدون ctx.roundRect */
  DG.roundRect = function (ctx, x, y, w, h, r) {
    const rad = Math.min(r || 0, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  };

  /* تنسيق الأرقام */
  DG.fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };

  /* تنسيق الوقت mm:ss */
  DG.fmtTime = function (seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  };
})(window.DG);
