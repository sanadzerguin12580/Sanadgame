/* ============================================================
   game.js — قلب اللعبة: الحلقة الرئيسية، إدارة المراحل،
   الرسومات والخلفية، وتوليد العناصر.
   ============================================================ */
(function (DG) {
  'use strict';

  const C = DG.CONFIG;

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');

      this.state = 'menu';          // menu | playing | paused | stageclear | gameover | victory
      this.time = 0;
      this.menuTime = 0;
      this.last = performance.now();

      this.stageIndex = 0;
      this.player = null;
      this.boss = null;

      this.projectiles = [];
      this.hazards = [];
      this.shockwaves = [];
      this.particles = [];
      this.texts = [];
      this.minions = [];
      this.lightning = [];

      this.shakeMag = 0;
      this.runCoins = 0;
      this.runTime = 0;
      this.stageTime = 0;

      this.skyGrad = null;
      this.vignette = null;
      this.sand = [];
      this.specks = [];

      this.initBackground();

      /* الهجوم بالفأرة أيضًا (زر الفأرة الأيسر) */
      const self = this;
      this.canvas.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        DG.Audio.init();
        if (self.state === 'playing') DG.Input.press('attack');
      });

      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    /* ===================== تجهيز الخلفية ===================== */
    initBackground() {
      const ctx = this.ctx;

      this.sand = Array.from({ length: 70 }, function () {
        return {
          x: DG.rand(0, C.W),
          y: DG.rand(60, C.H - 40),
          vx: DG.rand(-65, -20),
          vy: DG.rand(-9, 9),
          size: DG.rand(0.6, 2.2),
          alpha: DG.rand(0.12, 0.45)
        };
      });

      this.specks = Array.from({ length: 260 }, function () {
        return {
          x: DG.rand(0, C.W),
          y: DG.rand(C.GROUND + 4, C.H),
          r: DG.rand(0.6, 2.2),
          a: DG.rand(0.04, 0.22)
        };
      });

      this.skyGrad = ctx.createLinearGradient(0, -40, 0, C.GROUND);
      this.skyGrad.addColorStop(0, '#221634');
      this.skyGrad.addColorStop(0.38, '#5a2b3c');
      this.skyGrad.addColorStop(0.7, '#b8552f');
      this.skyGrad.addColorStop(1, '#e89a4a');

      this.vignette = ctx.createRadialGradient(
        C.W / 2, C.H / 2, C.H * 0.32,
        C.W / 2, C.H / 2, C.W * 0.72
      );
      this.vignette.addColorStop(0, 'rgba(0,0,0,0)');
      this.vignette.addColorStop(1, 'rgba(0,0,0,.55)');
    }

    /* ===================== إدارة الجولات والمراحل ===================== */
    startRun() {
      this.runCoins = 0;
      this.runTime = 0;
      this.startStage(0);
      DG.Audio.play('click');
    }

    startStage(index) {
      this.stageIndex = DG.clamp(index, 0, DG.STAGES.length - 1);

      this.projectiles = [];
      this.hazards = [];
      this.shockwaves = [];
      this.particles = [];
      this.texts = [];
      this.minions = [];
      this.lightning = [];

      this.player = new DG.Player(DG.Save.stats());
      this.player.x = 290;

      this.boss = DG.createBoss(this.stageIndex, this);
      this.boss.idleTimer = 2.2;   // مهلة سماح مع بداية المرحلة

      this.state = 'playing';
      this.stageTime = 0;
      this.shakeMag = 0;

      DG.Input.reset();
      DG.UI.hideScreens();
      DG.UI.showHUD(true);
      DG.UI.updateHUD(this);
      DG.UI.banner(
        'المرحلة ' + (this.stageIndex + 1),
        this.boss.name + ' — ' + this.boss.title,
        2600
      );
    }

    nextStage() {
      if (this.stageIndex < DG.STAGES.length - 1) {
        this.startStage(this.stageIndex + 1);
      }
    }

    retryStage() {
      this.startStage(this.stageIndex);
    }

    restartStage() {
      this.startStage(this.stageIndex);
    }

    pause() {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      DG.UI.showPause();
    }

    resume() {
      if (this.state !== 'paused') return;
      this.state = 'playing';
      this.last = performance.now();
      DG.UI.hideScreens();
    }

    toMenu() {
      this.state = 'menu';
      this.player = null;
      this.boss = null;
      this.projectiles = [];
      this.hazards = [];
      this.shockwaves = [];
      this.particles = [];
      this.texts = [];
      this.minions = [];
      this.lightning = [];
      this.shakeMag = 0;
      DG.Input.reset();
      DG.UI.showHUD(false);
      DG.UI.showScreen('screen-menu');
      DG.UI.updateMenuStats();
    }

    /* ===================== نتائج المعركة ===================== */
    onBossDefeated(boss) {
      if (this.state !== 'playing') return;

      const hpRatio = this.player ? DG.clamp(this.player.hp / this.player.maxHp, 0, 1) : 0;
      const bonus = Math.round(50 * hpRatio);
      const reward = boss.coinReward + bonus;

      this.runCoins += reward;
      DG.Save.addCoins(reward);
      DG.Save.addBossKill();
      DG.UI.updateMenuStats();

      const isLast = this.stageIndex >= DG.STAGES.length - 1;
      if (isLast) {
        this.state = 'victory';
        DG.Save.addWin();
        DG.UI.updateMenuStats();
        DG.Audio.play('victory');
        DG.UI.showVictory(this, reward);
        DG.UI.showHUD(false);
      } else {
        this.state = 'stageclear';
        DG.UI.showStageClear(this, reward);
        DG.UI.showHUD(false);
      }
    }

    onPlayerDeath() {
      if (this.state !== 'playing') return;
      this.state = 'gameover';
      DG.UI.showGameOver(this);
      DG.UI.showHUD(false);
    }

    /* ===================== توليد العناصر ===================== */
    spawnParticles(x, y, opts) {
      const o = opts || {};
      const count = o.count || 6;
      const life = o.life || 0.6;
      const size = o.size || 5;
      const gravity = o.gravity !== undefined ? o.gravity : 600;
      const baseAngle = o.angle;
      const spread = o.spread !== undefined ? o.spread : Math.PI * 2;

      for (let i = 0; i < count; i++) {
        const ang = baseAngle !== undefined
          ? baseAngle + DG.rand(-spread / 2, spread / 2)
          : DG.rand(0, Math.PI * 2);
        const sp = (o.speed || 200) * DG.rand(0.3, 1);
        this.particles.push(new DG.Particle(
          x, y,
          Math.cos(ang) * sp, Math.sin(ang) * sp,
          DG.rand(life * 0.6, life),
          DG.rand(size * 0.6, size),
          o.color || '#ffcf6b',
          gravity,
          o.glow
        ));
      }
    }

    spawnProjectile(opts) {
      this.projectiles.push(new DG.Projectile(opts));
    }

    spawnHazard(x, groundY, opts) {
      this.hazards.push(new DG.Hazard(x, groundY, opts));
    }

    spawnShockwave(x, y, opts) {
      this.shockwaves.push(new DG.Shockwave(x, y, opts));
    }

    spawnMinion(x) {
      this.minions.push(new DG.ScorpionMinion(x, {
        hp: 30 + this.stageIndex * 12
      }));
    }

    addText(text, x, y, opts) {
      this.texts.push(new DG.FloatingText(x, y, text, opts));
    }

    spawnLightning(x, y) {
      this.lightning.push({
        x: x, y: y, life: 0.3, maxLife: 0.3, seed: DG.rand(0, 100)
      });
    }

    shake(mag) {
      if (!DG.Save.settings.shake) return;
      this.shakeMag = Math.max(this.shakeMag, mag);
    }

    hurtFlash() {
      if (DG.UI && DG.UI.hurtFlash) DG.UI.hurtFlash();
    }

    /* ===================== التحديث ===================== */
    loop(now) {
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (!isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(dt, 0.033);

      if (this.state === 'paused' && DG.Input.pressed('pause')) {
        this.resume();
      }

      if (this.state === 'playing') {
        this.update(dt);
      } else {
        this.time += dt;
        this.updateAmbient(dt);
        this.updateEffects(dt);
        this.shakeMag = Math.max(0, this.shakeMag - (this.shakeMag * 8 + 20) * dt);
      }

      this.render();
      DG.Input.endFrame();
      requestAnimationFrame(this.loop);
    }

    update(dt) {
      if (DG.Input.pressed('pause')) {
        this.pause();
        return;
      }

      this.time += dt;
      this.runTime += dt;
      this.stageTime += dt;
      this.updateAmbient(dt);

      this.player.update(dt, this);

      /* قد تتغير الحالة داخل تحديث اللاعب (مثل الموت) */
      if (this.state !== 'playing') {
        this.updateEffects(dt);
        return;
      }

      if (this.boss) this.boss.update(dt, this);
      if (this.state !== 'playing') {
        this.updateEffects(dt);
        return;
      }

      for (const m of this.minions) m.update(dt, this);
      this.minions = this.minions.filter(function (m) { return !m.dead; });

      for (const p of this.projectiles) p.update(dt, this);
      this.projectiles = this.projectiles.filter(function (p) { return !p.dead; });

      for (const h of this.hazards) h.update(dt, this);
      this.hazards = this.hazards.filter(function (h) { return !h.dead; });

      for (const s of this.shockwaves) s.update(dt, this);
      this.shockwaves = this.shockwaves.filter(function (s) { return !s.dead; });

      this.updateEffects(dt);

      this.shakeMag = Math.max(0, this.shakeMag - (this.shakeMag * 8 + 20) * dt);

      DG.UI.updateHUD(this);
    }

    updateEffects(dt) {
      for (const p of this.particles) p.update(dt);
      this.particles = this.particles.filter(function (p) { return !p.dead; });

      for (const t of this.texts) t.update(dt);
      this.texts = this.texts.filter(function (t) { return !t.dead; });

      for (const l of this.lightning) l.life -= dt;
      this.lightning = this.lightning.filter(function (l) { return l.life > 0; });
    }

    updateAmbient(dt) {
      const factor = this.state === 'playing' ? 1 : 0.55;
      for (const s of this.sand) {
        s.x += s.vx * dt * factor;
        s.y += s.vy * dt * factor;
        if (s.x < -12) {
          s.x = C.W + 12;
          s.y = DG.rand(60, C.H - 40);
        }
        if (s.y < 45) s.y = C.H - 50;
        if (s.y > C.H - 20) s.y = 55;
      }
      if (this.state === 'menu') this.menuTime += dt;
    }

    /* ===================== الرسم ===================== */
    render() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, C.W, C.H);

      let ox = 0, oy = 0;
      if (this.shakeMag > 0.2 && DG.Save.settings.shake) {
        ox = DG.rand(-1, 1) * this.shakeMag;
        oy = DG.rand(-1, 1) * this.shakeMag;
      }

      ctx.save();
      ctx.translate(ox, oy);

      this.drawBackground(ctx);

      if (this.state === 'menu') {
        this.drawMenuScene(ctx);
      } else if (this.player) {
        this.drawScene(ctx);
      }

      ctx.restore();

      /* تعتيم الأطراف */
      ctx.fillStyle = this.vignette;
      ctx.fillRect(0, 0, C.W, C.H);
    }

    drawScene(ctx) {
      for (const h of this.hazards) h.draw(ctx);
      for (const s of this.shockwaves) s.draw(ctx);

      if (this.boss) this.boss.draw(ctx, this);

      for (const m of this.minions) m.draw(ctx);

      if (this.player) this.player.draw(ctx, this);

      for (const p of this.projectiles) p.draw(ctx);

      for (const l of this.lightning) this.drawLightning(ctx, l);

      for (const p of this.particles) p.draw(ctx);
      for (const t of this.texts) t.draw(ctx);
    }

    drawLightning(ctx, bolt) {
      const alpha = DG.clamp(bolt.life / bolt.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = '#ffe08a';
      ctx.shadowBlur = 30;
      ctx.strokeStyle = '#fff8d8';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bolt.x, -20);
      const steps = 8;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = bolt.x + Math.sin(bolt.seed + i * 2.1) * 30 * (1 - t);
        const y = DG.lerp(-20, bolt.y, t);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,230,150,.35)';
      ctx.beginPath();
      ctx.ellipse(bolt.x, C.GROUND, 95, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    /* ---------- الخلفية الصحراوية ---------- */
    drawBackground(ctx) {
      const W = C.W, H = C.H, G = C.GROUND;

      ctx.fillStyle = this.skyGrad;
      ctx.fillRect(-50, -50, W + 100, H + 100);

      /* نجوم باهتة في الأعلى */
      ctx.save();
      for (let i = 0; i < 36; i++) {
        const x = (i * 211) % W;
        const y = 24 + ((i * 131) % 150);
        ctx.globalAlpha = 0.08 + (i % 5) * 0.04;
        ctx.fillStyle = '#fff2d8';
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.restore();

      /* الشمس */
      const sunX = W * 0.73, sunY = H * 0.4;
      ctx.save();
      const sunGlow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 250);
      sunGlow.addColorStop(0, 'rgba(255,235,180,.95)');
      sunGlow.addColorStop(0.3, 'rgba(255,185,95,.5)');
      sunGlow.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 250, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe9b8';
      ctx.beginPath();
      ctx.arc(sunX, sunY, 54, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      /* أشرطة ضباب */
      ctx.fillStyle = 'rgba(255,196,150,.07)';
      ctx.fillRect(0, H * 0.33, W, 24);
      ctx.fillRect(W * 0.08, H * 0.46, W * 0.68, 14);

      const parallax = this.player ? (this.player.x - 640) * 0.02 : 0;

      /* أهرامات بعيدة */
      this.drawPyramid(ctx, W * 0.18 - parallax * 0.25, G - 42, 210, 152, 'rgba(72,35,48,.55)');
      this.drawPyramid(ctx, W * 0.43 - parallax * 0.35, G - 30, 150, 105, 'rgba(88,42,50,.45)');
      this.drawPyramid(ctx, W * 0.86 - parallax * 0.25, G - 38, 190, 130, 'rgba(64,30,42,.5)');

      /* كثبان رملية متدرجة */
      this.drawDune(ctx, G - 96, 26, 520, '#8f4b3c', parallax * 0.4);
      this.drawDune(ctx, G - 58, 20, 420, '#b06a3f', parallax * 0.7);
      this.drawDune(ctx, G - 22, 14, 330, '#cf8a4a', parallax);

      /* الأرض */
      const groundGrad = ctx.createLinearGradient(0, G, 0, H);
      groundGrad.addColorStop(0, '#cf9550');
      groundGrad.addColorStop(1, '#8a5426');
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, G, W, H - G);

      ctx.fillStyle = 'rgba(255,220,160,.35)';
      ctx.fillRect(0, G, W, 3);

      /* حبيبات الأرض */
      for (const s of this.specks) {
        ctx.globalAlpha = s.a;
        ctx.fillStyle = '#5e3a1b';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* ديكورات أرضية */
      this.drawRock(ctx, 132, G + 20, 36, 16);
      this.drawRock(ctx, 1128, G + 34, 28, 12);
      this.drawShrub(ctx, 372, G + 6);
      this.drawSkull(ctx, 812, G + 30);

      /* رمال متطايرة */
      this.drawSand(ctx);
    }

    drawPyramid(ctx, cx, baseY, w, h, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, baseY);
      ctx.lineTo(cx + w * 0.06, baseY - h);
      ctx.lineTo(cx + w / 2, baseY);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(255,190,120,.07)';
      ctx.beginPath();
      ctx.moveTo(cx + w * 0.06, baseY - h + 8);
      ctx.lineTo(cx + w / 2, baseY);
      ctx.lineTo(cx + w * 0.12, baseY);
      ctx.closePath();
      ctx.fill();
    }

    drawDune(ctx, baseY, amp, wavelength, color, offset) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-50, C.GROUND + 80);
      ctx.lineTo(-50, baseY);
      for (let x = -50; x <= C.W + 50; x += 22) {
        const y = baseY +
          Math.sin(((x + offset) / wavelength) * Math.PI * 2) * amp +
          Math.sin(((x + offset * 1.7) / (wavelength * 0.55))) * amp * 0.28;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(C.W + 50, C.GROUND + 80);
      ctx.closePath();
      ctx.fill();
    }

    drawRock(ctx, x, y, w, h) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      ctx.beginPath();
      ctx.ellipse(x + 4, y + h * 0.7, w * 0.6, h * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#8a5a2d';
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y + h / 2);
      ctx.lineTo(x - w * 0.3, y - h / 2);
      ctx.lineTo(x + w * 0.25, y - h * 0.6);
      ctx.lineTo(x + w / 2, y + h * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,205,140,.15)';
      ctx.beginPath();
      ctx.moveTo(x - w * 0.3, y - h / 2);
      ctx.lineTo(x + w * 0.25, y - h * 0.6);
      ctx.lineTo(x + w * 0.05, y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    drawShrub(ctx, x, y) {
      ctx.save();
      ctx.strokeStyle = '#7d5a2a';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 2, y - 26);
      ctx.moveTo(x - 14, y - 18);
      ctx.lineTo(x - 2, y - 20);
      ctx.moveTo(x + 12, y - 14);
      ctx.lineTo(x, y - 18);
      ctx.moveTo(x - 8, y - 30);
      ctx.lineTo(x - 2, y - 26);
      ctx.stroke();
      ctx.restore();
    }

    drawSkull(ctx, x, y) {
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = '#e2cba6';
      ctx.beginPath();
      ctx.ellipse(x, y, 15, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 8, y + 5, 16, 7);
      ctx.fillStyle = '#4a3322';
      ctx.beginPath();
      ctx.arc(x - 5, y - 1, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 5, y - 1, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawSand(ctx) {
      for (const s of this.sand) {
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = '#ffe1a8';
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, s.size * 2.4, s.size, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    /* ---------- ظل زعيم ضخم في خلفية القائمة ---------- */
    drawMenuScene(ctx) {
      const W = C.W, G = C.GROUND;
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#2a1418';
      ctx.translate(W * 0.79, G + 16);

      ctx.beginPath();
      ctx.moveTo(-140, 0);
      ctx.lineTo(-168, -150);
      ctx.quadraticCurveTo(-112, -286, 0, -296);
      ctx.quadraticCurveTo(112, -286, 168, -150);
      ctx.lineTo(140, 0);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#2a1418';
      ctx.lineWidth = 50;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-150, -200);
      ctx.quadraticCurveTo(-236, -160, -246, -34);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(150, -200);
      ctx.quadraticCurveTo(236, -160, 246, -34);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, -318, 62, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,150,60,.55)';
      ctx.beginPath();
      ctx.arc(-22, -324, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(22, -324, 9, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      this.drawSand(ctx);
    }
  }

  DG.Game = Game;
})(window.DG);
