/* =========================================================
   DEV MODE — hidden developer console (spec §4-§8).
   - KS.DevCmd: DOM-free command engine (stat/weapon/item/reset/
     undo) with an undo history. Headless-testable.
   - KS.DevMode: Minecraft-style console UI. Opens with `/` during
     a wave or in the shop (never from the menu), pauses gameplay
     while open, and only exists while the Dev Mode accessibility
     toggle is enabled.
   Command SYNTAX stays English/LTR; interface strings localize.
   ========================================================= */
window.KS = window.KS || {};

KS.DevCmd = (() => {
  const C = KS.CONFIG;

  /* ---------------- stat registry (live data) ---------------- */
  const STAT_ALIASES = {
    max_hp: 'maxHP', maxhp: 'maxHP', health: 'maxHP',
    movement_speed: 'speed', move_speed: 'speed',
    attack_speed: 'attackSpeed', atk_speed: 'attackSpeed',
    current_hp: 'HP', hp: 'HP',
    crit: 'critChance', crit_chance: 'critChance',
    melee_damage: 'meleeDMG', ranged_damage: 'rangedDMG',
    elemental_damage: 'elementalDMG',
    pickup: 'pickupRange', pickup_range: 'pickupRange',
    xp: 'xpGain', xp_gain: 'xpGain',
    mat: 'doubleMaterial', double_material: 'doubleMaterial',
    hp_regen: 'hpRegen', life_steal: 'lifeSteal',
  };

  function statKeys(game) {
    return Object.keys((game.charDef && game.charDef.stats) || {})
      .filter((k) => k !== 'level');
  }

  /* resolve a stat name/alias -> { key, special? }  ('HP' = current HP) */
  function resolveStat(game, name) {
    const n = String(name || '').toLowerCase().replace(/[\s_-]+/g, '_');
    if (!n) return null;
    if (n === 'hp' || n === 'current_hp') return { key: 'HP', special: true };
    for (const k of statKeys(game)) {
      if (k.toLowerCase() === n) return { key: k };
    }
    const target = STAT_ALIASES[n];
    if (target === 'HP') return { key: 'HP', special: true };
    if (target && statKeys(game).includes(target)) return { key: target };
    return null;
  }

  function statValue(game, key) {
    if (key === 'HP') return game.player.hp;
    return game.stats[key] || 0;
  }

  /* ---------------- undo history ---------------- */
  const history = [];   // { cat, restore(game) }

  function snapStats(game) {
    return {
      stats: Object.assign({}, game.stats),
      hp: game.player.hp,
      noDamage: !!game.player.noDamage,
      off: Object.assign({}, game.__devOff || {}),
    };
  }
  function restoreStats(game, s) {
    game.stats = Object.assign({}, s.stats);
    game.__devOff = Object.assign({}, s.off);
    game.player.refreshMaxHp(game.stats);
    game.player.hp = Math.min(s.hp, game.player.maxHP);
    game.player.noDamage = s.noDamage;
  }
  function snapWeapons(game) {
    return {
      stats: Object.assign({}, game.stats),
      off: Object.assign({}, game.__devOff || {}),
      weapons: game.weapons.map((w) => ({ def: w.def, tier: w.tier, timer: 0 })),
    };
  }
  function restoreWeapons(game, s) {
    for (const w of game.weapons) game.applyWeaponFx(w, -1);
    game.weapons = s.weapons.map((w) => ({ def: w.def, tier: w.tier, timer: 0 }));
    game.stats = Object.assign({}, s.stats);
    game.__devOff = Object.assign({}, s.off);
    for (const w of game.weapons) game.applyWeaponFx(w, 1);
    game.player.refreshMaxHp(game.stats);
    game.player.hp = Math.min(game.player.hp, game.player.maxHP);
  }
  function snapItems(game) {
    return {
      stats: Object.assign({}, game.stats),
      off: Object.assign({}, game.__devOff || {}),
      items: game.ownedItems.slice(),
    };
  }
  function restoreItems(game, s) {
    game.ownedItems = s.items.slice();
    game.stats = Object.assign({}, s.stats);
    game.__devOff = Object.assign({}, s.off);
    game.player.refreshMaxHp(game.stats);
    game.player.hp = Math.min(game.player.hp, game.player.maxHP);
  }
  /* full-run snapshot for /reset all + /undo all */
  function snapAll(game) {
    return Object.assign(snapWeapons(game), snapItems(game), snapStats(game), {
      hp: game.player.hp,
      noDamage: !!game.player.noDamage,
      materials: game.materials,
    });
  }
  function restoreAll(game, s) {
    for (const w of game.weapons) game.applyWeaponFx(w, -1);
    game.weapons = s.weapons.map((w) => ({ def: w.def, tier: w.tier, timer: 0 }));
    game.ownedItems = s.items.slice();
    game.stats = Object.assign({}, s.stats);
    game.__devOff = Object.assign({}, s.off);
    for (const w of game.weapons) game.applyWeaponFx(w, 1);
    game.player.refreshMaxHp(game.stats);
    game.player.hp = Math.min(s.hp, game.player.maxHP);
    game.player.noDamage = s.noDamage;
    game.materials = s.materials;
  }
  function pushUndo(cat, snapshot, restore) {
    history.push({ cat, snapshot, restore });
    if (history.length > 60) history.shift();
  }

  /* ---------------- helpers ---------------- */
  const isNum = (v) => v !== '' && Number.isFinite(Number(v));

  function findWeapon(name) {
    const n = String(name || '').toLowerCase();
    for (const id of Object.keys(C.WEAPONS)) {
      if (id.toLowerCase() === n ||
          String(C.WEAPONS[id].name).toLowerCase() === n) return id;
    }
    return null;
  }
  function weaponDisplayName(id) {
    const nm = C.WEAPONS[id] && C.WEAPONS[id].name;
    return KS.L(nm);
  }
  function findItem(name) {
    const n = String(name || '').toLowerCase();
    for (const it of KS.Shop.ITEMS) {
      const names = [it.id];
      if (typeof it.name === 'string') names.push(it.name);
      else if (it.name && typeof it.name === 'object') {
        names.push(it.name.en, it.name.he);
      }
      for (const cand of names) {
        if (cand && String(cand).toLowerCase() === n) return it.id;
      }
    }
    return null;
  }
  function itemDisplayName(def) {
    return KS.L(def.name) || def.id;
  }
  function itemCount(game, id) {
    return game.ownedItems.filter((d) => d.id === id).length;
  }
  function removeItemCopies(game, id, n) {
    let removed = 0;
    for (let i = game.ownedItems.length - 1; i >= 0 && removed < n; i--) {
      if (game.ownedItems[i].id !== id) continue;
      for (const [k, v] of game.ownedItems[i].fx || []) {
        game.stats[k] = (game.stats[k] || 0) - v;
      }
      game.ownedItems.splice(i, 1);
      removed++;
    }
    game.player.refreshMaxHp(game.stats);
    game.player.hp = Math.min(game.player.hp, game.player.maxHP);
    return removed;
  }

  /* rebuild stats from the CURRENT character + weapons + items */
  function rebuildStats(game) {
    game.stats = Object.assign({}, game.charDef.stats);
    game.__devOff = {};
    for (const w of game.weapons) game.applyWeaponFx(w, 1);
    for (const it of game.ownedItems) {
      for (const [k, v] of it.fx || []) game.stats[k] = (game.stats[k] || 0) + v;
    }
    game.player.recomputeDyn();          // v0.11 §5-§6 dynamic bonuses
    game.player.refreshMaxHp(game.stats);
    game.player.hp = game.player.maxHP;
    game.player.noDamage = false;
  }
  function resetWeaponsArr(game) {
    for (const w of game.weapons) game.applyWeaponFx(w, -1);
    const ws = [game.mkWeapon(game.charDef.startingWeapon,
      game.charDef.startingWeaponTier || 1)];
    if (game.charDef.bonusWeapon) {
      ws.push(game.mkWeapon(game.charDef.bonusWeapon, 1));
    }
    game.weapons = ws;
    for (const w of game.weapons) game.applyWeaponFx(w, 1);
  }

  const RESET_CATS = ['stats', 'weapons', 'items', 'health', 'materials', 'all'];
  const STAT_MODS = ['add', 'multiply', 'set', 'disable', 'enable'];

  /* ---------------- v0.11 §8: /character unlock|lock ----------------
     Developer/test tool for the persistent character unlock state.
     Runs on the character SELECT screen (no game needed) and during
     runs alike; names may contain spaces ("Barry Adkins", "King
     Kensinger"). Validates the character exists, never enables Dev
     Mode itself, never a normal unlock method. */
  function findCharacter(name) {
    const n = String(name || '').toLowerCase().trim();
    if (!n) return null;
    const CH = (KS.CONFIG && KS.CONFIG.CHARACTERS) || {};
    for (const id of Object.keys(CH)) {
      const nm = CH[id].name;
      const names = [id];
      if (nm && typeof nm === 'object') {
        names.push(String(nm.en).toLowerCase(), String(nm.he).toLowerCase());
      } else if (nm) {
        names.push(String(nm).toLowerCase());
      }
      for (const cand of names) {
        if (cand && String(cand).toLowerCase() === n) return id;
      }
    }
    return null;
  }

  function charDisplayName(id) {
    const ch = KS.CONFIG.CHARACTERS[id];
    return KS.L(ch.name) || id;
  }

  function cmdCharacter(game, tok) {
    const mod = String(tok[0] || '').toLowerCase();
    if (mod !== 'unlock' && mod !== 'lock') {
      return { ok: false, msg: KS.t('devErrMod', mod || '', 'unlock, lock') };
    }
    /* the character name = every remaining token, spaces included */
    const name = tok.slice(1).join(' ');
    if (!name) return { ok: false, msg: KS.t('devErrCharName') };
    const id = findCharacter(name);
    if (!id) return { ok: false, msg: KS.t('devErrChar', name) };
    if (!KS.Unlocks) return { ok: false, msg: KS.t('devErrCmd', 'character') };
    let ok, msg;
    if (mod === 'unlock') {
      ok = KS.Unlocks.unlock(id);
      msg = ok ? KS.t('devCharUnlocked', charDisplayName(id))
               : KS.t('devCharAlready', charDisplayName(id));
    } else {
      ok = KS.Unlocks.lock(id);
      msg = ok ? KS.t('devCharLocked', charDisplayName(id))
               : KS.t('devCharNotUnlocked', charDisplayName(id));
    }
    return { ok, msg };
  }

  /* ---------------- commands ---------------- */
  function cmdStat(game, tok) {
    const st = resolveStat(game, tok[0]);
    if (!st) return { ok: false, msg: KS.t('devErrStat', tok[0] || '') };
    const mod = (tok[1] || '').toLowerCase();
    if (!STAT_MODS.includes(mod)) {
      return { ok: false, msg: KS.t('devErrMod', mod || '', STAT_MODS.join(', ')) };
    }
    const raw = tok[2];
    let val = NaN;
    if (mod === 'add' || mod === 'multiply' || mod === 'set') {
      if (!isNum(raw)) return { ok: false, msg: KS.t('devErrValue', raw || '') };
      val = Number(raw);
      if (!Number.isFinite(val)) return { ok: false, msg: KS.t('devErrValue', raw) };
    }

    pushUndo('stats', snapStats(game), restoreStats);

    if (st.special) {                       /* ---- current HP ---- */
      const p = game.player;
      if (mod === 'add') p.hp = Math.max(0, Math.min(p.maxHP, p.hp + val));
      else if (mod === 'multiply') p.hp = Math.max(0, Math.min(p.maxHP, p.hp * val));
      else if (mod === 'set') p.hp = Math.max(0, Math.min(p.maxHP, val));
      else if (mod === 'disable') { p.noDamage = true; }
      else if (mod === 'enable') { p.noDamage = false; }
      const cur = p.noDamage ? KS.t('devNoDamage') : String(Math.round(p.hp));
      return { ok: true, msg: KS.t('devStatOk', 'HP', mod, cur) };
    }

    const key = st.key;
    game.__devOff = game.__devOff || {};
    if (mod === 'add') game.stats[key] = statValue(game, key) + val;
    else if (mod === 'multiply') game.stats[key] = statValue(game, key) * val;
    else if (mod === 'set') game.stats[key] = val;
    else if (mod === 'disable') {
      if (key in game.__devOff) return { ok: false, msg: KS.t('devAlreadyOff', key) };
      game.__devOff[key] = statValue(game, key);
      game.stats[key] = 0;
    } else if (mod === 'enable') {
      if (!(key in game.__devOff)) return { ok: false, msg: KS.t('devNotOff', key) };
      game.stats[key] = game.__devOff[key];
      delete game.__devOff[key];
    }
    if (key === 'maxHP') {
      game.player.refreshMaxHp(game.stats);
      game.player.hp = Math.min(game.player.hp, game.player.maxHP);
    }
    return { ok: true, msg: KS.t('devStatOk', key, mod,
      String(Math.round(statValue(game, key) * 100) / 100)) };
  }

  function cmdWeapon(game, tok) {
    const mods = ['add', 'set', 'remove'];
    const isMod = (t) => mods.includes(String(t || '').toLowerCase());
    const isSlot = (t) => /^[1-6]$/.test(String(t));
    let mode, slotArg = null, nameArg = null;
    if (isMod(tok[0])) {
      mode = tok[0].toLowerCase();
      /* set takes the slot right after the modifier: /weapon set 1 Sword */
      if (mode === 'set' && isSlot(tok[1])) {
        slotArg = Number(tok[1]); nameArg = tok[2];
      } else {
        nameArg = tok[1];
      }
    } else if (isSlot(tok[0]) && isMod(tok[1])) {
      slotArg = Number(tok[0]); mode = tok[1].toLowerCase(); nameArg = tok[2];
    } else {
      return { ok: false, msg: KS.t('devErrMod', tok[0] || '', mods.join(', ')) };
    }
    const owned = game.weapons;
    if (mode === 'add') {
      const id = findWeapon(nameArg);
      if (!id) return { ok: false, msg: KS.t('devErrWeapon', nameArg || '') };
      if (owned.some((w) => w.def.id === id)) {
        return { ok: false, msg: KS.t('devErrDup', weaponDisplayName(id)) };
      }
      if (owned.length >= C.MAX_WEAPONS) {
        return { ok: false, msg: KS.t('weaponsFull') };
      }
      pushUndo('weapons', snapWeapons(game), restoreWeapons);
      game.buyWeapon(id, 1);
      return { ok: true, msg: KS.t('devWeaponAdd', weaponDisplayName(id)) };
    }
    if (mode === 'set') {
      /* target slot: explicit arg, else the weapon being replaced */
      let slot = slotArg;
      if (slot == null) return { ok: false, msg: KS.t('devErrSlot') };
      if (slot < 1 || slot > owned.length) {
        return { ok: false, msg: KS.t('devErrSlotRange', slot, owned.length) };
      }
      const id = findWeapon(nameArg);
      if (!id) return { ok: false, msg: KS.t('devErrWeapon', nameArg || '') };
      if (owned[slot - 1].def.id === id) {
        return { ok: false, msg: KS.t('devErrDup', weaponDisplayName(id)) };
      }
      pushUndo('weapons', snapWeapons(game), restoreWeapons);
      game.applyWeaponFx(owned[slot - 1], -1);
      owned[slot - 1] = game.mkWeapon(id, 1);
      game.applyWeaponFx(owned[slot - 1], 1);
      game.player.refreshMaxHp(game.stats);
      return { ok: true, msg: KS.t('devWeaponSet', slot, weaponDisplayName(id)) };
    }
    /* remove: by weapon name or slot */
    let idx = -1;
    if (slotArg != null) idx = slotArg - 1;
    else {
      const id = findWeapon(nameArg);
      if (!id) return { ok: false, msg: KS.t('devErrWeapon', nameArg || '') };
      idx = owned.findIndex((w) => w.def.id === id);
    }
    if (idx < 0 || idx >= owned.length) {
      return { ok: false, msg: KS.t('devErrWeapon', nameArg || '') };
    }
    if (owned.length <= 1) return { ok: false, msg: KS.t('lastWeapon') };
    pushUndo('weapons', snapWeapons(game), restoreWeapons);
    const name = weaponDisplayName(owned[idx].def.id);
    game.applyWeaponFx(owned[idx], -1);
    owned.splice(idx, 1);
    game.player.refreshMaxHp(game.stats);
    game.player.hp = Math.min(game.player.hp, game.player.maxHP);
    return { ok: true, msg: KS.t('devWeaponRemove', name) };
  }

  function cmdItem(game, tok) {
    const mods = ['add', 'set', 'remove'];
    let mod, nameArg, valArg;
    if (mods.includes(String(tok[0] || '').toLowerCase())) {
      mod = tok[0].toLowerCase(); nameArg = tok[1]; valArg = tok[2];
    } else if (mods.includes(String(tok[1] || '').toLowerCase())) {
      nameArg = tok[0]; mod = tok[1].toLowerCase(); valArg = tok[2];
    } else {
      return { ok: false, msg: KS.t('devErrMod', tok[0] || '', mods.join(', ')) };
    }
    const id = findItem(nameArg);
    if (!id) return { ok: false, msg: KS.t('devErrItem', nameArg || '') };
    const def = KS.Shop.itemDef(id);
    let n = 1;
    if (mod !== 'remove' || valArg != null) {
      if (!isNum(valArg)) return { ok: false, msg: KS.t('devErrValue', valArg || '') };
      n = Math.floor(Number(valArg));
      if (n < 0 || n > 999) return { ok: false, msg: KS.t('devErrValue', valArg) };
    }

    pushUndo('items', snapItems(game), restoreItems);

    const have = itemCount(game, id);
    if (mod === 'add') {
      for (let i = 0; i < n; i++) game.buyItem(def);
    } else if (mod === 'set') {
      if (n > have) for (let i = have; i < n; i++) game.buyItem(def);
      else if (n < have) removeItemCopies(game, id, have - n);
    } else {
      const target = valArg == null ? have : Math.min(n, have);
      removeItemCopies(game, id, target);
    }
    const result = itemCount(game, id);
    game.player.refreshMaxHp(game.stats);
    game.player.hp = Math.min(game.player.hp, game.player.maxHP);
    return { ok: true, msg: KS.t('devItemOk', itemDisplayName(def), String(result)) };
  }

  function cmdReset(game, tok) {
    const cat = String(tok[0] || '').toLowerCase();
    if (!RESET_CATS.includes(cat)) {
      return { ok: false, msg: KS.t('devErrCat', tok[0] || '', RESET_CATS.join(', ')) };
    }
    const charName = game.charDef.name;
    if (cat === 'stats') {
      pushUndo('stats', snapStats(game), restoreStats);
    } else if (cat === 'weapons') {
      pushUndo('weapons', snapWeapons(game), restoreWeapons);
    } else if (cat === 'items') {
      pushUndo('items', snapItems(game), restoreItems);
    } else if (cat === 'health') {
      pushUndo('health', { hp: game.player.hp, noDamage: !!game.player.noDamage },
        (g, s) => { g.player.hp = Math.min(s.hp, g.player.maxHP); g.player.noDamage = s.noDamage; });
    } else if (cat === 'materials') {
      pushUndo('materials', game.materials, (g, m) => { g.materials = m; });
    } else if (cat === 'all') {
      pushUndo('all', snapAll(game), restoreAll);
    }

    if (cat === 'stats') rebuildStats(game);
    else if (cat === 'weapons') { resetWeaponsArr(game); rebuildStats(game); }
    else if (cat === 'items') { game.ownedItems = []; rebuildStats(game); }
    else if (cat === 'health') { game.player.hp = game.player.maxHP; game.player.noDamage = false; }
    else if (cat === 'materials') game.materials = 0;
    else if (cat === 'all') {
      game.ownedItems = [];
      resetWeaponsArr(game);
      rebuildStats(game);
      game.materials = 0;
    }
    return { ok: true, msg: KS.t('devResetOk', cat, String(charName)) };
  }

  function cmdUndo(game, tok) {
    const cat = String(tok[0] || '').toLowerCase();
    const cats = RESET_CATS;
    if (!cats.includes(cat)) {
      return { ok: false, msg: KS.t('devErrCat', tok[0] || '', cats.join(', ')) };
    }
    let idx = -1;
    for (let i = history.length - 1; i >= 0; i--) {
      if (cat === 'all' || history[i].cat === cat) { idx = i; break; }
    }
    if (idx < 0) return { ok: false, msg: KS.t('devNothingUndo', cat) };
    const entry = history.splice(idx, 1)[0];
    entry.restore(game, entry.snapshot);
    return { ok: true, msg: KS.t('devUndoOk', entry.cat) };
  }

  /* ---------------- entry point ---------------- */
  function exec(game, line) {
    try {
      const tok = String(line || '').trim().replace(/^\//, '').split(/\s+/).filter(Boolean);
      if (!tok.length) return { ok: false, msg: KS.t('devErrEmpty') };
      const cmd = tok[0].toLowerCase();
      const args = tok.slice(1);
      /* v0.11 §8: /character unlock|lock works on the character select
         screen too — it only touches the persistent unlock store, so
         no live game is required for it */
      if (cmd === 'character') return cmdCharacter(game, args);
      if (!game || !game.running) return { ok: false, msg: KS.t('devNoGame') };
      if (cmd === 'stat') return cmdStat(game, args);
      if (cmd === 'weapon') return cmdWeapon(game, args);
      if (cmd === 'item') return cmdItem(game, args);
      if (cmd === 'reset') return cmdReset(game, args);
      if (cmd === 'undo') return cmdUndo(game, args);
      return { ok: false, msg: KS.t('devErrCmd', cmd) };
    } catch (err) {
      return { ok: false, msg: KS.t('devErrCrash', String(err && err.message || err)) };
    }
  }

  /* ---------------- suggestions (Minecraft-style) ---------------- */
  function filterOpts(opts, partial) {
    const p = String(partial || '').toLowerCase();
    return opts.filter((o) => !p || o.label.toLowerCase().startsWith(p));
  }
  function statOpts(game, partial) {
    const seen = new Set();
    const opts = [];
    const add = (key, label) => {
      if (seen.has(label)) return;
      seen.add(label);
      opts.push({ label, desc: KS.t('devCurVal', String(statValue(game, key))) });
    };
    for (const k of statKeys(game)) add(k, k);
    add('HP', 'hp');
    for (const [a, k] of Object.entries(STAT_ALIASES)) {
      if (k === 'HP') continue;
      if (statKeys(game).includes(k)) add(k, a);
    }
    return filterOpts(opts, partial);
  }
  function weaponOpts(game, partial, ownedOnly) {
    const ids = ownedOnly
      ? [...new Set(game.weapons.map((w) => w.def.id))]
      : Object.keys(C.WEAPONS);
    return filterOpts(ids.map((id) => ({
      label: weaponDisplayName(id), desc: KS.t('devWeaponDesc'),
    })), partial);
  }
  function itemOpts(partial) {
    return filterOpts(KS.Shop.ITEMS.map((it) => ({
      label: itemDisplayName(it), desc: KS.t('devItemDesc'),
    })), partial);
  }
  function modOpts(partial) {
    return filterOpts(STAT_MODS.map((m) => ({ label: m, desc: KS.t('devMod_' + m) })), partial);
  }
  const WMODS = ['add', 'set', 'remove'];
  function wmodOpts(partial) {
    return filterOpts(WMODS.map((m) => ({ label: m, desc: KS.t('devMod_' + m) })), partial);
  }
  function slotOpts(game, partial, ownedOnly) {
    const max = ownedOnly ? game.weapons.length : C.MAX_WEAPONS;
    const opts = [];
    for (let i = 1; i <= max; i++) {
      const w = game.weapons[i - 1];
      opts.push({ label: String(i), desc: w ? weaponDisplayName(w.def.id) : KS.t('devSlotEmpty') });
    }
    return filterOpts(opts, partial);
  }
  function catOpts(partial) {
    return filterOpts(RESET_CATS.map((c) => ({ label: c, desc: KS.t('devCat_' + c) })), partial);
  }

  function suggest(game, line) {
    const body = String(line || '').replace(/^\//, '');
    const endsSpace = body === '' || /\s$/.test(body);
    const tok = body.split(/\s+/).filter(Boolean);
    const cmd = (tok[0] || '').toLowerCase();
    const partial = endsSpace ? '' : (tok[tok.length - 1] || '');
    const pos = endsSpace ? tok.length : tok.length - 1;   // 0 = command
    let items = [];

    if (pos === 0) {
      const cmds = [
        { label: 'stat', desc: KS.t('devCmd_stat') },
        { label: 'weapon', desc: KS.t('devCmd_weapon') },
        { label: 'item', desc: KS.t('devCmd_item') },
        { label: 'reset', desc: KS.t('devCmd_reset') },
        { label: 'undo', desc: KS.t('devCmd_undo') },
        { label: 'character', desc: KS.t('devCmd_character') },
      ];
      items = filterOpts(cmds, partial);
    } else if (cmd === 'character') {
      if (pos === 1) items = filterOpts(['unlock', 'lock'].map((m) => ({
        label: m, desc: KS.t('devCmd_character') })), partial);
      else if (pos >= 2) {
        /* suggest full names (they contain spaces) */
        const CH = (KS.CONFIG && KS.CONFIG.CHARACTERS) || {};
        items = filterOpts(Object.keys(CH).map((id) => ({
          label: KS.L(CH[id].name), desc: KS.t('devCurVal', id) })), partial);
      }
    } else if (cmd === 'stat') {
      if (pos === 1) items = statOpts(game, partial);
      else if (pos === 2) items = modOpts(partial);
      else if (pos === 3) {
        const mod = String(tok[2] || '').toLowerCase();
        items = (mod === 'disable' || mod === 'enable')
          ? [] : filterOpts([1, 5, 10, 50, 100].map((v) => ({
              label: String(v), desc: KS.t('devValHint') })), partial);
      }
    } else if (cmd === 'weapon') {
      const t1 = String(tok[1] || '');
      if (pos === 1) {
        items = wmodOpts(partial).concat(slotOpts(game, partial, false));
      } else if (pos === 2) {
        if (/^[1-6]$/.test(t1)) items = wmodOpts(partial);
        else if (t1.toLowerCase() === 'add') items = weaponOpts(game, partial, false);
        else if (t1.toLowerCase() === 'set') items = slotOpts(game, partial, true);
        else if (t1.toLowerCase() === 'remove') {
          items = weaponOpts(game, partial, true).concat(slotOpts(game, partial, true));
        }
      } else if (pos === 3) {
        items = weaponOpts(game, partial, t1.toLowerCase() === 'remove');
      }
    } else if (cmd === 'item') {
      const t1 = String(tok[1] || '');
      const mods = ['add', 'set', 'remove'];
      if (pos === 1) items = wmodOpts(partial).concat(itemOpts(partial));
      else if (pos === 2) {
        if (mods.includes(t1.toLowerCase())) items = itemOpts(partial);
        else items = wmodOpts(partial);
      } else if (pos === 3) {
        items = filterOpts([1, 5, 10].map((v) => ({
          label: String(v), desc: KS.t('devValHint') })), partial);
      }
    } else if (cmd === 'reset' || cmd === 'undo') {
      if (pos === 1) items = catOpts(partial);
    }
    return {
      items,
      desc: items.length ? items[0].desc : '',
    };
  }

  return { exec, suggest, resolveStat, statValue, history,
    resetHistory: () => { history.length = 0; },
    RESET_CATS, STAT_MODS };
})();

/* =========================================================
   DevMode UI — Minecraft-style console overlay
   ========================================================= */
KS.DevMode = (() => {
  let root = null, log = null, input = null, sugBox = null, cmdList = null;
  let open = false;
  let pausedByConsole = false;
  let history_ = [];       // executed command lines
  let histIdx = -1;
  let sugIdx = -1;
  let sugItems = [];
  let getGame = () => null;
  let settingsRow = null;

  const CMDS = [
    { name: 'stat', key: 'devCmd_stat' },
    { name: 'weapon', key: 'devCmd_weapon' },
    { name: 'item', key: 'devCmd_item' },
    { name: 'reset', key: 'devCmd_reset' },
    { name: 'undo', key: 'devCmd_undo' },
  ];

  function t(key, ...args) { return KS.t(key, ...args); }

  function buildDOM() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'devconsole';
    root.className = 'hidden';
    root.innerHTML = `
      <div class="dc-panel">
        <div class="dc-head"><span>${t('devTitle')}</span>
          <span class="dc-hint">${t('devHint')}</span></div>
        <div class="dc-body">
          <div class="dc-log" id="dc-log"></div>
          <div class="dc-cmds" id="dc-cmds"></div>
        </div>
        <div class="dc-suggest hidden" id="dc-suggest"></div>
        <div class="dc-inputrow">
          <span class="dc-prompt">/</span>
          <input id="dc-input" type="text" dir="ltr" autocomplete="off"
            spellcheck="false" placeholder="${t('devPlaceholder')}">
        </div>
      </div>`;
    document.body.appendChild(root);
    log = root.querySelector('#dc-log');
    input = root.querySelector('#dc-input');
    sugBox = root.querySelector('#dc-suggest');
    cmdList = root.querySelector('#dc-cmds');
    renderCmdList('');

    input.addEventListener('keydown', onInputKey);
    input.addEventListener('input', () => refreshSuggestions(true));
    /* clicking outside the input never executes a command */
    root.addEventListener('pointerdown', (e) => {
      if (e.target !== input) { input.focus(); e.preventDefault(); }
    });
  }

  function renderCmdList(activePrefix) {
    if (!cmdList) return;
    const p = String(activePrefix || '').toLowerCase();
    cmdList.innerHTML = CMDS.map((c) => `
      <div class="dc-cmd ${c.name.startsWith(p) ? 'active' : ''}">
        <b>/${c.name}</b><span>${t(c.key)}</span>
      </div>`).join('');
  }

  function pushLog(text, cls) {
    const line = document.createElement('div');
    line.className = 'dc-line ' + (cls || '');
    line.textContent = text;
    log.appendChild(line);
    while (log.children.length > 40) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }

  function refreshSuggestions(refocus) {
    const game = getGame();
    const text = input.value;
    sugItems = [];
    sugIdx = -1;
    if (text.trim() && (game || /^\/?character/i.test(text.trim()))) {
      const s = KS.DevCmd.suggest(game, text);
      sugItems = s.items || [];
    }
    if (!sugItems.length) {
      sugBox.classList.add('hidden');
      sugBox.innerHTML = '';
    } else {
      sugBox.classList.remove('hidden');
      sugBox.innerHTML = sugItems.map((it, i) => `
        <div class="dc-sug ${i === 0 ? 'sel' : ''}" data-i="${i}">
          <b>${it.label}</b><span>${it.desc}</span>
        </div>`).join('');
      sugIdx = 0;
      sugBox.querySelectorAll('.dc-sug').forEach((el) => {
        el.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          completeSuggestion(Number(el.dataset.i));
        });
      });
    }
    renderCmdList(text.replace(/^\//, '').split(/\s+/)[0] || '');
    if (refocus) input.focus();
  }

  function highlightSuggestion() {
    sugBox.querySelectorAll('.dc-sug').forEach((el, i) => {
      el.classList.toggle('sel', i === sugIdx);
    });
  }

  function completeSuggestion(idx) {
    const it = sugItems[idx];
    if (!it) return;
    const body = input.value.replace(/^\//, '');
    const tok = body.split(/\s+/);
    const endsSpace = body === '' || /\s$/.test(body);
    if (endsSpace) tok.push(it.label);
    else tok[tok.length - 1] = it.label;
    input.value = '/' + tok.filter(Boolean).join(' ') + ' ';
    refreshSuggestions(true);
  }

  function onInputKey(e) {
    e.stopPropagation();                    /* game never sees these keys */
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      runCommand(input.value);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (sugIdx >= 0) completeSuggestion(sugIdx);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (sugItems.length && sugIdx < sugItems.length - 1) {
        sugIdx++; highlightSuggestion();
      } else if (histIdx < history_.length - 1) {
        histIdx++; input.value = history_[histIdx]; refreshSuggestions(false);
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (sugItems.length && sugIdx > 0) {
        sugIdx--; highlightSuggestion();
      } else if (history_.length && histIdx > 0) {
        histIdx--; input.value = history_[histIdx]; refreshSuggestions(false);
      } else if (history_.length && histIdx === -1) {
        histIdx = history_.length - 1; input.value = history_[histIdx];
        refreshSuggestions(false);
      }
      return;
    }
    /* any other key: suggestions refresh on the 'input' event */
  }

  function runCommand(line) {
    const text = String(line || '').trim();
    if (!text || text === '/') return;   // a lone prefix is not a command
    history_.push(text);
    if (history_.length > 40) history_.shift();
    histIdx = -1;
    pushLog('> ' + text, 'cmd');
    const game = getGame();
    const res = KS.DevCmd.exec(game, text);
    pushLog(res.msg, res.ok ? 'ok' : 'err');
    input.value = '';
    refreshSuggestions(false);
    input.focus();
    /* v0.11 §8: a successful /character unlock|lock refreshes the
       character select screen immediately (locked chips + preview) */
    if (res.ok && /^\/?character\s/i.test(text)) {
      const chars = document.getElementById('characters');
      if (chars && chars.classList.contains('visible') &&
          typeof window.KSREFRESH_CHARS === 'function') {
        window.KSREFRESH_CHARS();
      }
    }
  }

  function gameContextOK() {
    /* v0.11 §8: the console also opens on the CHARACTER SELECT screen */
    const chars = document.getElementById('characters');
    if (chars && chars.classList.contains('visible')) return true;
    const game = getGame();
    if (!game || !game.running || game.over) return false;
    /* inside an active round OR the between-wave shop */
    if (game.state === 'wave') return true;
    const shop = document.getElementById('shop');
    if (shop && shop.classList.contains('visible')) return true;
    return false;
  }

  function openConsole() {
    if (open || !enabled()) return;
    buildDOM();
    open = true;
    root.classList.remove('hidden');
    const game = getGame();
    if (game && game.running && game.state === 'wave' && !game.paused) {
      pausedByConsole = true;
      game.paused = true;               /* freeze timer + enemies while typing */
    }
    pushLog(t('devWelcome'), 'ok');
    /* the command prefix is typed automatically — start typing the
       command name immediately (spec §2) */
    input.value = '/';
    refreshSuggestions(true);
  }

  function close() {
    if (!open) return;
    open = false;
    if (root) root.classList.add('hidden');
    if (pausedByConsole) {
      pausedByConsole = false;
      const game = getGame();
      if (game) game.paused = false;
    }
  }

  function enabled() {
    return !!(KS.Settings && KS.Settings.get().devMode);
  }

  /* E toggles the console (spec §2): open -> close -> open... Escape
     also closes. Capture phase so the game's own E hotkey (shop lock)
     never fights the console. Only during a round or in the shop,
     only while Dev Mode is enabled. */
  function onWindowKey(e) {
    /* Escape closes the console regardless of keyboard focus */
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.code !== 'KeyE') return;
    /* typing in the command input: E is a letter unless the input is
       still untouched (bare auto-prefix), then E closes */
    if (e.target === input) {
      if (open && input.value === '/') { e.preventDefault(); close(); }
      return;
    }
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (open) { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (!enabled() || !gameContextOK()) return;
    e.preventDefault();
    e.stopPropagation();               // the shop-lock hotkey must not fire
    openConsole();
  }

  /* Dev Mode toggle row is visible ONLY while Hebrew is selected;
     visibility and the persisted state are independent */
  function syncVisibility() {
    if (!settingsRow) settingsRow = document.getElementById('row-devmode');
    if (!settingsRow) return;
    const he = (KS.Settings.get().language || 'en') === 'he';
    settingsRow.style.display = he ? '' : 'none';
  }

  return {
    init(opts) {
      getGame = (opts && opts.getGame) || getGame;
      buildDOM();
      window.addEventListener('keydown', onWindowKey, true);  // capture
      syncVisibility();
    },
    open: openConsole,
    close,
    isOpen: () => open,
    enabled,
    syncVisibility,
    /* test hook: run a command without the UI */
    runForTest: (line) => KS.DevCmd.exec(getGame(), line),
  };
})();
