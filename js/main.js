/* =========================================================
   Boot: asset loading, screen flow, settings UI, pause menu,
   wave-break flow (banner -> Level Up -> Shop) & HUD binding.
   Flow: Menu -> RUN OPTIONS -> Characters -> Weapons ->
         (Co-Op: P2 characters -> P2 weapons) -> Difficulty -> Run ->
         (Pause) / (Wave end: WAVE COMPLETED -> crates -> LEVEL UP
         (P1 then P2) -> SHOP (P1 turn then P2 turn) -> next wave)
         -> Death / Victory

   v0.10 — TRUE FULL-INTERFACE SPLIT SCREEN:
   every player-specific interface element lives inside a per-player
   root (#pu0 = left half / full screen solo, #pu1 = right half in
   co-op). Shop, level-up, crate, pause and death screens all have
   one independent panel per player, positioned inside that player's
   own half (interface centers at 25% / 75% of the window). During
   level-up and shop the turn belongs to ONE player at a time: P1
   first, then P2; the inactive half darkens ~28%, blurs slightly
   and is non-interactive (enforced in logic, not just visuals).
   ========================================================= */
window.KS = window.KS || {};
(function () {
  const $ = (id) => document.getElementById(id);
  const C = KS.CONFIG;

  const ASSETS = {
    menuImg:  'assets/MenuBackground.jpg',
    map:      'assets/MapBackground.jpg',
    portrait: 'assets/KensingerBalanced.png',
    fist:     'assets/fistAttack.png',
    hand:     'assets/handAttack.png',     // replaced hand attack visual (spec §5)
    knife:    'assets/knifeAttack.png',    // knife attack visual (spec §6)
    /* v0.11 §1: the five new ranged weapons */
    pistol:    'assets/pistol.png',
    smg:       'assets/smg.png',
    shredder:  'assets/shredder.png',
    revolver:  'assets/revolver.png',
    shuriken:  'assets/shuriken.png',
    turretT1: 'assets/buildersTurretT1.png',
    turretT2: 'assets/buildersTurretT2.png',
    turretT3: 'assets/buildersTurretT3.png',
    turretT4: 'assets/buildersTurretT4.png',
    /* enemy sprites (drawn by js/enemies.js) */
    eIphone:  'assets/enemies/iphone.png',
    eCamera:  'assets/enemies/camera.png',
    eChatgpt: 'assets/enemies/chatgpt.png',
    eToilet:  'assets/enemies/toilet.png',
    eGemini:  'assets/enemies/gemini.png',
    eTiktok:  'assets/enemies/tiktok.png',
    eClaude:  'assets/enemies/claude.png',
    eDrugs:   'assets/enemies/drugs.png',
    eAirpods: 'assets/enemies/airpods.png',   // v0.9 §9: one complete pair
  };

  /* ---------------- run selection state ---------------- */
  let currentChar = null;
  /* preloaded portrait images per character id (filled in boot) */
  const charPortraits = {};
  let currentWeaponId = null;
  let currentDifficulty = 0;
  /* v0.10 §1: Co-Op defaults to OFF — a normal run is always
     single-player unless the player explicitly enables it here */
  const runSettings = { map: 'plains', endless: false, coop: false };

  let game = null;
  let paused = false;
  /* v0.10 §8: co-op selection sequence — P1 character, P1 weapon,
     P2 character, P2 weapon, run. pickStage drives BACK routing,
     panel positioning (picking player's half) and the pick banner. */
  let pickStage = null;          // null | 'p1char' | 'p1weapon' | 'p2char' | 'p2weapon'
  let mpSel = null;              // co-op selections: { chars:[c1,c2], weapons:[w1,w2], difficulty }
  let luPlayerIdx = 0;           // whose level-up turn it is
  let crPlayerIdx = 0;           // whose crate rewards are open
  let shopTurn = 0;              // v0.10 §5: whose SHOP turn it is
  const shopState = [            // per-player shop session state
    { entries: null, rerolls: 0, last: null, done: false, visitsNoTurret: 0 },
    { entries: null, rerolls: 0, last: null, done: false, visitsNoTurret: 0 },
  ];
  const hoveredShopBy = [0, 0];  // hovered card index per player
  let mpCharsAtEnd = [];         // for run-end records
  let statsTab = 'primary';
  let debugOn = false;             // enemy-system debug overlay (toggle: B)
  let confirmAction = null;
  let lastTimerSec = -1;
  const lastTimerBy = [-1, -1];
  const lastKillsBy = [-1, -1];
  const lastMaterialsBy = [-1, -1];
  const lastWaveBy = [-1, -1];

  /* break-flow state */
  let bannerTimer = null;
  let typeTimer = null;
  const luRerollsBy = [0, 0];      // level-up rerolls per player
  const luChoicesBy = [[], []];    // current choices per player
  let luChoices = [];              // active player's choices (compat alias)
  let wmIndex = -1;
  let wmPlayer = null;
  let markerDotX = [];

  const fmtTime = (s) => {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  };

  /* =========================================================
     Small helpers
     ========================================================= */
  function toast(msg, ms = 1800) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden', 'fade');
    clearTimeout(toast._h);
    toast._h = setTimeout(() => t.classList.add('fade'), ms);
    clearTimeout(toast._h2);
    toast._h2 = setTimeout(() => t.classList.add('hidden'), ms + 300);
  }

  function hideTooltip() { $('tooltip').classList.add('hidden'); }
  function showTooltip(html, x, y) {
    const tt = $('tooltip');
    tt.innerHTML = html;
    tt.classList.remove('hidden');
    const r = tt.getBoundingClientRect();
    let px = x + 16, py = y + 16;
    if (px + r.width > window.innerWidth - 8) px = x - r.width - 12;
    if (py + r.height > window.innerHeight - 8) py = y - r.height - 12;
    tt.style.left = px + 'px';
    tt.style.top = py + 'px';
  }

  /* v0.10 §8: the pick banner sits over the PICKING player's half */
  function showPickBanner(text, isP2) {
    const b = $('pick-banner');
    if (!text) { b.classList.add('hidden'); return; }
    b.textContent = text;
    b.classList.toggle('p2', !!isP2);
    b.classList.toggle('right', !!isP2);
    b.classList.toggle('left', !isP2);
    b.classList.remove('hidden');
  }

  /* position the pick panel in the picking player's half + dim the
     other half; solo keeps the original centered layout untouched */
  function applyPickUi() {
    for (const scr of ['characters', 'weapons', 'difficulty']) {
      $(scr).classList.remove('pick-left', 'pick-right');
    }
    if (!runSettings.coop || !pickStage) { showPickBanner(null); return; }
    const isP2 = pickStage.indexOf('p2') === 0;
    const scr = pickStage.indexOf('char') >= 0 ? 'characters' : 'weapons';
    $(scr).classList.add(isP2 ? 'pick-right' : 'pick-left');
    showPickBanner(
      KS.t(pickStage.indexOf('char') >= 0 ? 'pickCharP' : 'pickWeaponP',
        isP2 ? '2' : '1'),
      isP2);
  }

  function bindBtn(el, fn) {
    if (!el) return;
    el.addEventListener('click', (e) => { KS.Audio.clickSfx(); fn && fn(e); });
    el.addEventListener('mouseenter', () => KS.Audio.hoverSfx());
  }
  function bindHoverSound(el) {
    if (el) el.addEventListener('mouseenter', () => KS.Audio.hoverSfx());
  }
  function bindAll(selector, fn, root) {
    for (const el of (root || document).querySelectorAll(selector)) bindBtn(el, fn);
  }

  /* Icon helper: tries an image file first, falls back to an emoji.
     Lets custom art be dropped into assets/ later without code changes:
       assets/stats/<key>.png            — pause/break stats logos
       assets/upgrades/<key>_t<tier>.png — level-up upgrade images
       assets/items/<id>.png             — shop item icons
     Results are cached so a missing file 404s at most once. */
  const _iconCache = {};
  function makeIcon(src, emoji, cls) {
    if (_iconCache[src] === 'emoji') {
      const span = document.createElement('span');
      if (cls) span.className = cls;
      span.textContent = emoji;
      return span;
    }
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    if (cls) img.className = cls;
    img.onerror = () => {
      _iconCache[src] = 'emoji';
      const span = document.createElement('span');
      if (cls) span.className = cls;
      span.textContent = emoji;
      img.replaceWith(span);
    };
    return img;
  }

  const STAT_LABELS = {
    maxHP: 'Max HP', hpRegen: 'HP Regeneration', lifeSteal: 'Life Steal',
    damage: '% Damage', meleeDMG: 'Melee Damage', rangedDMG: 'Ranged Damage',
    elementalDMG: 'Elemental Damage', attackSpeed: '% Attack Speed',
    critChance: '% Crit Chance', engineering: 'Engineering', range: 'Range',
    armor: 'Armor', dodge: '% Dodge', speedPct: '% Speed', luck: 'Luck',
    harvesting: 'Harvesting', consumableHeal: 'Consumable Heal',
    materialsHealing: '% Materials Healing', xpGain: '% XP Gain',
    pickupRange: '% Pickup Range', itemPrice: '% Item Price',
    explosionDamage: '% Explosion Damage', explosionSize: '% Explosion Size',
    bounces: 'Bounces', piercing: 'Piercing', piercingDamage: '% Piercing Damage',
    bossDamage: '% Damage against bosses', structureAttackSpeed: '% Structure attack speed',
    structureRange: 'Structure Range', burningSpeed: '% Burning Speed',
    burningSpread: 'Burning Spread', knockback: 'Knockback',
    doubleMaterial: '% Double Material Chance', freeRerolls: 'Free Rerolls',
    trees: 'Trees', enemiesPct: '% Enemies', enemySpeedPct: '% Enemy Speed',
    rerollPrice: '% Reroll Price', curse: 'Curse',
  };

  /* =========================================================
     Shared stat text builders
     ========================================================= */
  function charStatLines(ch) {
    const w = C.WEAPONS[ch.startingWeapon];
    const tier = KS.tierInfo(ch.startingWeaponTier);
    const lines = (KS.L(ch.bonusLines) || []).map((b) => [b, '']);
    lines.push([KS.t('startingWeapon'), `${KS.L(w.name)} — ${tier.name}`]);
    return lines;
  }

  function weaponClasses(def) {
    return (def.classes && def.classes.length) ? def.classes.join(', ') : (def.desc || '');
  }

  function weaponStatLines(def, tier) {
    const tdef = def.tiers[tier];
    const info = KS.tierInfo(tier);
    const scalingPct = def.scalingPct == null ? 100 : def.scalingPct;
    const scaleName = def.scalingStat === 'meleeDMG' ? 'Melee DMG' : def.scalingStat;
    const lines = [
      ['Tier', { text: `T${tier} · ${info.name}`, color: info.color }],
      ['Damage', `${tdef.damage} (${scalingPct}% ${scaleName})`],
      ['Attack Speed', `${tdef.cooldown}s`],
      ['DPS', `${(tdef.damage / tdef.cooldown).toFixed(1)} (${Math.floor(scalingPct / tdef.cooldown)}%)/s`],
      ['Crit', `x${def.critMult} damage, ${Math.round(def.critChance * 100)}% chance`],
      ['Range', def.range],
      ['Knockback', def.knockback],
      ['Lifesteal', def.lifesteal || 0],
    ];
    /* v0.11 §1: magazine + reload rows (shuriken: none — the attack
       interval alone limits it) */
    const M = C.MAGS && C.MAGS[def.id];
    if (M) {
      lines.push(['Magazine', M.mag[tier - 1]]);
      lines.push(['Reload', `${M.reload[tier - 1]}s`]);
    }
    if (tdef.special) lines.push(['Effect', { text: tdef.special, color: '#7fe694' }]);
    return lines;
  }

  function renderStatLines(el, lines) {
    el.innerHTML = '';
    for (const [k, v] of lines) {
      const row = document.createElement('div');
      row.className = 'stat-line';
      const isObj = v && typeof v === 'object';
      /* bonus lines carry their own text and no right-hand value */
      row.innerHTML = `<span>${k}</span>` +
        (v === '' ? '' : `<b ${isObj ? `style="color:${v.color}"` : ''}>${isObj ? v.text : v}</b>`);
      el.appendChild(row);
    }
  }

  function weaponTooltipHtml(def, tier) {
    const info = KS.tierInfo(tier);
    const rows = weaponStatLines(def, tier)
      .map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:18px">
        <span style="opacity:.65">${k}</span><b>${typeof v === 'object' ? v.text : v}</b></div>`).join('');
    return `<div class="tt-title" style="color:${info.color}">${KS.L(def.name)} — T${tier} ${info.name}</div>
      <div style="opacity:.75;font-style:italic;margin-bottom:5px">${weaponClasses(def)}</div>${rows}`;
  }

  function itemTooltipHtml(itemDef) {
    const info = KS.tierInfo(itemDef.tier);
    const fx = itemDef.fx.map(([k, v]) =>
      `<div style="color:#8f8">+${v} ${SL(k)}</div>`).join('');
    return `<div class="tt-title" style="color:${info.color}">${itemDef.icon} ${KS.L(itemDef.name)} — T${itemDef.tier} ${info.name}</div>${fx}`;
  }

  /* =========================================================
     Screens
     ========================================================= */
  function setScreen(name) {
    for (const s of ['menu', 'settings', 'play', 'characters', 'weapons', 'difficulty'])
      $(s).classList.toggle('visible', s === name);
    $('hud').classList.toggle('visible', name === 'game');
    $('pause').classList.remove('visible', 'confirming');
    $('levelup').classList.remove('visible');
    $('shop').classList.remove('visible');
    $('gameover').classList.remove('visible');
    $('cratereward').classList.remove('visible');
    $('wavebanner').classList.add('hidden');
    $('pm-confirm').classList.add('hidden');
    closeWeaponManage();
    hideTooltip();
    closeMapList();
  }
  const showMenu       = () => { pickStage = null; mpSel = null; setScreen('menu'); applyPickUi(); KS.applyI18n(); };
  const showSettings   = () => { setScreen('settings'); KS.applyI18n(); };
  /* v0.10 §8: the RUN OPTIONS screen sits between the menu and the
     character select (BACK from character selection returns here) */
  const showPlay       = () => { pickStage = null; setScreen('play'); applyPickUi(); KS.applyI18n(); };

  /* ---------------- P1 character select ---------------- */
  function showCharacters() {
    pickStage = 'p1char';
    setScreen('characters');
    applyPickUi();
    buildCharSlots();
    /* preview the CHOSEN character (defaults to Kensinger only before
       any pick has been made this session) */
    const ch = currentChar || C.CHARACTERS.balanced;
    updateCharPreview(ch);
    updateRecordBox(ch);
  }

  /* ---------------- P1 weapon select ---------------- */
  function showWeapons() {
    pickStage = 'p1weapon';
    if (mpSel && mpSel.chars[0]) currentChar = mpSel.chars[0];   // BACK from P2
    setScreen('weapons');
    applyPickUi();
    $('ws-char-img').src = currentChar.portrait;
    $('ws-char-title').textContent = currentChar.name;
    renderStatLines($('ws-char-stats'), charStatLines(currentChar));
    buildWeaponSlots();
    updateWeaponBox(C.WEAPONS[currentChar.startingWeapon], currentChar.startingWeaponTier);
  }

  /* ---------------- P2 character select (co-op) ---------------- */
  function showCharacters2() {
    pickStage = 'p2char';
    setScreen('characters');
    applyPickUi();
    buildCharSlots();
    const ch = (mpSel && mpSel.chars[1]) || C.CHARACTERS.balanced;
    updateCharPreview(ch);
    updateRecordBox(ch);
  }

  /* ---------------- P2 weapon select (co-op) ---------------- */
  function showWeapons2() {
    pickStage = 'p2weapon';
    if (mpSel && mpSel.chars[1]) currentChar = mpSel.chars[1];
    setScreen('weapons');
    applyPickUi();
    $('ws-char-img').src = currentChar.portrait;
    $('ws-char-title').textContent = currentChar.name;
    renderStatLines($('ws-char-stats'), charStatLines(currentChar));
    buildWeaponSlots();
    updateWeaponBox(C.WEAPONS[currentChar.startingWeapon], currentChar.startingWeaponTier);
  }

  /* ---------------- difficulty select ---------------- */
  function showDifficulty() {
    pickStage = null;
    setScreen('difficulty');
    applyPickUi();
    $('ds-char-img').src = currentChar.portrait;
    $('ds-char-title').textContent = currentChar.name;
    renderStatLines($('ds-char-stats'), charStatLines(currentChar));
    buildDiffSlots();
    updateDiffBox(currentDifficulty);
  }

  /* =========================================================
     Character select screen
     ========================================================= */
  const SLOT_COUNT = 12;

  /* localized stat display name (stat_<key> in i18n, English fallback) */
  const SL = (k) => {
    const key = 'stat_' + k;
    const s = KS.t(key);
    return (s && s !== key) ? s : (STAT_LABELS[k] || k);
  };

  /* v0.10 §11: visible-size normalization on the select screens —
     the slot/preview art scales by the same measured factor as the
     in-game sprite, so switching characters never looks smaller */
  function applyCharScale(img, id, basePct) {
    const sc = (KS.CharScale && KS.CharScale[id]) || 1;
    const pct = Math.min(100, Math.round(basePct * sc));
    img.style.maxWidth = pct + '%';
    img.style.maxHeight = pct + '%';
  }

  function buildCharSlots() {
    const row = $('char-slots');
    row.innerHTML = '';
    /* highlight the stage-appropriate pick: P2's slot during their
       phase, P1's otherwise */
    const selId = (pickStage === 'p2char' && mpSel && mpSel.chars[1])
      ? mpSel.chars[1].id
      : (currentChar && currentChar.id);

    /* v0.11 §10: RANDOM KENSINGER — picks one random character from
       THIS player's own unlocked list and selects it immediately
       (locked characters are never picked). If only one character is
       unlocked, that one is selected — never an error. The pick is the
       character actually used when the run begins. */
    const q = document.createElement('div');
    q.className = 'slot';
    q.innerHTML = '<span class="qmark">❓</span>';
    q.title = 'Random Kensinger';
    bindHoverSound(q);
    q.addEventListener('mouseenter', () => updateCharPreview(null));
    bindBtn(q, () => {
      const unlocked = Object.keys(C.CHARACTERS)
        .filter((id) => KS.Unlocks.isUnlocked(id));
      if (!unlocked.length) { toast(KS.t('randomNoChars')); return; }
      const pickId = unlocked[(Math.random() * unlocked.length) | 0];
      const ch = C.CHARACTERS[pickId];
      /* set as the selected character immediately (per stage/player) */
      currentChar = ch;
      [...row.querySelectorAll('.slot.selected')].forEach((el) => el.classList.remove('selected'));
      const mine = [...row.children].find((el) => el.dataset && el.dataset.char === pickId);
      if (mine) mine.classList.add('selected');
      updateCharPreview(ch);
      updateRecordBox(ch);
      toast(KS.t('randomCharPick', KS.L(ch.name)));
      if (pickStage === 'p2char') { mpSel.chars[1] = ch; showWeapons2(); return; }
      showWeapons();
    });
    row.appendChild(q);

    for (const id of Object.keys(C.CHARACTERS)) {
      const ch = C.CHARACTERS[id];
      /* v0.11 §7: locked characters (Barry, King) show their
         requirement + progress and cannot be selected normally */
      const isLocked = !KS.Unlocks.isUnlocked(id);
      const s = document.createElement('div');
      s.dataset.char = id;
      s.className = 'slot' + (selId === ch.id ? ' selected' : '') + (isLocked ? ' locked' : '');
      const img = document.createElement('img');
      img.src = ch.portrait;
      img.alt = KS.L(ch.name) || ch.id;
      applyCharScale(img, ch.id, 72);
      if (isLocked) img.style.opacity = 0.45;
      s.appendChild(img);
      if (isLocked) {
        const lock = document.createElement('span');
        lock.className = 'lockmark';
        lock.textContent = '🔒';
        s.appendChild(lock);
      }
      bindHoverSound(s);
      const choose = () => {
        currentChar = ch;
        [...row.querySelectorAll('.slot.selected')].forEach(el => el.classList.remove('selected'));
        s.classList.add('selected');
        updateCharPreview(ch);
        updateRecordBox(ch);
      };
      s.addEventListener('mouseenter', () => {
        updateCharPreview(isLocked ? { lockedPreview: ch } : ch);
        updateRecordBox(ch);
      });
      bindBtn(s, () => {
        if (isLocked) {
          /* §7: locked characters cannot be selected normally — the
             requirement + current progress is shown instead */
          updateCharPreview({ lockedPreview: ch });
          toast(KS.t('lockedCharRequirement'));
          return;
        }
        choose();
        /* v0.10 §8: during Player 2's pick phase this click records
           THEIR character and advances to P2 weapon select */
        if (pickStage === 'p2char') {
          mpSel.chars[1] = ch;
          showWeapons2();
          return;
        }
        showWeapons();
      });
      row.appendChild(s);
    }

    for (let i = row.children.length; i < SLOT_COUNT; i++) {
      const s = document.createElement('div');
      s.className = 'slot locked';
      s.innerHTML = '<span class="lockmark">🔒</span>';
      bindHoverSound(s);
      bindBtn(s, () => toast(KS.t('lockedChar')));
      row.appendChild(s);
    }
  }

  function updateCharPreview(ch) {
    const img = $('cs-preview-img');
    const stats = $('cs-preview-stats');
    if (!ch) {
      $('cs-preview-title').textContent = '???';
      $('cs-preview-tag').textContent = 'A mysterious Kensinger. Who could it be?';
      img.removeAttribute('src');
      img.style.display = 'none';
      const holder = img.parentElement;
      if (!holder.querySelector('.qmark')) {
        const q = document.createElement('span');
        q.className = 'qmark';
        q.style.fontSize = '84px';
        holder.appendChild(q);
      }
      stats.innerHTML = '<div class="stat-line"><span>Stats</span><b>???</b></div>';
      return;
    }
    /* v0.11 §7: locked-character preview — portrait + requirement +
       current progress instead of the stat sheet */
    if (ch.lockedPreview) {
      const c = ch.lockedPreview;
      img.style.display = '';
      const holder = img.parentElement;
      const q = holder.querySelector('.qmark');
      if (q) q.remove();
      img.src = c.portrait;
      applyCharScale(img, c.id, 82);
      img.style.opacity = 0.55;
      $('cs-preview-title').textContent = KS.L(c.name);
      $('cs-preview-tag').textContent = KS.t('lockedCharRequirement');
      const req = KS.Unlocks.requirementInfo(c.id);
      const lines = (KS.L(c.bonusLines) || []).map((b) => [b, '']);
      if (req) {
        lines.push([KS.t(req.key),
          { text: `${req.cur} / ${req.need}`, color: req.cur >= req.need ? '#7fe694' : '#ffd76e' }]);
      }
      renderStatLines(stats, lines);
      return;
    }
    img.style.display = '';
    img.style.opacity = '';
    const holder = img.parentElement;
    const q = holder.querySelector('.qmark');
    if (q) q.remove();
    img.src = ch.portrait;
    applyCharScale(img, ch.id, 82);
    $('cs-preview-title').textContent = KS.L(ch.name);
    $('cs-preview-tag').textContent = KS.L(ch.tagline);
    renderStatLines(stats, charStatLines(ch));
  }

  function updateRecordBox(ch) {
    const box = $('cs-record');
    box.innerHTML = '';
    const r = KS.Records.get(ch.id);
    if (!r.beaten || r.beaten.length === 0) return;

    const mk = (k, v) => {
      const d = document.createElement('div');
      d.className = 'record-line';
      d.innerHTML = `<span>${k}</span><b>${v}</b>`;
      box.appendChild(d);
    };
    mk(KS.t('diffBeaten'), r.beaten.join(', '));
    mk(KS.t('timesPlayed'), r.played);
    mk(KS.t('wins'), r.wins);
    mk(KS.t('deaths'), r.deaths);
  }

  /* --- run options (play screen) --- */
  function closeMapList() {
    const l = $('map-list');
    if (l) l.classList.add('hidden');
  }
  function buildRunOptions() {
    bindBtn($('btn-map'), () => $('map-list').classList.toggle('hidden'));
    for (const item of document.querySelectorAll('.map-item')) {
      bindBtn(item, () => {
        if (item.disabled || item.classList.contains('unavailable')) return;
        for (const it of document.querySelectorAll('.map-item')) it.classList.remove('selected');
        item.classList.add('selected');
        runSettings.map = item.dataset.map;
        $('map-label').textContent = C.MAPS[runSettings.map].name;
        closeMapList();
      });
    }
    bindBtn($('btn-endless'), () => {
      runSettings.endless = !runSettings.endless;
      $('endless-state').textContent = runSettings.endless ? '☑' : '▢';
      $('btn-endless').classList.toggle('active', runSettings.endless);
    });
    /* v0.10 §1: the manual Co-Op toggle. OFF for a fresh install;
       enabling it starts the two-player pick sequence when the run
       opens. No Player 2 and no multiplayer UI exists while OFF. */
    bindBtn($('btn-coop'), () => {
      runSettings.coop = !runSettings.coop;
      $('btn-coop').classList.toggle('active', runSettings.coop);
      $('coop-state').textContent = runSettings.coop ? '☑' : '▢';
    });
  }

  /* =========================================================
     Weapon select screen
     ========================================================= */
  /* weapons the current character may pick as a starting weapon
     (Adkins only gets "Unarmed"-tagged weapons, Bair Blade/Support) */
  function allowedWeapons() {
    const f = currentChar && currentChar.weaponFilter;
    if (!f) return Object.keys(C.WEAPONS);
    return Object.keys(C.WEAPONS)
      .filter((id) => C.WEAPONS[id].classes &&
        C.WEAPONS[id].classes.some((c) => f.includes(c)));
  }

  function buildWeaponSlots() {
    const row = $('weapon-slots');
    row.innerHTML = '';
    const allowed = allowedWeapons();
    const isP2 = pickStage === 'p2weapon';

    const q = document.createElement('div');
    q.className = 'slot';
    q.innerHTML = '<span class="qmark">❓</span>';
    bindHoverSound(q);
    q.addEventListener('mouseenter', () => {
      $('wp-img').style.opacity = 0.25;
      $('wp-title').textContent = '?';
      $('wp-desc').textContent = KS.t('randomWeaponDesc');
      $('wp-stats').innerHTML = '';
    });
    q.addEventListener('mouseleave', () => {
      const w = C.WEAPONS[currentChar.startingWeapon];
      updateWeaponBox(w, currentChar.startingWeaponTier);
    });
    bindBtn(q, () => {
      const pick = allowed[(Math.random() * allowed.length) | 0];
      pickWeapon(pick);
    });
    row.appendChild(q);

    for (const id of allowed) {
      const w = C.WEAPONS[id];
      const s = document.createElement('div');
      s.className = 'slot selected';
      s.innerHTML = `<img src="${w.icon}" alt="${KS.L(w.name)}">`;
      bindHoverSound(s);
      s.addEventListener('mouseenter', () => updateWeaponBox(w, currentChar.startingWeaponTier));
      bindBtn(s, () => pickWeapon(id));
      row.appendChild(s);
    }

    for (let i = row.children.length; i < SLOT_COUNT; i++) {
      const s = document.createElement('div');
      s.className = 'slot locked';
      s.innerHTML = '<span class="lockmark">🔒</span>';
      bindHoverSound(s);
      bindBtn(s, () => toast(KS.t('lockedWeapon')));
      row.appendChild(s);
    }

    /* v0.10 §8: the sequence is P1 char -> P1 weapon -> P2 char ->
       P2 weapon -> difficulty; each pick lands in the right slot */
    function pickWeapon(id) {
      if (isP2) {
        currentWeaponId = id;
        mpSel.weapons[1] = id;
        showDifficulty();
        return;
      }
      currentWeaponId = id;
      if (runSettings.coop) {
        mpSel = { chars: [currentChar, null], weapons: [id, null], difficulty: null };
        showCharacters2();          // hand over to PLAYER 2
        return;
      }
      showDifficulty();
    }
  }

  function updateWeaponBox(w, tier) {
    $('wp-img').style.opacity = 1;
    $('wp-img').src = w.icon;
    $('wp-title').textContent = KS.L(w.name);
    /* the class tags sit right under the weapon title */
    $('wp-desc').textContent = weaponClasses(w);
    renderStatLines($('wp-stats'), weaponStatLines(w, tier));
  }

  /* =========================================================
     Difficulty select screen
     ========================================================= */
  function buildDiffSlots() {
    const row = $('diff-slots');
    row.innerHTML = '';
    for (let d = 0; d < C.DIFFICULTY_SLOTS; d++) {
      const unlocked = KS.Records.isDifficultyUnlocked(currentChar.id, d);
      const s = document.createElement('div');
      s.className = 'slot' + (d === 0 ? ' zero' : '') + (unlocked ? ' selected' : ' locked');
      s.innerHTML = unlocked
        ? `<span class="diff-num">${d}</span>`
        : '<span class="lockmark">🔒</span>';
      s.title = C.DIFFICULTIES[d].name;
      bindHoverSound(s);
      const dd = d;
      s.addEventListener('mouseenter', () => updateDiffBox(dd));
      if (unlocked) {
        bindBtn(s, () => {
          currentDifficulty = dd;
          startRun();
        });
      } else {
        bindBtn(s, () => toast(KS.t('diffUnlock', dd)));
      }
      row.appendChild(s);
    }
  }

  function updateDiffBox(d) {
    const def = C.DIFFICULTIES[d];
    $('dp-badge').textContent = d;
    $('dp-title').textContent = KS.L(def.name);
    $('dp-desc').textContent = d === 0
      ? KS.t('noModifiers')
      : KS.t('diffTough');
    const stats = $('dp-stats');
    if (!def.lines || def.lines.length === 0) {
      stats.innerHTML = `<div class="stat-line"><span>${KS.t('modifier')}</span><b>${KS.t('none')}</b></div>`;
    } else {
      stats.innerHTML = def.lines
        .map((l) => `<div class="stat-line"><span>${KS.t('modifier')}</span><b>${l}</b></div>`).join('');
    }
  }

  /* =========================================================
     Settings screen
     ========================================================= */
  function buildSettings() {
    /* tabs */
    for (const tab of document.querySelectorAll('.set-tab')) {
      bindBtn(tab, () => {
        for (const t of document.querySelectorAll('.set-tab')) t.classList.remove('selected');
        tab.classList.add('selected');
        for (const p of document.querySelectorAll('.set-pane')) p.classList.add('hidden');
        $('set-' + tab.dataset.tab).classList.remove('hidden');
      });
    }

    /* sliders */
    const sliders = [
      ['set-master', 'master', 'val-master'],
      ['set-soundvol', 'sound', 'val-soundvol'],
      ['set-music', 'music', 'val-music'],
      ['set-explosion', 'explosionOpacity', 'val-explosion'],
      ['set-projectile', 'projectileOpacity', 'val-projectile'],
      ['set-pet', 'petOpacity', 'val-pet'],
      ['set-fontsize', 'fontSize', 'val-fontsize'],
    ];
    for (const [id, key, valId] of sliders) {
      const el = $(id);
      el.value = KS.Settings.get()[key];
      $(valId).textContent = el.value + '%';
      el.addEventListener('input', () => {
        $(valId).textContent = el.value + '%';
        KS.Settings.set(key, Number(el.value));
      });
    }

    /* language select */
    const lang = $('set-language');
    lang.value = KS.Settings.get().language;
    lang.addEventListener('change', () => {
      KS.Settings.set('language', lang.value);
      KS.applyI18n();
      $('map-label').textContent = C.MAPS[runSettings.map].name;
      /* v0.9 §11: the Dev Mode toggle's VISIBILITY follows the language,
         but the STATE never changes with it */
      if (KS.DevMode && KS.DevMode.syncVisibility) KS.DevMode.syncVisibility();
    });

    /* toggle buttons */
    for (const btn of document.querySelectorAll('.toggle-btn')) {
      const key = btn.dataset.setting;
      refreshToggle(btn, KS.Settings.get()[key]);
      bindBtn(btn, () => {
        const v = !KS.Settings.get()[key];
        KS.Settings.set(key, v);
        refreshToggle(btn, v);
      });
    }

    /* ---- v0.11 §9: Data tab — export / import ---- */
    const statusEl = $('data-status');
    const showStatus = (msg, ok) => {
      statusEl.textContent = msg;
      statusEl.classList.remove('hidden');
      statusEl.classList.toggle('ok', !!ok);
      statusEl.classList.toggle('err', !ok);
      clearTimeout(showStatus._h);
      showStatus._h = setTimeout(() => statusEl.classList.add('hidden'), 5000);
    };

    /* confirmation step before ANY import replaces the save — reuses
       the pause-confirm dialog structure so it stays visually
       consistent; cancelling leaves the current save untouched */
    let pendingImport = null;
    const confirmImport = (payload, sourceLabel) => {
      pendingImport = payload;
      $('dc-confirm-title').textContent = KS.t('dataConfirmTitle');
      $('dc-confirm-text').textContent =
        KS.t('dataConfirmText', sourceLabel);
      $('dc-confirm').classList.remove('hidden');
    };
    const closeDataConfirm = () => {
      pendingImport = null;
      $('dc-confirm').classList.add('hidden');
    };
    bindBtn($('dc-confirm-yes'), () => {
      if (!pendingImport) { closeDataConfirm(); return; }
      const res = KS.SaveData.apply(pendingImport);
      pendingImport = null;
      $('dc-confirm').classList.add('hidden');
      if (res.ok) {
        showStatus(KS.t('dataImportOk'), true);
        KS.applyI18n();
        buildSettings();               // reflect imported settings values
      } else {
        showStatus(KS.t('dataImportFail'), false);
      }
    });
    bindBtn($('dc-confirm-no'), closeDataConfirm);

    /* EXPORT: downloadable kensinger-survival-save.json */
    bindBtn($('btn-data-export'), () => {
      KS.SaveData.download();
      showStatus(KS.t('dataExportOk', KS.SaveData.FILE_NAME), true);
    });

    /* IMPORT from file: validate -> confirm -> apply */
    const fileInput = $('data-import-file');
    bindBtn($('btn-data-import-file'), () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      fileInput.value = '';             // allow re-selecting the same file
      if (!f) { showStatus(KS.t('dataNoFile'), false); return; }
      KS.SaveData.readImportFile(f, (res) => {
        if (!res.ok) {
          /* invalid file: rejected, the current save stays untouched */
          showStatus(KS.t('dataImportInvalid'), false);
          return;
        }
        confirmImport(res.data, f.name);
      });
    });

    /* IMPORT from pasted text: validate -> confirm -> apply */
    bindBtn($('btn-data-import-text'), () => {
      const txt = ($('data-import-text').value || '').trim();
      if (!txt) { showStatus(KS.t('dataEmptyText'), false); return; }
      const res = KS.SaveData.validate(txt);
      if (!res.ok) {
        /* malformed text: rejected without touching the current save */
        showStatus(KS.t('dataImportInvalid'), false);
        return;
      }
      confirmImport(res.data, KS.t('dataTextSource'));
    });
  }

  function refreshToggle(btn, v) {
    btn.textContent = v ? 'ON' : 'OFF';
    btn.classList.toggle('on', !!v);
  }

  /* =========================================================
     Run flow
     ========================================================= */
  /* reset all per-player break-state (fresh run) */
  function resetRunUiState() {
    /* stale elimination banners must never leak across runs (§1:
       single-player never shows "PLAYER n IS DOWN") */
    for (const root of [$('pu0'), $('pu1')]) {
      const d = root.querySelector('.p-down');
      if (d) d.remove();
    }
    lastTimerSec = -1;
    lastTimerBy[0] = lastTimerBy[1] = -1;
    lastKillsBy[0] = lastKillsBy[1] = -1;
    lastMaterialsBy[0] = lastMaterialsBy[1] = -1;
    lastWaveBy[0] = lastWaveBy[1] = -1;
    luRerollsBy[0] = luRerollsBy[1] = 0;
    luChoicesBy[0] = luChoicesBy[1] = [];
    luChoices = [];
    luPlayerIdx = 0;
    crPlayerIdx = 0;
    shopTurn = 0;
    shopState.forEach((st) => {
      st.entries = null; st.rerolls = 0; st.last = null;
      st.done = false; st.visitsNoTurret = 0;
    });
    hoveredShopBy[0] = hoveredShopBy[1] = 0;
    clearTimeout(bannerTimer); clearTimeout(typeTimer);
    showPickBanner(null);
  }

  /* solo roots reset: only Player 1's half exists */
  function setSoloUiMode() {
    document.body.classList.remove('split');
    $('pu1').hidden = true;
    $('pu0').classList.remove('inactive');
    document.querySelector('.wb-h1').hidden = true;
  }
  /* duo roots: both halves visible */
  function setDuoUiMode() {
    document.body.classList.add('split');
    $('pu1').hidden = false;
    document.querySelector('.wb-h1').hidden = false;
  }

  function startRun() {
    /* v0.10 §8: the co-op sequence already completed BOTH players'
       picks before the difficulty screen — start the shared run */
    if (runSettings.coop) {
      if (mpSel && mpSel.chars[1] && mpSel.weapons[1]) {
        mpSel.difficulty = currentDifficulty;
        return startRunDuo();
      }
      return;                      // flow guarantees complete picks
    }
    pickStage = null;
    mpSel = null;
    KS.Records.addPlayed(currentChar.id);
    if (KS.DevCmd) KS.DevCmd.resetHistory();   // undo history is per-run
    paused = false;
    resetRunUiState();
    setSoloUiMode();
    setScreen('game');
    $('hud').classList.remove('dimmed');
    game.start(currentChar, {
      weaponId: currentWeaponId || currentChar.startingWeapon,
      difficulty: currentDifficulty,
      endless: runSettings.endless,
      map: runSettings.map,
      /* the player sprite in the arena must be the chosen character,
         never the hardcoded Kensinger default */
      portrait: charPortraits[currentChar.id],
    });
  }

  /* v0.10 §2: launch the shared session with BOTH selections — each
     player keeps their own character bonuses, weapons and equipment */
  function startRunDuo() {
    KS.Records.addPlayed(mpSel.chars[0].id);
    KS.Records.addPlayed(mpSel.chars[1].id);
    if (KS.DevCmd) KS.DevCmd.resetHistory();
    paused = false;
    resetRunUiState();
    setDuoUiMode();
    setScreen('game');
    $('hud').classList.remove('dimmed');
    mpCharsAtEnd = [mpSel.chars[0], mpSel.chars[1]];
    game.startDuo([
      { charDef: mpSel.chars[0], weaponId: mpSel.weapons[0],
        portrait: charPortraits[mpSel.chars[0].id] },
      { charDef: mpSel.chars[1], weaponId: mpSel.weapons[1],
        portrait: charPortraits[mpSel.chars[1].id] },
    ], {
      difficulty: mpSel.difficulty != null ? mpSel.difficulty : currentDifficulty,
      endless: runSettings.endless,
      map: runSettings.map,
    });
    /* mpSel is KEPT so pause-menu RESTART rebuilds the same duo run;
       it is cleared when returning to the menu */
  }

  /* ---- in-run HUD: ONE CHIP PER WEAPON INSTANCE (spec §10) ----
     v0.10 §2: each player root renders that player's own chips from
     their own snapshot. Rebuilds on signature change only. */
  const hudWeaponSigs = ['', ''];
  function refreshHudWeaponFor(root, player) {
    if (!root || !player || !player.weapons) return;
    const wrap = root.querySelector('.weapon-slot');
    if (!wrap) return;
    const ri = player.idx;
    const sig = player.weapons.map((w) => w.def.id + ':' + w.uid + ':' + w.tier).join('|');
    if (sig === hudWeaponSigs[ri]) return;
    hudWeaponSigs[ri] = sig;
    wrap.innerHTML = '';
    for (const w of player.weapons) {
      const info = KS.tierInfo(w.tier);
      const chip = document.createElement('div');
      chip.className = 'weapon-chip';
      chip.style.borderColor = info.color;
      /* v0.11 §1: ammunition + reload indicator — magazine count, or
         RELOAD with a progress bar while recharging. Shuriken shows
         nothing (no magazine). The element is updated every frame by
         updateHudRoot (hudDataAll carries the live numbers). */
      const ammoEl = document.createElement('div');
      ammoEl.className = 'weapon-ammo';
      ammoEl.dataset.uid = w.uid;
      chip.innerHTML = `
        <div class="weapon-icon-wrap">
          <img src="${w.def.icon}" alt="${KS.L(w.def.name)}">
          <div class="weapon-cd" data-uid="${w.uid}"></div>
        </div>
        <div class="weapon-info">
          <div class="weapon-name">${KS.L(w.def.name)}</div>
          <div class="weapon-tier" style="color:${info.color}">T${w.tier} · ${info.name}</div>
        </div>`;
      chip.querySelector('.weapon-info').appendChild(ammoEl);
      chip.addEventListener('mousemove', (e) =>
        showTooltip(weaponTooltipHtml(w.def, w.tier), e.clientX, e.clientY));
      chip.addEventListener('mouseleave', hideTooltip);
      wrap.appendChild(chip);
    }
  }

  /* the UI root that belongs to player i (solo: everything is #pu0) */
  function hudRootFor(i) {
    return (game && game.duo && i === 1) ? $('pu1') : $('pu0');
  }
  function refreshAllWeaponChips() {
    if (!game || !game.players) return;
    game.players.forEach((p, i) => refreshHudWeaponFor(hudRootFor(i), p));
  }

  function setPaused(v) {
    if (!game || !game.running || game.over || game.state !== 'wave') return;
    paused = v;
    game.paused = v;
    if (v) {
      openPause();
      $('pause').classList.add('visible');
    } else {
      $('pause').classList.remove('visible', 'confirming');
      $('pm-confirm').classList.add('hidden');
      confirmAction = null;
      hideTooltip();
    }
  }

  /* =========================================================
     Shared stats list (pause / level-up / shop)
     v0.10 §9: every panel renders the SNAPSHOT it is given —
     Player 2's panels always show Player 2's actual numbers.
     ========================================================= */
  const STAT_ICONS = {
    Level: ['level', '⭐'], Curse: ['curse', '😈'], 'Max HP': ['maxHP', '❤️'],
    'HP Regeneration': ['hpRegen', '🫁'], '% Life Steal': ['lifeSteal', '🦷'],
    '% Damage': ['damage', '💪'], '% Attack Speed': ['attackSpeed', '⚡'],
    '% Crit Chance': ['critChance', '🤞'], '% Dodge': ['dodge', '🧥'],
    '% Speed': ['speedPct', '🦵'], 'Melee Damage': ['meleeDMG', '🤜'],
    'Ranged Damage': ['rangedDMG', '🦾'], 'Elemental Damage': ['elementalDMG', '🧠'],
    Engineering: ['engineering', '💀'], Range: ['range', '👁️'], Armor: ['armor', '🦺'],
    Luck: ['luck', '👃'], Harvesting: ['harvesting', '🤲'],
  };

  const PRIMARY_STATS = [
    { label: 'Level',           val: (s, sn) => sn.level,
      tipKey: 'stLevel', tipArg: (s, sn) => [sn.level] },
    { label: 'Curse',           val: (s) => s.curse || 0,
      tipKey: 'stCurse', tipArg: (s) => [s.curse || 0] },
    { label: 'Max HP',          val: (s) => s.maxHP,
      tipKey: 'stMaxHP', tipArg: (s) => [s.maxHP] },
    { label: 'HP Regeneration', val: (s) => s.hpRegen,
      tipKey: 'stHpRegen', tipArg: (s) => [KS.hpRegenRate(s.hpRegen)] },
    { label: '% Life Steal',    val: (s) => s.lifeSteal,
      tipKey: 'stLifeSteal', tipArg: (s) => [s.lifeSteal] },
    { label: '% Damage',        val: (s) => s.damage,
      tipKey: 'stDamage', tipArg: (s) => [s.damage] },
    { label: '% Attack Speed',  val: (s) => s.attackSpeed,
      tipKey: 'stAttackSpeed', tipArg: (s) => [s.attackSpeed] },
    { label: '% Crit Chance',   val: (s, sn) =>
        Math.round(sn.weapons[0].def.critChance * 100) + (s.critChance || 0),
      tipKey: 'stCrit', tipArg: (s, sn) =>
        [Math.round(sn.weapons[0].def.critChance * 100) + (s.critChance || 0)] },
    { label: '% Dodge',         val: (s) => s.dodge,
      tipKey: 'stDodge', tipArg: (s) => [s.dodge] },
    { label: '% Speed',         val: (s) => s.speedPct,
      tipKey: 'stSpeed', tipArg: (s) => [s.speedPct] },
    { label: 'Melee Damage',    val: (s) => s.meleeDMG,
      tipKey: 'stMelee', tipArg: (s) => [s.meleeDMG] },
    { label: 'Ranged Damage',   val: (s) => s.rangedDMG,
      tipKey: 'stRanged', tipArg: (s) => [s.rangedDMG] },
    { label: 'Elemental Damage', val: (s) => s.elementalDMG,
      tipKey: 'stElemental', tipArg: (s) => [s.elementalDMG] },
    { label: 'Engineering',     val: (s) => s.engineering,
      tipKey: 'stEngineering', tipArg: () => [] },
    { label: 'Range',           val: (s, sn) => sn.weapons[0].def.range + (s.range || 0),
      tipKey: 'stRange', tipArg: (s) => [s.range] },
    { label: 'Armor',           val: (s) => s.armor,
      tipKey: 'stArmor', tipArg: (s) => [KS.armorReduction(s.armor)] },
    { label: 'Luck',            val: (s) => s.luck,
      tipKey: 'stLuck', tipArg: (s) => [s.luck] },
    { label: 'Harvesting',      val: (s) => s.harvesting,
      tipKey: 'stHarvesting', tipArg: (s) => [s.harvesting] },
  ];

  const SECONDARY_STATS = [
    'consumableHeal', 'materialsHealing', 'xpGain', 'pickupRange', 'itemPrice',
    'explosionDamage', 'explosionSize', 'bounces', 'piercing', 'piercingDamage',
    'bossDamage', 'structureAttackSpeed', 'structureRange', 'burningSpeed',
    'burningSpread', 'knockback', 'doubleMaterial', 'freeRerolls', 'trees',
    'enemiesPct', 'enemySpeedPct', 'rerollPrice',
  ];

  function renderStatsList(el, snap, allowSecondary = false) {
    const s = snap.stats;
    el.innerHTML = '';
    const rows = (statsTab === 'secondary' && allowSecondary)
      ? SECONDARY_STATS.map((key) => [SL(key), s[key] || 0, null, null])
      : PRIMARY_STATS.map((d) => [d.label, d.val(s, snap), d.tipKey, d.tipArg]);

    for (const [label, value, tipKey, tipArg] of rows) {
      const row = document.createElement('div');
      row.className = 'stat-row';
      const nameEl = document.createElement('span');
      nameEl.className = 'sname';
      if (STAT_ICONS[label]) {
        const [key, emoji] = STAT_ICONS[label];
        nameEl.appendChild(makeIcon(`assets/stats/${key}.png`, emoji, 'sicon'));
      }
      nameEl.appendChild(document.createTextNode(label));
      const valEl = document.createElement('span');
      valEl.className = 'sval';
      valEl.textContent = value;
      row.append(nameEl, valEl);
      if (tipKey) {
        const tip = () => KS.t(tipKey, ...(tipArg ? tipArg(s, snap) : []));
        row.addEventListener('mousemove', (e) =>
          showTooltip(`<div class="tt-title">${label}</div>${tip()}`, e.clientX, e.clientY));
        row.addEventListener('mouseleave', hideTooltip);
      }
      el.appendChild(row);
    }
  }

  /* =========================================================
     HUD binding (v0.10 §2, §6, §7)
     Every player root updates from ITS OWN snapshot: own health,
     own wave/time display centered in the half, own materials, own
     kill count, own weapon chips, own boss bar, own down banner.
     ========================================================= */
  function bindHud() {
    game.onHUD = (list) => {
      const idxs = game.duo ? [0, 1] : [0];
      idxs.forEach((ri) => {
        const root = hudRootFor(ri);
        const h = list[ri] || list[0];
        if (h) updateHudRoot(root, h, ri);
      });
      if (debugOn) {
        const panel = $('debugpanel');
        const txt = game.debugData();
        if (panel.textContent !== txt) panel.textContent = txt;
        panel.classList.remove('hidden');
      } else {
        $('debugpanel').classList.add('hidden');
      }
    };

    function updateHudRoot(root, h, ri) {
      const q = (sel) => root.querySelector(sel);
      const ratio = h.hp / h.maxHP;
      const fill = q('.hp-fill');
      fill.style.width = (ratio * 100) + '%';
      fill.classList.toggle('low', ratio < 0.3);
      q('.hp-text').textContent = `${Math.ceil(h.hp)} / ${h.maxHP}`;

      /* v0.10 §6: each half has its own wave + timer display, centered
         near the top of ITS half (25% / 75%), both from shared state */
      const t = Math.ceil(h.waveTimeLeft);
      if (t !== lastTimerBy[ri]) {
        q('.timer').textContent = String(t);
        lastTimerBy[ri] = t;
      }
      /* v0.10 §7: independent kill counters (own kills only) */
      if (h.kills !== lastKillsBy[ri]) {
        q('.kills').textContent = '☠ ' + h.kills;
        lastKillsBy[ri] = h.kills;
      }
      if (h.materials !== lastMaterialsBy[ri]) {
        q('.materials-n').textContent = String(h.materials);
        lastMaterialsBy[ri] = h.materials;
      }
      if (h.wave !== lastWaveBy[ri]) {
        q('.wave-label').textContent = `${KS.t('wave')} ${h.wave}` +
          (h.endless && h.wave > C.WAVES.length ? ' · ' + KS.t('endless') : '');
        lastWaveBy[ri] = h.wave;
      }
      /* per-player weapon chips + cooldown overlays (spec §10) */
      refreshHudWeaponFor(root, game.players[ri]);
      const cdMap = h.weapons || [];
      root.querySelectorAll('.weapon-cd').forEach((el) => {
        const inst = cdMap.find((x) => x.uid === Number(el.dataset.uid));
        if (inst) el.style.height = ((1 - inst.cdFill) * 100) + '%';
      });
      /* v0.11 §1: ammunition + reload indicators (live per frame) */
      root.querySelectorAll('.weapon-ammo').forEach((el) => {
        const inst = cdMap.find((x) => x.uid === Number(el.dataset.uid));
        if (!inst) return;
        if (inst.ammo == null) { el.textContent = ''; return; }   // no magazine
        if (inst.reload != null && inst.reload > 0) {
          el.textContent = KS.t('reloading') + ' ' + Math.round(inst.reload * 100) + '%';
          el.classList.add('reloading');
          el.classList.remove('low');
        } else {
          el.textContent = inst.ammo;
          el.classList.remove('reloading');
          el.classList.toggle('low', inst.ammo <= Math.max(1, Math.floor(inst.ammo / 4)));
        }
      });

      /* elimination notice on that player's own view — duo only;
         single-player NEVER shows "PLAYER n IS DOWN" (v0.10 §1) */
      let down = root.querySelector('.p-down');
      if (h.duo && h.eliminated) {
        if (!down) {
          down = document.createElement('div');
          down.className = 'p-down';
          down.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:900;color:#ff5b5b;font-size:2em;text-shadow:0 2px 8px #000;pointer-events:none;';
          root.appendChild(down);
        }
        down.textContent = ri === 0 ? KS.t('p1Down') : KS.t('p2Down');
      } else if (down) down.remove();

      /* boss health bars — one copy per half, centered in the half */
      const bb = q('.bossbar');
      if (bb) {
        if (h.bosses && h.bosses.length) {
          bb.classList.remove('hidden');
          const name = h.bosses.length > 1 ? 'AI COUNCIL' : h.bosses[0].name;
          if (q('.bossbar-name').textContent !== name) q('.bossbar-name').textContent = name;
          const bars = h.bosses.map((b) => {
            const pct = Math.max(0, Math.min(100, (b.hp / b.maxHP) * 100));
            return `<div class="bossbar-seg"><div class="bossbar-fill" style="width:${pct}%"></div></div>`;
          }).join('');
          if (q('.bossbar-bars').innerHTML !== bars) q('.bossbar-bars').innerHTML = bars;
        } else {
          bb.classList.add('hidden');
        }
      }
    }

    game.onRunEnd = (st) => {
      const canRetryWave = !st.won && KS.Settings.get().retryFailedWaves;
      if (st.won) {
        if (st.duo && mpCharsAtEnd.length === 2) {
          KS.Records.addWin(mpCharsAtEnd[0].id, st.difficulty);
          KS.Records.addWin(mpCharsAtEnd[1].id, st.difficulty);
        } else KS.Records.addWin(currentChar.id, st.difficulty);
      } else {
        if (st.duo && mpCharsAtEnd.length === 2) {
          KS.Records.addDeath(mpCharsAtEnd[0].id, st.wave, st.endless);
          KS.Records.addDeath(mpCharsAtEnd[1].id, st.wave, st.endless);
        } else KS.Records.addDeath(currentChar.id, st.wave, st.endless);
      }
      showGameOver(st, canRetryWave);
    };

    game.onWaveComplete = onWaveComplete;
  }

  /* ---------------- game over / victory (per player) ---------------- */
  function showGameOver(st, canRetryWave) {
    const duo = !!st.duo;
    $('gameover').classList.toggle('duo-mode', duo);
    $('go-side-1').hidden = !duo;
    const n = duo ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const side = $('go-side-' + i);
      const title = side.querySelector('.go-title');
      title.textContent = st.won ? KS.t('youSurvived') : KS.t('youDied');
      title.classList.toggle('dead', !st.won);
      title.classList.toggle('won', !!st.won);
      side.querySelector('.go-time').textContent = fmtTime(st.time);
      /* v0.10 §7: every player's panel shows THEIR OWN kill count */
      side.querySelector('.go-kills').textContent =
        String(duo && st.perKills ? st.perKills[i] : st.kills);
      side.querySelector('.go-wave').textContent =
        String(st.wave) + (st.endless ? ' (Endless)' : '');
      side.querySelector('[data-gact="retryWave"]').classList.toggle('hidden', !canRetryWave);
      side.querySelector('[data-gact="retry"]').classList.toggle('hidden', canRetryWave);
      side.querySelector('[data-gact="continue"]').classList.toggle('hidden', !st.won);
    }
    setTimeout(() => $('gameover').classList.add('visible'), 450);
  }

  /* =========================================================
     Turn helpers (v0.10 §5): the inactive half darkens ~28%,
     blurs slightly and loses pointer events — logic re-checks
     ownership on every action, so dimming alone is never the gate.
     ========================================================= */
  function applySideActivity(prefix, activeIdx) {
    if (!game || !game.duo) return;
    for (const i of [0, 1]) {
      const el = $(prefix + '-' + i);
      if (el) el.classList.toggle('inactive', i !== activeIdx);
    }
  }
  function clearSideActivity() {
    for (const pre of ['shop-side', 'lu-side', 'cr-side', 'go-side']) {
      for (const i of [0, 1]) {
        const el = $(pre + '-' + i);
        if (el) el.classList.remove('inactive');
      }
    }
  }

  /* =========================================================
     Wave break flow: WAVE COMPLETED banner -> crates per player ->
     Level Up (P1 then P2) -> Shop (P1 turn, then P2 turn) -> wave
     ========================================================= */
  function onWaveComplete(waveEnded, perPlayer) {
    $('hud').classList.add('dimmed');
    showWaveBanner(() => {
      const q = [];
      (perPlayer || []).forEach((pp, i) => {
        if (pp.crateItems && pp.crateItems.length) q.push({ type: 'crates', idx: i, items: pp.crateItems });
      });
      game.players.forEach((p, i) => {
        if (p.pendingLevels > 0) q.push({ type: 'lu', idx: i });
      });
      q.push({ type: 'shop' });
      breakQueue = q;
      runNextBreakStep();
    }, perPlayer);
  }

  /* sequential intermission steps (crates per player -> level-ups per
     player -> shop turns); each step hands off to the next */
  let breakQueue = [];
  function runNextBreakStep() {
    const step = breakQueue.shift();
    if (!step) return;
    if (step.type === 'crates') { openCrateRewardsFor(step.idx, step.items); return; }
    if (step.type === 'lu') { openLevelUpFor(step.idx); return; }
    openShop();
  }

  /* ---- loot crate reward screen: one item per collected crate;
     take it or recycle it for part of its price (spec §4).
     v0.10: the panel lives in the COLLECTING player's half and the
     other half dims while it is their turn. ---- */
  let crQueue = [];        // [{ item, special }]
  function crItemFxLines(it) {
    return (it.fx || []).map(([k, v]) => `+${v} ${SL(k)}`);
  }

  function openCrateRewardsFor(idx, pairs) {
    crPlayerIdx = idx;
    crQueue = pairs.slice();
    $('cratereward').classList.toggle('duo-mode', !!game.duo);
    $('cr-side-1').hidden = !game.duo;
    applySideActivity('cr-side', idx);
    renderCrateReward();
    $('cratereward').classList.add('visible');
  }

  function renderCrateReward() {
    const side = $('cr-side-' + crPlayerIdx);
    const { item, special } = crQueue[0];
    side.querySelector('.cr-remaining').textContent =
      KS.t('cratesRemaining').replace('{n}', String(crQueue.length));
    side.querySelector('.cr-icon').textContent = item.icon;
    side.querySelector('.cr-name').textContent = KS.L(item.name);
    side.querySelector('.cr-tier').textContent = special
      ? `${KS.t('crateSpecial')} — T${item.tier}`
      : `T${item.tier}`;
    side.querySelector('.cr-fx').innerHTML =
      crItemFxLines(item).map((l) => `<div>${l}</div>`).join('');
    const refund = Math.max(1, Math.round(item.price * KS.CONFIG.LOOT.crateRecyclePct));
    side.querySelector('.cr-recycle').textContent =
      KS.t('crateRecycle').replace('{n}', String(refund));
  }

  function finishOneCrate(take) {
    if (!crQueue.length) return;
    const p = game.players[crPlayerIdx];
    const { item } = crQueue.shift();
    if (take) {
      p.buyItem(item);              // applies stat fx + registers ownership
    } else {
      p.materials += Math.max(1, Math.round(item.price * KS.CONFIG.LOOT.crateRecyclePct));
    }
    $('cratereward').classList.remove('visible');
    hideTooltip();
    if (crQueue.length) {
      setTimeout(() => {
        renderCrateReward();
        $('cratereward').classList.add('visible');
      }, 120);
    } else {
      runNextBreakStep();
    }
  }

  /* ---- WAVE COMPLETED banner: one copy per half (§14). Each half
     shows the shared title and THAT player's income breakdown plus
     the duplicated combined reward (§7). ---- */
  function showWaveBanner(doneCb, perPlayer) {
    const wrap = $('wavebanner');
    const h0 = wrap.querySelector('.wb-h0');
    const h1 = wrap.querySelector('.wb-h1');
    h1.hidden = !game.duo;
    const msg = KS.t('waveCompleted');
    const halves = [h0, h1];
    halves.forEach((half, i) => {
      const subEl = half.querySelector('.wavebanner-sub');
      const old = half.querySelector('.wb-reward');
      if (old) old.remove();
      const pp = perPlayer && perPlayer[i];
      if (game.duo && pp) {
        const parts = [KS.t('pCollected', String(i + 1), String(pp.earned))];
        if (pp.harvest > 0) parts.push(KS.t('pHarvestShort', String(pp.harvest)));
        if (pp.builderConv > 0) parts.push(KS.t('builderConverted', String(pp.builderConv)));
        subEl.textContent = parts.join('  ·  ');
        const rw = document.createElement('div');
        rw.className = 'wb-reward';
        rw.textContent = KS.t('rewardEach', String(pp.reward));
        subEl.after(rw);
      } else if (pp) {
        /* solo: original single-player result line */
        const parts = [];
        if (pp.harvest > 0) parts.push(KS.t('harvestIncome').replace('{n}', String(pp.harvest)));
        if (pp.builderConv > 0) parts.push(KS.t('builderConverted', String(pp.builderConv)));
        subEl.textContent = parts.join('  ·  ');
      }
    });
    wrap.classList.remove('hidden');
    wrap.classList.toggle('no-dark', !KS.Settings.get().screenDarkening);

    /* smooth typing reveal into BOTH halves' copies */
    clearInterval(typeTimer);
    let i = 0;
    const textEls = halves.map((h) => h.querySelector('.wavebanner-text'));
    textEls.forEach((el) => { el.textContent = ''; });
    typeTimer = setInterval(() => {
      i++;
      textEls.forEach((el) => { el.textContent = msg.slice(0, i); });
      if (i >= msg.length) clearInterval(typeTimer);
    }, 62);

    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      wrap.classList.add('hidden');
      doneCb && doneCb();
    }, 1500);
  }

  /* ---------------- Level Up screen (one panel per player) ---------
     v0.10 §5+§9: the active player's panel sits in their own half;
     their choices, reroll cost and stats are NEVER written into the
     other player's panel. P1 completes ALL pending picks first, then
     P2 (queue order) — multiple pending choices are never discarded. */
  function luRollLevel() {
    const p = game.players[luPlayerIdx];
    return Math.max(1, p.level - p.pendingLevels);
  }

  function luRerollCost() { return 2 + luRerollsBy[luPlayerIdx]; }

  function openLevelUpFor(idx) {
    luPlayerIdx = idx;
    luRerollsBy[idx] = 0;
    const p = game.players[idx];
    luChoicesBy[idx] = KS.Upgrades.rollChoices(luRollLevel(), p.stats.luck);
    luChoices = luChoicesBy[idx];
    $('levelup').classList.toggle('duo-mode', !!game.duo);
    $('lu-side-1').hidden = !game.duo;
    applySideActivity('lu-side', idx);
    fillLevelUpSide(idx);
    $('levelup').classList.add('visible');
  }

  function fillLevelUpSide(idx) {
    const p = game.players[idx];
    const side = $('lu-side-' + idx);
    side.querySelector('.lu-title').textContent = game.duo
      ? `${KS.t('levelUp')} — ${KS.t(idx === 0 ? 'player1' : 'player2')}`
      : KS.t('levelUp');
    const box = side.querySelector('.lu-choices');
    box.innerHTML = '';
    for (const upg of luChoicesBy[idx]) renderUpgradeCard(box, upg);
    side.querySelector('.lu-reroll-label').textContent =
      KS.t('rerollCost', 2 + luRerollsBy[idx]);
    side.querySelector('.lu-remaining').textContent =
      KS.t('choicesLeft', p.pendingLevels);
    renderStatsList(side.querySelector('.lu-stats-list'), p.snapshot());
  }

  function renderUpgradeCard(box, upg) {
    const info = KS.tierInfo(upg.tier);
    const def = upg.stat;
    const name = KS.Upgrades.statName(def);
    const upgradeName = def.names[upg.tier - 1] + ' Upgrade';
    const effect = KS.Upgrades.effectText(def, upg.tier);

    const card = document.createElement('div');
    card.className = 'up-card';
    card.style.borderColor = info.color;
    card.innerHTML = `
      <div class="up-tier" style="color:${info.color}">T${upg.tier} · ${info.name}</div>
      <div class="up-icon"></div>
      <div class="up-title">${name}</div>
      <div class="up-sub">${KS.t('upgrade')}</div>
      <div class="up-name">${upgradeName}</div>
      <div class="up-effect">${effect}</div>
      <button class="btn choose-btn">${KS.t('choose')}</button>
    `;
    card.querySelector('.up-icon').appendChild(
      makeIcon(`assets/upgrades/${def.key}_t${upg.tier}.png`, upg.icon));
    bindHoverSound(card);
    const choose = card.querySelector('.choose-btn');
    bindBtn(choose, () => chooseUpgrade(upg));
    box.appendChild(card);
  }

  function chooseUpgrade(upg) {
    const idx = luPlayerIdx;
    const p = game.players[idx];
    /* Builder statMods scale upgrade gains (damage x0.25, engineering
       x1.5 for Bair The Builder — spec §8); applied to THIS player only */
    const gain = KS.Upgrades.apply(upg, p.stats, (k, v) => p.statGain(k, v));
    const hpGain = KS.Upgrades.maxHpGain(upg);
    /* v0.11 §5: Barry's melee bonus follows speed upgrades immediately */
    p.recomputeDyn();
    if (hpGain > 0) p.refreshMaxHp(p.stats);
    p.pendingLevels--;

    if (p.pendingLevels > 0) {
      /* auto free reroll between picks — same player, same panel */
      luChoicesBy[idx] = KS.Upgrades.rollChoices(luRollLevel(), p.stats.luck);
      luChoices = luChoicesBy[idx];
      fillLevelUpSide(idx);
    } else {
      $('levelup').classList.remove('visible');
      hideTooltip();
      runNextBreakStep();
    }
  }

  function rerollLevelUp() {
    const idx = luPlayerIdx;
    const p = game.players[idx];
    const cost = 2 + luRerollsBy[idx];
    if (!p.spendMaterials(cost)) { toast(KS.t('needMaterials')); return; }
    luRerollsBy[idx]++;
    luChoicesBy[idx] = KS.Upgrades.rollChoices(luRollLevel(), p.stats.luck);
    luChoices = luChoicesBy[idx];
    fillLevelUpSide(idx);
  }

  /* ---------------- Shop screen (v0.10 §3-§5) ----------------
     Two COMPLETELY independent shop interfaces — one per player,
     each centered in its own half: own header (PLAYER n SHOP,
     materials, wave, reroll price), own four purchase cards, own
     inventory, own reroll price/count, own locks, own DONE button.
     Turn-based: P1 first, then P2; only the active player's
     buy/reroll/sell/combine/lock/DONE actually execute. */
  function rollShopFor(pi, prev) {
    const p = game.players[pi];
    const st = shopState[pi];
    /* v0.11 §3: turret offers are character-aware:
       - a player who owns ANY turret rolls no turret offers
       - Builder's Turret only rolls for Bair (3x chance for him)
       - the normal turret rolls for everyone else (Bair never sees it) */
    const isBair = p.charDef && p.charDef.id === 'builder';
    const ownsTurret = !!(p.turret || p.builderTurret);
    const excl = ownsTurret ? ['buildersTurret', 'normalTurret'] : [];
    /* v0.10 §12 + v0.11 §3: per-player appearance tracking */
    const res = KS.Shop.rollWithGuarantee(game.wave, p.stats.luck, prev, excl,
      st.visitsNoTurret, p.charDef, ownsTurret);
    st.entries = res.entries;
    st.visitsNoTurret = res.visits;
    st.last = res.entries;
  }

  function openShop() {
    shopTurn = 0;
    shopState.forEach((st) => { st.rerolls = 0; st.done = false; });
    rollShopFor(0, shopState[0].last);
    if (game.duo) rollShopFor(1, shopState[1].last);
    $('shop').classList.toggle('duo-mode', !!game.duo);
    $('shop-side-1').hidden = !game.duo;
    applySideActivity('shop-side', 0);          // P1 always shops first
    setShopTitles();
    renderShop();
    $('shop').classList.add('visible');
  }

  function setShopTitles() {
    for (const i of [0, 1]) {
      const el = $('shop-side-' + i).querySelector('.shop-title');
      el.textContent = game.duo
        ? KS.t('playerShop', String(i + 1))
        : KS.t('shopWave', game.wave);
    }
  }

  function setShopTurn(t) {
    shopTurn = t;
    applySideActivity('shop-side', t);
    renderShop();
  }

  function shopRerollCost(pi) {
    const st = shopState[pi];
    if (st.entries && st.entries.length && st.entries.every((e) => e.sold)) return 0;
    return KS.Shop.rerollPrice(game.wave, st.rerolls);
  }

  function renderShop() {
    renderShopSide(0);
    if (game.duo) renderShopSide(1);
  }

  function renderShopSide(pi) {
    const p = game.players[pi];
    const st = shopState[pi];
    const side = $('shop-side-' + pi);
    const box = side.querySelector('.shop-cards');
    box.innerHTML = '';
    (st.entries || []).forEach((entry, idx) => {
      box.appendChild(renderShopCard(entry, idx, pi));
    });
    const cost = shopRerollCost(pi);
    side.querySelector('.shop-reroll-label').textContent =
      cost === 0 ? KS.t('rerollFree') : KS.t('rerollCost', cost);
    side.querySelector('.shop-reroll-price').textContent = String(cost);
    side.querySelector('.sh-wave').textContent = KS.t('waveShort', String(game.wave));
    side.querySelector('.shop-mat-n').textContent = String(p.materials);
    const doneBtn = side.querySelector('.shop-done');
    doneBtn.textContent = game.duo ? KS.t('done') : KS.t('goNext', game.wave + 1);
    doneBtn.classList.toggle('turn-done', !!(game.duo && st.done));
    renderOwnedDisplayFor(p, side.querySelector('.so-items'), side.querySelector('.so-weapons'));
    renderStatsList(side.querySelector('.shop-stats-list'), p.snapshot());
  }

  function entryTitleHtml(entry) {
    const info = KS.tierInfo(entry.tier);
    const isWeapon = entry.kind === 'weapon';
    const name = KS.L(isWeapon ? C.WEAPONS[entry.id].name : KS.Shop.itemDef(entry.id).name);
    /* weapon class tags sit right under the title */
    const classes = isWeapon
      ? `<div class="sc-classes">${weaponClasses(C.WEAPONS[entry.id])}</div>` : '';
    return `<div class="sc-icon"></div>
      <div class="sc-name" style="color:${info.color}">${name}</div>${classes}
      <div class="sc-tier" style="color:${info.color}">T${entry.tier} · ${info.name}</div>`;
  }

  /* v0.10 §3: every purchase card carries a short description */
  function entryDescHtml(entry) {
    if (entry.kind === 'weapon') {
      return `<div class="sc-desc">${weaponClasses(C.WEAPONS[entry.id])}</div>`;
    }
    const def = KS.Shop.itemDef(entry.id);
    const desc = def.desc || def.fx.map(([k, v]) => `+${v} ${SL(k)}`).join(' · ');
    return `<div class="sc-desc">${desc}</div>`;
  }

  function fillEntryIcon(card, entry) {
    const holder = card.querySelector('.sc-icon');
    if (entry.kind === 'weapon') {
      const def = C.WEAPONS[entry.id];
      const img = document.createElement('img');
      img.src = def.icon;
      img.alt = '';
      holder.appendChild(img);
    } else {
      const def = KS.Shop.itemDef(entry.id);
      holder.appendChild(makeIcon(`assets/items/${def.id}.png`, def.icon));
    }
  }

  function entryStatsHtml(entry) {
    if (entry.kind === 'weapon') {
      const def = C.WEAPONS[entry.id];
      return weaponStatLines(def, entry.tier).slice(1)
        .map(([k, v]) => `<div class="sc-stat"><span>${k}</span><b>${typeof v === 'object' ? v.text : v}</b></div>`)
        .join('');
    }
    const def = KS.Shop.itemDef(entry.id);
    return def.fx.map(([k, v]) =>
      `<div class="sc-stat"><span></span><b style="color:#7fe694">+${v} ${SL(k)}</b></div>`)
      .join('');
  }

  function entryTooltipHtml(entry) {
    return entry.kind === 'weapon'
      ? weaponTooltipHtml(C.WEAPONS[entry.id], entry.tier)
      : itemTooltipHtml(KS.Shop.itemDef(entry.id));
  }

  function renderShopCard(entry, idx, pi) {
    const p = game.players[pi];
    const card = document.createElement('div');
    /* bought cards lose ALL content: only the empty box remains until
       the next reroll refills it */
    if (entry.sold) {
      card.className = 'shop-card emptied';
      return card;
    }
    /* affordability scoped to THIS player's balance (spec §7) */
    const afford = p.materials >= entry.price;
    card.className = 'shop-card' + (afford ? '' : ' cannot-afford');
    card.style.borderColor = KS.tierInfo(entry.tier).color;
    card.innerHTML = `
      ${entryTitleHtml(entry)}
      ${entryDescHtml(entry)}
      <div class="sc-stats">${entryStatsHtml(entry)}</div>
      <div class="sc-price${afford ? '' : ' cannot'}"><span class="mat-cube"></span> ${entry.price}</div>
      <button class="btn sc-buy" ${afford ? '' : 'data-broke="1"'}>${afford ? KS.t('buy') : KS.t('cannotAfford')}</button>
      <button class="lock-btn ${entry.locked ? 'on' : ''}">
        <span class="key-chip">E</span><span>${entry.locked ? KS.t('unlock') : KS.t('lock')}</span>
      </button>
    `;
    fillEntryIcon(card, entry);
    bindHoverSound(card);
    card.addEventListener('mouseenter', () => { hoveredShopBy[pi] = idx; });
    card.addEventListener('mousemove', (e) =>
      showTooltip(entryTooltipHtml(entry), e.clientX, e.clientY));
    card.addEventListener('mouseleave', hideTooltip);

    const buy = card.querySelector('.sc-buy');
    bindBtn(buy, () => buyEntry(entry, pi));    // debits THIS player
    const lock = card.querySelector('.lock-btn');
    bindBtn(lock, () => toggleLock(entry, card));
    if (entry.locked) {
      /* §3: clear locked indication on the card itself */
      const tag = document.createElement('div');
      tag.className = 'sc-locked-tag';
      tag.textContent = '🔒 ' + KS.t('lock');
      card.appendChild(tag);
    }
    return card;
  }

  function buyEntry(entry, pi) {
    const p = game.players[pi];
    if (game.duo && shopTurn !== pi) return;    // §5: turn enforcement
    if (entry.sold) return;
    if (p.materials < entry.price) { toast(KS.t('needMaterials')); return; }
    if (entry.kind === 'weapon') {
      if (!p.buyWeapon(entry.id, entry.tier)) { toast(KS.t('weaponsFull')); return; }
    } else {
      const def = KS.Shop.itemDef(entry.id);
      if (def.turret && (p.turret || p.builderTurret)) {
        toast(KS.t('turretOwned')); return;      // §6: one turret per player
      }
      /* v0.11 §3: Builder's Turret is purchasable ONLY by Bair The
         Builder — the visual shop AND every alternate route enforce it */
      if (def.turret && !(p.charDef && p.charDef.id === 'builder')) {
        toast(KS.t('builderTurretOnly')); return;
      }
      /* v0.11 §4: the normal turret is a separate structure; Bair's
         "no additional structures" rule blocks it for him alone */
      if (def.normalTurret) {
        if (p.turret || p.builderTurret) { toast(KS.t('turretOwned')); return; }
        if (p.charDef && p.charDef.id === 'builder') {
          toast(KS.t('builderNoExtraStructures')); return;
        }
      }
      if (!p.buyItem(def)) { toast(KS.t('turretOwned')); return; }
    }
    p.spendMaterials(entry.price);
    entry.sold = true;
    KS.Audio.clickSfx();
    refreshAllWeaponChips();
    renderShop();
  }

  function toggleLock(entry, card) {
    entry.locked = !entry.locked;
    const btn = card.querySelector('.lock-btn');
    btn.classList.toggle('on', entry.locked);
    btn.querySelector('span:last-child').textContent =
      entry.locked ? KS.t('unlock') : KS.t('lock');
  }

  /* rerolls are per player AND per turn (§4): each reroll costs THAT
     player's currency and rerolls only THAT player's cards */
  function rerollShopFor(pi) {
    const p = game.players[pi];
    const st = shopState[pi];
    if (game.duo && shopTurn !== pi) return;    // §5: only the active turn
    const cost = shopRerollCost(pi);
    if (cost > 0) {
      if (p.materials < cost) { toast(KS.t('needMaterials')); return; }
      p.spendMaterials(cost);
    }
    st.rerolls++;
    rollShopFor(pi, st.entries);
    renderShop();
  }

  /* §5: the DONE button lives at the bottom center of the active
     player's own half; only their click advances the turn */
  function shopDone(pi) {
    const st = shopState[pi];
    if (game.duo && shopTurn !== pi) return;
    if (st.done) return;
    st.done = true;
    if (!game.duo) return goNextWave();
    renderShop();
    if (pi === 0) setShopTurn(1);               // hand over to PLAYER 2
    else goNextWave();                          // both done -> next wave
  }

  function toggleLockHotkey() {
    if (!$('shop').classList.contains('visible')) return;
    const pi = game.duo ? shopTurn : 0;
    const entry = shopState[pi].entries && shopState[pi].entries[hoveredShopBy[pi]];
    if (!entry || entry.sold) return;
    const card = $('shop-side-' + pi).querySelectorAll('.shop-cards .shop-card')[hoveredShopBy[pi]];
    if (card) toggleLock(entry, card);
  }

  function renderOwnedDisplayFor(p, items, weapons) {
    /* scoped to THIS player's inventory — one player's chips never
       show up in the other player's panel */
    items.innerHTML = '';
    for (const item of p.ownedItems) {
      const el = document.createElement('div');
      el.className = 'owned-chip';
      el.style.borderColor = KS.tierInfo(item.tier).color;
      el.appendChild(makeIcon(`assets/items/${item.id}.png`, item.icon));
      el.addEventListener('mousemove', (e) => showTooltip(itemTooltipHtml(item), e.clientX, e.clientY));
      el.addEventListener('mouseleave', hideTooltip);
      items.appendChild(el);
    }
    /* v0.11 §4: normal turret — an owned turret chip with its current
       tier and a fixed-price UPGRADE button (builder's turret upgrades
       through Structure Range as before and shows no button) */
    if (p.turret && p.turret.normal) {
      const t = document.createElement('div');
      t.className = 'owned-chip turret-chip';
      const NT = C.NORMAL_TURRET;
      const atMax = p.turret.turretTier >= NT.tiers.length;
      const price = p.turret.nextUpgradePrice();
      t.innerHTML = `<img src="assets/buildersTurretT${Math.min(p.turret.turretTier, 4)}.png" alt="">
        <span class="t-tier">T${p.turret.turretTier}</span>`;
      t.addEventListener('mousemove', (e) => {
        const cur = NT.tiers[p.turret.turretTier - 1];
        showTooltip(`<div class="tt-title">Turret — T${p.turret.turretTier}</div>
          <div style="color:#8f8">Damage ${cur.damage} · ${cur.cooldown}s · ${cur.range}px</div>
          <div style="opacity:.7">${atMax ? 'Max tier' : 'Next: T' + (p.turret.turretTier + 1) +
            ' — ' + price + ' materials'}</div>`, e.clientX, e.clientY);
      });
      t.addEventListener('mouseleave', hideTooltip);
      if (!atMax) {
        const up = document.createElement('button');
        up.className = 'btn turret-up-btn';
        up.textContent = '▲ ' + price;
        bindBtn(up, () => {
          if (game.duo && shopTurn !== p.idx) return;    // §5 turn gate
          if (p.materials < price) { toast(KS.t('needMaterials')); return; }
          p.spendMaterials(price);
          p.turret.upgradeTier();
          KS.Audio.clickSfx();
          renderShop();
        });
        t.appendChild(up);
      }
      items.appendChild(t);
    }
    if (!p.ownedItems.length && !(p.turret && p.turret.normal)) {
      items.innerHTML = '<span class="owned-empty">—</span>';
    }
    if (p.ownedItems.length === 0 && p.turret && p.turret.normal) {
      items.appendChild(Object.assign(document.createElement('span'),
        { className: 'owned-empty', textContent: '—' }));
    }

    weapons.innerHTML = '';
    p.weapons.forEach((w, idx) => {
      const el = document.createElement('div');
      el.className = 'owned-chip';
      el.style.borderColor = KS.tierInfo(w.tier).color;
      el.innerHTML = `<img src="${w.def.icon}" alt="${KS.L(w.def.name)}">`;
      el.addEventListener('mousemove', (e) => showTooltip(weaponTooltipHtml(w.def, w.tier), e.clientX, e.clientY));
      el.addEventListener('mouseleave', hideTooltip);
      /* click an owned weapon to sell it or combine duplicates */
      bindBtn(el, () => openWeaponManage(idx, p));
      weapons.appendChild(el);
    });
  }

  /* ---------------- sell / combine owned weapons ---------------- */
  function openWeaponManage(idx, player) {
    /* §5: in duo only the ACTIVE shop turn's player manages weapons */
    if (game.duo && player.idx !== shopTurn) return;
    wmPlayer = player;
    const w = wmPlayer.weapons[idx];
    if (!w) return;
    wmIndex = idx;
    const info = KS.tierInfo(w.tier);
    $('wm-icon').innerHTML = `<img src="${w.def.icon}" alt="">`;
    $('wm-icon').style.borderColor = info.color;
    $('wm-name').textContent = w.def.name;
    $('wm-name').style.color = info.color;
    $('wm-tier').textContent = `T${w.tier} · ${info.name}`;
    $('wm-tier').style.color = info.color;
    renderStatLines($('wm-stats'), weaponStatLines(w.def, w.tier));

    const sellBtn = $('btn-wm-sell');
    const comBtn = $('btn-wm-combine');
    const canSell = wmPlayer.weapons.length > 1;
    sellBtn.disabled = !canSell;
    sellBtn.innerHTML = `<span class="mat-cube"></span> ${KS.t('sell')} +${KS.Shop.weaponSellPrice(w.def.id, w.tier)}`;

    const copies = wmPlayer.weapons.filter((x) =>
      x.def.id === w.def.id && x.tier === w.tier).length;
    const canCombine = copies >= 2 && w.tier < 4;
    comBtn.disabled = !canCombine;
    comBtn.textContent = canCombine
      ? `${KS.t('combine')} → T${w.tier + 1}`
      : KS.t('combine');

    let hint = '';
    if (!canSell) hint = KS.t('lastWeapon');
    else if (!canCombine) {
      hint = (w.tier >= 4 && copies >= 2) ? KS.t('maxTier') : KS.t('combineNeed');
    }
    $('wm-hint').textContent = hint;

    /* the popup centers over the OWNER's half */
    const wm = $('wep-manage');
    wm.classList.toggle('left', game.duo && wmPlayer.idx === 0);
    wm.classList.toggle('right', game.duo && wmPlayer.idx === 1);

    hideTooltip();
    wm.classList.remove('hidden');
  }

  function closeWeaponManage() {
    wmIndex = -1;
    wmPlayer = null;
    const wm = $('wep-manage');
    if (wm) wm.classList.add('hidden');
  }

  function sellWeapon() {
    const idx = wmIndex;
    if (idx < 0 || !wmPlayer || !wmPlayer.weapons[idx]) return;
    if (game.duo && wmPlayer.idx !== shopTurn) return;    // §5
    if (wmPlayer.weapons.length <= 1) { toast(KS.t('lastWeapon')); return; }
    const gained = wmPlayer.sellWeapon(idx);
    if (gained > 0) {
      KS.Audio.clickSfx();
      closeWeaponManage();
      refreshAllWeaponChips();
      renderShop();
    }
  }

  function combineWeapon() {
    const idx = wmIndex;
    if (idx < 0 || !wmPlayer) return;
    if (game.duo && wmPlayer.idx !== shopTurn) return;    // §5
    if (wmPlayer.combineWeapon(idx)) {
      KS.Audio.clickSfx();
      closeWeaponManage();
      refreshAllWeaponChips();
      renderShop();
    }
  }

  function goNextWave() {
    closeWeaponManage();
    hideTooltip();
    $('shop').classList.remove('visible');
    $('hud').classList.remove('dimmed');
    clearSideActivity();
    game.startWave(game.wave + 1);
  }

  /* =========================================================
     Pause menu (v0.10 §14): ONE interface per player — each half
     shows that player's weapons, items, stats and wave marker;
     either side's buttons control the shared run.
     ========================================================= */
  function openPause() {
    const duo = !!game.duo;
    $('pause').classList.toggle('duo-mode', duo);
    $('pause-side-1').hidden = !duo;
    if (!duo) {
      /* v0.10.1: single-player keeps the ORIGINAL v0.9 pause layout
         (buttons / weapons+items / stats / wave bar grid) */
      fillPauseSide($('pause-ui'), 0);
      return;
    }
    for (let i = 0; i < 2; i++) fillPauseSide($('pause-side-' + i), i);
  }

  function fillPauseSide(rootEl, i) {
    const side = rootEl;
    const p = game.players[i];
    const snap = p.snapshot();
    buildPauseWeapons(side, snap);
    buildPauseItems(side, snap, p);
    renderStatsList(side.querySelector('.pm-stats-list'), snap, true);
    side.querySelector('.pm-stats-toggle').textContent =
      statsTab === 'primary' ? 'Secondary ▸' : '◂ Primary';
    buildWaveBar(side, snap, p.charDef);
  }

  /* primary/secondary stats toggle — refreshes whichever pause
     structure is currently on screen (original grid or duo halves) */
  function refreshPauseStats() {
    const roots = game.duo
      ? [$('pause-side-0'), $('pause-side-1')]
      : [$('pause-ui')];
    roots.forEach((el, i) => {
      el.querySelector('.pm-stats-toggle').textContent =
        statsTab === 'primary' ? 'Secondary ▸' : '◂ Primary';
      renderStatsList(el.querySelector('.pm-stats-list'),
        game.players[i].snapshot(), true);
    });
  }

  function buildPauseWeapons(side, snap) {
    side.querySelector('.pm-weapons-title').textContent =
      `${KS.t('weapons')} (${snap.weapons.length}/${snap.maxWeapons})`;
    const box = side.querySelector('.pm-weapons');
    box.innerHTML = '';
    for (const w of snap.weapons) {
      const el = document.createElement('div');
      el.className = 'pm-icon';
      el.style.borderColor = KS.tierInfo(w.tier).color;
      el.innerHTML = `<img src="${w.def.icon}" alt="${KS.L(w.def.name)}">`;
      el.addEventListener('mousemove', (e) =>
        showTooltip(weaponTooltipHtml(w.def, w.tier), e.clientX, e.clientY));
      el.addEventListener('mouseleave', hideTooltip);
      box.appendChild(el);
    }
    for (let i = snap.weapons.length; i < snap.maxWeapons; i++) {
      const el = document.createElement('div');
      el.className = 'pm-icon';
      el.style.opacity = 0.35;
      el.innerHTML = '<span class="qmark">➕</span>';
      box.appendChild(el);
    }
  }

  function buildPauseItems(side, snap, player) {
    side.querySelector('.pm-items-title').textContent =
      `${KS.t('items')} (${snap.items.length})`;
    const box = side.querySelector('.pm-items');
    box.innerHTML = '';
    const ch = (player && player.charDef) || currentChar;

    const chip = document.createElement('div');
    chip.className = 'pm-icon char-chip';
    chip.innerHTML = `<img src="${ch.portrait}" alt="${ch.name}">`;
    chip.addEventListener('mousemove', (e) => {
      const tip = `<div class="tt-title">${ch.name}</div>
        <div style="opacity:.7;font-style:italic;margin-bottom:4px">${KS.L(ch.tagline)}</div>` +
        (KS.L(ch.bonusLines) || []).map((b) => `<div>${b}</div>`).join('');
      showTooltip(tip, e.clientX, e.clientY);
    });
    chip.addEventListener('mouseleave', hideTooltip);
    box.appendChild(chip);

    for (const item of snap.items) {
      const el = document.createElement('div');
      el.className = 'pm-icon';
      el.style.borderColor = KS.tierInfo(item.tier).color;
      el.appendChild(makeIcon(`assets/items/${item.id}.png`, item.icon));
      el.addEventListener('mousemove', (e) =>
        showTooltip(itemTooltipHtml(item), e.clientX, e.clientY));
      el.addEventListener('mouseleave', hideTooltip);
      box.appendChild(el);
    }
    if (!snap.items.length) {
      const empty = document.createElement('span');
      empty.className = 'pm-empty';
      empty.textContent = '—';
      box.appendChild(empty);
    }
  }

  /* ---------------- wave bar (pause, per player) ---------------- */
  function buildWaveBar(side, snap, charDef) {
    const dots = side.querySelector('.pm-dots');
    const marker = side.querySelector('.pm-marker');
    dots.innerHTML = '';
    const N = C.WAVES.length;
    markerDotX = [];
    const marks = new Set(C.WAVE_MARKS.filter((m) => m > 0));   // no "0" label
    const pos = (wv) => (wv / N) * 100;
    for (let wv = 1; wv <= N; wv++) {
      markerDotX[wv] = pos(wv);
      const dot = document.createElement('div');
      dot.className = 'pm-dot' + (marks.has(wv) ? ' marked' : '');
      if (wv === 20) {
        dot.classList.add('final');
        dot.textContent = '💀';
      }
      dot.style.left = pos(wv) + '%';
      dots.appendChild(dot);
    }
    for (const wv of marks) {
      const lbl = document.createElement('div');
      lbl.className = 'pm-dot-label' + (wv === 20 ? ' final' : '');
      lbl.textContent = wv;
      lbl.style.left = pos(wv) + '%';
      dots.appendChild(lbl);
    }
    if (marker) dots.appendChild(marker);
    updateWaveMarker(side, snap, charDef);
  }

  function updateWaveMarker(side, snap, charDef) {
    const N = C.WAVES.length;
    const wv = Math.min(Math.max(snap.wave, 1), N);
    const marker = side.querySelector('.pm-marker');
    const img = marker.querySelector('.pm-marker-img');
    img.src = charDef ? charDef.portrait : '';
    marker.style.left = markerDotX[wv] + '%';
    const ch = charDef || currentChar;
    if (!ch) return;
    const tip = `<div class="tt-title">${ch.name}</div>
      <div style="opacity:.7;font-style:italic;margin-bottom:4px">${KS.L(ch.tagline)}</div>
      <div style="display:flex;justify-content:space-between;gap:16px"><span style="opacity:.65">${KS.t('waveX', snap.wave)}</span><b>${snap.wave}</b></div>
      <div style="display:flex;justify-content:space-between;gap:16px"><span style="opacity:.65">${KS.t('maxHP')}</span><b>${snap.stats.maxHP}</b></div>
      <div style="display:flex;justify-content:space-between;gap:16px"><span style="opacity:.65">${SL('damage')}</span><b>${snap.stats.damage}%</b></div>
      <div style="display:flex;justify-content:space-between;gap:16px"><span style="opacity:.65">${SL('speedPct')}</span><b>+${snap.stats.speedPct}%</b></div>`;
    marker.onmousemove = (e) => showTooltip(tip, e.clientX, e.clientY);
    marker.onmouseleave = hideTooltip;
  }

  /* ---------------- pause confirmations ---------------- */
  const CONFIRM_TEXTS = () => ({
    restart: [KS.t('confirmRestart'), KS.t('confirmRestartText')],
    end:     [KS.t('confirmEnd'), KS.t('confirmEndText')],
    quit:    [KS.t('confirmQuit'), KS.t('confirmQuitText')],
  });

  function askConfirm(action) {
    confirmAction = action;
    hideTooltip();
    const [title, text] = CONFIRM_TEXTS()[action];
    $('pm-confirm-title').textContent = title;
    $('pm-confirm-text').textContent = text;
    $('pm-confirm').classList.remove('hidden');
    $('pause').classList.add('confirming');
  }

  function closeConfirm() {
    confirmAction = null;
    hideTooltip();
    $('pm-confirm').classList.add('hidden');
    $('pause').classList.remove('confirming');
  }

  function doConfirm() {
    const action = confirmAction;
    closeConfirm();
    if (action === 'restart') {
      startRun();
    } else if (action === 'end') {
      game.stop();
      showPlay();
      KS.Audio.restartMusic();
    } else if (action === 'quit') {
      game.stop();
      showMenu();
      KS.Audio.restartMusic();
    }
  }

  /* =========================================================
     Character visible-size measurement (v0.10 §11)
     All four characters must LOOK the same size: the opaque bounds
     (alpha bbox) of each portrait are measured at boot and every
     render (game sprite, select slots, preview) scales by the same
     factor. Normalized UP to the largest visible size — nobody is
     ever shrunk. Proportions are preserved (uniform scale only).
     ========================================================= */
  function measureVisibleFrac(img) {
    try {
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth || img.width;
      cv.height = img.naturalHeight || img.height;
      if (!cv.width || !cv.height) return 1;
      const g = cv.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let minX = cv.width, minY = cv.height, maxX = -1, maxY = -1;
      for (let y = 0; y < cv.height; y++) {
        for (let x = 0; x < cv.width; x++) {
          if (d[(y * cv.width + x) * 4 + 3] > 12) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0 || maxY < 0) return 1;
      return Math.max((maxX - minX + 1) / cv.width, (maxY - minY + 1) / cv.height);
    } catch (e) {
      return 1;                      // cross-origin or other failure: no scaling
    }
  }

  function computeCharScales() {
    const fr = {};
    for (const id of Object.keys(C.CHARACTERS)) {
      fr[id] = measureVisibleFrac(charPortraits[id]) || 1;
    }
    const ref = Math.max(fr.balanced || 0, ...Object.values(fr));
    KS.CharScale = {};
    for (const id of Object.keys(C.CHARACTERS)) {
      /* v0.11 §2 fix: the clamp used to CUT the compensation for
         characters with lots of transparent padding (Bair's visible
         body fills only ~76% of his canvas, so he needs a 1.32x draw
         scale to match the others' visible height). Widened clamp so
         full compensation is always applied — visible body matches,
         aspect ratio kept (uniform scale), collision untouched. */
      KS.CharScale[id] = Math.min(2.2, Math.max(0.8, ref / fr[id]));
    }
  }

  /* =========================================================
     Boot
     ========================================================= */
  function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('failed to load ' + src));
      img.src = src;
    });
  }

  async function boot() {
    try {
      KS.applyI18n();
      KS.Settings.apply('all');

      /* every playable character's portrait is preloaded so the
         in-game player sprite matches the selected character */
      const entries = Object.entries(ASSETS)
        .concat(Object.entries(C.CHARACTERS).map(([id, ch]) => ['char_' + id, ch.portrait]));
      const loaded = await Promise.all(entries.map(([, src]) => loadImage(src)));
      const imgs = Object.fromEntries(entries.map(([k], i) => [k, loaded[i]]));
      for (const id of Object.keys(C.CHARACTERS)) {
        charPortraits[id] = imgs['char_' + id] || imgs.portrait;
      }
      computeCharScales();

      /* Builder's Turret art per tier (spec §9): KS.Turret.images */
      KS.Turret.images = {
        T1: imgs.turretT1, T2: imgs.turretT2,
        T3: imgs.turretT3, T4: imgs.turretT4,
      };

      game = new KS.Game($('game'), {
        map: imgs.map, portrait: imgs.portrait, fist: imgs.fist,
        hand: imgs.hand, knife: imgs.knife,
        /* v0.11 §1: ranged weapon projectile art */
        pistol: imgs.pistol, smg: imgs.smg, shredder: imgs.shredder,
        revolver: imgs.revolver, shuriken: imgs.shuriken,
        enemy: {
          iphone: imgs.eIphone, camera: imgs.eCamera, chatgpt: imgs.eChatgpt,
          toilet: imgs.eToilet, gemini: imgs.eGemini, tiktok: imgs.eTiktok,
          claude: imgs.eClaude, drugs: imgs.eDrugs, airpods: imgs.eAirpods,
        },
      });
      bindHud();
      /* v0.11 §8: the dev console's /character unlock|lock refreshes
         the character select screen immediately (it runs even while
         that screen is open) */
      window.KSREFRESH_CHARS = () => {
        if (pickStage === 'p2char') { showCharacters2(); return; }
        if ($('characters').classList.contains('visible')) showCharacters();
      };

      /* v0.11 §5-§6: immediate unlock notification from the game loop */
      game.onUnlock = (charId, playerIdx) => {
        const ch = C.CHARACTERS[charId];
        toast(KS.t('unlockToast', KS.L(ch.name),
          playerIdx > 0 ? KS.t('player2') : KS.t('player1')), 3200);
      };
      buildRunOptions();
      buildSettings();
      /* hidden dev console (only reachable while the Dev Mode toggle is
         enabled, which itself only shows while Hebrew is selected) */
      KS.DevMode.init({ getGame: () => game });

      /* menu: unchanged two-button start screen — local multiplayer
         lives in RUN OPTIONS -> Co-Op (v0.10 §1) */
      bindBtn($('btn-start'), showPlay);
      bindBtn($('btn-settings'), showSettings);
      bindBtn($('btn-settings-back'), showMenu);

      /* run options screen */
      bindBtn($('btn-play-next'), showCharacters);
      bindBtn($('btn-play-back'), showMenu);

      /* BACK routing (v0.10 §8): every selection screen returns to
         ITS OWN previous stage, selections preserved */
      bindBtn($('btn-chars-back'), () => {
        /* P2 char -> P1 weapon screen; P1 char -> run options */
        if (pickStage === 'p2char') showWeapons();
        else showPlay();
      });
      bindBtn($('btn-weapons-back'), () => {
        /* P2 weapon -> P2 char; P1 weapon -> P1 char */
        if (pickStage === 'p2weapon') showCharacters2();
        else showCharacters();
      });
      bindBtn($('btn-diff-back'), () => {
        if (runSettings.coop) showWeapons2();
        else showWeapons();
      });

      /* pause buttons — the ORIGINAL solo ids and the duo per-side
         buttons all control the shared run */
      bindAll('.pm-act', (e) => {
        const pact = e.currentTarget.dataset.pact;
        if (pact === 'resume') setPaused(false);
        else if (pact === 'restart') askConfirm('restart');
        else if (pact === 'end') askConfirm('end');
        else if (pact === 'quit') askConfirm('quit');
      });
      bindBtn($('btn-resume'), () => setPaused(false));
      bindBtn($('btn-restart'), () => askConfirm('restart'));
      bindBtn($('btn-endrun'), () => askConfirm('end'));
      bindBtn($('btn-quit'), () => askConfirm('quit'));
      /* confirmation overlay (shared by both pause structures) */
      bindBtn($('btn-confirm-yes'), doConfirm);
      bindBtn($('btn-confirm-no'), closeConfirm);
      bindAll('.pm-stats-toggle', () => {
        statsTab = statsTab === 'primary' ? 'secondary' : 'primary';
        refreshPauseStats();
      });

      /* break screens — per-side buttons carry their owner index */
      bindAll('.lu-reroll', () => rerollLevelUp());
      for (const i of [0, 1]) {
        const cr = $('cr-side-' + i);
        if (cr) {
          bindBtn(cr.querySelector('.cr-take'), () => {
            if (game && game.duo && crPlayerIdx !== i) return;   // §5 turn gate
            finishOneCrate(true);
          });
          bindBtn(cr.querySelector('.cr-recycle'), () => {
            if (game && game.duo && crPlayerIdx !== i) return;
            finishOneCrate(false);
          });
        }
        const sh = $('shop-side-' + i);
        if (sh) {
          bindBtn(sh.querySelector('.shop-reroll'), () => rerollShopFor(i));
          bindBtn(sh.querySelector('.shop-done'), () => shopDone(i));
        }
      }

      /* weapon sell / combine popup */
      bindBtn($('btn-wm-sell'), sellWeapon);
      bindBtn($('btn-wm-combine'), combineWeapon);
      bindBtn($('btn-wm-close'), closeWeaponManage);
      $('wep-manage').addEventListener('click', (e) => {
        if (e.target === $('wep-manage')) closeWeaponManage();
      });

      /* game over buttons — per side */
      bindAll('.go-act', (e) => {
        const act = e.currentTarget.dataset.gact;
        if (act === 'retry') startRun();
        else if (act === 'retryWave') {
          $('gameover').classList.remove('visible');
          $('hud').classList.remove('dimmed');
          game.retryWave();
        } else if (act === 'continue') {
          $('gameover').classList.remove('visible');
          game.continueEndless();
        } else if (act === 'endrun') {
          game.stop();
          showPlay();
          KS.Audio.restartMusic();
        } else if (act === 'menu') {
          game.stop();
          showMenu();
          KS.Audio.restartMusic();
        }
      });

      /* hotkeys: F = level-up reroll, R = shop reroll (active turn),
         E = shop lock (active turn) */
      KS.Input.setHotkey('KeyF', () => {
        if ($('levelup').classList.contains('visible')) rerollLevelUp();
      });
      KS.Input.setHotkey('KeyR', () => {
        if ($('shop').classList.contains('visible')) rerollShopFor(game.duo ? shopTurn : 0);
      });
      KS.Input.setHotkey('KeyE', toggleLockHotkey);
      /* B toggles the enemy-system debugging overlay */
      KS.Input.setHotkey('KeyB', () => { debugOn = !debugOn; });

      KS.Input.setPauseHandler(() => {
        /* ESC first closes the weapon sell/combine popup */
        if (!$('wep-manage').classList.contains('hidden')) { closeWeaponManage(); return; }
        if (paused && confirmAction) { closeConfirm(); return; }
        setPaused(!paused);
      });
      window.addEventListener('blur', () => {
        if (game && game.running && !game.over && game.state === 'wave') setPaused(true);
      });

      KS.Audio.startMusic();

      window.KSDBG = {
        get game() { return game; },
        get state() {
          return { currentChar, currentWeaponId, currentDifficulty, runSettings,
            paused, statsTab, mpSel, pickStage, shopTurn, shopState,
            luPlayerIdx, crPlayerIdx };
        },
        startRun, showPlay, showCharacters, showWeapons,
        showCharacters2, showWeapons2, showDifficulty,
        openShop, openLevelUpFor, rerollShopFor, shopDone, setShopTurn,
        chooseUpgrade,
        setCoop: (v) => {
          runSettings.coop = v;
          $('btn-coop').classList.toggle('active', v);
          $('coop-state').textContent = v ? '☑' : '▢';
        },
        mpSetup: () => {
          runSettings.coop = true;
          mpSel = { chars: [currentChar, null],
            weapons: [currentWeaponId || null, null], difficulty: null };
        },
        mpComplete: (c2, w2) => {
          if (!mpSel) window.KSDBG.mpSetup();
          if (c2) mpSel.chars[1] = c2;
          if (w2) mpSel.weapons[1] = w2;
        },
      };

      $('btn-start').disabled = false;
      $('btn-start').textContent = KS.t('start');
    } catch (err) {
      console.error(err);
      $('btn-start').textContent = 'ERROR';
    }
  }

  boot();
})();
