/* ============================================================
   bosses.js — الزعماء الثلاثة وأتباعهم
   كل زعيم يملك مجموعة هجمات (attacks) تُختار حسب:
   - المرحلة الحالية (1/2/3) المشتقة من نسبة الصحة المتبقية
   - المسافة بينه وبين اللاعب
   - وقت الانتظار (cooldown) لكل هجوم
   لإضافة هجوم جديد: أضف كائنًا داخل this.attacks بالمفاتيح:
   windup / active / recover / phases / range / weight / cooldown
   و start(boss, game) و update(boss, game, dt) اختياريين.
   ============================================================ */
(function (DG) {
  'use strict';

  const C = DG.CONFIG;
  const GROUND = C.GROUND;

  /* نقطة على منحنى بيزييه (لرسم ذيل العقرب) */
  function cubicPoint(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
    return {
      x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
      y: a * p0.y + b * p1.y + c * p2.y + d * p3.y
    };
  }

  /* ============================================================
     الصنف الأساسي للزعيم — يتحكم في آلة الحالات والحركة والضرر
     ============================================================ */
  class Boss {
    constructor(def, game) {
      Object.assign(this, {
        name: 'زعيم',
        title: '',
        maxHp: 600,
        w: 150,
        h: 180,
        x: 960,
        y: GROUND,
        color: '#c98a45',
        coinReward: 100,
        contactDamage: 8,
        walkSpeed: 90,
        preferredRange: 220,
        flying: false
      }, def || {});

      this.hp = this.maxHp;
      this.facing = -1;
      this.state = 'idle';          // idle | windup | active | recover | dead
      this.current = null;          // مفتاح الهجوم الحالي
      this.idleTimer = 1.4;
      this.windup = 0;
      this.active = 0;
      this.recover = 0;
      this.cooldowns = {};
      this.flash = 0;
      this.invuln = 0;
      this.contactCD = 0;
      this.dead = false;
      this.deathTimer = 0;
      this.deathDuration = 1.9;
      this.rewarded = false;
      this.phase = 1;
      this.transition = 0;
      this.t = 0;
      this.anim = 0;
      this.attacks = {};
    }

    get rect() {
      return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
    }

    get ratio() { return this.hp / this.maxHp; }

    phaseFor(ratio) { return ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3; }

    clampX() {
      this.x = DG.clamp(this.x, C.ARENA_LEFT + this.w / 2, C.ARENA_RIGHT - this.w / 2);
    }

    /* ================= الضرر والموت ================= */
    takeDamage(amount, game) {
      if (this.dead || this.invuln > 0) return false;

      this.hp = Math.max(0, this.hp - amount);
      this.flash = 0.12;
      game.spawnParticles(
        this.x + DG.rand(-this.w * 0.3, this.w * 0.3),
        this.y - this.h * 0.65,
        { count: 7, color: '#ffe0a0', speed: 240, life: 0.45, size: 5, gravity: 300 }
      );
      DG.Audio.play('bossHurt');

      if (this.hp <= 0) {
        this.die(game);
        return true;
      }

      const nextPhase = this.phaseFor(this.hp / this.maxHp);
      if (nextPhase > this.phase) {
        this.phase = nextPhase;
        this.transition = 1.1;
        this.invuln = 1.1;
        this.state = 'idle';
        this.current = null;
        this.windup = 0;
        this.active = 0;
        this.recover = 0;
        this.idleTimer = 0.8;
        Object.keys(this.cooldowns).forEach(function (k) { this.cooldowns[k] = 0; }, this);
        game.shake(15);
        DG.Audio.play('phase');
        game.spawnParticles(this.x, this.y - this.h * 0.5, {
          count: 45, color: '#ff9a4a', speed: 430, life: 1, size: 7, gravity: 200
        });
        game.addText('الغضب ' + nextPhase, this.x, this.y - this.h - 46, {
          color: '#ffb347', size: 30, life: 1.4, vy: -28
        });
      }
      return true;
    }

    die(game) {
      this.dead = true;
      this.state = 'dead';
      this.current = null;
      this.deathTimer = this.deathDuration;
      this.invuln = 999;
      game.shake(22);
      DG.Audio.play('death');
      game.spawnParticles(this.x, this.y - this.h * 0.5, {
        count: 60, color: '#ffcf6b', speed: 420, life: 1.2, size: 7, gravity: 300
      });

      /* تنظيف هجمات الزعيم المعلّقة حتى لا تصيب اللاعب بعد موته */
      game.projectiles.length = 0;
      game.hazards.length = 0;
      game.shockwaves.length = 0;
      for (const m of game.minions) m.dead = true;
    }

    /* ================= التحديث ================= */
    update(dt, game) {
      this.t += dt;
      this.anim += dt;
      this.flash = Math.max(0, this.flash - dt);
      this.invuln = Math.max(0, this.invuln - dt);
      this.contactCD = Math.max(0, this.contactCD - dt);
      if (this.transition > 0) this.transition = Math.max(0, this.transition - dt);
      for (const k in this.cooldowns) {
        this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
      }

      /* مشهد الموت */
      if (this.dead) {
        this.deathTimer -= dt;
        if (Math.random() < 0.7) {
          game.spawnParticles(
            this.x + DG.rand(-this.w * 0.45, this.w * 0.45),
            this.y - this.h * DG.rand(0.15, 0.95),
            { count: 2, color: '#ffcf6b', speed: 230, life: 0.7, size: 6, gravity: 120 }
          );
        }
        if (this.deathTimer <= 0 && !this.rewarded) {
          this.rewarded = true;
          game.onBossDefeated(this);
        }
        return;
      }

      this.facing = game.player.x < this.x ? -1 : 1;

      /* فترة التحول بين المراحل: الزعيم لا يهاجم */
      if (this.transition > 0) {
        if (Math.random() < 0.5) {
          game.spawnParticles(this.x + DG.rand(-70, 70), this.y - this.h * 0.6, {
            count: 1, color: '#ff9a5a', speed: 260, life: 0.6, size: 5, gravity: -120
          });
        }
        return;
      }

      this.updateAI(dt, game);

      /* ضرر التلامس مع جسم الزعيم */
      if (this.contactDamage > 0 && this.contactCD <= 0 &&
          DG.rectsOverlap(this.rect, game.player.rect)) {
        if (game.player.takeDamage(this.contactDamage, game)) this.contactCD = 0.75;
      }
    }

    updateAI(dt, game) {
      const atk = this.current ? this.attacks[this.current] : null;

      if (this.state === 'idle' || this.state === 'recover') {
        this.defaultMove(dt, game);
      }

      switch (this.state) {
        case 'idle': {
          this.idleTimer -= dt;
          if (this.idleTimer <= 0) {
            const key = this.chooseAttack(game);
            if (key) this.beginAttack(key, game);
            else this.idleTimer = 0.3;
          }
          break;
        }
        case 'windup': {
          this.windup -= dt;
          if (this.windup <= 0 && atk) {
            this.state = 'active';
            this.active = atk.active || 0.2;
            if (atk.start) atk.start(this, game);
          }
          break;
        }
        case 'active': {
          this.active -= dt;
          if (atk && atk.update) atk.update(this, game, dt);
          if (this.active <= 0 && atk) {
            if (atk.end) atk.end(this, game);
            this.state = 'recover';
            this.recover = atk.recover || 0.5;
          }
          break;
        }
        case 'recover': {
          this.recover -= dt;
          if (this.recover <= 0) {
            this.state = 'idle';
            this.idleTimer = this.idleTime();
            this.current = null;
          }
          break;
        }
        default:
          break;
      }
    }

    idleTime() {
      return Math.max(0.45, 0.95 - (this.phase - 1) * 0.2) + DG.rand(0, 0.25);
    }

    defaultMove(dt, game) {
      const dx = game.player.x - this.x;
      const dist = Math.abs(dx);
      let dir = 0;
      if (dist > this.preferredRange + 45) dir = DG.sign(dx);
      else if (dist < this.preferredRange - 75) dir = -DG.sign(dx);

      if (dir !== 0) {
        this.x += dir * this.walkSpeed * dt * (1 + (this.phase - 1) * 0.18);
        if (Math.random() < dt * 9) {
          game.spawnParticles(this.x - dir * this.w * 0.3, GROUND - 4, {
            count: 1, color: '#d9b06b', speed: 60, life: 0.5, size: 4, gravity: -40
          });
        }
      }
      this.clampX();
    }

    chooseAttack(game) {
      const self = this;
      const distToPlayer = Math.abs(game.player.x - this.x);
      const pool = Object.keys(this.attacks).filter(function (key) {
        const a = self.attacks[key];
        if ((self.cooldowns[key] || 0) > 0) return false;
        if (a.phases && a.phases.indexOf(self.phase) === -1) return false;
        if (a.range) {
          if (distToPlayer < a.range[0] || distToPlayer > a.range[1]) return false;
        }
        return true;
      });

      if (!pool.length) return null;

      let total = 0;
      for (const key of pool) total += this.attacks[key].weight || 1;
      let roll = Math.random() * total;
      for (const key of pool) {
        roll -= this.attacks[key].weight || 1;
        if (roll <= 0) return key;
      }
      return pool[0];
    }

    beginAttack(key, game) {
      const atk = this.attacks[key];
      if (!atk) return;
      this.current = key;
      this.state = 'windup';
      this.windup = atk.windup || 0.5;
      this.cooldowns[key] = atk.cooldown || 3;
      if (atk.begin) atk.begin(this, game);
    }

    /* ================= الرسم المساعد ================= */
    drawShadow(ctx) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.beginPath();
      ctx.ellipse(this.x, GROUND + 4, this.w * 0.55, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawWindup(ctx) {
      if (this.state !== 'windup' || !this.current) return;
      const atk = this.attacks[this.current];
      if (!atk) return;
      const prog = DG.clamp(1 - this.windup / (atk.windup || 1), 0, 1);

      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.strokeStyle = 'rgba(255,140,70,.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, this.w * 0.55, 18, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,225,160,.95)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(0, 0, this.w * 0.55 * prog, 18 * prog, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,210,130,' + (0.55 + 0.45 * Math.sin(this.t * 22)) + ')';
      ctx.font = '900 34px Cairo, Tahoma, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', 0, -this.h - 20);
      ctx.restore();
    }

    draw(ctx, game) { /* تُستبدل في الأصناف الفرعية */ }
  }

  /* ============================================================
     الزعيم الأول: حارس الرمال
     ============================================================ */
  class SandGuardian extends Boss {
    constructor(game) {
      super({
        name: 'حارس الرمال',
        title: 'الواحة المنسية',
        maxHp: 620,
        w: 152,
        h: 192,
        x: 960,
        coinReward: 90,
        contactDamage: 9,
        walkSpeed: 95,
        preferredRange: 175
      }, game);

      this.attacks = {
        /* ضربة أرضية تُطلق موجتي صدمة */
        slam: {
          windup: 0.65, active: 0.22, recover: 0.75,
          range: [0, 310], weight: 3, cooldown: 2.8, phases: [1, 2, 3],
          start: function (b, game) {
            DG.Audio.play('slam');
            game.shake(18);
            game.spawnShockwave(b.x, GROUND - 8, {
              speed: 640, maxRadius: 980, damage: 15, thickness: 36
            });
            game.spawnParticles(b.x, GROUND - 12, {
              count: 32, color: '#d9a25c', speed: 460, life: 0.9, size: 8, gravity: 900
            });
            if (Math.abs(game.player.x - b.x) < 175 && game.player.y > GROUND - 80) {
              game.player.takeDamage(20, game);
            }
          }
        },

        /* قذف صخور مقوسة نحو اللاعب */
        rocks: {
          windup: 0.5, active: 0.95, recover: 0.6,
          range: [200, 1200], weight: 2, cooldown: 3.4, phases: [1, 2, 3],
          start: function (b) {
            b.rockLeft = b.phase >= 3 ? 4 : 3;
            b.rockTimer = 0;
          },
          update: function (b, game, dt) {
            b.rockTimer -= dt;
            if (b.rockTimer <= 0 && b.rockLeft > 0) {
              b.rockLeft--;
              b.rockTimer = 0.2;
              const targetX = game.player.x + game.player.vx * 0.2;
              const fromX = b.x + b.facing * 24;
              const fromY = b.y - 158;
              const vx = DG.clamp((targetX - fromX) * 0.85, -560, 560);
              game.spawnProjectile({
                x: fromX, y: fromY, vx: vx, vy: -380, gravity: 980,
                r: 18, damage: 11, color: '#c98a45', kind: 'rock', life: 5
              });
              DG.Audio.play('dash');
            }
          }
        },

        /* أعمدة رملية تحت اللاعب (المرحلة 2+) */
        spikes: {
          windup: 0.75, active: 1.15, recover: 0.8,
          range: [0, 1200], weight: 2, cooldown: 5.2, phases: [2, 3],
          start: function (b, game) {
            b.spikeTimer = 0;
            b.spikeQueue = [];
            const n = b.phase >= 3 ? 5 : 4;
            for (let i = 0; i < n; i++) {
              const x = DG.clamp(
                game.player.x + DG.rand(-260, 260) + (i % 2 ? -45 : 45),
                100, 1180
              );
              b.spikeQueue.push({ x: x, delay: 0.15 + 0.18 * i, done: false });
            }
            DG.Audio.play('phase');
          },
          update: function (b, game, dt) {
            b.spikeTimer += dt;
            for (const s of b.spikeQueue) {
              if (!s.done && b.spikeTimer >= s.delay) {
                s.done = true;
                game.spawnHazard(s.x, GROUND, {
                  radius: 52, warn: 0.55, damage: 13, kind: 'spikes'
                });
              }
            }
          }
        },

        /* دوران غاضب يجرف الساحة (المرحلة 3 فقط) */
        spin: {
          windup: 0.55, active: 1.5, recover: 0.75,
          range: [0, 720], weight: 1.4, cooldown: 7, phases: [3],
          start: function (b, game) {
            b.spinDir = DG.sign(game.player.x - b.x) || 1;
            DG.Audio.play('dash');
          },
          update: function (b, game, dt) {
            b.x += b.spinDir * 430 * dt;
            b.clampX();
            if (Math.random() < 0.7) {
              game.spawnParticles(b.x, GROUND - 10, {
                count: 1, color: '#e0b06a', speed: 200, life: 0.5, size: 5, gravity: 80
              });
            }
            if (b.contactCD <= 0 && DG.rectsOverlap(b.rect, game.player.rect)) {
              if (game.player.takeDamage(14, game)) b.contactCD = 0.6;
            }
          }
        }
      };
    }

    draw(ctx, game) {
      this.drawShadow(ctx);
      ctx.save();
      ctx.translate(this.x, this.y);
      if (this.dead) ctx.globalAlpha = DG.clamp(this.deathTimer / this.deathDuration, 0, 1);
      if (this.flash > 0) ctx.filter = 'brightness(1.7) saturate(1.25)';

      const breathe = Math.sin(this.t * 1.7) * 3;
      const atk = this.current ? this.attacks[this.current] : null;
      const windProg = (this.state === 'windup' && atk)
        ? DG.clamp(1 - this.windup / atk.windup, 0, 1) : 0;
      const raise = (this.current === 'slam' && (this.state === 'windup' || this.state === 'active'))
        ? (this.state === 'windup' ? windProg : 1) : 0;

      /* الأرجل والقدمان */
      ctx.fillStyle = '#8a5327';
      DG.roundRect(ctx, -58, -48, 40, 50, 10); ctx.fill();
      DG.roundRect(ctx, 18, -48, 40, 50, 10); ctx.fill();
      ctx.fillStyle = '#6f421f';
      DG.roundRect(ctx, -66, -14, 54, 18, 8); ctx.fill();
      DG.roundRect(ctx, 12, -14, 54, 18, 8); ctx.fill();

      /* الجذع الصخري */
      const bodyGrad = ctx.createLinearGradient(0, -this.h, 0, -30);
      bodyGrad.addColorStop(0, '#dda35c');
      bodyGrad.addColorStop(0.45, '#bd7c3d');
      bodyGrad.addColorStop(1, '#8a5327');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.moveTo(-56, -36);
      ctx.lineTo(-66, -118);
      ctx.quadraticCurveTo(-56, -178, 0, -186 + breathe);
      ctx.quadraticCurveTo(56, -178, 66, -118);
      ctx.lineTo(56, -36);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(70,40,18,.55)';
      ctx.lineWidth = 3;
      ctx.stroke();

      /* شقوق متوهجة في المراحل المتقدمة */
      ctx.strokeStyle = this.phase >= 2 ? 'rgba(255,150,60,.8)' : 'rgba(90,55,28,.6)';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-30, -152); ctx.lineTo(-18, -126); ctx.lineTo(-27, -100); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(35, -142); ctx.lineTo(23, -112); ctx.lineTo(38, -88); ctx.stroke();

      /* النواة المتوهجة */
      ctx.save();
      ctx.shadowColor = '#ffaa44';
      ctx.shadowBlur = 20;
      ctx.fillStyle = 'rgba(255,170,70,' + (0.6 + Math.sin(this.t * 3) * 0.25) + ')';
      ctx.beginPath(); ctx.arc(0, -106, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff1c9';
      ctx.beginPath(); ctx.arc(0, -106, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      /* الذراعان والقبضتان */
      const fistY = DG.lerp(-92, -212, raise);
      ctx.strokeStyle = '#a26833';
      ctx.lineWidth = 26;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-58, -142);
      ctx.quadraticCurveTo(-88, DG.lerp(-132, -192, raise), -90, fistY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(58, -142);
      ctx.quadraticCurveTo(88, DG.lerp(-132, -192, raise), 90, fistY);
      ctx.stroke();
      ctx.fillStyle = '#c98a45';
      ctx.strokeStyle = 'rgba(70,40,18,.5)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(-90, fistY, 24, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(90, fistY, 24, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      /* كتفان صخريان */
      ctx.fillStyle = '#b9773a';
      ctx.beginPath(); ctx.ellipse(-58, -150, 24, 17, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(58, -150, 24, 17, 0.3, 0, Math.PI * 2); ctx.fill();

      /* الرأس والعمامة الحجرية */
      ctx.fillStyle = '#c98a45';
      ctx.beginPath(); ctx.arc(0, -198 + breathe, 27, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e0b06a';
      ctx.beginPath(); ctx.arc(0, -204 + breathe, 29, Math.PI * 1.03, Math.PI * 1.97); ctx.fill();
      ctx.fillStyle = this.phase >= 3 ? '#ff6b3d' : '#ffb347';
      ctx.save();
      ctx.shadowColor = this.phase >= 3 ? '#ff6b3d' : '#ffb347';
      ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(-10, -197 + breathe, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(10, -197 + breathe, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      /* رسم رمز الجبهة */
      ctx.strokeStyle = 'rgba(255,205,120,.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -214 + breathe);
      ctx.lineTo(5, -207 + breathe);
      ctx.lineTo(0, -201 + breathe);
      ctx.lineTo(-5, -207 + breathe);
      ctx.closePath();
      ctx.stroke();

      /* خطوط سرعة عند الدوران */
      if (this.state === 'active' && this.current === 'spin') {
        ctx.strokeStyle = 'rgba(255,220,150,.5)';
        ctx.lineWidth = 3;
        for (let i = 0; i < 4; i++) {
          const y = -60 - i * 35;
          ctx.beginPath();
          ctx.moveTo(-this.spinDir * 100, y);
          ctx.lineTo(-this.spinDir * 190, y);
          ctx.stroke();
        }
      }

      ctx.restore();
      this.drawWindup(ctx);
    }
  }

  /* ============================================================
     الزعيم الثاني: ملك العقارب
     ============================================================ */
  class ScorpionKing extends Boss {
    constructor(game) {
      super({
        name: 'ملك العقارب',
        title: 'وادي السموم',
        maxHp: 860,
        w: 236,
        h: 156,
        x: 980,
        coinReward: 140,
        contactDamage: 9,
        walkSpeed: 120,
        preferredRange: 260
      }, game);

      this.attacks = {
        /* اندفاع عرضي سريع */
        charge: {
          windup: 0.65, active: 0.95, recover: 0.7,
          range: [150, 1150], weight: 3, cooldown: 3.6, phases: [1, 2, 3],
          begin: function (b, game) {
            b.chargeDir = DG.sign(game.player.x - b.x) || 1;
            b.chargeHit = false;
            b.wallHit = false;
          },
          start: function (b) {
            b.chargeSpeed = 720 + b.phase * 80;
            DG.Audio.play('dash');
          },
          update: function (b, game, dt) {
            b.x += b.chargeDir * b.chargeSpeed * dt;
            if (Math.random() < 0.75) {
              game.spawnParticles(b.x - b.chargeDir * b.w * 0.3, GROUND - 10, {
                count: 1, color: '#d9a25c', speed: 260, life: 0.5, size: 5, gravity: 200
              });
            }
            const minX = C.ARENA_LEFT + b.w / 2;
            const maxX = C.ARENA_RIGHT - b.w / 2;
            if (!b.wallHit && (b.x < minX || b.x > maxX)) {
              b.wallHit = true;
              b.x = DG.clamp(b.x, minX, maxX);
              game.shake(14);
              DG.Audio.play('slam');
              game.spawnParticles(b.x, GROUND - 30, {
                count: 22, color: '#c98a45', speed: 340, life: 0.8, size: 7, gravity: 700
              });
            } else {
              b.clampX();
            }
            if (!b.chargeHit && DG.rectsOverlap(b.rect, game.player.rect)) {
              if (game.player.takeDamage(15, game)) b.chargeHit = true;
            }
          },
          end: function (b) { b.chargeHit = false; }
        },

        /* رشة إبر سامة متعددة */
        sting: {
          windup: 0.45, active: 0.7, recover: 0.55,
          range: [140, 1150], weight: 2.6, cooldown: 2.9, phases: [1, 2, 3],
          start: function (b) {
            b.stingLeft = b.phase >= 3 ? 5 : 3;
            b.stingTimer = 0;
          },
          update: function (b, game, dt) {
            b.stingTimer -= dt;
            if (b.stingLeft > 0 && b.stingTimer <= 0) {
              b.stingLeft--;
              b.stingTimer = 0.14;
              const sx = b.x + b.facing * 85;
              const sy = b.y - 150;
              const targetY = game.player.y - game.player.h * 0.5;
              const ang = Math.atan2(targetY - sy, game.player.x - sx) + DG.rand(-0.14, 0.14);
              const speed = 500;
              game.spawnProjectile({
                x: sx, y: sy,
                vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
                r: 11, damage: 9, color: '#b6e05a', kind: 'orb', life: 3,
                homing: b.phase >= 3 ? 0.8 : 0
              });
              DG.Audio.play('orb');
            }
          }
        },

        /* استدعاء عقارب صغيرة (المرحلة 2+) */
        summon: {
          windup: 0.9, active: 0.4, recover: 0.8,
          range: [0, 1200], weight: 1.5, cooldown: 9, phases: [2, 3],
          start: function (b, game) {
            const n = b.phase >= 3 ? 3 : 2;
            for (let i = 0; i < n; i++) {
              const x = i % 2 === 0 ? DG.rand(160, 360) : DG.rand(920, 1120);
              game.spawnMinion(x);
              game.spawnParticles(x, GROUND - 20, {
                count: 14, color: '#9fd15a', speed: 220, life: 0.7, size: 5, gravity: 300
              });
            }
            DG.Audio.play('phase');
            game.shake(7);
          }
        },

        /* مطر سموم من الأرض (المرحلة 3) */
        venom: {
          windup: 0.7, active: 1.55, recover: 0.75,
          range: [0, 1200], weight: 1.6, cooldown: 7, phases: [3],
          start: function (b, game) {
            b.venomTimer = 0;
            b.venomQueue = [];
            const n = 6;
            for (let i = 0; i < n; i++) {
              b.venomQueue.push({
                x: DG.clamp(game.player.x + DG.rand(-420, 420), 100, 1180),
                delay: 0.16 * i,
                done: false
              });
            }
            DG.Audio.play('phase');
          },
          update: function (b, game, dt) {
            b.venomTimer += dt;
            for (const q of b.venomQueue) {
              if (!q.done && b.venomTimer >= q.delay) {
                q.done = true;
                game.spawnHazard(q.x, GROUND, {
                  radius: 46, warn: 0.7, damage: 11, kind: 'venom'
                });
              }
            }
          }
        }
      };
    }

    draw(ctx, game) {
      this.drawShadow(ctx);
      ctx.save();
      ctx.translate(this.x, this.y);
      if (this.dead) ctx.globalAlpha = DG.clamp(this.deathTimer / this.deathDuration, 0, 1);
      if (this.flash > 0) ctx.filter = 'brightness(1.6) saturate(1.2)';
      ctx.scale(this.facing, 1);

      const atk = this.current ? this.attacks[this.current] : null;
      const windProg = (this.state === 'windup' && atk)
        ? DG.clamp(1 - this.windup / atk.windup, 0, 1) : 0;
      const charging = this.state === 'active' && this.current === 'charge';
      const stingReady = (this.state === 'windup' && this.current === 'sting') ? windProg : 0;
      const sway = Math.sin(this.anim * 3) * 10;

      /* الأرجل */
      ctx.strokeStyle = '#a86b22';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < 3; i++) {
          const hx = -34 + i * 34;
          const footX = hx + side * (44 + i * 6);
          const lift = Math.abs(Math.sin(this.anim * 12 + i * 1.4)) * (charging ? 10 : 5);
          ctx.beginPath();
          ctx.moveTo(hx, -72);
          ctx.quadraticCurveTo(hx + side * 30, -34, footX, -lift);
          ctx.stroke();
          ctx.fillStyle = '#8a5418';
          ctx.beginPath();
          ctx.arc(hx + side * 12, -46, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      /* الذيل المقوس */
      const p0 = { x: -64, y: -92 };
      const p1 = { x: -104, y: -150 };
      const p2 = { x: -18, y: -218 + sway };
      const p3 = { x: 30, y: -176 + sway * 0.5 };
      ctx.strokeStyle = '#8a5418';
      ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
      ctx.stroke();
      for (let i = 1; i <= 5; i++) {
        const pt = cubicPoint(p0, p1, p2, p3, i / 6);
        ctx.fillStyle = i % 2 === 0 ? '#e0a53a' : '#c98a2c';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 14 - i * 1.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(100,58,15,.55)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      /* الإبرة */
      ctx.save();
      ctx.translate(p3.x + 4, p3.y - 2);
      ctx.rotate(0.9);
      if (stingReady > 0) {
        ctx.shadowColor = '#b6e05a';
        ctx.shadowBlur = 20 + stingReady * 20;
      }
      ctx.fillStyle = this.phase >= 2 ? '#7fae3a' : '#7a3f14';
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(8, 12);
      ctx.lineTo(-8, 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      /* الجسم */
      const bodyGrad = ctx.createLinearGradient(0, -126, 0, -34);
      bodyGrad.addColorStop(0, '#f2c766');
      bodyGrad.addColorStop(0.5, '#d69a2f');
      bodyGrad.addColorStop(1, '#98600f');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.ellipse(0, -82, 86, 44, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(90,52,12,.55)';
      ctx.lineWidth = 3;
      ctx.stroke();

      /* صفائح الظهر */
      ctx.strokeStyle = 'rgba(120,70,15,.5)';
      ctx.lineWidth = 3;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.ellipse(-8, -82, 66 - i * 14, 36 - i * 7, 0, Math.PI * 1.03, Math.PI * 1.97);
        ctx.stroke();
      }

      /* المخالب */
      const clawOpen = 0.5 + Math.sin(this.anim * 4) * 0.25 + stingReady * 0.4;
      ctx.strokeStyle = '#c98a2c';
      ctx.lineWidth = 15;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(58, -94);
      ctx.quadraticCurveTo(98, -116, 122, -100);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(52, -70);
      ctx.quadraticCurveTo(94, -50, 118, -66);
      ctx.stroke();

      for (let k = 0; k < 2; k++) {
        const cx = k === 0 ? 128 : 124;
        const cy = k === 0 ? -104 : -62;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(k === 0 ? -0.35 : 0.4);
        ctx.fillStyle = '#e0a53a';
        ctx.strokeStyle = 'rgba(90,52,12,.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, 22, 12, clawOpen - 0.5, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(10, -8 - clawOpen * 6, 18, 9, 0.5, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }

      /* الرأس والتاج */
      ctx.fillStyle = '#d69a2f';
      ctx.beginPath();
      ctx.ellipse(84, -86, 28, 23, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(90,52,12,.5)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = this.phase >= 3 ? '#ff4d3d' : '#cc2f24';
      ctx.save();
      ctx.shadowColor = '#ff4d3d';
      ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(92, -94, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(104, -88, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#ffd76b';
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(78 + i * 11, -112);
        ctx.lineTo(83 + i * 11, -132);
        ctx.lineTo(88 + i * 11, -112);
        ctx.closePath();
        ctx.fill();
      }

      /* خطوط سرعة أثناء الاندفاع */
      if (charging) {
        ctx.strokeStyle = 'rgba(255,230,160,.55)';
        ctx.lineWidth = 4;
        for (let i = 0; i < 4; i++) {
          const y = -40 - i * 28;
          ctx.beginPath();
          ctx.moveTo(-90, y);
          ctx.lineTo(-190, y);
          ctx.stroke();
        }
      }

      ctx.restore();
      this.drawWindup(ctx);
    }
  }

  /* ============================================================
     الزعيم الثالث: ساحر الصحراء
     ============================================================ */
  class DesertSorcerer extends Boss {
    constructor(game) {
      super({
        name: 'ساحر الصحراء',
        title: 'معبد الرمال',
        maxHp: 1080,
        w: 120,
        h: 170,
        x: 960,
        y: GROUND - 66,
        coinReward: 220,
        contactDamage: 0,
        walkSpeed: 85,
        preferredRange: 340,
        flying: true
      }, game);

      this.attacks = {
        /* اختفاء ثم كرات سحرية متتبعة */
        orbs: {
          windup: 0.55, active: 0.7, recover: 0.55,
          range: [0, 1300], weight: 2.7, cooldown: 3.2, phases: [1, 2, 3],
          start: function (b, game) {
            game.spawnParticles(b.x, b.y - 90, {
              count: 24, color: '#c9a7ff', speed: 300, life: 0.7, size: 6, gravity: -150
            });
            const targetX = game.player.x < C.W / 2
              ? DG.rand(840, 1120)
              : DG.rand(160, 440);
            b.x = targetX;
            b.y = GROUND - 66;
            game.spawnParticles(b.x, b.y - 90, {
              count: 24, color: '#c9a7ff', speed: 300, life: 0.7, size: 6, gravity: -150
            });
            b.orbsLeft = b.phase >= 3 ? 6 : 4;
            b.orbTimer = 0.05;
            DG.Audio.play('phase');
          },
          update: function (b, game, dt) {
            b.orbTimer -= dt;
            if (b.orbsLeft > 0 && b.orbTimer <= 0) {
              b.orbsLeft--;
              b.orbTimer = 0.14;
              const sx = b.x + b.facing * 38;
              const sy = b.y - 138;
              const ang = Math.atan2(
                (game.player.y - 55) - sy,
                game.player.x - sx
              ) + DG.rand(-0.12, 0.12);
              const speed = 300;
              game.spawnProjectile({
                x: sx, y: sy,
                vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
                r: 12, damage: 10, color: '#b78bff', kind: 'orb', life: 6,
                homing: 1.5
              });
              DG.Audio.play('orb');
            }
          }
        },

        /* شعاع أفقي يجتاح الساحة */
        beam: {
          windup: 0.9, active: 0.7, recover: 0.6,
          range: [0, 1300], weight: 2, cooldown: 4.2, phases: [1, 2, 3],
          begin: function (b, game) {
            b.beamY = game.player.y - 56;
            b.beamOn = false;
          },
          start: function (b, game) {
            b.beamOn = true;
            game.shake(10);
            DG.Audio.play('lightning');
          },
          update: function (b, game) {
            const p = game.player;
            if (!p || p.dead || !b.beamOn) return;
            const r = p.rect;
            if (r.y < b.beamY + 24 && r.y + r.h > b.beamY - 24) {
              p.takeDamage(22, game);
            }
            if (Math.random() < 0.7) {
              game.spawnParticles(DG.rand(0, C.W), b.beamY + DG.rand(-12, 12), {
                count: 1, color: '#d8c2ff', speed: 130, life: 0.35, size: 4, gravity: 0
              });
            }
          },
          end: function (b) { b.beamOn = false; }
        },

        /* نيازك على مواقع متفرقة (المرحلة 2+) */
        meteors: {
          windup: 0.6, active: 2.1, recover: 0.6,
          range: [0, 1300], weight: 1.9, cooldown: 6, phases: [2, 3],
          start: function (b) {
            b.meteorTimer = 0;
            b.meteorLeft = b.phase >= 3 ? 7 : 5;
          },
          update: function (b, game, dt) {
            b.meteorTimer -= dt;
            if (b.meteorLeft > 0 && b.meteorTimer <= 0) {
              b.meteorLeft--;
              b.meteorTimer = 0.26;
              const baseX = Math.random() < 0.45
                ? game.player.x
                : DG.rand(120, 1160);
              const x = DG.clamp(baseX + DG.rand(-90, 90), 100, 1180);
              game.spawnHazard(x, GROUND, {
                radius: 54, warn: 0.9, damage: 14, kind: 'meteor'
              });
              DG.Audio.play('orb');
            }
          }
        },

        /* عاصفة رملية تدفع اللاعب (المرحلة 3) */
        storm: {
          windup: 0.8, active: 2.6, recover: 0.85,
          range: [0, 1300], weight: 1.6, cooldown: 8, phases: [3],
          start: function (b, game) {
            b.stormTimer = 0;
            b.stormOrbs = 4;
            DG.Audio.play('phase');
            game.shake(6);
          },
          update: function (b, game, dt) {
            const p = game.player;
            const windDir = Math.sin(b.t * 1.4) > 0 ? 1 : -1;
            if (p && !p.dead) {
              p.x = DG.clamp(
                p.x + windDir * 95 * dt,
                C.ARENA_LEFT + p.w / 2,
                C.ARENA_RIGHT - p.w / 2
              );
            }
            if (Math.random() < 0.85) {
              game.spawnParticles(DG.rand(0, C.W), DG.rand(120, GROUND), {
                count: 1, color: '#e9bd76', speed: 420, life: 0.8, size: 4,
                gravity: 0, angle: 0, spread: 0.4
              });
            }
            b.stormTimer -= dt;
            if (b.stormOrbs > 0 && b.stormTimer <= 0) {
              b.stormOrbs--;
              b.stormTimer = 0.55;
              const sx = b.x;
              const sy = b.y - 130;
              const ang = Math.atan2(game.player.y - 60 - sy, game.player.x - sx);
              game.spawnProjectile({
                x: sx, y: sy,
                vx: Math.cos(ang) * 260, vy: Math.sin(ang) * 260,
                r: 11, damage: 9, color: '#b78bff', kind: 'orb', life: 5,
                homing: 1.2
              });
            }
          }
        }
      };
    }

    update(dt, game) {
      super.update(dt, game);
      if (!this.dead) this.y = GROUND - 66 + Math.sin(this.t * 1.7) * 12;
    }

    draw(ctx, game) {
      this.drawShadow(ctx);

      const atk = this.current ? this.attacks[this.current] : null;
      const windProg = (this.state === 'windup' && atk)
        ? DG.clamp(1 - this.windup / atk.windup, 0, 1) : 0;

      ctx.save();
      ctx.translate(this.x, this.y);
      if (this.dead) ctx.globalAlpha = DG.clamp(this.deathTimer / this.deathDuration, 0, 1);
      if (this.flash > 0) ctx.filter = 'brightness(1.6) saturate(1.3)';

      const bob = Math.sin(this.t * 2) * 4;

      /* دائرة السحر الخلفية */
      ctx.save();
      ctx.translate(0, -92);
      ctx.rotate(this.t * 0.5);
      ctx.strokeStyle = 'rgba(180,140,255,.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 74, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([6, 12]);
      ctx.strokeStyle = 'rgba(210,180,255,.45)';
      ctx.beginPath();
      ctx.arc(0, 0, 92, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.fillStyle = 'rgba(210,180,255,.55)';
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 74, Math.sin(a) * 74, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      ctx.scale(this.facing, 1);

      /* العباءة */
      const robeGrad = ctx.createLinearGradient(0, -150, 0, 10);
      robeGrad.addColorStop(0, '#6b4a9e');
      robeGrad.addColorStop(0.6, '#452e6e');
      robeGrad.addColorStop(1, '#241638');
      ctx.fillStyle = robeGrad;
      ctx.beginPath();
      ctx.moveTo(-26, -142);
      ctx.quadraticCurveTo(-46, -76, -40, -6 + bob * 0.3);
      ctx.lineTo(-24, 4 + bob * 0.3);
      ctx.lineTo(-12, -8 + bob * 0.3);
      ctx.lineTo(0, 6 + bob * 0.3);
      ctx.lineTo(12, -8 + bob * 0.3);
      ctx.lineTo(24, 4 + bob * 0.3);
      ctx.lineTo(40, -6 + bob * 0.3);
      ctx.quadraticCurveTo(46, -76, 26, -142);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,10,30,.5)';
      ctx.lineWidth = 2;
      ctx.stroke();

      /* حواف ذهبية */
      ctx.strokeStyle = 'rgba(255,210,120,.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-24, -132);
      ctx.quadraticCurveTo(-38, -72, -33, -14);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(24, -132);
      ctx.quadraticCurveTo(38, -72, 33, -14);
      ctx.stroke();

      /* الرداء الأمامي */
      ctx.fillStyle = '#31204d';
      ctx.beginPath();
      ctx.moveTo(-14, -132);
      ctx.quadraticCurveTo(-20, -60, -14, -2 + bob * 0.2);
      ctx.lineTo(14, -2 + bob * 0.2);
      ctx.quadraticCurveTo(20, -60, 14, -132);
      ctx.closePath();
      ctx.fill();

      /* القبعة/القلنسوة */
      ctx.fillStyle = '#553a80';
      ctx.beginPath();
      ctx.moveTo(-27, -138);
      ctx.quadraticCurveTo(-22, -180, 0, -182);
      ctx.quadraticCurveTo(24, -180, 27, -138);
      ctx.quadraticCurveTo(0, -120, -27, -138);
      ctx.closePath();
      ctx.fill();

      /* الوجه المظلم */
      ctx.fillStyle = '#120a1d';
      ctx.beginPath();
      ctx.ellipse(0, -148, 14, 19, 0, 0, Math.PI * 2);
      ctx.fill();

      /* العينان المتوهجتان */
      ctx.save();
      ctx.shadowColor = '#b9a4ff';
      ctx.shadowBlur = 14;
      ctx.fillStyle = this.phase >= 3 ? '#ff9ad6' : '#c9b8ff';
      ctx.beginPath();
      ctx.arc(-5, -150, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(5, -150, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      /* العصا */
      ctx.strokeStyle = '#6b4a2a';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(42, 4);
      ctx.lineTo(44, -136);
      ctx.stroke();

      /* كرة العصا */
      const orbGlow = 0.7 + Math.sin(this.t * 5) * 0.25;
      ctx.save();
      ctx.shadowColor = '#c9a7ff';
      ctx.shadowBlur = 24;
      ctx.fillStyle = 'rgba(185,150,255,' + orbGlow + ')';
      ctx.beginPath();
      ctx.arc(44, -144, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f0e6ff';
      ctx.beginPath();
      ctx.arc(44, -144, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      /* اليد */
      ctx.fillStyle = '#d8c2ff';
      ctx.beginPath();
      ctx.arc(42, -96, 5, 0, Math.PI * 2);
      ctx.fill();

      /* هالة التحضير */
      if (windProg > 0) {
        ctx.save();
        ctx.globalAlpha = windProg * 0.5;
        ctx.strokeStyle = '#d8c2ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -100, 60 + windProg * 30, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();

      /* خط الشعاع التحذيري ثم الشعاع نفسه (بإحداثيات العالم) */
      if (this.current === 'beam' && atk) {
        if (this.state === 'windup') {
          ctx.save();
          ctx.globalAlpha = 0.25 + windProg * 0.5;
          ctx.strokeStyle = '#c9a7ff';
          ctx.lineWidth = 2 + windProg * 3;
          ctx.setLineDash([14, 10]);
          ctx.beginPath();
          ctx.moveTo(0, this.beamY);
          ctx.lineTo(C.W, this.beamY);
          ctx.stroke();
          ctx.restore();
        } else if (this.state === 'active' && this.beamOn) {
          ctx.save();
          ctx.shadowColor = '#c9a7ff';
          ctx.shadowBlur = 26;
          const grad = ctx.createLinearGradient(0, this.beamY - 26, 0, this.beamY + 26);
          grad.addColorStop(0, 'rgba(200,170,255,0)');
          grad.addColorStop(0.5, 'rgba(240,230,255,.95)');
          grad.addColorStop(1, 'rgba(200,170,255,0)');
          ctx.fillStyle = grad;
          ctx.fillRect(0, this.beamY - 26, C.W, 52);
          ctx.fillStyle = 'rgba(255,255,255,.9)';
          ctx.fillRect(0, this.beamY - 6, C.W, 12);
          ctx.restore();
        }
      }

      /* عاصفة رملية حول الساحر */
      if (this.state === 'active' && this.current === 'storm') {
        ctx.save();
        ctx.strokeStyle = 'rgba(233,189,118,.5)';
        ctx.lineWidth = 3;
        for (let i = 0; i < 5; i++) {
          const a = this.t * 4 + i * 1.25;
          ctx.beginPath();
          ctx.arc(this.x, this.y - 90, 110 + i * 18, a, a + 1.2);
          ctx.stroke();
        }
        ctx.restore();
      }

      this.drawWindup(ctx);
    }
  }

  /* ============================================================
     تابع صغير: عقرب صغير يستدعيه ملك العقارب
     ============================================================ */
  class ScorpionMinion {
    constructor(x, opts) {
      const o = opts || {};
      this.x = x;
      this.y = GROUND;
      this.w = 64;
      this.h = 48;
      this.hp = o.hp || 36;
      this.maxHp = this.hp;
      this.speed = o.speed || 145;
      this.damage = o.damage || 8;
      this.facing = 1;
      this.contactCD = 0;
      this.flash = 0;
      this.dead = false;
      this.walk = DG.rand(0, 5);
      this.swingId = -1;
    }

    get rect() {
      return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
    }

    update(dt, game) {
      if (this.dead) return;
      this.flash = Math.max(0, this.flash - dt);
      this.contactCD = Math.max(0, this.contactCD - dt);

      const dx = game.player.x - this.x;
      this.facing = DG.sign(dx) || 1;
      if (Math.abs(dx) > 55) this.x += this.facing * this.speed * dt;
      this.walk += dt * 14;
      this.x = DG.clamp(this.x, C.ARENA_LEFT + this.w / 2, C.ARENA_RIGHT - this.w / 2);

      if (this.contactCD <= 0 && DG.rectsOverlap(this.rect, game.player.rect)) {
        if (game.player.takeDamage(this.damage, game)) this.contactCD = 0.9;
      }
    }

    takeDamage(amount, game) {
      if (this.dead) return;
      this.hp -= amount;
      this.flash = 0.12;
      game.addText('-' + Math.round(amount), this.x, this.y - this.h - 6, {
        color: '#ffe8a3', size: 18, life: 0.55
      });
      game.spawnParticles(this.x, this.y - 20, {
        count: 7, color: '#e0b06a', speed: 200, life: 0.4, size: 4, gravity: 400
      });
      if (this.hp <= 0) {
        this.dead = true;
        game.spawnParticles(this.x, this.y - 20, {
          count: 14, color: '#8fd14f', speed: 230, life: 0.7, size: 5, gravity: 600
        });
        DG.Audio.play('hit');
      }
    }

    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(this.facing, 1);
      if (this.flash > 0) ctx.filter = 'brightness(1.8)';

      /* ظل */
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.beginPath();
      ctx.ellipse(0, 2, 30, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      /* أرجل */
      ctx.strokeStyle = '#a86b22';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < 3; i++) {
          const hx = -14 + i * 13;
          const lift = Math.abs(Math.sin(this.walk + i)) * 4;
          ctx.beginPath();
          ctx.moveTo(hx, -26);
          ctx.quadraticCurveTo(hx + side * 12, -12, hx + side * 22, -lift);
          ctx.stroke();
        }
      }

      /* ذيل */
      ctx.strokeStyle = '#c98a2c';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(-22, -30);
      ctx.quadraticCurveTo(-42, -58, -12, -66);
      ctx.stroke();
      ctx.fillStyle = '#8a5418';
      ctx.beginPath();
      ctx.moveTo(-12, -66);
      ctx.lineTo(-4, -78);
      ctx.lineTo(-18, -74);
      ctx.closePath();
      ctx.fill();

      /* جسم */
      ctx.fillStyle = '#d69a2f';
      ctx.beginPath();
      ctx.ellipse(0, -28, 26, 16, 0, 0, Math.PI * 2);
      ctx.fill();

      /* رأس */
      ctx.fillStyle = '#c98a2c';
      ctx.beginPath();
      ctx.ellipse(24, -30, 11, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7a1f16';
      ctx.beginPath();
      ctx.arc(28, -33, 2.4, 0, Math.PI * 2);
      ctx.fill();

      /* مخلبان صغيران */
      ctx.strokeStyle = '#c98a2c';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(16, -34);
      ctx.lineTo(32, -44);
      ctx.stroke();
      ctx.fillStyle = '#e0a53a';
      ctx.beginPath();
      ctx.ellipse(35, -46, 8, 5, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(30, -40, 7, 4, 0.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  /* ============================================================
     بيانات المراحل وتحميل الزعيم حسب الترتيب
     ============================================================ */
  DG.STAGES = [
    { name: 'حارس الرمال', place: 'الواحة المنسية' },
    { name: 'ملك العقارب', place: 'وادي السموم' },
    { name: 'ساحر الصحراء', place: 'معبد الرمال' }
  ];

  DG.createBoss = function (index, game) {
    switch (index) {
      case 0: return new SandGuardian(game);
      case 1: return new ScorpionKing(game);
      case 2: return new DesertSorcerer(game);
      default: return new SandGuardian(game);
    }
  };

  DG.Boss = Boss;
  DG.SandGuardian = SandGuardian;
  DG.ScorpionKing = ScorpionKing;
  DG.DesertSorcerer = DesertSorcerer;
  DG.ScorpionMinion = ScorpionMinion;
})(window.DG);
