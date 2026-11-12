/* ============================================================
   input.js — لوحة المفاتيح والفأرة
   isDown  : هل الزر مضغوط الآن؟
   pressed : هل ضُغط في هذه اللقطة فقط؟ (يُمسح في نهاية كل إطار)
   ============================================================ */
(function (DG) {
  'use strict';

  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'jump', KeyW: 'jump', ArrowUp: 'jump',
    ShiftLeft: 'dash', ShiftRight: 'dash',
    KeyJ: 'attack',
    KeyQ: 'shield',
    KeyE: 'lightning',
    Escape: 'pause', KeyP: 'pause'
  };

  const GAME_KEYS = ['left', 'right', 'jump', 'dash', 'attack', 'shield', 'lightning', 'pause'];
  const down = new Set();
  const pressed = new Set();

  window.addEventListener('keydown', function (e) {
    const action = KEYMAP[e.code];
    if (!action) return;
    if (GAME_KEYS.indexOf(action) !== -1) e.preventDefault();
    if (e.repeat) return;
    down.add(action);
    pressed.add(action);
    if (DG.Audio) DG.Audio.init();
  });

  window.addEventListener('keyup', function (e) {
    const action = KEYMAP[e.code];
    if (!action) return;
    down.delete(action);
  });

  /* عند فقدان التركيز نُفرّغ الحركة حتى لا يظل اللاعب يمشي وحده */
  window.addEventListener('blur', function () {
    down.clear();
    pressed.clear();
  });

  DG.Input = {
    isDown: function (action) { return down.has(action); },
    pressed: function (action) { return pressed.has(action); },
    /* للاستخدام البرمجي أو أزرار اللمس لاحقًا */
    press: function (action) { pressed.add(action); },
    endFrame: function () { pressed.clear(); },
    reset: function () { down.clear(); pressed.clear(); }
  };
})(window.DG);
