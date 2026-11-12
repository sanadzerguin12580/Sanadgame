/* ============================================================
   audio.js — مؤثرات صوتية مولّدة عبر Web Audio (بدون ملفات خارجية)
   لا يحتاج أي أصول صوتية: كل الأصوات تُصنع برمجيًا.
   ============================================================ */
(function (DG) {
  'use strict';

  let ac = null;          // AudioContext
  let master = null;      // عقدة التحكم بالصوت العام
  let volume = 0.55;

  function init() {
    if (ac) {
      if (ac.state === 'suspended') ac.resume().catch(function () {});
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      ac = new Ctx();
      master = ac.createGain();
      master.gain.value = volume;
      master.connect(ac.destination);
    } catch (err) {
      ac = null;
      console.warn('[Audio] تعذر إنشاء سياق الصوت.', err);
    }
  }

  /* نغمة بسيطة مع انزلاق ترددي اختياري */
  function tone(freq, dur, type, gain, slideTo, delay) {
    if (!ac || !master) return;
    const t0 = ac.currentTime + (delay || 0);
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(25, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain || 0.1), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  /* ضجيج مُرشّح (للضربات والانفجارات) */
  function noise(dur, gain, cutoff, delay) {
    if (!ac || !master) return;
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buffer = ac.createBuffer(1, len, ac.sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff || 1400;
    const g = ac.createGain();
    const t0 = ac.currentTime + (delay || 0);
    g.gain.setValueAtTime(gain || 0.15, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t0);
  }

  const SFX = {
    swing: function () { noise(0.11, 0.14, 3000); tone(360, 0.09, 'triangle', 0.05, 170); },
    hit: function () { noise(0.07, 0.2, 1100); tone(130, 0.1, 'square', 0.1, 70); },
    hurt: function () { tone(190, 0.24, 'sawtooth', 0.13, 65); noise(0.14, 0.12, 700); },
    jump: function () { tone(300, 0.14, 'sine', 0.08, 540); },
    dash: function () { noise(0.16, 0.1, 1800); },
    shield: function () {
      tone(200, 0.45, 'sine', 0.12, 420);
      tone(310, 0.45, 'sine', 0.06, 640, 0.03);
    },
    lightning: function () {
      noise(0.42, 0.24, 5000);
      tone(1000, 0.3, 'sawtooth', 0.11, 55);
    },
    bossHurt: function () { tone(95, 0.1, 'square', 0.05, 65); },
    slam: function () { noise(0.36, 0.28, 320); tone(72, 0.4, 'sine', 0.18, 38); },
    orb: function () { tone(480, 0.18, 'sine', 0.06, 880); },
    coin: function () { tone(880, 0.09, 'square', 0.05, 1320); },
    death: function () { noise(0.9, 0.26, 600); tone(150, 0.9, 'sawtooth', 0.14, 40); },
    phase: function () { tone(165, 0.65, 'sawtooth', 0.13, 75); noise(0.5, 0.18, 700); },
    click: function () { tone(620, 0.05, 'square', 0.04, 820); },
    victory: function () {
      [523, 659, 784, 1046].forEach(function (f, i) {
        tone(f, 0.32, 'triangle', 0.1, null, i * 0.12);
      });
    }
  };

  DG.Audio = {
    init: init,
    play: function (name) {
      if (!ac) init();
      const fn = SFX[name];
      if (fn) fn();
    },
    setVolume: function (v) {
      volume = DG.clamp(v, 0, 1);
      if (master) master.gain.value = volume;
    },
    get volume() { return volume; }
  };
})(window.DG);
