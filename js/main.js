/* ============================================================
   main.js — نقطة الانطلاق: إنشاء اللعبة وربطها بالواجهة
   ============================================================ */
(function () {
  'use strict';

  window.addEventListener('DOMContentLoaded', function () {
    const canvas = document.getElementById('game');
    if (!canvas || !window.DG || !window.DG.Game) {
      console.error('[Main] تعذر العثور على عناصر اللعبة الأساسية.');
      return;
    }

    const game = new DG.Game(canvas);
    DG.UI.init(game);
    DG.Audio.setVolume(DG.Save.settings.volume);

    /* إتاحة اللعبة للتجربة من Console */
    window.game = game;

    /* إيقاف تلقائي عند ترك التبويب */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && game.state === 'playing') game.pause();
    });
  });
})();
