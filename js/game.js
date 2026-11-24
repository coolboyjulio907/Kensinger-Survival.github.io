/* =========================================================
   Core game: loop, camera, wave clock, combat, rendering.
   - Larger-than-screen 3x3 arena with camera follow.
   - Weapons: array (up to MAX_WEAPONS), each auto-attacks on
     its own cooldown. Strikes LOCK their direction on fire,
     fly dead straight out-and-back and hit EVERY enemy they
     touch (infinite piercing).
   - Enemy system (see enemies.js): nine enemy identities with
     per-type AI, Standard/Advanced/Elite variants, boss waves
     (ChatGPT 5 / Gemini 10 / Claude 15 / AI Council 20) and a
     quota-based spawn director with red-X warnings.
   - EVERY killed enemy drops materials (reward by type/variant/
     boss); picking a material up grants +1 material AND +1 XP.
   - New waves: full heal + player teleports to map center.
   - Wave end: enemies clear, drops auto-collect, then the
     WAVE COMPLETED -> Level Up -> Shop intermission runs.
     Boss waves hold open until every boss is defeated.
   ========================================================= */
window.KS = window.KS || {};
(function () {
  const C = KS.CONFIG;
  const ARENA = KS.arenaSize();
  const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';
  const TAU = Math.PI * 2;

  class Game {
    constructor(canvas, images) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.images = images;
      if (images.enemy) KS.EnemySprites.init(images.enemy);
      this.running = false;
      this.over = false;
      this.paused = false;
      this.state = 'idle';           // 'wave' | 'break' | 'idle'
      this.onHUD = null;
      this.onRunEnd = null;
      this.onWaveComplete = null;    // (waveJustEnded) => main shows banner/levelup/shop
      this.camX = 0; this.camY = 0;
      this.cams = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
      this._lastFrame = 0;

      this.prerenderArena();
      window.addEventListener('resize', () => this.resize());
      this.resize();
      this.rafId = requestAnimationFrame((t) => { this.last = t; this.loop(t); });
    }

    /* ---------------- lifecycle ---------------- */
    start(charDef, opts = {}) {
      /* v0.9 §1: solo is a one-player game; startDuo() builds two */
      this.duo = false;
      this.nextWeaponUid = 1;          // shared counter: reset BEFORE minting
      const p = this.makePlayer(charDef, opts.weaponId || charDef.startingWeapon,
        opts.portrait || null);
      this.players = [p];
      this.begin(opts);
    }

    /* v0.9 §1: local two-player run — independent characters, weapons
       and bonuses per player (never cross-applied) */
    startDuo(selections, opts = {}) {
      this.duo = true;
      this.nextWeaponUid = 1;          // shared counter: reset BEFORE minting
      this.players = selections.map((sel, i) =>
        this.makePlayer(sel.charDef, sel.weaponId, sel.portrait || null, i));
      this.begin(opts);
    }

    makePlayer(charDef, weaponId, portrait, idx = 0) {
      const stats = Object.assign({}, charDef.stats);   // mutable run stats
      const p = new KS.Player(stats, idx);
      p.game = this;
      p.charDef = charDef;
      p.portraitImg = portrait;
      const wid = weaponId || charDef.startingWeapon;
      /* ---- weapon INSTANCES (spec §10) ----
         Every slot is an independent instance with a unique id: defs
         (C.WEAPONS) hold shared data; instances hold tier/cooldown/
         state. Identical weapons never merge. */
      p.weapons = [p.mkWeapon(wid, charDef.startingWeaponTier)];
      /* Brotato Brawler/Crazy structure (spec §3-§4): the chosen
         starting weapon PLUS one guaranteed bonus weapon as a separate
         instance — even when the chosen weapon is the same kind */
      if (charDef.bonusWeapon) {
        p.weapons.push(p.mkWeapon(charDef.bonusWeapon, 1));
      }
      /* Bair The Builder: exactly one unique Builder's Turret
         (spec §8) — re-deployed each wave; granted independently */
      p.builderTurret = !!charDef.turret;
      p.turret = null;
      /* v0.11 §5-§6: seed the dynamic-bonus layer (Barry's melee-from-
       speed, King's tier bonuses) right away so the very first frame
       already carries the correct stats */
      p.recomputeDyn();
      return p;
    }

    begin(opts = {}) {
      const charDef = this.players[0].charDef;
      this.charDef = charDef;
      this.opts = opts;
      this.difficulty = opts.difficulty || 0;
      this.mods = (C.DIFFICULTIES[this.difficulty] || C.DIFFICULTIES[0]).mods || {};
      this.endless = !!opts.endless;
      /* per-player split cameras */
      this.cams = this.players.map(() => ({ x: 0, y: 0 }));
      this.enemies = [];
      this.strikes = [];
      this.pprojs = [];              // v0.11 §1: player weapon projectiles
      this.dmgNums = [];
      this.dying = [];
      this.markers = [];             // red X spawn warnings
      this.drops = [];               // material pickups
      this.eprojs = [];              // enemy projectiles
      this.hazards = [];             // flush waves / soundwaves / clouds / zones
      this.hazPool = [];             // v0.10 §13: recycled hazard objects
      this.bosses = [];              // active boss references
      this.bossBanner = null;        // boss name shown under the wave banner
      this.bossBannerT = 0;
      this.pairSeq = 0;
      this.director = new KS.SpawnDirector(this);
      this.time = 0;
      this.kills = 0;
      this.wave = 0;
      this.shakeT = 0;
      this.waveFlash = 0;
      this.over = false;
      this.won = false;
      this.paused = false;
      this.running = true;
      this.last = performance.now();
      this.startWave(1);
    }

    stop() { this.running = false; }

    /* ---- v0.9 §1 compat accessors: single-player code (dev console,
       main UI, tests) reads/writes players[0] through these; duo code
       uses explicit per-player state ---- */
    get player() { return this.players[0]; }
    get charDef() { return this.players[0].charDef; }
    set charDef(v) { this.players[0].charDef = v; }
    get stats() { return this.players[0].stats; }
    set stats(v) { this.players[0].stats = v; }
    get weapons() { return this.players[0].weapons; }
    set weapons(v) { this.players[0].weapons = v; }
    get ownedItems() { return this.players[0].ownedItems; }
    set ownedItems(v) { this.players[0].ownedItems = v; }
    get crates() { return this.players[0].crates; }
    set crates(v) { this.players[0].crates = v; }
    get materials() { return this.players[0].materials; }
    set materials(v) { this.players[0].materials = v; }
    get level() { return this.players[0].level; }
    set level(v) { this.players[0].level = v; }
    get xp() { return this.players[0].xp; }
    set xp(v) { this.players[0].xp = v; }
    get pendingLevels() { return this.players[0].pendingLevels; }
    set pendingLevels(v) { this.players[0].pendingLevels = v; }
    get harvestMul() { return this.players[0].harvestMul; }
    set harvestMul(v) { this.players[0].harvestMul = v; }
    get builderTurret() { return this.players[0].builderTurret; }
    set builderTurret(v) { this.players[0].builderTurret = v; }
    get turret() { return this.players[0].turret; }
    set turret(v) { this.players[0].turret = v; }

    /* compat delegations (players[0]) — see Player for the real logic */
    weaponCooldown(w) { return this.players[0].weaponCooldown(w); }
    weaponReach(w) { return this.players[0].weaponReach(w); }
    applyWeaponFx(w, s) { return this.players[0].applyWeaponFx(w, s); }
    weaponFx(w) { return this.players[0].weaponFx(w); }
    statGain(k, v) { return this.players[0].statGain(k, v); }
    mkWeapon(id, t) { return this.players[0].mkWeapon(id, t); }
    buyWeapon(id, t) { return this.players[0].buyWeapon(id, t); }
    sellWeapon(i) { return this.players[0].sellWeapon(i); }
    combineWeapon(i) { return this.players[0].combineWeapon(i); }
    buyItem(itemDef) { return this.players[0].buyItem(itemDef); }
    spendMaterials(n) { return this.players[0].spendMaterials(n); }
    gainXP(n) { return this.players[0].gainXP(n); }
    xpNeed() { return this.players[0].xpNeed(); }
    snapshot() { return this.players[0].snapshot(); }
    resolveCrates() { return this.players[0].resolveCrates(); }
    convertUncollectedMaterials() { return this.players[0].convertUncollectedMaterials(); }

    startWave(n) {
      this.wave = n;
      this.waveTime = KS.waveDuration(n);
      this.waveBannerT = 2.2;
      this.enemies = [];
      this.markers = [];
      this.drops = [];
      this.eprojs = [];
      this.hazards = [];
      this.pprojs = [];              // v0.11 §1: clear live bullets each wave
      this.bosses = [];
      this.bossBanner = null;
      this.bossBannerT = 0;
      this.state = 'wave';
      this.over = false;
      this.won = false;                // clear any stale victory flag
      this.paused = false;
      /* Builder's Turret: one unique structure per player, re-deployed
         at the start of every wave (spec §9); duo builders deploy on
         their own half of the arena. Shop-bought turrets deploy too.
         v0.11 §4: the NORMAL turret is its own structure (own tier
         ladder, stats, targeting); normalTurret flag travels on the
         player so saved runs rebuild the right kind (§3 no-invalidate). */
      for (const p of this.players) {
        if (p.turret === 'pending') p.turret = null;   // fresh structure
        const ownsStruct = p.builderTurret || p.turret ||
          p.ownedItems.some((it) => it.turret || it.normalTurret);
        p.turret = ownsStruct
          ? new KS.Turret(this, p, this.duo ? p.idx : 0.5,
            { normal: !p.builderTurret && (p.normalTurret ||
              p.ownedItems.some((it) => it.normalTurret)) })
          : null;
      }
      /* quota-based spawn schedule for this wave (enemies + bosses) */
      this.director.startWave(n);
      this.waveQuotaUnits = this.director.totalUnits();   // horde-wave loot rule
      this.cratesDropped = 0;        // ordinary crates spawned this wave (spec §4)
      /* moving onto a new wave: full heal + back to the start area */
      const a = KS.arenaSize();
      this.players.forEach((p, i) => {
        /* duo: each player starts on their own half (§1: shared arena) */
        p.x = this.duo ? a / 2 + (i === 0 ? -70 : 70) : a / 2;
        p.y = a / 2;
        p.hp = p.maxHP;
        p.invuln = 0;
        p.regenAcc = 0;
        p.eliminated = false;
      });
      this.snapCamera();
      /* snapshot for the "Retry failed waves" setting (per player) */
      this.waveSnap = {
        wave: n,
        duo: !!this.duo,
        players: this.players.map((p) => ({
          stats: Object.assign({}, p.stats),
          materials: p.materials,
          earned: 0,
          level: p.level,
          xp: p.xp,
          harvestMul: p.harvestMul,
          charDefId: p.charDef.id,
          weapons: p.weapons.map((w) => ({ id: w.def.id, tier: w.tier })),
          items: p.ownedItems.map((it) => it.id),
          crates: p.crates.map((c) => ({ special: !!c.special })),
          builderTurret: p.builderTurret,
          ownedTurret: p.ownedItems.some((it) => it.turret),
        })),
      };
      this.last = performance.now();
    }

    retryWave() {
      const s = this.waveSnap;
      if (!s) { this.startWave(this.wave); return; }
      /* v0.9: per-player snapshots (solo has exactly one entry) */
      s.players.forEach((ps, i) => {
        const p = this.players[i];
        if (!p) return;
        p.stats = Object.assign({}, ps.stats);
        p.materials = ps.materials;
        p.earned = 0;
        p.level = ps.level;
        p.xp = ps.xp;
        p.harvestMul = ps.harvestMul;
        p.weapons = ps.weapons.map((w) => ({
          def: C.WEAPONS[w.id], tier: w.tier, timer: 0, mods: {},
          uid: this.nextWeaponUid++,
        }));
        p.ownedItems = ps.items.map((id) => KS.Shop.itemDef(id)).filter(Boolean);
        p.crates = (ps.crates || []).filter((c) => c && typeof c === 'object');
      });
      this.over = false;
      this.won = false;
      this.startWave(s.wave);
    }

    continueEndless() {
      if (!this.running) return;
      this.endless = true;
      this.over = false;
      this.won = false;
      this.startWave(this.wave + 1);
    }

    /* ---------------- arena pre-render ---------------- */
    prerenderArena() {
      const TILE = C.ARENA.TILE, N = C.ARENA.GRID;
      /* v0.9 §2: tiles render at the SCALED size — the playable area is
         genuinely smaller, not a zoom of the old map */
      const TS = TILE * C.ARENA.SCALE;
      const cv = document.createElement('canvas');
      cv.width = cv.height = ARENA;
      const g = cv.getContext('2d');

      for (let row = 0; row < N; row++)
        for (let col = 0; col < N; col++)
          g.drawImage(this.images.map, col * TS, row * TS, TS, TS);

      g.strokeStyle = 'rgba(0, 0, 0, 0.14)';
      g.lineWidth = 2;
      for (let i = 1; i < N; i++) {
        g.beginPath(); g.moveTo(i * TS, 0); g.lineTo(i * TS, ARENA); g.stroke();
        g.beginPath(); g.moveTo(0, i * TS); g.lineTo(ARENA, i * TS); g.stroke();
      }

      const edge = 46;
      const grads = [
        [0, 0, 0, edge], [0, ARENA, 0, ARENA - edge],
        [0, 0, edge, 0], [ARENA, 0, ARENA - edge, 0],
      ];
      for (const [x0, y0, x1, y1] of grads) {
        const gr = g.createLinearGradient(x0, y0, x1, y1);
        gr.addColorStop(0, 'rgba(0,0,0,0.30)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, ARENA, ARENA);
      }
      this.arenaCv = cv;
    }

    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.dpr = dpr;
      this.vw = window.innerWidth;
      this.vh = window.innerHeight;
      this.canvas.width = Math.round(this.vw * dpr);
      this.canvas.height = Math.round(this.vh * dpr);
      this.canvas.style.width = this.vw + 'px';
      this.canvas.style.height = this.vh + 'px';
    }

    computeView() {
      /* compatibility shim over computeViews() */
      const v = this.computeViews()[0];
      return { scale: v.scale, vw2: v.w / v.scale, vh2: v.h / v.scale };
    }

    /* jump the camera straight to the player (no long pan across the map) */
    snapCamera() {
      if (!this.players) return;
      this.players.forEach((p, i) => {
        const v = this.computeViews()[i] || this.computeViews()[0];
        const sc = Math.max(v.w, v.h) / (ARENA * C.VIEW.visibleFrac);
        const vw2 = v.w / sc, vh2 = v.h / sc;
        const cx = Math.min(Math.max(p.x - vw2 / 2, 0), Math.max(0, ARENA - vw2));
        const cy = Math.min(Math.max(p.y - vh2 / 2, 0), Math.max(0, ARENA - vh2));
        this.cams[i].x = cx; this.cams[i].y = cy;
        if (i === 0) { this.camX = cx; this.camY = cy; }
      });
    }

    /* v0.9 §1: split-screen viewports — P1 owns the LEFT half, P2 the
       RIGHT half; each has its own camera centered on its own player */
    computeViews() {
      const { vw, vh } = this;
      if (!this.duo) {
        const scale = Math.max(vw, vh) / (ARENA * C.VIEW.visibleFrac);
        return [{ x: 0, y: 0, w: vw, h: vh, scale,
          player: this.players ? this.players[0] : null, cam: this.cams ? this.cams[0] : { x: 0, y: 0 }, idx: 0 }];
      }
      const half = vw / 2;
      const scale = Math.max(half, vh) / (ARENA * C.VIEW.visibleFrac);
      return [
        { x: 0, y: 0, w: half, h: vh, scale, player: this.players[0], cam: this.cams[0], idx: 0 },
        { x: half, y: 0, w: half, h: vh, scale, player: this.players[1], cam: this.cams[1], idx: 1 },
      ];
    }

    mouseWorld() {
      const v = this.computeViews()[0];
      const m = KS.Input.mouse;
      return { x: m.x / v.scale + v.cam.x, y: m.y / v.scale + v.cam.y };
    }

    /* ---------------- main loop ---------------- */
    loop = (now) => {
      this.rafId = requestAnimationFrame(this.loop);
      /* optional 30 FPS cap (Limit FPS setting) */
      if (KS.Settings.get().limitFps && now - this._lastFrame < 33) return;
      const step = this._lastFrame ? now - this._lastFrame : 16.7;
      this._lastFrame = now;
      let dt = step / 1000;
      if (dt > 0.05) dt = 0.05;
      if (this.running && !this.paused && !this.over && this.state === 'wave') this.update(dt);
      else if (this.running && this.state === 'break') this.updateBreakFx(dt);
      this.render();
      if (this.onHUD && this.running) this.onHUD(this.hudDataAll());
    };

    /* ---------------- attack helpers ---------------- */
    /* effective cooldown of a weapon (attack speed stat + character
       bonuses such as Adkins' +50% with Unarmed weapons) */
    weaponCooldown(w) {
      const tdef = w.def.tiers[w.tier];
      let mul = 1 + (this.stats.attackSpeed || 0) / 100;
      if (w.def.classes && w.def.classes.includes('Unarmed') && this.stats.unarmedAS) {
        mul *= 1 + this.stats.unarmedAS / 100;
      }
      return tdef.cooldown / mul;
    }

    /* passive stat fx a weapon grants while equipped (Hand: Harvesting) */
    weaponFx(w) {
      const tdef = w.def.tiers[w.tier];
      const fx = [];
      if (tdef.harvest) fx.push(['harvesting', tdef.harvest]);
      return fx;
    }
    applyWeaponFx(w, sign = 1) {
      for (const [key, val] of this.weaponFx(w)) {
        this.stats[key] = (this.stats[key] || 0) + val * sign;
      }
    }

    /* v0.9 §1: one snapshot per player — every player's HUD shows its
       own health, weapons, materials (balance + this wave's earnings),
       XP and level; wave/boss info is shared */
    hudDataAll() {
      return this.players.map((p) => ({
        idx: p.idx,
        duo: !!this.duo,
        hp: Math.max(0, p.hp),
        maxHP: p.maxHP,
        eliminated: p.eliminated,
        time: this.time,
        kills: p.kills,               // v0.10 §7: own kill count
        materials: p.materials + p.earned,
        level: p.level,
        xp: p.xp,
        xpNeed: p.xpNeed(),
        pendingLevels: p.pendingLevels,
        charName: p.charDef ? p.charDef.name : '',
        wave: this.wave,
        waveTimeLeft: Math.max(0, this.waveTime),
        endless: this.endless,
        bosses: this.bossBars(),
        weapons: p.weapons.map((w) => ({
          uid: w.uid,
          icon: w.def.icon,
          tier: w.tier,
          cdFill: this.over ? 1 : Math.min(1, w.timer / p.weaponCooldown(w)),
          /* v0.11 §1: live ammunition state for the HUD chip */
          ammo: w.ammo ? w.ammo.left : null,          // null = no magazine
          reload: p.reloadProgress ? p.reloadProgress(w) : null,   // 0..1
        })),
      }));
    }

    hudData() {
      /* compatibility: solo-style snapshot of players[0] */
      return this.hudDataAll()[0];
    }

    /* debugging display (spec §12): wave, quotas, active count,
       variants, boss health, spawn queue — rendered by main.js */
    debugData() {
      if (!this.director) return '';
      const rem = this.director.remaining();
      const spawned = this.director.spawned || {};
      const variants = { standard: 0, advanced: 0, elite: 0 };
      let ordinary = 0;
      for (const e of this.enemies) {
        if (e.dead || e.boss) continue;
        ordinary++;
        variants[e.variant.id] = (variants[e.variant.id] || 0) + 1;
      }
      const fmt = (o) => Object.entries(o).map(([k, v]) => `${k}:${v}`).join(' ') || '—';
      const lines = [
        `WAVE ${this.wave}  (${Math.max(0, this.waveTime).toFixed(1)}s left)  state=${this.state}`,
        `active ordinary: ${ordinary}/${this.bossAlive() ? C.ENEMY.bossOrdinaryCap : C.ENEMY.maxAlive}` +
          ` (cap: ${this.bossAlive() ? 'BOSS ACTIVE' : 'normal'})  markers: ${this.markers.length}`,
        `variants alive — std ${variants.standard} · adv ${variants.advanced} · elite ${variants.elite}`,
        `spawn queue: ${this.director.queue.length} events · boss queue: ${this.director.bossQueue.length}`,
        `spawned:  ${fmt(spawned)}`,
        `quota left: ${fmt(rem)}`,
        `projectiles: ${this.eprojs.length}  hazards: ${this.hazards.length}`,
      ];
      for (const b of this.bosses) {
        lines.push(`BOSS ${b.bossCfg.name}: ${Math.max(0, Math.round(b.hp))}/${b.maxHP}` +
          ` (${(b.hp / b.maxHP * 100).toFixed(0)}%)  phase ${b.phase()}${b.dead ? '  DEAD' : ''}`);
      }
      return lines.join('\n');
    }

    /* ---------------- update (active wave) ---------------- */
    update(dt) {
      this.time += dt;
      /* v0.9 §1: every alive player runs its own movement, takes its
         own contact/projectile damage and fires its own weapons */
      for (const p of this.players) {
        if (p.eliminated) continue;
        /* distraction clouds slow the player (strongest applies, never stacks) */
        p.update(dt, KS.cloudSlow(this.hazards, p));
      }

      /* v0.11 §5: Barry's standing-still armor penalty updates live
         (disappears the moment movement resumes); §5-§6 unlock
         progress is reported from each player's OWN stats. */
      for (const p of this.players) {
        if (p.eliminated) continue;
        p.applyStillArmor(!p.moving);
        if (KS.Unlocks) {
          const sp = p.stats.speedPct || 0;
          const got = KS.Unlocks.reportSpeed(sp);
          if (got && this.onUnlock) this.onUnlock(got, p.idx);
          const t4 = p.weapons.filter((w) => w.tier === 4).length;
          const gotK = KS.Unlocks.reportTier4Weapons(t4);
          if (gotK && this.onUnlock) this.onUnlock(gotK, p.idx);
        }
      }

      /* --- wave clock — when it expires the wave holds open until
         the field is clear (and any boss is dead): remaining enemies
         are DEFEATED by the player, never discarded (spec §4-§5) --- */
      this.waveTime -= dt;
      if (this.waveBannerT > 0) this.waveBannerT -= dt;
      if (this.bossBannerT > 0) this.bossBannerT -= dt;
      if (this.waveTime <= 0) {
        this.waveTime = 0;               // overtime: scheduling has stopped
        const leftover = this.enemies.some(e => !e.dead) || this.markers.length > 0;
        if (leftover || this.bossAlive()) {
          /* overtime — the player finishes the remaining enemies */
        } else {
          this.endWave();
          return;
        }
      }

      /* --- spawn markers -> enemies --- */
      for (const m of this.markers) m.t -= dt;
      for (let i = this.markers.length - 1; i >= 0; i--) {
        if (this.markers[i].t <= 0) {
          this.enemies.push(this.markers[i].enemy);
          this.markers.splice(i, 1);
        }
      }

      /* --- spawn director: quota schedule + boss entrances --- */
      this.director.update(dt);

      /* --- enemies: per-type AI + contact damage vs EVERY player --- */
      for (const e of this.enemies) {
        if (e.dead) continue;
        e.update(dt, this);
        if (e.spawnT > 0 || e.dmg <= 0) continue;    // harmless while spawning in / contactless
        for (const p of this.players) {
          if (p.eliminated) continue;
          const dx = p.x - e.x, dy = p.y - e.y;
          if (Math.hypot(dx, dy) < p.r + e.r) {
            const res = p.hurt(e.dmg);
            if (res === 'dodge') {
              this.pushDmg(p.x, p.y - p.r - 10, 'DODGE', false);
            } else if (res === 'hit') {
              if (KS.Settings.get().screenshake) this.shakeT = C.FX.shakeTime;
              if (p.hp <= 0) this.eliminate(p);
            }
          }
        }
      }

      /* --- enemy projectiles: move + hit the first player they touch --- */
      for (const pr of this.eprojs) {
        pr.update(dt);
        if (pr.dead) continue;
        for (const p of this.players) {
          if (p.eliminated) continue;
          if (Math.hypot(p.x - pr.x, p.y - pr.y) < p.r + pr.r) {
            pr.dead = true;
            const res = p.hurt(pr.dmg);
            if (res === 'dodge') {
              this.pushDmg(p.x, p.y - p.r - 10, 'DODGE', false);
            } else if (res === 'hit') {
              if (KS.Settings.get().screenshake) this.shakeT = C.FX.shakeTime;
              if (p.hp <= 0) this.eliminate(p);
            }
            break;
          }
        }
      }
      /* splitting orbs burst into a radial cluster on expiry */
      for (const pr of this.eprojs) {
        if (pr.dead && pr.split > 0) {
          for (let i = 0; i < pr.split; i++) {
            this.eprojs.push(new KS.EProj(pr.x, pr.y,
              i * TAU / pr.split + Math.random() * 0.4, 210, pr.dmg, 'text',
              { r: 6, life: 2.2 }));
          }
          pr.split = 0;
        }
      }
      this.eprojs = this.eprojs.filter(pr => !pr.dead);

      /* --- hazards: flush waves / soundwaves / clouds / zones --- */
      KS.updateHazards(this.hazards, dt, this);

      /* Builder's Turrets: one per player; auto-targets, aims and
         fires on its own cooldown with its owner's stats (spec §9) */
      for (const p of this.players) {
        if (p.turret) p.turret.update(dt);
      }

      /* --- weapons: fully automatic attacks (spec §7) ---
         Manual clicking is disabled as a combat input: every weapon
         instance fires on its own cooldown, only when a real enemy is
         in reach. Mouse input stays UI-only. Per player (v0.9 §1).
         v0.11 §1: Ranged-class weapons fire PlayerProj bullets with
         per-instance magazines; the automatic reload gates firing
         but never touches movement. */
      for (const p of this.players) {
        if (p.eliminated) continue;
        for (const w of p.weapons) {
          w.timer += dt;
          const reloading = p.tickReload(w, dt);
          if (reloading) { w.timer = 0; continue; }   // busy reloading
          if (w.timer >= p.weaponCooldown(w)) {
            const isRanged = w.def.classes && w.def.classes.includes('Ranged');
            const reach = isRanged
              ? (w.def.range + (p.stats.range || 0))          // full range stat for guns
              : p.weaponReach(w);
            if (this.nearestEnemy(p, reach)) {
              if (!p.consumeAmmo(w)) continue;               // dry: wait for reload
              w.timer = 0;
              if (isRanged) this.fireRanged(p, w);
              else this.doStrike(p, w);
            }
          }
        }
      }
      for (const s of this.strikes) {
        s.update(dt);
        this.applyStrikeHits(s.owner || this.players[0], s);
      }
      /* v0.11 §1: player projectiles — move + collide; a hard pool cap
         keeps memory flat even in extreme waves */
      for (const pr of this.pprojs) pr.update(dt, this);
      this.pprojs = this.pprojs.filter((pr) => !pr.dead);
      if (this.pprojs.length > C.PROJ.poolCap) {
        this.pprojs.length = C.PROJ.poolCap;   // trim oldest overflow
      }

      /* --- material drops --- */
      this.updateDrops(dt);

      /* --- fx lists --- */
      for (const n of this.dmgNums) n.update(dt);
      for (const d of this.dying) d.t += dt;

      this.strikes = this.strikes.filter(s => !s.dead);
      this.dmgNums = this.dmgNums.filter(n => !n.dead);
      this.dying = this.dying.filter(d => d.t < 0.3);
      this.enemies = this.enemies.filter(e => !e.dead);

      if (this.shakeT > 0) this.shakeT -= dt;
      if (this.waveFlash > 0) this.waveFlash -= dt;
    }

    /* break-state fx: damage numbers drift away, drop fly-in */
    updateBreakFx(dt) {
      for (const n of this.dmgNums) n.update(dt);
      this.dmgNums = this.dmgNums.filter(n => !n.dead);
      for (const s of this.strikes) s.update(dt);
      this.strikes = this.strikes.filter(s => !s.dead);
      this.updateDrops(dt, true);
    }

    updateDrops(dt, collectAll = false) {
      /* v0.9 §1: each drop is attracted to and collected by the nearest
         player; earnings credit THAT player (own currency, own XP). */
      for (let i = this.drops.length - 1; i >= 0; i--) {
        const d = this.drops[i];
        d.t += dt;
        /* nearest alive player to this drop */
        let p = null, pd = Infinity;
        for (const q of this.players) {
          if (q.eliminated) continue;
          const dd = Math.hypot(q.x - d.x, q.y - d.y);
          if (dd < pd) { pd = dd; p = q; }
        }
        if (!p) p = this.players[0];
        const magnet = 80 + (p.stats.pickupRange || 0) * 0.6;
        const dx = p.x - d.x, dy = p.y - d.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (collectAll || dist < magnet) {
          const sp = collectAll ? 900 : Math.max(240, 900 - dist * 2);
          d.x += (dx / dist) * sp * dt;
          d.y += (dy / dist) * sp * dt;
        }
        if (collectAll || dist < p.r + 12) {
          if (d.type === 'fruit') {
            /* fruit heals (spec §4): base 3 + % Consumable Heal */
            const heal = C.LOOT.fruitHeal + (p.stats.consumableHeal || 0);
            const before = p.hp;
            p.hp = Math.min(p.maxHP, p.hp + heal);
            this.pushDmg(p.x, p.y - p.r - 12, `+${Math.round(p.hp - before)} HP`, false);
            KS.Audio.pickupSfx();
          } else if (d.type === 'crate') {
            /* register for the end-of-wave reward screen (spec §4) —
               credited to the COLLECTING player */
            p.crates.push({ special: !!d.special });
            KS.Audio.pickupSfx();
          } else {
            /* each picked-up material grants +1 material AND bulk XP:
               1 XP per material (scaled by % XP Gain) — v0.9 §1: the
               earnings accumulate on THIS player and are credited to
               their balance exactly once at the end of the wave */
            p.earned += d.val;
            p.gainXP(Math.max(1,
              Math.round(d.val * (1 + (p.stats.xpGain || 0) / 100))));
            KS.Audio.pickupSfx();
          }
          this.drops.splice(i, 1);
        }
      }
    }

    pushDmg(x, y, val, crit) {
      if (!KS.Settings.get().damageDisplay && typeof val === 'number') return;
      this.dmgNums.push(new KS.DamageNumber(x, y, val, crit));
    }

    weaponReach(w) {
      return (w.def.range + (this.stats.range || 0) * 0.5) * C.MELEE_RANGE_SCALE;
    }

    /* ---------------- spawning ---------------- */
    /* pick an arena-edge spot at least minDist from the player;
       never inside the arena center where the principal walks */
    spawnSpot(minDist = C.ENEMY.minSpawnDist) {
      const a = KS.arenaSize(), m = C.ENEMY.edgeMargin;
      let best = null, bestD = -1;
      for (let i = 0; i < 14; i++) {
        const side = (Math.random() * 4) | 0;
        let x, y;
        if (side === 0)      { x = m + Math.random() * (a - m * 2); y = m; }
        else if (side === 1) { x = a - m; y = m + Math.random() * (a - m * 2); }
        else if (side === 2) { x = m + Math.random() * (a - m * 2); y = a - m; }
        else                 { x = m; y = m + Math.random() * (a - m * 2); }
        /* v0.9 §1: keep clear of EVERY alive player (duo: both halves) */
        let d = Infinity;
        for (const q of this.players) {
          if (q.eliminated) continue;
          d = Math.min(d, Math.hypot(x - q.x, y - q.y));
        }
        if (d === Infinity) d = Math.hypot(x - a / 2, y - a / 2);
        if (d >= minDist) return { x, y };
        if (d > bestD) { bestD = d; best = { x, y }; }
      }
      return best;                       // farthest candidate (no cheating)
    }

    /* one quota spawn event: red X warning, then the enemy appears.
       AirPods: one event = one PAIR (two independently targetable pods). */
    queueEnemySpawn(type) {
      const def = C.ENEMIES[type];
      const variant = KS.SpawnDirector.rollVariant(this.wave);
      /* safety valve: if past the active cap, a random ordinary enemy
         is sacrificed without loot or kill credit */
      const alive = this.enemies.reduce((n, e) => n + (!e.dead && !e.boss ? 1 : 0), 0);
      const cap = this.bossAlive() ? C.ENEMY.bossOrdinaryCap : C.ENEMY.maxAlive;
      if (alive >= cap) {
        const victims = this.enemies.filter(e => !e.dead && !e.boss && e.spawnT <= 0);
        if (victims.length) {
          const v = victims[(Math.random() * victims.length) | 0];
          v.dead = true;
          v.sacrificed = true;
          this.dying.push({ x: v.x, y: v.y, r: v.r, color: v.color, t: 0 });
        }
      }
      if (def.pair) {
        const s1 = this.spawnSpot(), s2 = this.spawnSpot();
        const pairId = ++this.pairSeq;
        const a = new KS.Enemy(type, variant, this, s1.x, s1.y, { pairId, pairSlot: 0 });
        const b = new KS.Enemy(type, variant, this, s2.x, s2.y, { pairId, pairSlot: 1 });
        a.partner = b; b.partner = a;
        this.markers.push({ x: s1.x, y: s1.y, t: C.ENEMY.markerTime, enemy: a });
        this.markers.push({ x: s2.x, y: s2.y, t: C.ENEMY.markerTime, enemy: b });
      } else {
        const s = this.spawnSpot();
        const e = new KS.Enemy(type, variant, this, s.x, s.y);
        this.markers.push({ x: s.x, y: s.y, t: C.ENEMY.markerTime, enemy: e });
      }
    }

    /* boss entrance: teleport-in animation + roar + name banner.
       Bosses bypass the ordinary-enemy cap. */
    spawnBoss(cfg) {
      const s = this.spawnSpot(320);
      const b = new KS.Enemy(cfg.base, 'standard', this, s.x, s.y, { boss: cfg });
      this.enemies.push(b);
      this.bosses.push(b);
      this.bossBanner = cfg.name;
      this.bossBannerT = 3.4;
      if (KS.Settings.get().screenshake) this.shakeT = C.FX.shakeTime * 2;
      KS.Audio.abilitySfx('bossRoar');
    }

    bossAlive() {
      return this.bosses.some(b => !b.dead);
    }

    /* data for the boss health bars (main.js renders them) */
    bossBars() {
      return this.bosses
        .filter(b => !b.dead)
        .map(b => ({ name: b.bossCfg.name, hp: Math.max(0, b.hp), maxHP: b.maxHP }));
    }

    nearestEnemy(p, range) {
      let best = null, bd = Infinity;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y) - e.r;
        if (d <= range && d < bd) { bd = d; best = e; }
      }
      return best;
    }

    /* damage/knockback for every enemy the strike tip touches.
       Infinite piercing: the strike never stops, each enemy is
       damaged at most once per swing. */
    applyStrikeHits(p, s) {
      if (s.dead) return;
      const pos = s.pos();
      for (const e of this.enemies) {
        if (e.dead || e.spawnT > 0 || s.hits.has(e)) continue;
        if (Math.hypot(e.x - pos.x, e.y - pos.y) > e.r + s.hitR) continue;
        s.hits.add(e);
        const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
        const died = e.hit(s.dmg, s.dirX * s.kb, s.dirY * s.kb, this);
        this.pushDmg(e.x, e.y - e.r - 6, s.dmg, s.crit);
        if (!s.stole && p.tryLifesteal()) {
          s.stole = true;
          this.pushDmg(p.x, p.y - p.r - 12, '+1', false);
        }
        if (died) this.onKill(e, p);
      }
    }

    /* fire a strike: the direction is LOCKED here and the strike
       then flies dead straight. Auto mode aims at the nearest
       enemy; manual aim aims at the cursor — but the travel
       distance is ALWAYS clamped to the weapon reach, so the
       weapon can never fly to a far-away click point. */
    doStrike(p, w) {
      const tdef = w.def.tiers[w.tier];
      const stats = p.stats;                 // the firing player's stats
      const reach = p.weaponReach(w);

      /* direction: always toward the nearest valid target — the
         mouse is never part of combat (spec §7) */
      let dirX, dirY;
      const target = this.nearestEnemy(p, reach);
      if (!target) return;
      const dx = target.x - p.x, dy = target.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      dirX = dx / d; dirY = dy / d;

      const crit = Math.random() < w.def.critChance + (stats.critChance || 0) / 100;
      const scalingPct = w.def.scalingPct == null ? 100 : w.def.scalingPct;
      let dmg = tdef.damage
        * (1 + (stats[w.def.scalingStat] || 0) / 100 * scalingPct / 100)
        * (1 + (stats.damage || 0) / 100);
      if (crit) dmg *= w.def.critMult;

      const kb = (w.def.knockback + (stats.knockback || 0)) * C.FX.knockbackScale;
      this.strikes.push(new KS.Strike(p.x, p.y, dirX, dirY, reach, {
        dmg, crit, kb, hitR: 16,
        owner: p,                     // v0.9 §1: who fired it (lifesteal etc.)
        /* per-instance visual: each weapon uses its own attack art
           (fistAttack / handAttack / knifeAttack) */
        img: this.images[w.def.id] || this.images.fist,
        size: w.def.id === 'fist' ? 44 : 40,
        rot: w.def.artFace === 'left' ? Math.PI / 2 : 0,
        lead: w.def.artFace === 'left' ? 0.22 : 0,
      }));
      KS.Audio.punchSfx();
    }

    /* v0.11 §1: fire a RANGED weapon — a projectile per shot aimed at
       the nearest enemy in reach. SMG carries a moderate random spread;
       shredder rounds are slower, heavier explosive rounds; shuriken
       spins and pierces one extra enemy; pistol/revolver are exact. */
    fireRanged(p, w) {
      const tdef = w.def.tiers[w.tier];
      const stats = p.stats;
      const reach = w.def.range + (stats.range || 0);
      const target = this.nearestEnemy(p, reach);
      if (!target) return;
      const dx = target.x - p.x, dy = target.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      let ang = Math.atan2(dy, dx);
      const id = w.def.id;

      if (id === 'smg') ang += (Math.random() - 0.5) * 0.16;   // moderate spread

      const crit = Math.random() < w.def.critChance + (stats.critChance || 0) / 100;
      const scalingPct = w.def.scalingPct == null ? 100 : w.def.scalingPct;
      let dmg = tdef.damage
        * (1 + (stats[w.def.scalingStat] || 0) / 100 * scalingPct / 100)
        * (1 + (stats.damage || 0) / 100);
      if (crit) dmg *= w.def.critMult;

      const kb = (w.def.knockback + (stats.knockback || 0)) * C.FX.knockbackScale;
      const P = C.PROJ;
      this.pprojs.push(new KS.PlayerProj(p.x, p.y, ang, {
        dmg, crit,
        kb,
        speed: id === 'shredder' ? P.shredderSpeed : P.speed,
        def: w.def,
        owner: p,
        pierceLeft: id === 'shuriken' ? 1 : 0,          // §1: pierce one extra enemy
        spin: id === 'shuriken' ? P.shurikenSpin : 0,
        life: Math.max(0.35, reach / (id === 'shredder' ? P.shredderSpeed : P.speed)),
      }));
      KS.Audio.punchSfx();
    }

    /* v0.11 §1: shredder explosion — small area damage around the
       impact point. Each enemy is damaged at most once per explosion
       (the caller's hit Set travels through `pr.hits`). */
    shredderBlast(pr, impact) {
      const P = C.PROJ;
      const R = P.shredderBlastR * (1 + ((pr.owner && pr.owner.stats.explosionSize) || 0) / 100);
      const splash = pr.dmg * P.shredderBlastDmg *
        (1 + ((pr.owner && pr.owner.stats.explosionDamage) || 0) / 100);
      const owner = pr.owner || this.players[0];
      for (const e of this.enemies) {
        if (e.dead || e.spawnT > 0 || pr.hits.has(e)) continue;
        if (Math.hypot(e.x - impact.x, e.y - impact.y) > e.r + R) continue;
        pr.hits.add(e);                                   // once per explosion
        const died = e.hit(splash, 0, 0, this);
        this.pushDmg(e.x, e.y - e.r - 6, splash, false);
        if (died) this.onKill(e, owner);
      }
    }

    spawnPickup(e, type, special = false) {
      const a = Math.random() * Math.PI * 2;
      this.drops.push({
        x: e.x + Math.cos(a) * 8, y: e.y + Math.sin(a) * 8,
        t: Math.random() * 3, val: 0, type, special,
      });
    }

    /* v0.10 §7: kills are attributed to the killer — the strike's
       owner, a turret's owner, or nobody (sacrifices / overtime clears).
       The shared total still feeds records; every HUD shows the OWN count. */
    onKill(e, by) {
      this.kills++;
      if (by && by.kills != null) by.kills++;
      /* loot roll (spec §3-§5): wave-scaled material chance with a
         probabilistic fractional value, then an independent consumable
         roll (fruit vs diminishing crate). Bosses bypass the chances. */
      const loot = KS.Loot.rollForKill(this, e);
      if (loot.mats > 0) {
        /* split into a few visual cubes; near the pickup cap, values
           merge into existing pickups instead of adding objects */
        let val = loot.mats;
        const cap = C.LOOT.maxMatPickups;
        const matsOnGround = this.drops.filter((d) => d.type === 'mat').length;
        if (matsOnGround >= cap && this.drops.some((d) => d.type === 'mat')) {
          const target = this.drops.find((d) => d.type === 'mat');
          target.val += val;
        } else {
          const cubes = Math.max(1, Math.min(4, Math.round(val / 3)));
          const per = Math.max(1, Math.floor(val / cubes));
          let left = val;
          for (let i = 0; i < cubes && left > 0; i++) {
            const v = i === cubes - 1 ? left : Math.min(left, per);
            left -= v;
            const a = Math.random() * Math.PI * 2;
            this.drops.push({
              x: e.x + Math.cos(a) * 8, y: e.y + Math.sin(a) * 8,
              t: Math.random() * 3, val: v, type: 'mat',
            });
          }
        }
      }
      if (loot.fruit) this.spawnPickup(e, 'fruit');
      if (loot.crate) {
        this.spawnPickup(e, 'crate');
        this.cratesDropped++;          // diminishing: ordinary crates only
      }
      if (e.boss) {
        /* guaranteed boss reward (spec §5): never suppressed by the
           ordinary drop-rate rules */
        if (C.LOOT.bossCrateGuarantee) this.spawnPickup(e, 'crate', true);
        /* boss death: dark explosion feel + sound */
        if (KS.Settings.get().screenshake) this.shakeT = C.FX.shakeTime * 2;
        KS.Audio.abilitySfx('bossDie');
      }
    }

    gainXP(amount) {
      this.xp += amount;
      while (this.xp >= this.xpNeed()) {
        this.xp -= this.xpNeed();
        this.level++;
        this.pendingLevels++;
      }
    }

    xpNeed() {
      /* level n -> n+1 costs (n+3)^2 - 3 XP */
      return (this.level + 3) * (this.level + 3) - 3;
    }

    /* ---------------- wave end / intermission ---------------- */
    /* v0.10 §7 (currency): the wave's material income is COMBINED
       across players and credited identically to EVERY player — a
       duplicated shared reward, not a shared spending balance.
       Counted exactly once per pickup:
         1. Builder conversion consumes uncollected ground mats first.
         2. Remaining drops auto-collect into the nearest player's
            earned tally (each drop credited once).
         3. Per-player harvesting income is rolled (5% growth rule).
         4. combined = sum(all earned) + sum(all harvest) -> credited
            to every player. Solo: identical to the old behavior. */
    computeWaveIncome() {
      const convs = this.players.map((p) =>
        p.builderTurret ? p.convertUncollectedMaterials() : 0);
      this.collectAllDrops();
      const earned = this.players.map((p) => {
        const e = p.earned; p.earned = 0; return e;
      });
      const harvest = this.players.map((p) => {
        const h = Math.round((p.stats.harvesting || 0) * p.harvestMul);
        p.harvest = h;
        p.harvestMul *= this.wave < C.WAVES.length ? 1.05 : 0.8;
        return h;
      });
      const combined = earned.reduce((a, b) => a + b, 0) +
        harvest.reduce((a, b) => a + b, 0);
      this.players.forEach((p) => { p.materials += combined; });
      return this.players.map((p, i) => ({
        earned: earned[i], harvest: harvest[i],
        builderConv: convs[i], reward: combined,
        crateItems: p.resolveCrates(),     // shown as per-player reward steps
      }));
    }

    endWave() {
      if (!this.endless && this.wave >= C.WAVES.length) {
        /* victory: same combined crediting, then auto-take crates */
        const finalIncome = this.computeWaveIncome();
        finalIncome.forEach((pp, i) => {
          for (const { item } of pp.crateItems) this.players[i].buyItem(item);
        });
        this.victory();
        return;
      }
      /* the field is clear by definition here — wipe residuals only.
         Enemies that were defeated during overtime already dropped
         their loot through onKill. */
      this.enemies = [];
      this.markers = [];
      this.strikes = [];
      this.eprojs = [];
      this.hazards = [];
      this.bosses = [];
      const perPlayer = this.computeWaveIncome();

      this.state = 'break';
      if (this.onWaveComplete) {
        this.onWaveComplete(this.wave, perPlayer);
      }
    }

    collectAllDrops() { this.updateDrops(0, true); }

    /* shop hooks */
    /* character stat-modification scaling (Bair The Builder, spec §8):
       damage gains are reduced by 75%, engineering gains are increased
       by 50% — applied to every upgrade / item that grants these */
    statGain(key, val) {
      const mods = this.charDef && this.charDef.statMods;
      if (!mods) return val;
      if (key === 'damage' && mods.damageMul != null) return val * mods.damageMul;
      if (key === 'engineering' && mods.engineeringMul != null) return val * mods.engineeringMul;
      return val;
    }

    /* new weapon INSTANCE: unique id, own tier/cooldown/mods (spec §10) */
    mkWeapon(defId, tier) {
      const def = C.WEAPONS[defId];
      if (!def) throw new Error('unknown weapon: ' + defId);
      return { uid: this.nextWeaponUid++, def, tier, timer: 0, mods: {} };
    }

    buyWeapon(id, tier) {
      if (this.weapons.length >= C.MAX_WEAPONS) return false;
      const w = this.mkWeapon(id, tier);
      this.weapons.push(w);
      this.applyWeaponFx(w, 1);      // e.g. Hand grants Harvesting
      return true;
    }
    sellWeapon(idx) {
      const w = this.weapons[idx];
      if (!w) return 0;
      if (this.weapons.length <= 1) return 0;
      const price = KS.Shop.weaponSellPrice(w.def.id, w.tier);
      this.applyWeaponFx(w, -1);     // remove its passive stats
      this.weapons.splice(idx, 1);
      this.materials += price;
      return price;
    }
    combineWeapon(idx) {
      const w = this.weapons[idx];
      if (!w || w.tier >= 4) return false;
      /* only works with a second copy of the SAME weapon at the SAME tier */
      const j = this.weapons.findIndex((x, i) =>
        i !== idx && x.def.id === w.def.id && x.tier === w.tier);
      if (j < 0) return false;
      const [hi, lo] = idx > j ? [idx, j] : [j, idx];
      this.applyWeaponFx(this.weapons[hi], -1);
      this.applyWeaponFx(this.weapons[lo], -1);
      this.weapons.splice(hi, 1);
      this.weapons.splice(lo, 1);
      const up = this.mkWeapon(w.def.id, w.tier + 1);
      this.weapons.push(up);
      this.applyWeaponFx(up, 1);
      return true;
    }
    buyItem(itemDef) {
      this.ownedItems.push(itemDef);
      for (const [key, val] of itemDef.fx) {
        this.stats[key] = (this.stats[key] || 0) + this.statGain(key, val);
      }
      if (itemDef.fx.some(([k]) => k === 'maxHP')) {
        /* extra max HP also heals nothing (Brotato rule) — cap stays */
      }
      this.player.refreshMaxHp(this.stats);
      return true;
    }
    spendMaterials(n) {
      if (this.materials < n) return false;
      this.materials -= n;
      return true;
    }

    /* v0.9 §1: an eliminated player sits out; the run ends when ALL
       players are down (duo) or the single player dies (solo) */
    eliminate(p) {
      p.eliminated = true;
      if (this.players.every((q) => q.eliminated)) this.defeat();
    }

    defeat() {
      this.over = true;
      this.won = false;
      if (this.onRunEnd) this.onRunEnd({
        won: false, time: this.time, kills: this.kills,
        perKills: this.players.map((p) => p.kills),
        wave: this.wave, endless: this.endless, difficulty: this.difficulty,
        duo: !!this.duo,
      });
    }

    victory() {
      this.over = true;
      this.won = true;
      if (this.onRunEnd) this.onRunEnd({
        won: true, time: this.time, kills: this.kills,
        perKills: this.players.map((p) => p.kills),
        wave: this.wave, endless: this.endless, difficulty: this.difficulty,
        duo: !!this.duo,
      });
    }

    /* data for the pause menu / break screens */
    snapshot() {
      return {
        charDef: this.charDef,
        stats: this.stats,
        weapons: this.weapons.map((w) => ({ uid: w.uid, def: w.def, tier: w.tier })),
        maxWeapons: C.MAX_WEAPONS,
        items: this.ownedItems,
        materials: this.materials,
        level: this.level,
        xp: this.xp,
        xpNeed: this.xpNeed(),
        pendingLevels: this.pendingLevels,
        wave: this.wave,
        endless: this.endless,
        difficulty: this.difficulty,
        time: this.time,
        kills: this.kills,
      };
    }

    /* ---------------- render ---------------- */
    render() {
      const ctx = this.ctx;
      const { vw, vh, dpr } = this;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = '#0b0812';
      ctx.fillRect(0, 0, vw, vh);
      if (!this.running || !this.players) return;

      /* v0.9 §1: TWO independently rendered views in duo — each half has
         its own camera following its own player (never a shared zoom-out) */
      const views = this.computeViews();
      for (const v of views) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(v.x, v.y, v.w, v.h);
        ctx.clip();
        this.renderWorld(ctx, v);
        ctx.restore();
        this.renderViewOverlay(ctx, v);
      }
      /* visually clear divider between the two halves */
      if (views.length === 2) {
        ctx.fillStyle = 'rgba(8, 6, 14, 0.95)';
        ctx.fillRect(vw / 2 - 3, 0, 6, vh);
        ctx.fillStyle = '#3d3556';
        ctx.fillRect(vw / 2 - 1, 0, 2, vh);
      }
    }

    /* per-view screen-space overlays: wave banner, overtime, boss name */
    renderViewOverlay(ctx, v) {
      const cx = v.x + v.w / 2;
      const vwH = v.w, vhH = v.h;
      const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';

      if (this.waveBannerT > 0 && this.state === 'wave') {
        const t = this.waveBannerT;
        const a = Math.min(1, t / 0.4, (2.2 - t) / 0.35 + 0.15);
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, a));
        ctx.textAlign = 'center';
        ctx.font = `900 ${Math.round(Math.min(vwH, vhH) * 0.09)}px ${FONT}`;
        ctx.lineWidth = 8;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        const label = `WAVE ${this.wave}`;
        ctx.strokeText(label, cx, vhH * 0.24);
        ctx.fillStyle = '#ffe9a8';
        ctx.fillText(label, cx, vhH * 0.24);
        ctx.restore();
      }

      if (this.state === 'wave' && this.waveTime <= 0 &&
          (this.enemies.some(e => !e.dead) || this.markers.length > 0)) {
        const msg = (typeof KS.t === 'function' && KS.t('clearRemaining')) || 'CLEAR THE REMAINING ENEMIES';
        const pulse = 0.55 + 0.45 * Math.abs(Math.sin(performance.now() / 280));
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.textAlign = 'center';
        ctx.font = `800 ${Math.round(Math.min(vwH, vhH) * 0.030)}px ${FONT}`;
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(msg, cx, vhH * 0.175);
        ctx.fillStyle = '#ffd23f';
        ctx.fillText(msg, cx, vhH * 0.175);
        ctx.restore();
      }

      if (this.bossBannerT > 0 && this.bossBanner && this.state === 'wave') {
        const t = this.bossBannerT;
        const a = Math.min(1, t / 0.5, (3.4 - t) / 0.45 + 0.2);
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, a));
        ctx.textAlign = 'center';
        ctx.font = `900 ${Math.round(Math.min(vwH, vhH) * 0.052)}px ${FONT}`;
        ctx.lineWidth = 7;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(this.bossBanner, cx, vhH * 0.34);
        ctx.fillStyle = '#ff5b5b';
        ctx.fillText(this.bossBanner, cx, vhH * 0.34);
        ctx.restore();
      }
    }

    renderWorld(ctx, v) {
      const scale = v.scale;
      const p = v.player;
      /* an eliminated player's camera spectates their teammate */
      const focus = (this.duo && p && p.eliminated && this.players.some(q => !q.eliminated))
        ? this.players.find(q => !q.eliminated) : p;
      const vw2 = v.w / scale, vh2 = v.h / scale;
      const tx = focus ? focus.x - vw2 / 2 : (ARENA - vw2) / 2;
      const ty = focus ? focus.y - vh2 / 2 : (ARENA - vh2) / 2;
      const cx = Math.min(Math.max(tx, 0), Math.max(0, ARENA - vw2));
      const cy = Math.min(Math.max(ty, 0), Math.max(0, ARENA - vh2));
      v.cam.x += (cx - v.cam.x) * 0.22;
      v.cam.y += (cy - v.cam.y) * 0.22;
      if (v.idx === 0) { this.camX = v.cam.x; this.camY = v.cam.y; }

      ctx.save();
      /* v0.9 §1: draw into THIS view's screen region (P2's half is
         offset by the divider position) */
      ctx.translate(v.x, v.y);
      if (this.shakeT > 0 && KS.Settings.get().screenshake) {
        const m = C.FX.shakeMag * (this.shakeT / C.FX.shakeTime);
        ctx.translate((Math.random() - 0.5) * 2 * m, (Math.random() - 0.5) * 2 * m);
      }
      ctx.scale(scale, scale);
      ctx.translate(-v.cam.x, -v.cam.y);

      /* arena */
      ctx.drawImage(this.arenaCv, 0, 0);

      /* enemy shadows */
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (const e of this.enemies) {
        if (e.dead) continue;
        ctx.beginPath();
        ctx.ellipse(e.x, e.y + e.r * 0.85, e.r * 0.8, e.r * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      /* red X spawn markers — blink, 1s before spawn */
      if (this.markers.length) {
        const blinkOn = (performance.now() / 1000) % 0.66 < 0.4;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#ff2b2b';
        ctx.shadowColor = 'rgba(255,40,40,0.9)';
        ctx.shadowBlur = 10;
        for (const m of this.markers) {
          if (!blinkOn && KS.Settings.get().visualEffects) continue;
          const s = 13 + Math.sin(m.t * 9) * 2;
          ctx.globalAlpha = KS.Settings.get().visualEffects ? 0.95 : 0.8;
          ctx.beginPath();
          ctx.moveTo(m.x - s, m.y - s); ctx.lineTo(m.x + s, m.y + s);
          ctx.moveTo(m.x + s, m.y - s); ctx.lineTo(m.x - s, m.y + s);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      /* hazards under the enemies: clouds, warning circles, wave rings */
      KS.drawHazards(ctx, this.hazards, KS.Settings.get().visualEffects);

      /* enemies — sprite per identity, wind-up telegraphs, variant
         rings, shields (all inside Enemy.draw) */
      for (const e of this.enemies) {
        if (e.dead) continue;
        e.draw(ctx, this);
      }

      /* sacrificed enemies — fade-out puff */
      for (const d of this.dying) {
        const a = 1 - d.t / 0.3;
        ctx.save();
        ctx.globalAlpha = a * 0.8 * (KS.Settings.get().explosionOpacity / 100);
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r * (1 + (1 - a) * 1.2), 0, Math.PI * 2);
        ctx.fillStyle = d.color;
        ctx.fill();
        ctx.restore();
      }

      /* pickups: green material cubes, red fruit, wooden/golden crates */
      for (const d of this.drops) {
        const bob = Math.sin(d.t * 5) * 2;
        ctx.save();
        ctx.translate(d.x, d.y + bob);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(0, 7 - bob, 8, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        const r = 5.5;
        if (d.type === 'fruit') {
          /* apple: red body + green leaf + shine */
          ctx.shadowColor = 'rgba(255, 90, 70, 0.85)';
          ctx.shadowBlur = 9;
          ctx.fillStyle = '#e8402e';
          ctx.strokeStyle = 'rgba(80,10,5,0.9)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 1, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#3fae4a';
          ctx.beginPath();
          ctx.ellipse(3.5, -r + 1.5, 3.4, 1.7, -0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.beginPath();
          ctx.arc(-2, -0.5, 1.8, 0, Math.PI * 2);
          ctx.fill();
        } else if (d.type === 'crate') {
          /* loot crate: wooden box with straps; boss crates are golden */
          const gold = !!d.special;
          ctx.shadowColor = gold ? 'rgba(255, 200, 40, 0.95)' : 'rgba(160, 110, 45, 0.8)';
          ctx.shadowBlur = gold ? 12 : 7;
          ctx.fillStyle = gold ? '#e8b53a' : '#a4713a';
          ctx.strokeStyle = gold ? 'rgba(90,60,5,0.95)' : 'rgba(45,25,5,0.95)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(-r, -r, r * 2, r * 2, 2);
          ctx.fill();
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = gold ? 'rgba(120,80,10,0.9)' : 'rgba(60,35,10,0.8)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(-r, 0); ctx.lineTo(r, 0);
          ctx.moveTo(0, -r); ctx.lineTo(0, r);
          ctx.stroke();
        } else {
          ctx.shadowColor = 'rgba(90, 235, 120, 0.8)';
          ctx.shadowBlur = 8;
          ctx.fillStyle = '#5ee87f';
          ctx.strokeStyle = 'rgba(10,60,25,0.9)';
          ctx.lineWidth = 2;
          const r2 = 4;
          ctx.beginPath();
          ctx.roundRect(-r2, -r2, r2 * 2, r2 * 2, 2.5);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }

      /* v0.9 §1: every player is drawn in the shared world — each view
         shows its own player centered; the other player appears too */
      for (const q of this.players) {
        if (q.eliminated) continue;
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath();
        ctx.ellipse(q.x, q.y + q.r * 0.9, q.r * 0.85, q.r * 0.34, 0, 0, Math.PI * 2);
        ctx.fill();

        /* accessibility: character highlighting ring */
        if (KS.Settings.get().hlCharacter) {
          ctx.beginPath();
          ctx.ellipse(q.x, q.y + q.r * 0.55, q.r * 1.15, q.r * 0.5, 0, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 230, 0, 0.95)';
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        const bobY = q.moving ? Math.sin(q.bob) * 2.4 : 0;
        const blink = q.invuln > 0 && Math.floor(q.invuln * 14) % 2 === 0;
        /* v0.9.1 fix: every player ALWAYS wears their OWN selected
           character — on both halves of a duo screen. The run-level
           portrait is only a last-resort fallback (solo). */
        const img = q.portraitImg || this.images.portrait;
        /* v0.10 §11: visible-size normalization — the sprite scale is
           measured from each portrait's opaque bounds at boot, so all
           four characters LOOK the same size (collision body unchanged) */
        const vis = (KS.CharScale && q.charDef && KS.CharScale[q.charDef.id]) || 1;
        const h = q.r * 2.9 * vis;
        const w2 = h * (img.width / img.height);
        ctx.save();
        ctx.globalAlpha = blink ? 0.45 : 1;
        ctx.drawImage(img, q.x - w2 / 2, q.y + bobY - h * 0.62, w2, h);
        ctx.restore();

        /* v0.11 fix: a held RANGED weapon is ALWAYS visible on the
           character — the equipped gun rides at the player's side,
           pointing at the nearest enemy (so the gun does the shooting;
           the bullets fly out of it). Melee/shuriken weapons keep the
           classic lunge visuals only. */
        const gun = q.weapons && q.weapons.find((wd) =>
          wd.def.classes && wd.def.classes.includes('Ranged') && wd.def.id !== 'shuriken');
        if (gun) {
          const gimg = this.images[gun.def.id];
          if (gimg) {
            /* aim at the nearest enemy in reach (falls back to last move dir) */
            const reachNow = gun.def.range + (q.stats.range || 0);
            const tgt = this.nearestEnemy(q, reachNow);
            let ga;
            if (tgt) ga = Math.atan2(tgt.y - q.y, tgt.x - q.x);
            else ga = q.lastMoveAng != null ? q.lastMoveAng : 0;
            const gh = q.r * 1.15;                     // gun art height
            const gw = gh * (gimg.width / gimg.height);
            /* hold it at the hip, offset toward the facing side */
            const ox = Math.cos(ga) * q.r * 0.95;
            const oy = Math.sin(ga) * q.r * 0.95;
            ctx.save();
            if (blink) ctx.globalAlpha = 0.45;
            ctx.translate(q.x + ox, q.y + oy + bobY * 0.5);
            ctx.rotate(ga + Math.PI / 2);              // art points UP
            ctx.drawImage(gimg, -gw / 2, -gh / 2, gw, gh);
            ctx.restore();
          }
        }

        /* HP bar on character (setting) */
        if (KS.Settings.get().hpBarChar) {
          const bw = 44, bh = 6, bx = q.x - bw / 2, by = q.y + q.r * 1.25;
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
          ctx.fillStyle = q.hp / q.maxHP < 0.3 ? '#ff5b5b' : '#5ee87f';
          ctx.fillRect(bx, by, bw * Math.max(0, q.hp / q.maxHP), bh);
        }
      }

      /* Builder's Turrets: every player's structure + its projectiles */
      for (const q of this.players) {
        if (q.turret) q.turret.draw(ctx);
      }

      /* weapon strikes — each strike flies dead straight (out & back)
         carrying its weapon's attack image (spec §5-§6) */
      for (const s of this.strikes) {
        if (s.dead) continue;
        const pos = s.pos();
        const img = s.img || this.images.fist;
        const aspect = img.width / img.height;
        const h = (s.size || 44) + s.progress() * 10;
        const wd = h * aspect;
        const ang = Math.atan2(s.dirY, s.dirX);
        ctx.save();
        if (KS.Settings.get().hlWeapons) {
          ctx.shadowColor = 'rgba(255,230,0,0.9)';
          ctx.shadowBlur = 12;
        }
        ctx.translate(pos.x, pos.y);
        /* v0.9 §7: each weapon art has its own facing — fist/knife are
           drawn pointing UP (rotate +PI/2), the hand palm pushes LEFT
           (rotate +PI). The lead shift puts the striking edge at the
           strike position so the hitbox matches the visible attack. */
        ctx.rotate(ang + Math.PI / 2 + (s.rot || 0));
        const back = (s.lead || 0) * h;
        ctx.drawImage(img, -wd / 2, -h / 2 + back, wd, h);
        ctx.restore();
      }

      /* v0.11 §1: player projectiles (ranged weapons) — drawn above
         enemies with each weapon's own icon; shuriken spins */
      const projImg = (id) => (this.images[id] || null);
      for (const pr of this.pprojs) {
        if (pr.dead) continue;
        pr.draw(ctx, projImg(pr.def && pr.def.id));
      }

      /* damage numbers */
      ctx.textAlign = 'center';
      for (const n of this.dmgNums) {
        if (n.dead) continue;
        const a = Math.max(0, 1 - n.t / C.FX.dmgNumLife);
        ctx.globalAlpha = a;
        ctx.font = n.crit ? `bold 26px ${FONT}` : `bold 19px ${FONT}`;
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(n.val, n.x, n.y);
        ctx.fillStyle = n.crit ? '#ffb020' : '#ffffff';
        ctx.fillText(n.val, n.x, n.y);
        if (n.crit) {
          ctx.font = `bold 13px ${FONT}`;
          ctx.strokeText('CRIT!', n.x, n.y + 16);
          ctx.fillText('CRIT!', n.x, n.y + 16);
        }
        ctx.globalAlpha = 1;
      }

      /* enemy projectiles (above enemies, below the player) */
      const fxOn = KS.Settings.get().visualEffects;
      for (const pr of this.eprojs) {
        if (!pr.dead) pr.draw(ctx, fxOn);
      }

      ctx.restore();
    }
  }

  KS.Game = Game;
})();
