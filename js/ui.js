/* ============================================================
   ui.js — التحكم في الواجهات (DOM): القوائم، الترقيات، HUD
   الرسم نفسه على Canvas، أما النصوص والأزرار فكلها HTML/CSS
   لتدعم العربية بشكل مثالي وتبقى قابلة للتعديل بسهولة.
   ============================================================ */
(function (DG) {
  'use strict';

  const UI = {
    game: null,
    el: {},
    shopReturn: 'menu',
    settingsReturn: 'menu',
    bannerTimer: null,

    /* ===================== التهيئة ===================== */
    init(game) {
      this.game = game;
      this.cacheElements();
      this.bindEvents();
      this.applySettingsToForm();
      this.refreshShop();
      this.updateMenuStats();
      this.showScreen('screen-menu');
      this.showHUD(false);
    },

    cacheElements() {
      const id = function (n) { return document.getElementById(n); };
      this.el = {
        hud: id('hud'),
        hpFill: id('hp-fill'), hpText: id('hp-text'),
        energyFill: id('energy-fill'), energyText: id('energy-text'),
        dashCd: id('dash-cd'), dashCdnum: id('dash-cdnum'),
        shieldCd: id('shield-cd'), shieldCdnum: id('shield-cdnum'),
        lightningCd: id('lightning-cd'), lightningCdnum: id('lightning-cdnum'),
        bossName: id('boss-name'), bossPhase: id('boss-phase'),
        bossFill: id('boss-fill'), bossHpText: id('boss-hp-text'),
        coinText: id('coin-text'), stageText: id('stage-text'),
        banner: id('banner'), hurtVignette: id('hurt-vignette'),
        menuCoins: id('menu-coins'), menuWins: id('menu-wins'),
        shopCoins: id('shop-coins'), shopGrid: id('shop-grid'),
        setVolume: id('set-volume'), setVolumeVal: id('set-volume-val'),
        setShake: id('set-shake'),
        clearBoss: id('clear-boss'), clearReward: id('clear-reward'),
        clearCoins: id('clear-coins'), clearNote: id('clear-note'),
        overStage: id('over-stage'), overStageNum: id('over-stage-num'),
        overCoins: id('over-coins'),
        winCoins: id('win-coins'), winTime: id('win-time'), winCount: id('win-count')
      };
    },

    bindEvents() {
      const self = this;

      document.getElementById('overlay').addEventListener('click', function (e) {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        DG.Audio.init();
        DG.Audio.play('click');
        self.handleAction(btn.getAttribute('data-action'));
      });

      /* شراء ترقية */
      this.el.shopGrid.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-buy]');
        if (!btn) return;
        const key = btn.getAttribute('data-buy');
        if (DG.Save.buyUpgrade(key)) {
          DG.Audio.play('coin');
          self.refreshShop();
          self.updateMenuStats();
        }
      });

      /* مستوى الصوت */
      this.el.setVolume.addEventListener('input', function () {
        const v = Number(self.el.setVolume.value) / 100;
        DG.Save.setSetting('volume', v);
        DG.Audio.setVolume(v);
        self.el.setVolumeVal.textContent = Math.round(v * 100) + '%';
        DG.Audio.init();
      });

      /* اهتزاز الشاشة */
      this.el.setShake.addEventListener('change', function () {
        DG.Save.setSetting('shake', self.el.setShake.checked);
      });
    },

    handleAction(action) {
      const game = this.game;
      switch (action) {
        case 'start': game.startRun(); break;
        case 'shop': this.openShop('menu'); break;
        case 'settings': this.openSettings('menu'); break;
        case 'shop-back': this.closeShop(); break;
        case 'settings-back': this.closeSettings(); break;
        case 'resume': game.resume(); break;
        case 'restart': game.restartStage(); break;
        case 'to-menu': game.toMenu(); break;
        case 'retry': game.retryStage(); break;
        case 'next-stage': game.nextStage(); break;
        case 'play-again': game.startRun(); break;
        case 'shop-clear': this.openShop('stageclear'); break;
        case 'shop-gameover': this.openShop('gameover'); break;
        case 'shop-victory': this.openShop('victory'); break;
        case 'reset': this.confirmReset(); break;
        default: break;
      }
    },

    /* ===================== الشاشات ===================== */
    showScreen(id) {
      const screens = document.querySelectorAll('.screen');
      screens.forEach(function (screen) {
        screen.classList.toggle('open', !!id && screen.id === id);
      });
      if (id === 'screen-shop') this.refreshShop();
      if (id === 'screen-menu') this.updateMenuStats();
    },

    hideScreens() { this.showScreen(null); },

    showHUD(visible) {
      if (!this.el.hud) return;
      this.el.hud.classList.toggle('hidden', !visible);
    },

    showPause() { this.showScreen('screen-pause'); },

    showStageClear(game, reward) {
      this.el.clearBoss.textContent = game.boss.name;
      this.el.clearReward.textContent = '+' + DG.fmt(reward);
      this.el.clearCoins.textContent = DG.fmt(DG.Save.coins);
      const next = DG.STAGES[game.stageIndex + 1];
      this.el.clearNote.textContent = next
        ? 'المرحلة التالية: ' + next.name + ' — ' + next.place
        : '';
      this.showScreen('screen-stageclear');
    },

    showGameOver(game) {
      this.el.overStage.textContent = game.boss
        ? 'لقد هزمك ' + game.boss.name + ' في ' + DG.STAGES[game.stageIndex].place + '.'
        : 'لقد سقطت في الصحراء.';
      this.el.overStageNum.textContent = (game.stageIndex + 1) + ' / ' + DG.STAGES.length;
      this.el.overCoins.textContent = DG.fmt(game.runCoins);
      this.showScreen('screen-gameover');
    },

    showVictory(game) {
      this.el.winCoins.textContent = DG.fmt(game.runCoins);
      this.el.winTime.textContent = DG.fmtTime(game.runTime);
      this.el.winCount.textContent = DG.Save.data.stats.wins;
      this.showScreen('screen-victory');
    },

    openShop(returnTo) {
      this.shopReturn = returnTo;
      this.refreshShop();
      this.showScreen('screen-shop');
    },

    closeShop() {
      const map = {
        menu: 'screen-menu',
        stageclear: 'screen-stageclear',
        gameover: 'screen-gameover',
        victory: 'screen-victory'
      };
      this.showScreen(map[this.shopReturn] || 'screen-menu');
    },

    openSettings(returnTo) {
      this.settingsReturn = returnTo;
      this.applySettingsToForm();
      this.showScreen('screen-settings');
    },

    closeSettings() {
      this.showScreen(this.settingsReturn === 'pause' ? 'screen-pause' : 'screen-menu');
    },

    confirmReset() {
      const ok = window.confirm('هل أنت متأكد؟ سيتم مسح العملات والترقيات وكل التقدم نهائيًا.');
      if (!ok) return;
      DG.Save.reset();
      DG.Audio.setVolume(DG.Save.settings.volume);
      this.applySettingsToForm();
      this.refreshShop();
      this.updateMenuStats();
      DG.Audio.play('coin');
    },

    applySettingsToForm() {
      const settings = DG.Save.settings;
      this.el.setVolume.value = Math.round(settings.volume * 100);
      this.el.setVolumeVal.textContent = Math.round(settings.volume * 100) + '%';
      this.el.setShake.checked = !!settings.shake;
    },

    /* ===================== المتجر ===================== */
    refreshShop() {
      if (!this.el.shopGrid) return;
      this.el.shopCoins.textContent = DG.fmt(DG.Save.coins);
      this.el.shopGrid.innerHTML = '';

      const self = this;
      Object.keys(DG.Save.UPGRADES).forEach(function (key) {
        const u = DG.Save.UPGRADES[key];
        const level = DG.Save.upgradeLevel(key);
        const maxed = level >= u.max;
        const cost = DG.Save.upgradeCost(key);
        const disabled = maxed || DG.Save.coins < cost || u.max === 0;

        const pips = [];
        for (let i = 0; i < u.max; i++) {
          pips.push('<i class="' + (i < level ? 'on' : '') + '"></i>');
        }

        const card = document.createElement('article');
        card.className = 'shop-card';
        card.innerHTML =
          '<div class="shop-icon">' + u.icon + '</div>' +
          '<div class="shop-info">' +
            '<h3>' + u.name + '</h3>' +
            '<p>' + u.desc + '</p>' +
            '<div class="pips">' + pips.join('') + '</div>' +
          '</div>' +
          '<button class="btn buy" data-buy="' + key + '"' +
            (disabled ? ' disabled' : '') + '>' +
            (maxed ? 'مكتمل' : '🪙 ' + DG.fmt(cost)) +
          '</button>';
        self.el.shopGrid.appendChild(card);
      });
    },

    updateMenuStats() {
      this.el.menuCoins.textContent = '🪙 ' + DG.fmt(DG.Save.coins);
      this.el.menuWins.textContent = '🏆 ' + DG.Save.data.stats.wins + ' انتصار';
    },

    /* ===================== HUD ===================== */
    updateHUD(game) {
      const p = game.player;
      const b = game.boss;
      if (!p || !b) return;
      const e = this.el;

      e.hpFill.style.width = DG.clamp((p.hp / p.maxHp) * 100, 0, 100) + '%';
      e.hpText.textContent = Math.ceil(p.hp) + ' / ' + p.maxHp;

      e.energyFill.style.width = DG.clamp((p.energy / p.maxEnergy) * 100, 0, 100) + '%';
      e.energyText.textContent = Math.ceil(p.energy);

      this.setCooldown(e.dashCd, e.dashCdnum, p.dashCD / p.cdMax.dash, p.dashCD);
      this.setCooldown(e.shieldCd, e.shieldCdnum,
        p.skillCD.shield / p.cdMax.shield, p.skillCD.shield);
      this.setCooldown(e.lightningCd, e.lightningCdnum,
        p.skillCD.lightning / p.cdMax.lightning, p.skillCD.lightning);

      e.bossName.textContent = b.name;
      e.bossPhase.textContent = 'المرحلة ' + b.phase;
      e.bossPhase.classList.toggle('rage', b.phase >= 3);

      e.bossFill.style.width = DG.clamp((b.hp / b.maxHp) * 100, 0, 100) + '%';
      e.bossHpText.textContent = Math.ceil(b.hp) + ' / ' + b.maxHp;

      e.coinText.textContent = DG.fmt(DG.Save.coins);
      e.stageText.textContent = (game.stageIndex + 1) + ' / ' + DG.STAGES.length;
    },

    setCooldown(fillEl, numEl, fraction, seconds) {
      if (!fillEl || !numEl) return;
      fillEl.style.height = DG.clamp(fraction, 0, 1) * 100 + '%';
      if (seconds > 0.05) {
        numEl.textContent = seconds >= 1 ? Math.ceil(seconds) : seconds.toFixed(1);
      } else {
        numEl.textContent = '';
      }
    },

    banner(title, subtitle, duration) {
      const el = this.el.banner;
      el.innerHTML = '<b>' + title + '</b><span>' + subtitle + '</span>';
      el.classList.remove('show');
      void el.offsetWidth;   // إعادة تشغيل الأنيميشن
      el.classList.add('show');
      clearTimeout(this.bannerTimer);
      this.bannerTimer = setTimeout(function () {
        el.classList.remove('show');
      }, duration || 2600);
    },

    hurtFlash() {
      const el = this.el.hurtVignette;
      if (!el) return;
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    }
  };

  DG.UI = UI;
})(window.DG);
