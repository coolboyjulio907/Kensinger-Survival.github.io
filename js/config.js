/* =========================================================
   KENSINGER SURVIVAL — configuration & balance data
   All numbers live here so balance changes never touch code.
   ========================================================= */
window.KS = window.KS || {};

KS.CONFIG = {
  ARENA: {
    TILE: 320,   // MapBackground.jpg native tile size (px)
    GRID: 3,     // the map is a 3x3 grid of tiles
    SCALE: 0.75, // v0.9 §2: playable area is 75% of the old size
  },

  /* Camera: the view shows only this fraction of the map, so the map is
     slightly larger than the screen and the player must walk toward an
     edge to see its end. */
  VIEW: { visibleFrac: 0.84 },

  // Weapon tier color coding (used everywhere in the UI)
  TIERS: {
    1: { name: 'Common',    color: '#9aa4b2' }, // grey
    2: { name: 'Uncommon',  color: '#3d8bff' }, // blue
    3: { name: 'Rare',      color: '#b44dff' }, // purple
    4: { name: 'Legendary', color: '#ff4747' }, // red
  },

  WEAPONS: {
    knife: {
      id: 'knife',
      name: { en: 'Knife', he: 'סכין' },
      classes: ['Blade'],
      icon: 'assets/knifeAttack.png',
      scalingStat: 'meleeDMG',
      scalingPct: 100,
      critChance: 0.12,
      critMult: 2.0,
      range: 140,
      knockback: 18,
      lifesteal: 0,
      unlock: 'default',
      tiers: {
        1: { damage: 6,  cooldown: 0.85, special: 'Slashing strikes' },
        2: { damage: 9,  cooldown: 0.78, special: 'Slashing strikes' },
        3: { damage: 14, cooldown: 0.71, special: 'Slashing strikes' },
        4: { damage: 22, cooldown: 0.62, special: 'Slashing strikes' },
      },
    },

    fist: {
      id: 'fist',
      name: { en: 'Fist', he: 'אגרוף' },
      classes: ['Unarmed'],       // tags shown under the weapon title
      icon: 'assets/fistAttack.png',
      scalingStat: 'meleeDMG',   // damage = tier.damage * (1 + stat% * scalingPct/10000)
      scalingPct: 100,           // "(100%)" next to the damage
      // stats shared by every tier
      critChance: 0.01,          // 1 % chance
      critMult: 1.5,             // x1.5 crit damage
      range: 150,                // stat value (Brotato-style); melee reach = range * MELEE_RANGE_SCALE
      knockback: 15,
      lifesteal: 0,
      unlock: 'default',
      // per-tier balance (damage doubles each tier)
      tiers: {
        1: { damage: 8,  cooldown: 0.78 },
        2: { damage: 16, cooldown: 0.73 },
        3: { damage: 32, cooldown: 0.69 },
        4: { damage: 64, cooldown: 0.59 },
      },
    },

    hand: {
      id: 'hand',
      name: { en: 'Hand', he: 'כף יד' },
      classes: ['Unarmed', 'Support'],
      icon: 'assets/handAttack.png',   // replaced art (spec §5)
      artFace: 'left',                 // v0.9 §7: the palm pushes LEFT in the art
      scalingStat: 'meleeDMG',
      scalingPct: 50,            // "1 (50%)" — gains half of the Melee Damage stat
      critChance: 0.01,
      critMult: 1.5,
      range: 150,
      knockback: 30,
      lifesteal: 0,
      unlock: 'default',
      // passive stat granted while equipped (applied/removed on buy/sell/combine)
      tiers: {
        1: { damage: 1, cooldown: 1.01, harvest: 3,  special: '+3 Harvesting' },
        2: { damage: 1, cooldown: 0.93, harvest: 6,  special: '+6 Harvesting' },
        3: { damage: 1, cooldown: 0.86, harvest: 12, special: '+12 Harvesting' },
        4: { damage: 1, cooldown: 0.71, harvest: 25, special: '+25 Harvesting' },
      },
      tierPrices: [10, 22, 45, 91],   // shop base prices per tier (before inflation)
    },
    /* ---- v0.11 §1: five new ranged weapons ----
       All values are the proposed starting balance and live here so
       they are tunable without touching code. Magazine/reload data
       lives in MAGS below (per-tier base). */
    pistol: {
      id: 'pistol',
      name: { en: 'Pistol', he: 'אקדח' },
      classes: ['Ranged'],
      icon: 'assets/pistol.png',
      scalingStat: 'rangedDMG',
      scalingPct: 100,
      critChance: 0.10,
      critMult: 2.0,
      range: 330,              // projectile max flight distance
      knockback: 10,
      lifesteal: 0,
      unlock: 'default',
      tiers: {
        1: { damage: 12, cooldown: 0.65, special: 'Accurate single shot; moderate range' },
        2: { damage: 18, cooldown: 0.60, special: 'Accurate single shot; moderate range' },
        3: { damage: 27, cooldown: 0.55, special: 'Accurate single shot; moderate range' },
        4: { damage: 40, cooldown: 0.48, special: 'Accurate single shot; moderate range' },
      },
    },

    smg: {
      id: 'smg',
      name: { en: 'SMG', he: 'תת מקלע' },
      classes: ['Ranged'],
      icon: 'assets/smg.png',
      scalingStat: 'rangedDMG',
      scalingPct: 100,
      critChance: 0.06,
      critMult: 1.8,
      range: 290,
      knockback: 5,
      lifesteal: 0,
      unlock: 'default',
      tiers: {
        1: { damage: 5, cooldown: 0.16, special: 'Rapid fire with moderate spread' },
        2: { damage: 7, cooldown: 0.15, special: 'Rapid fire with moderate spread' },
        3: { damage: 10, cooldown: 0.14, special: 'Rapid fire with moderate spread' },
        4: { damage: 15, cooldown: 0.13, special: 'Rapid fire with moderate spread' },
      },
    },

    shredder: {
      id: 'shredder',
      name: { en: 'Shredder', he: 'מגרס' },
      classes: ['Ranged', 'Explosive'],
      icon: 'assets/shredder.png',
      scalingStat: 'rangedDMG',
      scalingPct: 100,
      critChance: 0.05,
      critMult: 2.0,
      range: 340,
      knockback: 14,
      lifesteal: 0,
      unlock: 'default',
      tiers: {
        1: { damage: 18, cooldown: 1.1, special: 'Explosive rounds — small area damage' },
        2: { damage: 26, cooldown: 1.02, special: 'Explosive rounds — small area damage' },
        3: { damage: 37, cooldown: 0.95, special: 'Explosive rounds — small area damage' },
        4: { damage: 52, cooldown: 0.85, special: 'Explosive rounds — small area damage' },
      },
    },

    revolver: {
      id: 'revolver',
      name: { en: 'Revolver', he: 'אקדח תופי' },
      classes: ['Ranged'],
      icon: 'assets/revolver.png',
      scalingStat: 'rangedDMG',
      scalingPct: 100,
      critChance: 0.14,
      critMult: 2.5,
      range: 360,
      knockback: 22,
      lifesteal: 0,
      unlock: 'default',
      tiers: {
        1: { damage: 24, cooldown: 0.9, special: 'Powerful single shots with a brief firing cooldown' },
        2: { damage: 34, cooldown: 0.84, special: 'Powerful single shots with a brief firing cooldown' },
        3: { damage: 48, cooldown: 0.78, special: 'Powerful single shots with a brief firing cooldown' },
        4: { damage: 68, cooldown: 0.70, special: 'Powerful single shots with a brief firing cooldown' },
      },
    },

    shuriken: {
      id: 'shuriken',
      name: { en: 'Shuriken', he: 'וכוכב השלכה' },
      classes: ['Ranged', 'Blade'],
      icon: 'assets/shuriken.png',
      scalingStat: 'rangedDMG',
      scalingPct: 100,
      critChance: 0.10,
      critMult: 2.0,
      range: 300,
      knockback: 8,
      lifesteal: 0,
      unlock: 'default',
      noMagazine: true,        // §1: no magazine, no conventional reload
      tiers: {
        1: { damage: 10, cooldown: 0.75, special: 'Spinning throw — pierces one extra enemy' },
        2: { damage: 15, cooldown: 0.70, special: 'Spinning throw — pierces one extra enemy' },
        3: { damage: 22, cooldown: 0.64, special: 'Spinning throw — pierces one extra enemy' },
        4: { damage: 32, cooldown: 0.58, special: 'Spinning throw — pierces one extra enemy' },
      },
    },
  },

  /* ---- v0.11 §1: magazine + reload balance (per weapon, per tier) ----
     mag = magazine size (shots before reload), reload = seconds.
     Shuriken has NO entry (noMagazine) — its attack interval alone
     limits how often it can be thrown. */
  MAGS: {
    pistol:    { mag: [6, 7, 8, 10],   reload: [1.4, 1.32, 1.24, 1.1] },
    smg:       { mag: [25, 28, 32, 40], reload: [2.0, 1.9, 1.8, 1.6] },
    shredder:  { mag: [4, 5, 6, 8],    reload: [2.2, 2.1, 2.0, 1.8] },
    revolver:  { mag: [4, 5, 6, 8],    reload: [1.8, 1.72, 1.64, 1.5] },
  },

  /* ---- v0.11 §1: projectile physics ---- */
  PROJ: {
    speed: 620,               // px/s for pistol/smg/revolver/shuriken
    shredderSpeed: 380,       // slower, heavier grenade-like round
    shredderBlastR: 70,       // small area damage radius
    shredderBlastDmg: 0.5,    // splash = 50% of the direct hit
    shurikenSpin: 14,         // rad/s spin visual
    hitR: 10,                 // projectile collision radius vs enemies
    poolCap: 240,             // hard ceiling on live player projectiles
  },


  // melee weapons only get half their range stat as actual reach,
  // and 150 stat = 75 px reach — the old full-length reach was ~2x too long.
  MELEE_RANGE_SCALE: 0.5,

  // Max weapons a character can equip (most characters: 6)
  MAX_WEAPONS: 6,
  // Items have NO limit — the pause menu grows a square per bought item.

  MAPS: {
    plains: { id: 'plains', name: 'Plains', available: true },
    desert: { id: 'desert', name: 'Desert', available: false },
  },

  CHARACTERS: {
    balanced: {
      id: 'balanced',
      name: 'Kensinger Balanced',   // exact spec name (§10-A)
      portrait: 'assets/KensingerBalanced.png',
      tagline: { en: 'A jack of all trades — healthy, quick, and greedy.',
        he: 'בקיא בכל — חסון, מהיר ושובב.' },
      /* lines shown verbatim on the character cards */
      bonusLines: {
        en: ['+5 Max HP', '+5% Speed', '+8 Harvesting'],
        he: ['+5 חיים מרביים', '+5% מהירות', '+8 קציר'],
      },
      stats: {
        maxHP: 15,         // 10 base + 5
        speed: 230,        // px/s inside the arena
        speedPct: 5,       // +5% Speed
        harvesting: 8,     // +8 Harvesting
        level: 1,
        curse: 0,
        hpRegen: 0,        // regen stat -> HP/s via table below
        lifeSteal: 0,      // %
        damage: 0,         // %
        attackSpeed: 0,    // %
        critChance: 0,     // % bonus on top of the weapon's own
        dodge: 0,          // % (max 60)
        meleeDMG: 0,       // flat additional melee damage
        rangedDMG: 0,
        elementalDMG: 0,
        engineering: 0,
        range: 0,          // flat range bonus (half as effective on melee)
        armor: 0,
        luck: 0,
        // ------- secondary stats (all default 0) -------
        consumableHeal: 0,
        materialsHealing: 0,
        xpGain: 0,
        pickupRange: 0,
        itemPrice: 0,
        explosionDamage: 0,
        explosionSize: 0,
        bounces: 0,
        piercing: 0,
        piercingDamage: 0,
        bossDamage: 0,
        structureAttackSpeed: 0,
        structureRange: 0,
        burningSpeed: 0,
        burningSpread: 0,
        knockback: 0,
        doubleMaterial: 0,
        freeRerolls: 0,
        trees: 0,
        enemiesPct: 0,
        enemySpeedPct: 0,
        rerollPrice: 0,
      },
      startingWeapon: 'fist',
      startingWeaponTier: 1,
    },

    adkins: {
      id: 'adkins',
      name: 'Adkins',
      portrait: 'assets/Adkins.png',
      tagline: { en: 'Bare-knuckle brawler. Fists fly faster than eyes can follow.',
        he: 'לוחם באגרופים חשופים. האגרופים מהירים מן העין.' },
      bonusLines: {
        en: [
          '+50% Attack Speed with Unarmed weapons',
          'You start with 1 Fist',
          '+15% Dodge',
          '-50 Range',
          '-50 Ranged Damage',
        ],
        he: [
          '+50% מהירות תקיפה עם נשק אגרוף',
          'אתה מתחיל עם אגרוף אחד',
          '+15% התחמקות',
          '-50 טווח',
          '-50 נזק מטווח',
        ],
      },
      stats: {
        maxHP: 10,         // 10 base, no HP bonus
        speed: 230,
        unarmedAS: 50,     // +50% Attack Speed with Unarmed-class weapons
        dodge: 15,         // +15% Dodge
        range: -50,        // -50 Range
        rangedDMG: -50,    // -50 Ranged Damage
        level: 1,
        curse: 0,
        hpRegen: 0,
        lifeSteal: 0,
        damage: 0,
        attackSpeed: 0,
        critChance: 0,
        speedPct: 0,
        meleeDMG: 0,
        elementalDMG: 0,
        engineering: 0,
        armor: 0,
        luck: 0,
        harvesting: 0,
        consumableHeal: 0,
        materialsHealing: 0,
        xpGain: 0,
        pickupRange: 0,
        itemPrice: 0,
        explosionDamage: 0,
        explosionSize: 0,
        bounces: 0,
        piercing: 0,
        piercingDamage: 0,
        bossDamage: 0,
        structureAttackSpeed: 0,
        structureRange: 0,
        burningSpeed: 0,
        burningSpread: 0,
        knockback: 0,
        doubleMaterial: 0,
        freeRerolls: 0,
        trees: 0,
        enemiesPct: 0,
        enemySpeedPct: 0,
        rerollPrice: 0,
      },
      startingWeapon: 'fist',
      startingWeaponTier: 1,
      /* guaranteed bonus weapon on top of the chosen starting weapon
         (Brotato Brawler structure): always a separate instance, even
         when the chosen weapon is itself a Fist */
      bonusWeapon: 'fist',
      weaponFilter: ['Unarmed'],     // weapon select only offers these classes
    },
    fairbair: {
      id: 'fairbair',
      name: 'Fair Bair',
      portrait: 'assets/FairBair.png',
      tagline: { en: 'Crazy by nature — a storm of swings with glass for armor.',
        he: 'משוגע בטבעו — סערת מכות עם שריון מזכוכית.' },
      bonusLines: {
        en: ['+25% Attack Speed', '-30% Dodge', '-10 Engineering', '-10 Ranged Damage'],
        he: ['+25% מהירות תקיפה', '-30% התחמקות', '-10 הנדסה', '-10 נזק מטווח'],
      },
      startingWeapon: 'fist',
      startingWeaponTier: 1,
      /* Brotato Crazy structure: chosen starting weapon + one
         guaranteed Knife as a separate instance */
      bonusWeapon: 'knife',
      weaponFilter: ['Blade', 'Unarmed'],
      stats: {
        maxHP: 10,         // 10 base, no HP bonus
        speed: 230,        // px/s inside the arena
        attackSpeed: 25,   // +25% Attack Speed (all weapon classes)
        dodge: -30,        // -30% Dodge (rolls use max(0, stat) -> effectively 0)
        engineering: -10,  // -10 Engineering
        rangedDMG: -10,    // -10 Ranged Damage
        level: 1,
        curse: 0,
        hpRegen: 0,
        lifeSteal: 0,
        damage: 0,
        critChance: 0,
        speedPct: 0,
        unarmedAS: 0,
        meleeDMG: 0,
        elementalDMG: 0,
        range: 0,
        armor: 0,
        luck: 0,
        harvesting: 0,
        consumableHeal: 0,
        materialsHealing: 0,
        xpGain: 0,
        pickupRange: 0,
        itemPrice: 0,
        explosionDamage: 0,
        explosionSize: 0,
        bounces: 0,
        piercing: 0,
        piercingDamage: 0,
        bossDamage: 0,
        structureAttackSpeed: 0,
        structureRange: 0,
        burningSpeed: 0,
        burningSpread: 0,
        knockback: 0,
        doubleMaterial: 0,
        freeRerolls: 0,
        trees: 0,
        enemiesPct: 0,
        enemySpeedPct: 0,
        rerollPrice: 0,
      },
    },
    builder: {
      id: 'builder',
      name: 'Bair The Builder',
      portrait: 'assets/BairTheBuilder.png',
      tagline: {
        en: 'Never stops building — the turret does the shooting.',
        he: 'לא מפסיק לבנות — התותח עושה את העבודה.',
      },
      bonusLines: {
        en: [
          'Starts with 1 Builder\'s Turret',
          'Every 5 uncollected materials -> +1% Structure Attack Speed, +1 Structure Range',
          'Engineering gains +50%',
          '+20 Harvesting',
          'Cannot have additional structures',
          '-30% Pickup Range',
          'Damage gains reduced by 75%',
        ],
        he: [
          'מתחיל עם תותח בנאי אחד',
          'כל 5 מטבעות שלא נאספו -> +1% מהירות תקיפת מבנים, +1 טווח מבנים',
          'רווחי הנדסה מוגדלים ב־50%',
          '+20 קציר',
          'אין מבנים נוספים',
          '-30% רדיוס איסוף',
          'רווחי נזק מוקטנים ב־75%',
        ],
      },
      stats: {
        maxHP: 10,         // 10 base, no HP bonus
        speed: 230,
        harvesting: 20,    // +20 Harvesting
        pickupRange: -30,  // -30% Pickup Range
        level: 1,
        curse: 0,
        hpRegen: 0,
        lifeSteal: 0,
        damage: 0,
        attackSpeed: 0,
        critChance: 0,
        speedPct: 0,
        unarmedAS: 0,
        meleeDMG: 0,
        elementalDMG: 0,
        engineering: 0,
        range: 0,
        armor: 0,
        dodge: 0,
        consumableHeal: 0,
        materialsHealing: 0,
        xpGain: 0,
        itemPrice: 0,
        explosionDamage: 0,
        explosionSize: 0,
        bounces: 0,
        piercing: 0,
        piercingDamage: 0,
        bossDamage: 0,
        structureAttackSpeed: 0,
        structureRange: 0,
        burningSpeed: 0,
        burningSpread: 0,
        knockback: 0,
        doubleMaterial: 0,
        freeRerolls: 0,
        trees: 0,
        enemiesPct: 0,
        enemySpeedPct: 0,
        rerollPrice: 0,
      },
      startingWeapon: 'hand',
      startingWeaponTier: 1,
      weaponFilter: ['Blade', 'Support'],   // restricted starting pool: Hand, Knife
      turret: true,                          // unique Builder's Turret (no extra copies)
      statMods: { damageMul: 0.25, engineeringMul: 1.5 },
    },

    /* ---- v0.11 §5: Barry Adkins (Brotato Speedy archetype) ---- */
    barry: {
      id: 'barry',
      name: 'Barry Adkins',
      portrait: 'assets/BarryAdkins.png',
      tagline: {
        en: 'Never stops moving — the faster he runs, the harder he hits.',
        he: 'לעולם לא עוצר — ככל שהוא רץ מהר יותר, הוא מכה חזק יותר.',
      },
      bonusLines: {
        en: [
          '+30% Movement Speed',
          '+1 Melee Damage for every 2% Movement Speed',
          '-3 Armor',
          '-100 Armor while standing still',
        ],
        he: [
          '+30% מהירות תנועה',
          '+1 נזק פנים-אל-פנים לכל 2% מהירות תנועה',
          '-3 שריון',
          '-100 שריון בעמידה',
        ],
      },
      /* dynamicSpeedMelee: recomputed whenever speedPct changes (§5) */
      stats: {
        maxHP: 10,
        speed: 230,
        speedPct: 30,          // +30% Movement Speed
        armor: -3,             // -3 Armor
        meleeDMG: 0,
        level: 1,
        curse: 0,
        hpRegen: 0,
        lifeSteal: 0,
        damage: 0,
        attackSpeed: 0,
        critChance: 0,
        dodge: 0,
        rangedDMG: 0,
        elementalDMG: 0,
        engineering: 0,
        range: 0,
        luck: 0,
        harvesting: 0,
        consumableHeal: 0,
        materialsHealing: 0,
        xpGain: 0,
        pickupRange: 0,
        itemPrice: 0,
        explosionDamage: 0,
        explosionSize: 0,
        bounces: 0,
        piercing: 0,
        piercingDamage: 0,
        bossDamage: 0,
        structureAttackSpeed: 0,
        structureRange: 0,
        burningSpeed: 0,
        burningSpread: 0,
        knockback: 0,
        doubleMaterial: 0,
        freeRerolls: 0,
        trees: 0,
        enemiesPct: 0,
        enemySpeedPct: 0,
        rerollPrice: 0,
      },
      startingWeapon: 'fist',
      startingWeaponTier: 1,
      /* melee-focused pool: Unarmed + the Shuriken (§5) */
      weaponFilter: ['Unarmed', 'Blade'],
      dynamicSpeedMelee: true,
      stillArmor: -100,        // applied while not actively moving
    },

    /* ---- v0.11 §6: King Kensinger (Brotato King archetype) ---- */
    king: {
      id: 'king',
      name: 'King Kensinger',
      portrait: 'assets/KingKensinger.png',
      tagline: {
        en: 'Rules by tier — the mightiest arsenal wears the crown.',
        he: 'שולט לפי דרגה — לארסנל האדיר ביותר מגיע הכתר.',
      },
      bonusLines: {
        en: [
          '+50 Luck',
          '+25% Damage for every Tier IV weapon owned',
          '+25% Attack Speed for every Tier IV weapon owned',
          '+5 Max HP for every different Tier IV item owned',
          '-15% Damage for every Tier I weapon owned',
          '-15% Attack Speed for every Tier I weapon owned',
          '-2 Max HP for every different Tier I item owned',
          'Starting weapon is Tier II',
        ],
        he: [
          '+50 מזל',
          '+25% נזק לכל נשק דרגה 4 בבעלותך',
          '+25% מהירות תקיפה לכל נשק דרגה 4 בבעלותך',
          '+5 חיים מרביים לכל פריט דרגה 4 שונה',
          '-15% נזק לכל נשק דרגה 1 בבעלותך',
          '-15% מהירות תקיפה לכל נשק דרגה 1 בבעלותך',
          '-2 חיים מרביים לכל פריט דרגה 1 שונה',
          'נשק פתיחה בדרגה 2',
        ],
      },
      stats: {
        maxHP: 10,
        speed: 230,
        luck: 50,              // +50 Luck
        level: 1,
        curse: 0,
        hpRegen: 0,
        lifeSteal: 0,
        damage: 0,
        attackSpeed: 0,
        critChance: 0,
        speedPct: 0,
        dodge: 0,
        meleeDMG: 0,
        rangedDMG: 0,
        elementalDMG: 0,
        engineering: 0,
        range: 0,
        armor: 0,
        harvesting: 0,
        consumableHeal: 0,
        materialsHealing: 0,
        xpGain: 0,
        pickupRange: 0,
        itemPrice: 0,
        explosionDamage: 0,
        explosionSize: 0,
        bounces: 0,
        piercing: 0,
        piercingDamage: 0,
        bossDamage: 0,
        structureAttackSpeed: 0,
        structureRange: 0,
        burningSpeed: 0,
        burningSpread: 0,
        knockback: 0,
        doubleMaterial: 0,
        freeRerolls: 0,
        trees: 0,
        enemiesPct: 0,
        enemySpeedPct: 0,
        rerollPrice: 0,
      },
      startingWeapon: 'pistol',
      startingWeaponTier: 2,   // §6: King's starting weapon is Tier II
      tierKing: true,          // dynamic Tier I/IV bonuses (§6)
    },

  },

  /* ---------------- wave durations ----------------
     Ramp for the first 9 waves, then 60s flat (spec §1). The timer
     uses the duration assigned to the current wave. Boss waves use
     the same duration and hold open until the field is clear. */
  WAVES: [
    /*  1 */ 20, /*  2 */ 25, /*  3 */ 30, /*  4 */ 35, /*  5 */ 40,
    /*  6 */ 45, /*  7 */ 50, /*  8 */ 55, /*  9 */ 60, /* 10 */ 60,
    /* 11 */ 60, /* 12 */ 60, /* 13 */ 60, /* 14 */ 60, /* 15 */ 60,
    /* 16 */ 60, /* 17 */ 60, /* 18 */ 60, /* 19 */ 60, /* 20 */ 60,
  ],
  WAVE_MARKS: [0, 5, 10, 15, 20],  // labeled ticks on the pause wave bar
  ENDLESS_WAVE_TIME: 60,           // waves beyond 20 (endless mode)

  /* ---------------- difficulties 0-6 ----------------
     Beating the highest unlocked difficulty unlocks the next one. */
  DIFFICULTIES: {
    0: { id: 0, name: 'Difficulty 0', mods: {},                                        lines: null },
    1: { id: 1, name: 'Difficulty 1', mods: { enemyHpMul: 1.20 },                      lines: ['+20% Enemy HP'] },
    2: { id: 2, name: 'Difficulty 2', mods: { enemyHpMul: 1.35, enemySpdMul: 1.10 },   lines: ['+35% Enemy HP', '+10% Enemy Speed'] },
    3: { id: 3, name: 'Difficulty 3', mods: { enemyHpMul: 1.50, enemySpdMul: 1.15, enemyDmgAdd: 1 },            lines: ['+50% Enemy HP', '+15% Enemy Speed', '+1 Enemy Damage'] },
    4: { id: 4, name: 'Difficulty 4', mods: { enemyHpMul: 1.70, enemySpdMul: 1.20, enemyDmgAdd: 2, spawnMul: 1.2 }, lines: ['+70% Enemy HP', '+20% Enemy Speed', '+2 Enemy Damage', '+20% Spawn Rate'] },
    5: { id: 5, name: 'Difficulty 5', mods: { enemyHpMul: 1.90, enemySpdMul: 1.25, enemyDmgAdd: 3, spawnMul: 1.35 }, lines: ['+90% Enemy HP', '+25% Enemy Speed', '+3 Enemy Damage', '+35% Spawn Rate'] },
    6: { id: 6, name: 'Difficulty 6', mods: { enemyHpMul: 2.20, enemySpdMul: 1.30, enemyDmgAdd: 4, spawnMul: 1.5 }, lines: ['+120% Enemy HP', '+30% Enemy Speed', '+4 Enemy Damage', '+50% Spawn Rate'] },
  },
  MAX_DIFFICULTY: 6,
  DIFFICULTY_SLOTS: 7,   // slots 0..6 shown in the difficulty screen

  PLAYER: { radius: 22, invulnTime: 0.6 },

  /* =========================================================
     ENEMY SYSTEM — all enemy data lives here (spec §11).
     Systems kept separate: ENEMIES (definitions) / VARIANTS
     (modifiers) / WAVE_SCHEDULE (quotas) / WAVE_SCALING (global
     curve) / BOSSES+COUNCIL (bosses).  Values are the initial
     balancing numbers from the enemy design document.
     ========================================================= */
  ENEMY: {
    maxAlive: 55,            // legacy cap (kept as a safety ceiling)
    /* active-enemy limits per wave (spec §1): opening waves arrive in
       small manageable groups; later waves scale back up */
    maxActiveByWave: { 1: 3, 2: 4, 3: 5, 4: 6, 5: 7, 6: 10, 9: 14, 13: 18, 17: 24 },
    maxActiveEndless: 24,
    bossOrdinaryCap: 12,     // ordinary cap while a boss is on the field
    markerTime: 1.0,         // red X warning shown before each spawn
    spawnFade: 0.35,         // seconds of spawn-in (harmless, no contact)
    minSpawnDist: 250,       // never spawn closer than this to the player
    edgeMargin: 26,          // distance from the arena edge

    /* ---- adaptive spawn-group scheduling (spec §2) ----
       The director chunks each wave's quota into GROUPS and spaces
       them by the wave's band below, fitting them between
       startFrac..endFrac of the wave's ACTUAL duration. Intervals
       are targets, not rigid timers: group size may stretch when a
       short wave carries a large quota. */
    spawnGroups: {
      bands: [               // per wave range: [interval min,max], [group size min,max]
        { maxWave: 2,   interval: [5, 7],       size: [1, 2] },
        { maxWave: 4,   interval: [4.5, 6],     size: [1, 2] },
        { maxWave: 6,   interval: [4, 5],       size: [2, 3] },
        { maxWave: 8,   interval: [3.5, 4.5],   size: [2, 3] },
        { maxWave: 12,  interval: [3, 4],       size: [2, 4] },
        { maxWave: 16,  interval: [2.5, 3.5],   size: [3, 5] },
        { maxWave: 999, interval: [2.5, 3],     size: [3, 5] },
      ],
      startFrac: 0.15,       // first group lands ~15% into the wave
      endFrac: 0.85,         // last group lands by ~85% (before the timer expires)
      retargetEvery: 4,      // seconds between adaptive re-timings after a cap hold

    },
  },

  /* ---------------- loot & economy (spec §3-§6) ----------------
     All drop/economy knobs live here so they can be tuned while
     testing.  Chance math itself is in js/loot.js. */
  LOOT: {
    matFlatWaves: 4,       // waves 1-4: every kill drops materials (100%)
    matPerWave: -0.015,    // from wave 5: chance = 1 + perWave*wave (-1.5pp/wave)
    matMin: 0.5,           // regular-wave floor (never below 50%)
    hordeQuota: 55,        // waves scheduling >= this many units are horde waves
    hordeMul: 0.65,        // horde-wave material chance multiplier
    fruitHeal: 3,          // HP restored by a fruit
    crateRecyclePct: 0.4,  // recycle refund = 40% of the item's price
    bossCrateGuarantee: true, // bosses always drop a special crate
    maxMatPickups: 80,     // beyond this, values merge into existing pickups
  },

  /* ---- v0.9 §3: enemy pursuit speed as an exact PERCENTAGE of the
     targeted player's EFFECTIVE speed (upgrades + char bonuses applied).
     Baseline for the whole run — no wave scaling on top (spec §3). ---- */
  SPEED_PCT: {
    toilet: 0.70,
    airpods: 0.85,
    camera: 0.70,
    tiktok: 0.90,
    chatgpt: 0.80,
    gemini: 0.75,
    iphone: 0.80,
    claude: 0.70,
    drugbottle: 0.75,
  },
  /* §4: iPhone chase surge = 100% of the target's effective speed */
  IPHONE_CHASE_PCT: 1.00,
  /* §8: ranged enemies telegraph before firing (s per enemy) */
  AIM_WARN: { tiktok: 0.40, chatgpt: 0.40, gemini: 0.38, claude: 0.45 },

  /* ---- Builder's Turret (spec §8-§9) ---- */
  TURRET: {
    baseDamage: 3,          // default projectile when no ranged weapon is owned
    baseRange: 220,         // px, + structureRange stat
    baseCooldown: 1.5,      // s, / (1 + structureAttackSpeed/100)
    hitR: 9,                // projectile collision radius
    knockback: 8,           // small knockback impulse on hit
    projSpeed: 420,
    engineeringScale: 0.01, // +1% damage per Engineering point
    matsPerBonus: 5,        // every 5 uncollected materials ...
    rangePerChunk: 1,       // ... -> +1 Structure Range (and +1% Structure AS)
    tiers: [
      { threshold: 0,   extraShots: 0, spread: 0 },     // T1: starting tier
      { threshold: 30,  extraShots: 1, spread: 0.16 },  // T2: +30 Structure Range
      { threshold: 150, extraShots: 2, spread: 0.20 },  // T3: +150
      { threshold: 300, extraShots: 3, spread: 0.24 },  // T4: +300
    ],
    spawnOffset: 90,        // spawn distance from the arena center
  },

  /* ---- v0.11 §4: NORMAL TURRET — a separate, purchasable structure.
     NOT Bair's unique turret: no guaranteed start, no conversion
     passive, and Bair's "no additional structures" restriction
     blocks it like any other structure. Four visual/stat tiers on
     the SAME existing turret art progression (T1-T4 images). ---- */
  NORMAL_TURRET: {
    startingPrice: 65,
    damage: 8,
    cooldown: 1.0,          // seconds per shot
    range: 230,             // px, targeting radius
    targeting: 'nearest',  // nearest eligible enemy
    hitR: 9,
    knockback: 8,
    projSpeed: 460,
    engineeringScale: 0.01, // +1% damage per Engineering point
    upgradePrice: [0, 90, 160, 300],   // per new tier (T2..T4)
    /* tier ladder: pure stat steps (art = existing T1-T4 images) */
    tiers: [
      { tier: 1, damage: 8,  cooldown: 1.0,  range: 230 },
      { tier: 2, damage: 13, cooldown: 0.9,  range: 255 },
      { tier: 3, damage: 19, cooldown: 0.8,  range: 280 },
      { tier: 4, damage: 28, cooldown: 0.68, range: 310 },
    ],
    poolCap: 14,            // max live normal-turret shots (performance)
  },

  /* ---- the nine base enemy identities (spec §3) ----
     hp / contactDmg / speed(px/s) / diameter(px) / atkRange /
     projDmg / projSpeed / cooldown(s) / projCount / reward(materials) */
  ENEMIES: {
    iphone: {
      id: 'iphone', name: 'iPhone', tier: 1, firstWave: 1,
      sprite: 'iphone', color: '#d9dfec',
      /* v0.9 §4: dedicated pursuit enemy — NO projectile attacks at all */
      hp: 30, contactDmg: 8, speed: 65, diameter: 38,
      move: 'pursue',
      /* Notification Rush: 100% of the target's speed for the surge */
      ability: { kind: 'dash', every: 8, warn: 0.7, dur: 0.55, recover: 0.7 },
      ranged: false,
      reward: 3,
      consumable: 0.02,               // chance a kill drops a consumable (spec §4)
      crate: 0.03,                    // chance a consumable is a loot crate
    },
    camera: {
      id: 'camera', name: 'Camera', tier: 1, firstWave: 1,
      sprite: 'camera', color: '#3a3f46',
      hp: 24, contactDmg: 1, speed: 42, diameter: 44,
      atkRange: 450, projDmg: 1, projSpeed: 420, cooldown: 2.2, projCount: 1,
      /* mobile ranged pursuer: chases the player, keeps a firing
         distance, pauses only for the Target-Lock flash (spec §1) */
      move: 'chase', attack: 'aimed', projKind: 'shot',
      keepDist: 0.55,               // fraction of atkRange held while pursuing
      ability: { kind: 'lock', warn: 0.55 },
      reward: 2,
      consumable: 0.01,               // chance a kill drops a consumable (spec §4)
      crate: 0.01,                    // chance a consumable is a loot crate
    },
    chatgpt: {
      id: 'chatgpt', name: 'ChatGPT', tier: 2, firstWave: 2,
      sprite: 'chatgpt', color: '#10a37f',
      hp: 38, contactDmg: 2, speed: 58, diameter: 43,
      atkRange: 300, projDmg: 2, projSpeed: 245, cooldown: 2.8, projCount: 1,
      move: 'pursue-stop', attack: 'text', projKind: 'text',
      stopTime: 0.55, stopChance: 0.45,
      ability: { kind: 'sequence', everyN: 3, delay: 0.35, predict: 0.4 },
      reward: 3,
      consumable: 0.03,               // chance a kill drops a consumable (spec §4)
      crate: 0.03,                    // chance a consumable is a loot crate
    },
    toilet: {
      id: 'toilet', name: 'Toilet', tier: 1, firstWave: 3,
      sprite: 'toilet', color: '#dceef5',
      hp: 95, contactDmg: 1, speed: 24, diameter: 62,
      atkRange: 170, projDmg: 9, projSpeed: 150, cooldown: 4.5, projCount: 1,
      move: 'slow', attack: 'flush',
      ability: { kind: 'flush', every: 6, warn: 1.0, radius: 140, waveSpeed: 260 },
      reward: 2,
      consumable: 0.01,               // chance a kill drops a consumable (spec §4)
      crate: 0.01,                    // chance a consumable is a loot crate
    },
    gemini: {
      id: 'gemini', name: 'Gemini', tier: 2, firstWave: 4,
      sprite: 'gemini', color: '#4285f4',
      hp: 42, contactDmg: 7, speed: 48, diameter: 42,
      atkRange: 340, projDmg: 8, projSpeed: 230, cooldown: 3.0, projCount: 1,
      move: 'strafe', attack: 'gem', projKind: 'gem',
      spread: 3, spreadArc: 0.22,
      ability: { kind: 'multimodal', every: 4, warn: 0.6, count: 5, arc: 0.38 },
      reward: 3,
      consumable: 0.03,               // chance a kill drops a consumable (spec §4)
      crate: 0.03,                    // chance a consumable is a loot crate
    },
    tiktok: {
      id: 'tiktok', name: 'TikTok', tier: 2, firstWave: 6,
      sprite: 'tiktok', color: '#ff0050',
      hp: 34, contactDmg: 1, speed: 105, diameter: 36,
      atkRange: 260, projDmg: 1, projSpeed: 250, cooldown: 3.2, projCount: 1,
      move: 'erratic', attack: 'video', projKind: 'video',
      ability: { kind: 'frenzy', every: 7, dur: 2.2, mult: 1.7, slowDur: 1.2, slowMul: 0.55 },
      reward: 2,
      consumable: 0.01,               // chance a kill drops a consumable (spec §4)
      crate: 0.01,                    // chance a consumable is a loot crate
    },
    airpods: {
      id: 'airpods', name: 'AirPods', tier: 2, firstWave: 8,
      /* v0.9 §9: ONE enemy = ONE complete AirPods image (the pair is a
         single entity: one HP bar, one body, one reward roll, one quota
         unit — never two independently controlled pods) */
      sprite: 'airpods', color: '#f2f2f2',
      hp: 34, contactDmg: 1, speed: 88, diameter: 46,
      atkRange: 150, projDmg: 5, projSpeed: 180, cooldown: 4.0, projCount: 1,
      move: 'orbit', orbitR: 130, attack: 'sound',
      ability: { kind: 'soundwave', every: 5.5, warn: 0.7, radius: 150, waveSpeed: 240 },
      ranged: true,                            // soundwave = area telegraph
      reward: 2,
      consumable: 0.02,               // chance a kill drops a consumable (spec §4)
      crate: 0.03,                    // chance a consumable is a loot crate
    },
    claude: {
      id: 'claude', name: 'Claude', tier: 3, firstWave: 10,
      sprite: 'claude', color: '#d97757',
      hp: 85, contactDmg: 10, speed: 35, diameter: 48,
      atkRange: 400, projDmg: 13, projSpeed: 190, cooldown: 3.8, projCount: 1,
      move: 'kite', kiteR: 280, attack: 'heavy', projKind: 'heavy',
      ability: { kind: 'shield', every: 8, absorb: 20, maxDur: 4 },
      reward: 4,
      consumable: 0.03,               // chance a kill drops a consumable (spec §4)
      crate: 0.05,                    // chance a consumable is a loot crate
    },
    drugbottle: {
      id: 'drugbottle', name: 'Drug Bottle', tier: 2, firstWave: 12,
      sprite: 'drugs', color: '#f2c94c',
      hp: 55, contactDmg: 8, speed: 67, diameter: 40,
      atkRange: 190, projDmg: 0, projSpeed: 0, cooldown: 5.0, projCount: 0,
      move: 'zigzag', attack: 'cloud',
      ability: { kind: 'cloud', every: 5, radius: 85, dur: 4, slow: 35, count: 1 },
      reward: 2,
      consumable: 0.01,               // chance a kill drops a consumable (spec §4)
      crate: 0.01,                    // chance a consumable is a loot crate
    },
  },

  /* ---- variant modifiers (spec §4).  Applied ON TOP of the global
     wave scaling — variants must stay visibly stronger at every wave.
     `chance` = spawn probability once unlocked; `tweaks` = per-enemy
     behavior overrides (merged shallowly into the def at spawn). ---- */
  VARIANTS: {
    standard: { id: 'standard', name: 'Standard', unlock: 1, hp: 1.0, dmg: 1.0, spd: 1.0, reward: 1, scale: 1.0 },
    advanced: {
      id: 'advanced', name: 'Advanced', unlock: 7, hp: 1.8, dmg: 1.25, spd: 1.10, reward: 2.5, scale: 1.18,
      ring: 'rgba(70,150,255,0.9)',
      chance: (w) => Math.min(0.45, Math.max(0, (w - 6) / 12)),
    },
    elite: {
      id: 'elite', name: 'Elite', unlock: 13, hp: 3.0, dmg: 1.5, spd: 1.15, reward: 5, scale: 1.34,
      ring: 'rgba(255,176,32,0.95)',
      chance: (w) => Math.min(0.30, Math.max(0, (w - 12) / 12)),
    },
  },

  /* per-enemy variant behavior upgrades — "not simply bigger/faster" */
  VARIANT_TWEAKS: {
    iphone: {
      advanced: { ability: { every: 7 } },
      elite: { projCount: 2, ability: { every: 5.5, speed: 330 } },
    },
    camera: {
      advanced: { cooldown: 2.0 },
      elite: { projCount: 2 },                       // multi-lens: two shots
    },
    chatgpt: {
      advanced: { projCount: 2 },
      elite: { projCount: 3 },
    },
    toilet: {
      advanced: { ability: { radius: 160 } },
      elite: { ability: { radius: 200, waveSpeed: 300 } },
    },
    gemini: {
      advanced: { ability: { every: 3 } },
      elite: { spread: 5, ability: { count: 7 } },
    },
    tiktok: {
      advanced: { ability: { every: 5.5 } },
      elite: { cooldown: 2.6, ability: { mult: 1.9 } },
    },
    airpods: {
      advanced: { ability: { radius: 170 } },
      elite: { ability: { radius: 200, every: 4.5 } },
    },
    claude: {
      advanced: { ability: { absorb: 35 } },
      elite: { ability: { absorb: 60, every: 6.5 } },
    },
    drugbottle: {
      advanced: { ability: { radius: 95, slow: 40 } },
      elite: { ability: { slow: 45, count: 2 } },     // carefully spaced clouds
    },
  },

  /* ---- exact spawn quotas (spec §6).  Ordinary enemies only —
     bosses are scheduled separately.  AirPods quota = PAIRS. ---- */
  WAVE_SCHEDULE: [
    /*  1 */ { iphone: 8,  camera: 2 },
    /*  2 */ { iphone: 10, camera: 2, chatgpt: 3 },
    /*  3 */ { iphone: 11, camera: 3, chatgpt: 4,  toilet: 2 },
    /*  4 */ { iphone: 12, camera: 3, chatgpt: 5,  toilet: 3,  gemini: 2 },
    /*  5 */ { iphone: 12, camera: 3, chatgpt: 5,  toilet: 3,  gemini: 3 },
    /*  6 */ { iphone: 13, camera: 3, chatgpt: 6,  toilet: 3,  gemini: 3,  tiktok: 2 },
    /*  7 */ { iphone: 14, camera: 3, chatgpt: 6,  toilet: 4,  gemini: 4,  tiktok: 3 },
    /*  8 */ { iphone: 14, camera: 4, chatgpt: 7,  toilet: 4,  gemini: 4,  tiktok: 3,  airpods: 2 },
    /*  9 */ { iphone: 15, camera: 4, chatgpt: 7,  toilet: 4,  gemini: 5,  tiktok: 4,  airpods: 2 },
    /* 10 */ { iphone: 15, camera: 4, chatgpt: 7,  toilet: 5,  gemini: 5,  tiktok: 4,  airpods: 2,  claude: 2 },
    /* 11 */ { iphone: 16, camera: 4, chatgpt: 8,  toilet: 5,  gemini: 5,  tiktok: 4,  airpods: 3,  claude: 2 },
    /* 12 */ { iphone: 16, camera: 4, chatgpt: 8,  toilet: 5,  gemini: 6,  tiktok: 5,  airpods: 3,  claude: 3,  drugbottle: 2 },
    /* 13 */ { iphone: 17, camera: 5, chatgpt: 8,  toilet: 6,  gemini: 6,  tiktok: 5,  airpods: 3,  claude: 3,  drugbottle: 2 },
    /* 14 */ { iphone: 17, camera: 5, chatgpt: 9,  toilet: 6,  gemini: 7,  tiktok: 5,  airpods: 3,  claude: 3,  drugbottle: 3 },
    /* 15 */ { iphone: 18, camera: 5, chatgpt: 9,  toilet: 6,  gemini: 7,  tiktok: 6,  airpods: 4,  claude: 3,  drugbottle: 3 },
    /* 16 */ { iphone: 18, camera: 5, chatgpt: 10, toilet: 7,  gemini: 7,  tiktok: 6,  airpods: 4,  claude: 4,  drugbottle: 3 },
    /* 17 */ { iphone: 19, camera: 6, chatgpt: 10, toilet: 7,  gemini: 8,  tiktok: 7,  airpods: 4,  claude: 4,  drugbottle: 4 },
    /* 18 */ { iphone: 19, camera: 6, chatgpt: 11, toilet: 7,  gemini: 8,  tiktok: 7,  airpods: 5,  claude: 4,  drugbottle: 4 },
    /* 19 */ { iphone: 20, camera: 6, chatgpt: 11, toilet: 8,  gemini: 9,  tiktok: 8,  airpods: 5,  claude: 5,  drugbottle: 5 },
    /* 20 */ { iphone: 12, camera: 3, chatgpt: 6,  toilet: 4,  gemini: 6,  tiktok: 4,  airpods: 3,  claude: 4,  drugbottle: 3 },
  ],

  /* ---- global difficulty curve (spec §8) — interpolated between
     anchors; continues linearly past wave 20 for endless mode ---- */
  WAVE_SCALING: {
    hp:  { anchors: [[1, 1.0], [5, 1.2], [10, 1.5], [15, 1.85], [20, 2.2]], slopeAfter20: 0.07 },
    dmg: { anchors: [[1, 1.0], [5, 1.1], [10, 1.25], [15, 1.4], [20, 1.6]], slopeAfter20: 0.04 },
  },

  /* ---- bosses (spec §5): only ChatGPT / Gemini / Claude ---- */
  BOSSES: {
    chatgpt: {
      id: 'chatgpt', base: 'chatgpt', name: 'ADVANCED CHATGPT', wave: 5,
      hpMul: 8, dmgMul: 1.25, sizeMul: 2.2, reward: 25, entrance: 3.0,
    },
    gemini: {
      id: 'gemini', base: 'gemini', name: 'ADVANCED GEMINI', wave: 10,
      hpMul: 9, dmgMul: 1.25, sizeMul: 2.25, reward: 30, entrance: 3.0,
    },
    claude: {
      id: 'claude', base: 'claude', name: 'ADVANCED CLAUDE', wave: 15,
      hpMul: 10, dmgMul: 1.3, sizeMul: 2.3, reward: 35, entrance: 3.0,
    },
  },
  /* Wave 20 final multi-boss fight — three separate health bars. */
  COUNCIL: {
    wave: 20, name: 'AI COUNCIL', entrance: 3.0,
    members: [
      { base: 'chatgpt', name: 'ADVANCED CHATGPT', hpMul: 7,   dmgMul: 1.2,  sizeMul: 2.0, reward: 20 },
      { base: 'gemini',  name: 'ADVANCED GEMINI',  hpMul: 7.5, dmgMul: 1.2,  sizeMul: 2.0, reward: 25 },
      { base: 'claude',  name: 'ADVANCED CLAUDE',  hpMul: 8,   dmgMul: 1.25, sizeMul: 2.0, reward: 30 },
    ],
  },
  /* endless mode (wave > 20): rotating boss, council every 5th wave */
  ENDLESS_BOSS_ROTATION: ['chatgpt', 'gemini', 'claude'],

  /* enemy sprite files (loaded by main.js, drawn by enemies.js) */
  ENEMY_IMG_SRC: {
    iphone:  'assets/enemies/iphone.png',
    camera:  'assets/enemies/camera.png',
    chatgpt: 'assets/enemies/chatgpt.png',
    toilet:  'assets/enemies/toilet.png',
    gemini:  'assets/enemies/gemini.png',
    tiktok:  'assets/enemies/tiktok.png',
    claude:  'assets/enemies/claude.png',
    drugs:   'assets/enemies/drugs.png',
    airpods: 'assets/enemies/airpods.png',   // charging-case art; individual pods are vector-drawn
  },

  AUDIO: {
    musicVol: 0.5,           // menu music sits at 50% vs other audio
    clickVol: 1.0,
    hoverVol: 0.55,          // hover blip is slightly quieter...
    hoverRate: 0.78,         // ...and lower pitched
  },

  FX: {
    knockbackScale: 8,       // impulse = knockback * scale (px/s)
    knockbackDecay: 8,       // friction — displacement ends up ~= knockback px
    dmgNumSpeed: 55,
    dmgNumLife: 0.75,
    shakeTime: 0.22,
    shakeMag: 5,
  },
};

KS.arenaSize = () =>
  Math.round(KS.CONFIG.ARENA.TILE * KS.CONFIG.ARENA.GRID * KS.CONFIG.ARENA.SCALE);
KS.tierInfo = (t) => {
  const base = KS.CONFIG.TIERS[t] || KS.CONFIG.TIERS[1];
  const num = KS.CONFIG.TIERS[t] ? t : 1;
  /* localized tier name (tier_1..tier_4), color stays shared */
  const name = (typeof KS.t === 'function') ? KS.t('tier_' + num) : base.name;
  return Object.assign({}, base, { name });
};
KS.waveDuration = (wave) => {
  const W = KS.CONFIG.WAVES;
  return wave <= W.length ? W[wave - 1] : KS.CONFIG.ENDLESS_WAVE_TIME;
};

/* global wave scaling: piecewise-linear between anchors, linear
   extension past wave 20 for endless mode */
/* ---- early-game balance curves (spec §1) ----
   Multipliers taper to 1.0 as the run progresses, so waves 9+ keep the
   existing difficulty progression unchanged. */
KS.earlyBalance = (wave) => ({
  dmg:     wave <= 3 ? 0.6 : wave <= 5 ? 0.8 : 1,
  speed:   wave <= 3 ? 0.65 : wave <= 5 ? 0.8 : 1,
  atkCd:   wave <= 3 ? 1.8 : wave <= 5 ? 1.5 : wave <= 8 ? 1.25 : 1,
  projSpd: wave <= 3 ? 0.7 : wave <= 6 ? 0.85 : 1,
  /* extra random delay before an enemy's first attack (stagger) */
  jitter:  wave <= 5 ? [0.6, 1.8] : [0, 0],
});

/* active-enemy cap for a wave (spec §1 table) */
KS.maxAliveFor = (wave) => {
  const T = KS.CONFIG.ENEMY.maxActiveByWave;
  let cap = T[1];
  for (const k of Object.keys(T)) if (wave >= +k) cap = T[k];
  if (wave > 20) cap = KS.CONFIG.ENEMY.maxActiveEndless;
  return cap;
};

KS.waveScale = (kind, wave) => {
  const S = KS.CONFIG.WAVE_SCALING[kind];
  const A = S.anchors;
  if (wave <= A[0][0]) return A[0][1];
  for (let i = 1; i < A.length; i++) {
    if (wave <= A[i][0]) {
      const [w0, v0] = A[i - 1], [w1, v1] = A[i];
      return v0 + (v1 - v0) * (wave - w0) / (w1 - w0);
    }
  }
  const last = A[A.length - 1];
  return last[1] + S.slopeAfter20 * (wave - last[0]);
};
KS.waveScaleHp = (w) => KS.waveScale('hp', w);
KS.waveScaleDmg = (w) => KS.waveScale('dmg', w);

/* ---------------- stat lookup tables (user supplied) ---------------- */

// HP Regen stat -> HP/second (exact values for 0..20, formula beyond)
KS.HP_REGEN_TABLE = [
  /* 0 */ 0, /* 1 */ 0.2, /* 2 */ 0.29, /* 3 */ 0.38, /* 4 */ 0.47,
  /* 5 */ 0.56, /* 6 */ 0.64, /* 7 */ 0.73, /* 8 */ 0.82, /* 9 */ 0.91,
  /*10 */ 1, /*11 */ 1.09, /*12 */ 1.18, /*13 */ 1.27, /*14 */ 1.36,
  /*15 */ 1.44, /*16 */ 1.53, /*17 */ 1.62, /*18 */ 1.71, /*19 */ 1.8,
  /*20 */ 1.89,
];
KS.hpRegenRate = (r) => {
  r = Math.max(0, Math.round(r));
  const T = KS.HP_REGEN_TABLE;
  if (r < T.length) return T[r];
  return Math.round((1 + (r - 10) * 0.089) * 100) / 100;
};

// Armor stat -> damage reduction % (exact values for 0..30, then anchors)
KS.ARMOR_TABLE = [
  0, 6, 12, 17, 21, 25, 29, 32, 35, 38, 40,      // 0-10
  42, 44, 46, 48, 50, 52, 53, 55, 56, 57, 58,    // 11-21
  59, 61, 62, 63, 63, 64, 65, 66, 67,            // 22-30
];
KS.armorReduction = (a) => {
  a = Math.max(0, Math.round(a));
  const T = KS.ARMOR_TABLE;
  if (a < T.length) return T[a];
  const anchors = [[100, 87], [200, 93], [300, 95], [400, 96], [500, 97], [1000, 99]];
  if (a >= 1000) return 99;
  for (let i = 1; i < anchors.length; i++) {
    const [a1, v1] = anchors[i - 1], [a2, v2] = anchors[i];
    if (a <= a2) return Math.round(v1 + (a - a1) * (v2 - v1) / (a2 - a1));
  }
  return 99;
};
