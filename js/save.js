/* ============================================================
   save.js — حفظ التقدم في localStorage
   يخزّن: العملات، مستويات الترقيات، الإعدادات، والإحصاءات.
   ============================================================ */
(function (DG) {
  'use strict';

  const KEY = 'sand_boss_rush_save_v1';

  /* تعريفات الترقيات المتاحة في المتجر
     ملاحظة: استخدمنا <bdi> حول الأرقام والرموز حتى لا يعكسها اتجاه RTL. */
  const UPGRADES = {
    hp: {
      icon: '❤️',
      name: 'الحد الأقصى للصحة',
      desc: 'تزيد الصحة القصوى بمقدار <bdi>20</bdi> لكل مستوى.',
      max: 10, base: 40, growth: 1.5
    },
    dmg: {
      icon: '⚔️',
      name: 'قوة الضربة',
      desc: 'تزيد ضرر كل ضربة بمقدار <bdi>3</bdi> نقاط.',
      max: 10, base: 35, growth: 1.5
    },
    cd: {
      icon: '⏱️',
      name: 'تقليل وقت الانتظار',
      desc: 'تقلل مدة الدرع والبرق بنسبة <bdi>5%</bdi> لكل مستوى (بحد أقصى <bdi>40%</bdi>).',
      max: 8, base: 50, growth: 1.6
    },
    energy: {
      icon: '🔋',
      name: 'تجديد الطاقة',
      desc: 'تزيد تجديد الطاقة بمقدار <bdi>2</bdi> في الثانية لكل مستوى.',
      max: 8, base: 45, growth: 1.55
    }
  };

  function defaults() {
    return {
      version: 1,
      coins: 0,
      upgrades: { hp: 0, dmg: 0, cd: 0, energy: 0 },
      settings: { volume: 0.55, shake: true },
      stats: { wins: 0, bossKills: 0 }
    };
  }

  /* قراءة آمنة: نتجاهل أي ملف تالف ونعود للقيم الافتراضية */
  function load() {
    const d = defaults();
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return d;
      const p = JSON.parse(raw);
      if (!p || typeof p !== 'object') return d;

      if (Number.isFinite(p.coins)) d.coins = Math.max(0, Math.floor(p.coins));

      if (p.upgrades && typeof p.upgrades === 'object') {
        Object.keys(d.upgrades).forEach(function (k) {
          const v = p.upgrades[k];
          if (Number.isFinite(v)) d.upgrades[k] = DG.clamp(Math.floor(v), 0, UPGRADES[k].max);
        });
      }

      if (p.settings && typeof p.settings === 'object') {
        if (Number.isFinite(p.settings.volume)) d.settings.volume = DG.clamp(p.settings.volume, 0, 1);
        if (typeof p.settings.shake === 'boolean') d.settings.shake = p.settings.shake;
      }

      if (p.stats && typeof p.stats === 'object') {
        if (Number.isFinite(p.stats.wins)) d.stats.wins = Math.max(0, Math.floor(p.stats.wins));
        if (Number.isFinite(p.stats.bossKills)) d.stats.bossKills = Math.max(0, Math.floor(p.stats.bossKills));
      }
    } catch (err) {
      console.warn('[Save] تعذرت قراءة ملف الحفظ، سيتم استخدام قيم جديدة.', err);
    }
    return d;
  }

  let data = load();

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (err) {
      /* قد يكون التخزين معطّلًا في وضع التصفح الخاص — نكمل بالذاكرة فقط */
      console.warn('[Save] التخزين المحلي غير متاح.', err);
    }
  }

  const Save = {
    UPGRADES: UPGRADES,

    get data() { return data; },
    get coins() { return data.coins; },
    get settings() { return data.settings; },

    addCoins(amount) {
      data.coins = Math.max(0, data.coins + Math.round(amount));
      persist();
    },

    spendCoins(amount) {
      if (data.coins < amount) return false;
      data.coins -= amount;
      persist();
      return true;
    },

    upgradeLevel(key) {
      return data.upgrades[key] || 0;
    },

    /* تكلفة المستوى التالي — تزداد تدريجيًا */
    upgradeCost(key) {
      const u = UPGRADES[key];
      if (!u) return Infinity;
      const level = this.upgradeLevel(key);
      if (level >= u.max) return Infinity;
      return Math.round((u.base * Math.pow(u.growth, level)) / 5) * 5;
    },

    buyUpgrade(key) {
      const u = UPGRADES[key];
      if (!u) return false;
      const level = this.upgradeLevel(key);
      if (level >= u.max) return false;
      const cost = this.upgradeCost(key);
      if (!this.spendCoins(cost)) return false;
      data.upgrades[key] = level + 1;
      persist();
      return true;
    },

    /* القيم الفعلية للاعب بعد تطبيق الترقيات */
    stats() {
      const hp = this.upgradeLevel('hp');
      const dmg = this.upgradeLevel('dmg');
      const cd = this.upgradeLevel('cd');
      const energy = this.upgradeLevel('energy');
      return {
        maxHp: 100 + hp * 20,
        damage: 12 + dmg * 3,
        cdr: Math.min(0.4, cd * 0.05),     // نسبة تقليل وقت الانتظار
        energyRegen: 9 + energy * 2
      };
    },

    addBossKill() {
      data.stats.bossKills++;
      persist();
    },

    addWin() {
      data.stats.wins++;
      persist();
    },

    setSetting(key, value) {
      data.settings[key] = value;
      persist();
    },

    reset() {
      data = defaults();
      persist();
    }
  };

  DG.Save = Save;
})(window.DG);
