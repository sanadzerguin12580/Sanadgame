/* ============================================================
   player.js — اللاعب: الحركة، القفز، التفادي، الهجوم، المهارات
   إحداثيات اللاعب: x مركز الجسم، y موضع القدمين (على الأرض).
   ============================================================ */
(function (DG) {
  'use strict';

  const C = DG.CONFIG;
  const GRAVITY = C.GRAVITY;

  class Player {
    constructor(stats) {
      const s = stats || DG.Save.stats();
      this.stats = s;

      /* الإحصاءات الأساسية */
      this.maxHp = s.maxHp;
      this.hp = s.maxHp;
      this.damage = s.damage;
      this.cdr = s.cdr || 0;
      this.energyRegen = s.energyRegen || 9;
      this.maxEnergy = 100;
      this.energy = 100;

      /* الموضع والحركة */
      this.x = 280;
      this.y = C.GROUND;
      this.vx = 0;
      this.vy = 0;
      this.w = 46;
      this.h = 96;
      this.facing = 1;
      this.onGround = true;
      this.speed = 345;
      this.jumpVelocity = -920;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.walkT = 0;

      /* الهجوم */
      this.attackTimer = 0;
      this.attackCD = 0;
      this.attackDidHit = false;
      this.swingId = 0;

      /* التفادي */
      this.dashTimer = 0;
      this.dashCD = 0;
      this.dashDir = 1;
      this.trail = [];

      /* الحماية والمهارات */
      this.iframes = 0;
      this.shieldTime = 0;
      this.shieldHp = 0;
      this.skillCD = { shield: 0, lightning: 0 };
      this.cdMax = {
        shield: 8 * (1 - this.cdr),
        lightning: 7 * (1 - this.cdr),
        dash: 1.1
      };

      /* إلقاء البرق */
      this.castTimer = 0;
      this.castTarget = null;

      this.hurtFlash = 0;
      this.dead = false;
    }

    /* مستطيل التصادم (يشمل الجسم كاملًا) */
    get rect() {
      return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
    }

    /* ======================= التحديث ======================= */
    update(dt, game) {
      if (this.dead) return;
      const I = DG.Input;
      this.animTime = (this.animTime || 0) + dt;

      /* مؤقتات */
      this.attackCD = Math.max(0, this.attackCD - dt);
      this.attackTimer = Math.max(0, this.attackTimer - dt);
      this.dashCD = Math.max(0, this.dashCD - dt);
      this.iframes = Math.max(0, this.iframes - dt);
      this.hurtFlash = Math.max(0, this.hurtFlash - dt);
      this.skillCD.shield = Math.max(0, this.skillCD.shield - dt);
      this.skillCD.lightning = Math.max(0, this.skillCD.lightning - dt);
      this.shieldTime = Math.max(0, this.shieldTime - dt);
      if (this.shieldTime <= 0) this.shieldHp = 0;

      /* تجديد الطاقة */
      this.energy = Math.min(this.maxEnergy, this.energy + this.energyRegen * dt);

      /* إنهاء إلقاء البرق */
      if (this.castTimer > 0) {
        this.castTimer -= dt;
        if (this.castTimer <= 0 && this.castTarget) this.performLightning(game);
      }

      /* ----- اتجاه الحركة ----- */
      let move = 0;
      if (I.isDown('left')) move -= 1;
      if (I.isDown('right')) move += 1;
      if (move !== 0 && this.castTimer <= 0) this.facing = move;

      /* ----- التفادي ----- */
      if (I.pressed('dash') && this.dashCD <= 0 && this.castTimer <= 0) {
        this.dashCD = this.cdMax.dash;
        this.dashTimer = 0.16;
        this.dashDir = move !== 0 ? move : this.facing;
        this.facing = this.dashDir;
        this.iframes = Math.max(this.iframes, 0.3);
        DG.Audio.play('dash');
        game.spawnParticles(this.x, this.y - 30, {
          count: 12, color: '#e8d3a8', speed: 200, life: 0.45, size: 5, gravity: 200
        });
      }

      if (this.dashTimer > 0) {
        this.dashTimer -= dt;
        this.vx = this.dashDir * 980;
        this.trail.push({ x: this.x, y: this.y, facing: this.facing, life: 0.22 });
        if (this.dashTimer <= 0) this.vx = 0;
      } else if (this.castTimer > 0) {
        this.vx *= 0.82;
      } else {
        this.vx = move * this.speed;
      }

      /* ----- القفز (مع Coyote time و Jump buffer) ----- */
      if (I.pressed('jump')) this.jumpBuffer = 0.14;
      this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
      this.coyote = this.onGround ? 0.1 : Math.max(0, this.coyote - dt);

      if (this.jumpBuffer > 0 && this.coyote > 0 && this.dashTimer <= 0) {
        this.vy = this.jumpVelocity;
        this.onGround = false;
        this.coyote = 0;
        this.jumpBuffer = 0;
        DG.Audio.play('jump');
        game.spawnParticles(this.x, this.y, {
          count: 8, color: '#d9b06b', speed: 140, life: 0.4, size: 4, gravity: 500
        });
      }
      /* قفزة متغيرة الارتفاع: الإفلات المبكر يقصّر القفزة */
      if (!I.isDown('jump') && this.vy < -300) this.vy = -300;

      /* ----- الهجوم الأساسي ----- */
      if (I.pressed('attack') && this.attackCD <= 0 && this.castTimer <= 0) {
        this.startAttack();
      }
      if (this.attackTimer > 0) {
        const elapsed = 0.2 - this.attackTimer;
        if (elapsed >= 0.04 && elapsed <= 0.14) this.doAttackHit(game);
      }

      /* ----- المهارات ----- */
      if (I.pressed('shield')) this.castShield(game);
      if (I.pressed('lightning')) this.castLightning(game);

      /* ----- الفيزياء ----- */
      this.vy += GRAVITY * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      if (this.y >= C.GROUND) {
        if (!this.onGround) {
          game.spawnParticles(this.x, C.GROUND, {
            count: 7, color: '#d9b06b', speed: 150, life: 0.35, size: 4, gravity: 500
          });
        }
        this.y = C.GROUND;
        this.vy = 0;
        this.onGround = true;
      } else {
        this.onGround = false;
      }

      this.x = DG.clamp(this.x, C.ARENA_LEFT + this.w / 2, C.ARENA_RIGHT - this.w / 2);

      if (this.onGround && Math.abs(this.vx) > 20) this.walkT += dt * 12;
      else if (this.onGround) this.walkT = 0;

      /* تلاشي أشباح التفادي */
      for (const t of this.trail) t.life -= dt;
      this.trail = this.trail.filter(function (t) { return t.life > 0; });
    }

    /* ======================= الهجوم ======================= */
    startAttack() {
      this.swingId++;
      this.attackTimer = 0.2;
      this.attackCD = 0.31;
      this.attackDidHit = false;
      DG.Audio.play('swing');
    }

    doAttackHit(game) {
      const reach = 94;
      const box = {
        x: this.facing > 0 ? this.x + 6 : this.x - 6 - reach,
        y: this.y - this.h + 8,
        w: reach,
        h: this.h - 12
      };

      /* الزعيم: إصابة واحدة لكل ضربة */
      if (game.boss && !game.boss.dead && !this.attackDidHit &&
          DG.rectsOverlap(box, game.boss.rect)) {
        this.attackDidHit = true;
        game.boss.takeDamage(this.damage, game);
        game.spawnParticles(game.boss.x + DG.rand(-30, 30), game.boss.y - game.boss.h * 0.7, {
          count: 8, color: '#ffe6a8', speed: 260, life: 0.4, size: 5, gravity: 200
        });
        game.shake(5);
        DG.Audio.play('hit');
      }

      /* الأتباع */
      for (const m of game.minions) {
        if (m.dead || m.swingId === this.swingId) continue;
        if (DG.rectsOverlap(box, m.rect)) {
          m.swingId = this.swingId;
          m.takeDamage(this.damage, game);
          DG.Audio.play('hit');
        }
      }

      /* صد المقذوفات بالسيف */
      for (const p of game.projectiles) {
        if (p.dead) continue;
        if (DG.circleRect(p.x, p.y, p.r, box)) {
          p.dead = true;
          game.spawnParticles(p.x, p.y, {
            count: 10, color: p.color, speed: 240, life: 0.4, size: 4, gravity: 0
          });
          DG.Audio.play('hit');
        }
      }
    }

    /* ======================= المهارات ======================= */
    castShield(game) {
      if (this.energy < 35 || this.skillCD.shield > 0 || this.dead) return;
      this.energy -= 35;
      this.skillCD.shield = this.cdMax.shield;
      this.shieldTime = 4;
      this.shieldHp = 45 + this.damage * 0.8;
      DG.Audio.play('shield');
      game.addText('درع رملي!', this.x, this.y - this.h - 26, {
        color: '#ffe0a0', size: 22, life: 0.9
      });
      game.spawnParticles(this.x, this.y - this.h * 0.5, {
        count: 20, color: '#f2c67a', speed: 220, life: 0.7, size: 5, gravity: -80
      });
    }

    castLightning(game) {
      if (this.energy < 45 || this.skillCD.lightning > 0 || this.castTimer > 0 || this.dead) return;
      const boss = game.boss;
      if (boss && !boss.dead && DG.dist(this.x, this.y - 50, boss.x, boss.y - boss.h * 0.5) < 600) {
        this.castTarget = { x: boss.x, y: boss.y - boss.h * 0.25 };
      } else {
        this.castTarget = { x: this.x + this.facing * 170, y: this.y - 30 };
      }
      this.energy -= 45;
      this.skillCD.lightning = this.cdMax.lightning;
      this.castTimer = 0.3;
    }

    performLightning(game) {
      const target = this.castTarget;
      this.castTarget = null;
      this.castTimer = 0;
      if (!target) return;

      const radius = 195;
      game.spawnLightning(target.x, target.y);
      game.shake(15);
      DG.Audio.play('lightning');

      /* إصابة الزعيم */
      if (game.boss && !game.boss.dead) {
        const b = game.boss;
        if (DG.dist(target.x, target.y, b.x, b.y - b.h * 0.5) < radius + b.w * 0.35) {
          b.takeDamage(Math.round(80 + this.damage * 1.1), game);
        }
      }

      /* إصابة الأتباع وتدمير المقذوفات */
      for (const m of game.minions) {
        if (!m.dead && DG.dist(target.x, target.y, m.x, m.y - 20) < radius) m.takeDamage(70, game);
      }
      for (const p of game.projectiles) {
        if (!p.dead && DG.dist(target.x, target.y, p.x, p.y) < radius) p.dead = true;
      }

      game.spawnParticles(target.x, target.y, {
        count: 34, color: '#ffe9a8', speed: 480, life: 0.8, size: 7, gravity: 350, glow: true
      });
      game.spawnParticles(target.x, C.GROUND, {
        count: 16, color: '#e9bd76', speed: 320, life: 0.6, size: 6, gravity: 700
      });
    }

    /* ======================= الضرر والموت ======================= */
    takeDamage(amount, game) {
      if (this.dead || this.iframes > 0 || this.dashTimer > 0) return false;

      /* الدرع الرملي يمتص الضرر أولًا */
      if (this.shieldTime > 0 && this.shieldHp > 0) {
        const absorbed = Math.min(this.shieldHp, amount);
        this.shieldHp -= absorbed;
        amount -= absorbed;
        game.addText('صدّ!', this.x, this.y - this.h - 12, { color: '#a9e4ff', size: 20, life: 0.7 });
        game.spawnParticles(this.x, this.y - this.h * 0.55, {
          count: 10, color: '#f2c67a', speed: 230, life: 0.5, size: 5, gravity: 200
        });
        if (this.shieldHp <= 0) this.shieldTime = 0;
        if (amount <= 0.5) {
          this.iframes = 0.4;
          return true;
        }
      }

      amount = Math.round(amount);
      this.hp = Math.max(0, this.hp - amount);
      this.iframes = 0.85;
      this.hurtFlash = 0.35;
      game.shake(10);
      game.hurtFlash();
      game.addText('-' + amount, this.x, this.y - this.h - 14, {
        color: '#ff7b6b', size: 24, life: 0.8
      });
      DG.Audio.play('hurt');

      if (this.hp <= 0) this.die(game);
      return true;
    }

    die(game) {
      if (this.dead) return;
      this.dead = true;
      this.hp = 0;
      game.spawnParticles(this.x, this.y - this.h * 0.5, {
        count: 32, color: '#e7b25e', speed: 340, life: 1.1, size: 6, gravity: 500
      });
      game.onPlayerDeath();
    }

    /* ======================= الرسم ======================= */
    draw(ctx, game) {
      /* ظل أرضي */
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.beginPath();
      ctx.ellipse(this.x, C.GROUND + 4, 28, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      /* أشباح التفادي */
      for (const t of this.trail) {
        ctx.save();
        ctx.globalAlpha = t.life * 1.6;
        ctx.translate(t.x, t.y);
        this.drawBody(ctx, t.facing, true);
        ctx.restore();
      }

      /* هالة الدرع */
      if (this.shieldTime > 0) this.drawShield(ctx, game);

      ctx.save();
      ctx.translate(this.x, this.y);
      if (this.hurtFlash > 0) ctx.filter = 'brightness(1.9) saturate(1.4)';
      this.drawBody(ctx, this.facing, false);
      ctx.restore();
    }

    drawShield(ctx, game) {
      const centerY = this.y - this.h / 2;
      const r = this.w * 1.05 + 12;
      const pulse = 0.35 + Math.sin(game.time * 9) * 0.08;
      ctx.save();
      ctx.translate(this.x, centerY);
      const g = ctx.createRadialGradient(0, 0, r * 0.45, 0, 0, r);
      g.addColorStop(0, 'rgba(255,214,140,0)');
      g.addColorStop(0.72, 'rgba(255,196,96,' + pulse + ')');
      g.addColorStop(1, 'rgba(255,170,60,.65)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      /* حبيبات رمل تدور حول اللاعب */
      for (let i = 0; i < 10; i++) {
        const ang = game.time * 2.2 + i * 0.63;
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = '#ffe1a1';
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * r * 0.92, Math.sin(ang) * r * 0.58, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    /* رسم جسم البطل — نقطة الأصل عند القدمين، يتجه نحو +x */
    drawBody(ctx, facing, ghost) {
      ctx.save();
      ctx.scale(facing, 1);
      if (ghost) ctx.globalAlpha *= 0.5;

      const walk = this.onGround ? Math.sin(this.walkT) : 0;
      const air = !this.onGround;
      const t = this.animTime || 0;

      /* وشاح خلفي متحرك */
      ctx.strokeStyle = '#c14d38';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-4, -82);
      ctx.quadraticCurveTo(-28, -86 + Math.sin(t * 9) * 4, -48, -62 + Math.sin(t * 8) * 7);
      ctx.stroke();

      /* الأرجل */
      const legA = air ? -14 : -2;
      const legSwing = walk * 10;
      ctx.strokeStyle = '#241d33';
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(-5, -40);
      ctx.lineTo(-6 - legSwing, legA);
      ctx.stroke();
      ctx.strokeStyle = '#332a4c';
      ctx.beginPath();
      ctx.moveTo(5, -40);
      ctx.lineTo(6 + legSwing, legA);
      ctx.stroke();

      /* القدمان */
      ctx.fillStyle = '#1b1626';
      DG.roundRect(ctx, -6 - legSwing - 7, legA - 4, 16, 7, 3); ctx.fill();
      DG.roundRect(ctx, 6 + legSwing - 7, legA - 4, 16, 7, 3); ctx.fill();

      /* الجسد / العباءة */
      const bodyGrad = ctx.createLinearGradient(0, -92, 0, -34);
      bodyGrad.addColorStop(0, '#3f7d88');
      bodyGrad.addColorStop(0.55, '#2c5b68');
      bodyGrad.addColorStop(1, '#1d3f4a');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.moveTo(-16, -40);
      ctx.quadraticCurveTo(-22, -64, -19, -78);
      ctx.quadraticCurveTo(-16, -90, 0, -90);
      ctx.quadraticCurveTo(16, -90, 19, -78);
      ctx.quadraticCurveTo(22, -64, 16, -40);
      ctx.quadraticCurveTo(0, -31, -16, -40);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(10,20,25,.5)';
      ctx.lineWidth = 2;
      ctx.stroke();

      /* حزام ذهبي */
      ctx.fillStyle = '#d9a94a';
      DG.roundRect(ctx, -17, -50, 34, 7, 3);
      ctx.fill();
      ctx.fillStyle = '#ffe2a1';
      ctx.beginPath();
      ctx.arc(0, -46.5, 3.2, 0, Math.PI * 2);
      ctx.fill();

      /* الرأس */
      ctx.fillStyle = '#e8ba8a';
      ctx.beginPath();
      ctx.arc(1, -98, 13, 0, Math.PI * 2);
      ctx.fill();

      /* العين */
      ctx.fillStyle = '#241511';
      ctx.beginPath();
      ctx.arc(7, -100, 1.9, 0, Math.PI * 2);
      ctx.fill();

      /* العمامة */
      ctx.fillStyle = '#d9a94a';
      ctx.beginPath();
      ctx.ellipse(1, -107, 14.5, 10, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f0cf85';
      DG.roundRect(ctx, -12, -109, 28, 5, 2.5);
      ctx.fill();
      ctx.strokeStyle = '#b58433';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-10, -108);
      ctx.quadraticCurveTo(-26, -102 + Math.sin(t * 7) * 3, -30, -86);
      ctx.stroke();

      /* الذراع الحاملة للسيف */
      let armAngle = 0.75;
      if (this.castTimer > 0) {
        armAngle = -1.95;
      } else if (this.attackTimer > 0) {
        const p = 1 - this.attackTimer / 0.2;
        armAngle = DG.lerp(-2.1, 1.0, DG.easeOutCubic(p));
      }
      const shoulderX = 11, shoulderY = -76;
      const handX = shoulderX + Math.cos(armAngle) * 26;
      const handY = shoulderY + Math.sin(armAngle) * 26;

      ctx.strokeStyle = '#2a5561';
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(shoulderX, shoulderY);
      ctx.lineTo(handX, handY);
      ctx.stroke();

      /* اليد */
      ctx.fillStyle = '#e8ba8a';
      ctx.beginPath();
      ctx.arc(handX, handY, 5, 0, Math.PI * 2);
      ctx.fill();

      /* السيف */
      const bladeAngle = armAngle;
      const tipX = handX + Math.cos(bladeAngle) * 54;
      const tipY = handY + Math.sin(bladeAngle) * 54;
      ctx.strokeStyle = '#3a2a1c';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(handX, handY);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      ctx.strokeStyle = '#dde8f2';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(handX, handY);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();

      /* المقبض الواقي */
      ctx.save();
      ctx.translate(handX, handY);
      ctx.rotate(bladeAngle);
      ctx.fillStyle = '#ffd27a';
      DG.roundRect(ctx, -2, -8, 6, 16, 2);
      ctx.fill();
      ctx.restore();

      /* أثر ضربة السيف */
      if (this.attackTimer > 0) {
        const p = 1 - this.attackTimer / 0.2;
        ctx.save();
        ctx.translate(14, -58);
        ctx.rotate(-0.35);
        ctx.globalAlpha = 0.9 * (1 - p * 0.55);
        ctx.strokeStyle = 'rgba(255,244,205,.9)';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        const start = -1.35 + p * 0.5;
        ctx.beginPath();
        ctx.arc(0, 0, 66, start, start + 1.85);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,200,110,.4)';
        ctx.lineWidth = 20;
        ctx.beginPath();
        ctx.arc(0, 0, 66, start + 0.35, start + 1.55);
        ctx.stroke();
        ctx.restore();
      }

      /* توهج التحضير للبرق */
      if (this.castTimer > 0) {
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath();
        ctx.arc(tipX, tipY, 12 + Math.sin((this.castTimer || 0) * 40) * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.restore();
    }
  }

  DG.Player = Player;
})(window.DG);
