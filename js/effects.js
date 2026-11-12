/* ============================================================
   effects.js — الجزيئات والمقذوفات والأخطار الأرضية والموجات
   كل العناصر هنا تُدار من Game وتُرسم فوق الخلفية.
   ============================================================ */
(function (DG) {
  'use strict';

  const GROUND = DG.CONFIG.GROUND;

  /* ---------------- جزيء (غبار، شرارات، رمال) ---------------- */
  class Particle {
    constructor(x, y, vx, vy, life, size, color, gravity, glow) {
      this.x = x; this.y = y;
      this.vx = vx; this.vy = vy;
      this.life = life; this.maxLife = life;
      this.size = size; this.color = color;
      this.gravity = gravity || 0;
      this.glow = !!glow;
      this.rot = DG.rand(0, Math.PI * 2);
      this.spin = DG.rand(-8, 8);
    }

    update(dt) {
      this.life -= dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += this.gravity * dt;
      this.vx *= 0.985;
      this.rot += this.spin * dt;
    }

    get dead() { return this.life <= 0; }

    draw(ctx) {
      const a = DG.clamp(this.life / this.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = this.color;
      if (this.glow) {
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 14;
      }
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      const s = this.size * (0.5 + a * 0.5);
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.restore();
    }
  }

  /* ---------------- مقذوف (صخرة / كرة سحرية / سم) ---------------- */
  class Projectile {
    constructor(opts) {
      const o = opts || {};
      this.x = o.x || 0;
      this.y = o.y || 0;
      this.vx = o.vx || 0;
      this.vy = o.vy || 0;
      this.r = o.r || 14;
      this.damage = o.damage || 10;
      this.life = o.life || 5;
      this.gravity = o.gravity || 0;
      this.homing = o.homing || 0;   // معدل الدوران نحو اللاعب (راديان/ث)
      this.color = o.color || '#ffcf6b';
      this.kind = o.kind || 'orb';
      this.dead = false;
      this.rot = DG.rand(0, Math.PI * 2);
      this.spin = DG.rand(-7, 7);
    }

    update(dt, game) {
      if (this.dead) return;
      this.life -= dt;

      /* توجيه ذاتي نحو اللاعب */
      if (this.homing > 0 && game.player && !game.player.dead) {
        const target = { x: game.player.x, y: game.player.y - game.player.h * 0.5 };
        const desired = Math.atan2(target.y - this.y, target.x - this.x);
        const current = Math.atan2(this.vy, this.vx);
        let diff = desired - current;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const ang = current + DG.clamp(diff, -this.homing * dt, this.homing * dt);
        const sp = Math.hypot(this.vx, this.vy) || 1;
        this.vx = Math.cos(ang) * sp;
        this.vy = Math.sin(ang) * sp;
      }

      this.vy += this.gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.rot += this.spin * dt;

      /* خروج من الساحة أو نهاية العمر */
      if (this.life <= 0 || this.x < -100 || this.x > DG.CONFIG.W + 100) {
        this.dead = true;
        return;
      }

      /* ارتطام بالأرض */
      if (this.y > GROUND + 26) {
        this.dead = true;
        game.spawnParticles(this.x, GROUND, {
          count: 9, color: this.color, speed: 200, life: 0.45, size: 5, gravity: 500
        });
        return;
      }

      /* إصابة اللاعب */
      if (game.player && !game.player.dead &&
          DG.circleRect(this.x, this.y, this.r, game.player.rect)) {
        game.player.takeDamage(this.damage, game);
        game.spawnParticles(this.x, this.y, {
          count: 12, color: this.color, speed: 260, life: 0.5, size: 5, gravity: 300
        });
        this.dead = true;
      }
    }

    draw(ctx) {
      if (this.dead) return;
      ctx.save();
      ctx.translate(this.x, this.y);

      if (this.kind === 'rock') {
        ctx.rotate(this.rot);
        ctx.fillStyle = '#b9773a';
        ctx.strokeStyle = 'rgba(60,35,15,.7)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const rr = this.r * (0.78 + ((i * 37) % 10) / 40);
          const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,210,150,.25)';
        ctx.beginPath();
        ctx.arc(-this.r * 0.25, -this.r * 0.3, this.r * 0.35, 0, Math.PI * 2);
        ctx.fill();
      } else {
        /* كرة متوهجة */
        const pulse = 1 + Math.sin(this.rot * 2) * 0.08;
        const g = ctx.createRadialGradient(0, 0, 1, 0, 0, this.r * 2.2 * pulse);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.3, this.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, this.r * 2.2 * pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(0, 0, this.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.beginPath();
        ctx.arc(-this.r * 0.25, -this.r * 0.25, this.r * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  /* ---------------- خطر أرضي (تحذير ثم انفجار) ---------------- */
  class Hazard {
    constructor(x, groundY, opts) {
      const o = opts || {};
      this.x = x;
      this.groundY = groundY;
      this.radius = o.radius || 52;
      this.warn = o.warn || 0.9;
      this.damage = o.damage || 12;
      this.kind = o.kind || 'spikes';   // spikes | meteor | venom
      this.color = o.color || '#e0b06a';
      this.timer = this.warn;
      this.state = 'warn';
      this.activeTime = 0.4;
      this.dead = false;
    }

    update(dt, game) {
      if (this.state === 'warn') {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.state = 'erupt';
          this.timer = this.activeTime;
          this.explode(game);
        }
      } else {
        this.timer -= dt;
        if (this.timer <= 0) this.dead = true;
      }
    }

    explode(game) {
      const p = game.player;
      if (p && !p.dead && DG.circleRect(this.x, this.groundY - 12, this.radius, p.rect)) {
        p.takeDamage(this.damage, game);
      }
      const colors = this.kind === 'venom'
        ? ['#8fd14f', '#4f8f2a', '#d4f28a']
        : ['#f0c070', '#d9a25c', '#c98a45'];
      game.spawnParticles(this.x, this.groundY - 10, {
        count: 18, color: DG.pick(colors), speed: 300, life: 0.7, size: 7, gravity: 600
      });
      game.shake(6);
      DG.Audio.play('hit');
    }

    draw(ctx) {
      const warnFrac = this.state === 'warn' ? DG.clamp(1 - this.timer / this.warn, 0, 1) : 1;

      if (this.state === 'warn') {
        /* حلقة تحذير على الأرض + حشوة تتقدم */
        ctx.save();
        ctx.translate(this.x, this.groundY);
        ctx.strokeStyle = this.kind === 'venom' ? 'rgba(160,230,110,.8)' : 'rgba(255,150,70,.85)';
        ctx.lineWidth = 3;
        ctx.setLineDash([9, 7]);
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius, 16, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = this.kind === 'venom'
          ? 'rgba(120,200,80,' + (0.1 + warnFrac * 0.3) + ')'
          : 'rgba(255,140,60,' + (0.1 + warnFrac * 0.35) + ')';
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius * warnFrac, 16 * warnFrac, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        /* نيزك هابط من السماء */
        if (this.kind === 'meteor') {
          const fallY = DG.lerp(this.groundY - 520, this.groundY - 30, warnFrac * warnFrac);
          ctx.save();
          ctx.translate(this.x, fallY);
          ctx.fillStyle = '#b9773a';
          ctx.beginPath();
          ctx.arc(0, 0, this.radius * 0.42, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,170,70,.5)';
          ctx.beginPath();
          ctx.moveTo(-10, 4);
          ctx.lineTo(0, -70);
          ctx.lineTo(10, 4);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      } else {
        /* الانفجار / الأعمدة */
        const k = DG.clamp(this.timer / this.activeTime, 0, 1);
        ctx.save();
        ctx.globalAlpha = k;
        if (this.kind === 'venom') {
          ctx.fillStyle = 'rgba(130,210,80,.55)';
          ctx.beginPath();
          ctx.ellipse(this.x, this.groundY, this.radius, 20, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(190,255,120,.7)';
          ctx.lineWidth = 3;
          for (let i = 0; i < 5; i++) {
            const dx = DG.rand(-this.radius * 0.7, this.radius * 0.7);
            const h = DG.rand(10, 40);
            ctx.beginPath();
            ctx.moveTo(this.x + dx, this.groundY);
            ctx.lineTo(this.x + dx + 4, this.groundY - h);
            ctx.stroke();
          }
        } else {
          /* أعمدة رملية مدببة */
          for (let i = -1; i <= 1; i++) {
            const h = (58 - Math.abs(i) * 16) * (0.6 + k * 0.6);
            ctx.fillStyle = 'rgba(232,178,94,.85)';
            ctx.beginPath();
            ctx.moveTo(this.x + i * this.radius * 0.42 - 12, this.groundY);
            ctx.lineTo(this.x + i * this.radius * 0.42, this.groundY - h);
            ctx.lineTo(this.x + i * this.radius * 0.42 + 12, this.groundY);
            ctx.closePath();
            ctx.fill();
          }
        }
        ctx.restore();
      }
    }
  }

  /* ---------------- موجة صدمة أرضية تتوسع ---------------- */
  class Shockwave {
    constructor(x, y, opts) {
      const o = opts || {};
      this.x = x;
      this.y = y;
      this.radius = 0;
      this.speed = o.speed || 620;
      this.maxRadius = o.maxRadius || 900;
      this.damage = o.damage || 15;
      this.thickness = o.thickness || 34;
      this.hit = false;
      this.dead = false;
    }

    update(dt, game) {
      const prev = this.radius;
      this.radius += this.speed * dt;
      if (this.radius > this.maxRadius) this.dead = true;

      const p = game.player;
      if (!p || p.dead || this.hit) return;
      const d = Math.abs(p.x - this.x);
      if (d <= this.radius && d >= prev - this.thickness && p.y > GROUND - 70) {
        this.hit = true;
        p.takeDamage(this.damage, game);
      }
    }

    draw(ctx) {
      const alpha = DG.clamp(1 - this.radius / this.maxRadius, 0, 1);
      for (let dir = -1; dir <= 1; dir += 2) {
        const rx = this.x + dir * this.radius;
        if (rx < -120 || rx > DG.CONFIG.W + 120) continue;
        const g = ctx.createLinearGradient(rx, this.y - 70, rx, this.y + 18);
        g.addColorStop(0, 'rgba(255,220,140,0)');
        g.addColorStop(0.55, 'rgba(255,190,90,' + (0.55 * alpha) + ')');
        g.addColorStop(1, 'rgba(190,110,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(rx, this.y, this.thickness * 0.55, 34 + alpha * 26, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,235,190,' + (0.55 * alpha) + ')';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(rx, this.y, this.thickness * 0.3, 16 + alpha * 10, 0, Math.PI, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  /* ---------------- أرقام / نصوص طائرة ---------------- */
  class FloatingText {
    constructor(x, y, text, opts) {
      const o = opts || {};
      this.x = x; this.y = y;
      this.text = text;
      this.color = o.color || '#ffe8a3';
      this.size = o.size || 22;
      this.life = o.life || 0.8;
      this.maxLife = this.life;
      this.vy = o.vy !== undefined ? o.vy : -70;
    }

    update(dt) {
      this.life -= dt;
      this.y += this.vy * dt;
      this.vy *= 0.96;
    }

    get dead() { return this.life <= 0; }

    draw(ctx) {
      const a = DG.clamp(this.life / this.maxLife, 0, 1);
      const scale = 1 + (1 - a) * 0.15;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(this.x, this.y);
      ctx.scale(scale, scale);
      ctx.font = '800 ' + this.size + 'px Cairo, Tahoma, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(20,10,8,.85)';
      ctx.strokeText(this.text, 0, 0);
      ctx.fillStyle = this.color;
      ctx.fillText(this.text, 0, 0);
      ctx.restore();
    }
  }

  DG.Particle = Particle;
  DG.Projectile = Projectile;
  DG.Hazard = Hazard;
  DG.Shockwave = Shockwave;
  DG.FloatingText = FloatingText;
})(window.DG);
