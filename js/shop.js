/* =========================================================
   Shop — 4 purchasable slots (slot 1 is always a Fist offer,
   the rest can also roll weapons), tier rarity by wave + Luck,
   inflation, locking, and the user's reroll pricing formula.
   - Reroll Increase: max(1, floor(0.40 * wave))
   - First Reroll:    floor(wave * 0.75) + Increase
   - Every reroll after adds the Increase again.
   - Locked entries survive rerolls AND waves at a frozen price.
   - Weapon base prices: Fist = 12 x tier mult, Hand = 10/22/45/91.
   ========================================================= */
window.KS = window.KS || {};

KS.Shop = (() => {
  const C = KS.CONFIG;
  const SLOTS = 4;
  const FIST_BASE_PRICE = 12;
  const FIST_TIER_MULT = [1, 2.2, 4.2, 8];
  const INFLATION = 0.14;   // +14% base price per wave (linear)
  const WEAPON_SLOT_CHANCE = 0.25;   // slots 2-4: chance to roll a weapon
  /* v0.11 §1: base shop prices of the five new ranged weapons
     (spec §1 table: Pistol 35 / SMG 55 / Shredder 75 / Revolver 65 /
     Shuriken 50). tierMult = per-tier price multiplier (config-tunable). */
  const RANGED_BASE_PRICE = {
    pistol: 35, smg: 55, shredder: 75, revolver: 65, shuriken: 50,
  };
  const RANGED_TIER_MULT = [1, 2.1, 4.0, 7.5];

  /* placeholder item pool (real item art arrives later) */
  const ITEMS = [
    /* v0.9 §6: purchasable structure — spawns the Builder's Turret with
       the existing four-tier upgrade system (structureRange thresholds).
       Bair The Builder keeps his guaranteed STARTING turret; everyone can
       own at most one turret (the purchase is blocked while one exists). */
    {
      id: 'buildersTurret',
      name: { en: "Builder's Turret", he: 'תותח הבנאי', es: 'Torreta del Constructor' },
      icon: '🔧',
      tier: 2,
      price: 28,
      desc: 'Deploys a structure that automatically targets the nearest enemy and fires. Upgrades with Structure Range.',
      turret: true,
      fx: [],
    },
    /* v0.11 §4: NORMAL TURRET — a separate purchasable structure for
       everyone (but NOT Bair: his "cannot have additional structures"
       restriction blocks it). Uses the same existing turret art and its
       T1-T4 visual progression via the NORMAL_TURRET tier ladder.
       NOT buildersTurret: no guaranteed start, no conversion passive. */
    {
      id: 'normalTurret',
      name: { en: 'Turret', he: 'תותח', es: 'Torreta' },
      icon: '🛡️',
      tier: 2,
      price: 65,
      desc: 'A purchasable turret that automatically targets the nearest enemy and fires. Four upgrade tiers.',
      normalTurret: true,
      fx: [],
    },
    /* tier 1 */
    { id: 'screwdriver', tier: 1, icon: '🔧', name: { en: 'Screwdriver', he: 'מברג' },   price: 12, fx: [['meleeDMG', 2]] },
    { id: 'apple',       tier: 1, icon: '🍎', name: { en: 'Apple', he: 'תפוח' },         price: 14, fx: [['hpRegen', 1]] },
    { id: 'shoes',       tier: 1, icon: '👟', name: { en: 'Running Shoes', he: 'נעלי ריצה' }, price: 16, fx: [['speedPct', 3]] },
    { id: 'coin',        tier: 1, icon: '🪙', name: { en: 'Lucky Coin', he: 'מטבע מזל' },    price: 15, fx: [['harvesting', 3]] },
    { id: 'glove',       tier: 1, icon: '🧤', name: { en: 'Worn Glove', he: 'כפפה בלויה' },    price: 16, fx: [['lifeSteal', 1]] },
    { id: 'bolt',        tier: 1, icon: '⚙️', name: { en: 'Rusty Bolt', he: 'בורג חלוד' },    price: 13, fx: [['armor', 1]] },
    /* tier 2 */
    { id: 'meat',        tier: 2, icon: '🍖', name: { en: 'Meat Snack', he: 'חטיף בשר' },       price: 26, fx: [['maxHP', 6]] },
    { id: 'energy',      tier: 2, icon: '🥤', name: { en: 'Energy Drink', he: 'משקה אנרגיה' },     price: 28, fx: [['attackSpeed', 8]] },
    { id: 'clover',      tier: 2, icon: '🍀', name: { en: 'Four-Leaf Clover', he: 'תלתן ארבעה עלים' }, price: 27, fx: [['luck', 8]] },
    { id: 'magnet',      tier: 2, icon: '🧲', name: { en: 'Magnet', he: 'מגנט' },           price: 24, fx: [['pickupRange', 40]] },
    { id: 'tape',        tier: 2, icon: '📼', name: { en: 'Duct Tape', he: 'נאדית דבק' },        price: 25, fx: [['armor', 2]] },
    /* tier 3 */
    { id: 'alien',       tier: 3, icon: '👽', name: { en: 'Alien Eyes', he: 'עיני חייזר' },    price: 48, fx: [['range', 30]] },
    { id: 'plate',       tier: 3, icon: '🛡️', name: { en: 'Chest Plate', he: 'שריון חזה' },   price: 55, fx: [['armor', 3], ['maxHP', 4]] },
    { id: 'protein',     tier: 3, icon: '🥛', name: { en: 'Protein Shake', he: 'שייק חלבון' }, price: 50, fx: [['hpRegen', 2], ['maxHP', 5]] },
    { id: 'battery',     tier: 3, icon: '🔋', name: { en: 'Power Cell', he: 'תא כוח' },    price: 46, fx: [['engineering', 2]] },
    /* tier 4 */
    { id: 'goldheart',   tier: 4, icon: '💛', name: { en: 'Golden Heart', he: 'לב זהב' },  price: 88, fx: [['maxHP', 12]] },
    { id: 'rocket',      tier: 4, icon: '🚀', name: 'Rocket Boots',  price: 92, fx: [['speedPct', 10], ['dodge', 4]] },
    { id: 'crown',       tier: 4, icon: '👑', name: 'Trophy Crown',  price: 85, fx: [['luck', 15], ['harvesting', 8]] },
  ];

  function inflated(base, wave) {
    return Math.max(1, Math.round(base * (1 + INFLATION * (wave - 1))));
  }

  /* user's reroll pricing table */
  function rerollIncrease(wave) {
    return Math.max(1, Math.floor(0.40 * wave));
  }
  function rerollPrice(wave, rerollsDone) {
    return Math.floor(wave * 0.75) + rerollIncrease(wave) + rerollsDone * rerollIncrease(wave);
  }

  function rollItemTier(wave, luck) {
    const ch = KS.Upgrades.chances(wave, luck);
    let r = Math.random() * 100;
    for (let t = 0; t < 4; t++) {
      r -= ch[t];
      if (r <= 0) return t + 1;
    }
    return 1;
  }

  function randomItem(tier, exclude) {
    let pool = ITEMS.filter((it) => it.tier === tier && !exclude.includes(it.id));
    if (!pool.length) pool = ITEMS.filter((it) => !exclude.includes(it.id));
    if (!pool.length) pool = ITEMS.filter((it) => it.tier === tier);
    return pool[(Math.random() * pool.length) | 0];
  }

  function rollWeaponEntry(wave, luck, forcedId) {
    const tier = rollItemTier(wave, luck);
    const id = forcedId || 'fist';
    return {
      kind: 'weapon', id, tier,
      price: inflated(weaponBasePrice(id, tier), wave),
      locked: false,
    };
  }

  /* slots 2-4: mostly items, but sometimes a weapon offer so new
     weapons (e.g. the Hand) can actually be bought */
  function rollSlot(wave, luck, excludeIds) {
    if (Math.random() < WEAPON_SLOT_CHANCE) {
      const ids = Object.keys(C.WEAPONS).filter((id) => !excludeIds.includes(id));
      const id = ids.length ? ids[(Math.random() * ids.length) | 0]
                            : 'fist';
      return rollWeaponEntry(wave, luck, id);
    }
    const tier = rollItemTier(wave, luck);
    const it = randomItem(tier, excludeIds);
    return { kind: 'item', id: it.id, tier, price: inflated(it.price, wave), locked: false };
  }

  /* generate the 4 shop slots for a wave; `prev` keeps locked entries.
     Sold entries NEVER persist — even if they were locked — so a bought
     card's box is gone (emptied) until the next reroll brings a fresh item. */
  function roll(wave, luck, prev, excludeIds = []) {
    const entries = [];
    const usedIds = [];
    /* slot 1: always a Fist offer ("appears constantly, even when rerolling") */
    const prevFist = prev && prev[0] && prev[0].locked && !prev[0].sold ? prev[0] : null;
    entries.push(prevFist || rollWeaponEntry(wave, luck));
    if (prevFist) usedIds.push(prevFist.id);
    for (let i = 1; i < SLOTS; i++) {
      const p = prev && prev[i];
      if (p && p.locked && !p.sold) { entries.push(p); usedIds.push(p.id); continue; }
      const entry = rollSlot(wave, luck, [...usedIds, ...excludeIds]);
      usedIds.push(entry.id);
      entries.push(entry);
    }
    return entries;
  }

  function itemDef(id) { return ITEMS.find((it) => it.id === id); }

  /* v0.10 §12 + v0.11 §3: shop turret offers, per-character:
     - Builder's Turret is ONLY purchasable by a player running Bair
       The Builder (restriction enforced here AND at purchase time).
     - When Bair is eligible (owns no turret yet), his Builder's
       Turret appearance chance in free slots is TRIPLED (~3x the
       normal eligible rate) — not guaranteed every shop.
     - Everyone else (who owns no turret) can roll the NORMAL turret;
       its normal appearance chance stays unchanged.
     - Bair can never be offered the normal turret (no additional
       structures restriction), and a non-Bair player is never
       offered the Builder's Turret.
     Locked entries are never overwritten, the Fist anchor (slot 1)
     is never replaced, and nothing is forced while a turret is
     already owned. The 3-visit guarantee (v0.10 §12) still applies to
     the eligible turret for the eligible character. */
  const BUILDER_TURRET_CHANCE = 0.10;   // normal eligible appearance rate
  function rollWithGuarantee(wave, luck, prev, excludeIds = [], visitsNoTurret = 0,
    charDef = null, ownsTurret = false) {
    const isBair = !!(charDef && charDef.id === 'builder');
    /* a player who already owns ANY turret rolls no turret offers */
    const turretBlocked = ownsTurret ||
      (excludeIds.includes('buildersTurret') && excludeIds.includes('normalTurret'));
    const entries = roll(wave, luck, prev, excludeIds);
    if (turretBlocked) {
      /* ineligible: no turret offers at all, no tracking */
      const both = [...excludeIds, 'buildersTurret', 'normalTurret'];
      for (let i = 1; i < entries.length; i++) {
        if (entries[i].id === 'buildersTurret' || entries[i].id === 'normalTurret') {
          entries[i] = rollSlot(wave, luck, both);
        }
      }
      return { entries, sawTurret: false, visits: 0 };
    }
    /* §3: the two turret items are exclusive to their audiences in the
       free (unlocked, unsold, non-anchor) slots:
       - Builder's Turret ONLY rolls for Bair (3x chance for him)
       - the normal turret ONLY rolls for everyone EXCEPT Bair
       A forbidden turret rolled by the base item pool is swapped for a
       safe entry (the forbidden id is passed as an exclusion so the
       replacement can never re-roll the same turret). */
    const forbidden = isBair ? 'normalTurret' : 'buildersTurret';
    const turretId = isBair ? 'buildersTurret' : 'normalTurret';
    const safeExcl = [...excludeIds, forbidden];
    const freeSlots = [];
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].locked || entries[i].sold) continue;
      if (entries[i].id === forbidden) {
        entries[i] = rollSlot(wave, luck, safeExcl);   // swap out
        if (entries[i].id === forbidden) continue;      // defensive
      }
      freeSlots.push(i);
    }
    const chance = isBair ? BUILDER_TURRET_CHANCE * 3 : 0.10;   // §3: ~3x for Bair
    const alreadyThere = entries.some((e) => e.id === turretId);
    if (!alreadyThere && freeSlots.length && Math.random() < chance) {
      const slot = freeSlots[(Math.random() * freeSlots.length) | 0];
      entries[slot] = {
        kind: 'item', id: turretId, tier: 2,
        price: inflated(isBair ? 28 : 65, wave), locked: false,
      };
    }
    if (entries.some((e) => e.id === turretId)) {
      return { entries, sawTurret: true, visits: 0 };    // appeared: reset
    }
    const visits = visitsNoTurret + 1;
    if (visits >= 3) {
      const slot = entries.findIndex((e, i) => i > 0 && !e.locked && !e.sold);
      if (slot > 0) {
        entries[slot] = {
          kind: 'item', id: turretId, tier: 2,
          price: inflated(isBair ? 28 : 65, wave), locked: false,
        };
        return { entries, sawTurret: true, visits: 0 };
      }
      return { entries, sawTurret: false, visits };      // all locked: retry next visit
    }
    return { entries, sawTurret: false, visits };
  }

  /* crate rewards: pick a random item of an exact tier (falls back to
     the closest tier that has items) */
  function rollItemOfTier(tier) {
    let pool = ITEMS.filter((it) => it.tier === tier);
    while (!pool.length && tier > 1) { tier--; pool = ITEMS.filter((it) => it.tier === tier); }
    if (!pool.length) pool = ITEMS.filter((it) => it.tier === 1);
    return pool[(Math.random() * pool.length) | 0];
  }

  /* weapon prices: per-weapon tier base (before inflation) + 50% sell-back */
  function weaponBasePrice(id, tier) {
    const def = C.WEAPONS[id];
    if (def && def.tierPrices) return def.tierPrices[tier - 1];
    /* v0.11 §1: the five new ranged weapons carry their spec base
       price with the ranged tier multiplier */
    if (RANGED_BASE_PRICE[id] != null) {
      return Math.round(RANGED_BASE_PRICE[id] * RANGED_TIER_MULT[tier - 1]);
    }
    return Math.round(FIST_BASE_PRICE * FIST_TIER_MULT[tier - 1]);
  }
  function weaponSellPrice(id, tier) {
    return Math.max(1, Math.round(weaponBasePrice(id, tier) * 0.5));
  }

  return { SLOTS, ITEMS, roll, rollWithGuarantee, rollItemTier, rollItemOfTier, rerollPrice, rerollIncrease, inflated, itemDef, weaponBasePrice, weaponSellPrice, FIST_BASE_PRICE, FIST_TIER_MULT, RANGED_BASE_PRICE, RANGED_TIER_MULT };
})();
