/* =========================================================
   Entities: Player, Enemy, floating damage numbers, weapon strikes.
   The Player now references the run's MUTABLE stats object, so
   level-up upgrades / shop items affect it immediately.
   ========================================================= */
window.KS = window.KS || {};
(function () {
  const C = KS.CONFIG;

  /* ---------------- Player ----------------
     v0.9 §1 (local multiplayer): every player owns its complete RUN
     state — stats, weapons, items, crates, materials, XP, level and
     its own Builder's Turret. In single-player the Game's compat
     accessors delegate to players[0]; in duo each player is fully
     independent (own progression, own currency, own shop purchases). */
  class Player {
    /* stats = the run's live (mutable) stat object */
    constructor(stats, idx = 0) {
      this.idx = idx;
      this.stats = stats;
      const a = KS.arenaSize();
      this.x = a / 2;
      this.y = a / 2;
      this.r = C.PLAYER.radius;
      this.hp = stats.maxHP;
      this.maxHP = stats.maxHP;
      this.level = stats.level || 1;
      this.invuln = 0;
      this.moving = false;
      this.bob = 0;
      this.age = 0;
      this.regenAcc = 0;
      this.lastSteal = -Infinity;
      /* ---- per-player run state ---- */
      this.game = null;            // backref set by Game.start/startDuo
      this.charDef = null;
      this.weapons = [];
      this.ownedItems = [];
      this.crates = [];
      this.materials = 0;          // spent balance
      this.earned = 0;             // collected this wave -> credited at wave end
      this.kills = 0;              // v0.10 §7: THIS player's kill count
      this.xp = 0;
      this.pendingLevels = 0;
      this.harvestMul = 1;
      this.builderTurret = false;
      this.turret = null;          // this player's own structure
      this.eliminated = false;
      this.portraitImg = null;
      this.harvest = 0;            // last wave's harvest income (results UI)
    }

    /* keep hp ratio sane when max HP changes */
    refreshMaxHp(stats) {
      this.stats = stats;
      const ratio = this.maxHP ? this.hp / this.maxHP : 1;
      this.maxHP = stats.maxHP;
      this.hp = Math.min(this.maxHP, Math.ceil(this.maxHP * ratio));
    }

    /* =========================================================
       v0.11 §5-§6: DYNAMIC character bonuses.
       Barry Adkins: +1 Melee Damage per 2% Movement Speed — recomputed
       from the CURRENT total speedPct (permanent + temporary sources)
       whenever any stat changes; -100 Armor while standing still
       (movement zeroes it again).
       King Kensinger: +/- bonuses from every owned weapon's tier and
       every DIFFERENT item id's tier (an item never counts twice);
       recomputed on every buy/sell/combine/tier change so nothing
       gets stuck.
       Both live in __dyn (separate layer from base stats so removal
       always restores exactly what was added).
       ========================================================= */
    recomputeDyn() {
      if (!this.charDef) return;
      /* wipe the previous dynamic layer, then rebuild it */
      const dyn = this.__dyn || (this.__dyn = {});
      for (const k of Object.keys(dyn)) { this.stats[k] -= dyn[k]; delete dyn[k]; }

      const cd = this.charDef;
      if (cd.dynamicSpeedMelee) {
        /* §5: floor(speedPct / 2) — every 2% grants +1 Melee Damage.
           Negative speed counts as 0 (no penalty double-dipping). */
        const bonus = Math.floor(Math.max(0, this.stats.speedPct || 0) / 2);
        dyn.meleeDMG = (dyn.meleeDMG || 0) + bonus;
        this.stats.meleeDMG += bonus;
      }
      if (cd.tierKing) {
        /* §6: count each owned weapon once by its CURRENT tier; count
           items by DIFFERENT ids (duplicates of the same item count
           once — use that item's tier). */
        let t1w = 0, t4w = 0, t1i = 0, t4i = 0;
        for (const w of this.weapons) {
          if (w.tier === 1) t1w++;
          if (w.tier === 4) t4w++;
        }
        const seen = new Set();
        for (const it of this.ownedItems) {
          if (seen.has(it.id)) continue;
          seen.add(it.id);
          if (it.tier === 1) t1i++;
          if (it.tier === 4) t4i++;
        }
        dyn.damage = (dyn.damage || 0) + 25 * t4w - 15 * t1w;
        dyn.attackSpeed = (dyn.attackSpeed || 0) + 25 * t4w - 15 * t1w;
        dyn.maxHP = (dyn.maxHP || 0) + 5 * t4i - 2 * t1i;
        this.stats.damage += dyn.damage;
        this.stats.attackSpeed += dyn.attackSpeed;
        this.stats.maxHP += dyn.maxHP;
        if (dyn.maxHP) this.refreshMaxHp(this.stats);
      }
    }

    /* §5: standing-still armor penalty — called every frame with the
       player's live moving flag. 'still' = not actively moving. */
    applyStillArmor(still) {
      if (!this.charDef || !this.charDef.stillArmor) return;
      const want = still ? this.charDef.stillArmor : 0;   // e.g. -100 / 0
      if (this.__stillArmor === want) return;
      if (this.__stillArmor != null) this.stats.armor -= this.__stillArmor;
      this.__stillArmor = want;
      this.stats.armor += want;
    }

    /* % move speed stat applies on top of the base speed */
    get effSpeed() {
      return this.stats.speed * (1 + (this.stats.speedPct || 0) / 100);
    }

    update(dt, slowMul = 1) {
      this.age += dt;
      const px0 = this.x, py0 = this.y;
      /* v0.9 §1: player 0 uses WASD, player 1 uses the arrow keys;
         single-player keeps the combined axis (WASD + arrows + pad) */
      const ax = this.game && this.game.duo
        ? KS.Input.axisFor(this.idx) : KS.Input.axis();
      this.moving = false;
      const sp = this.effSpeed * slowMul;

      if (KS.Settings.get().mouseOnly && !(this.game && this.game.duo && this.idx === 1)) {
        /* walk toward the cursor past a small deadzone */
        const g = KS.Input.gamepadAxis();
        if (g.x || g.y) {
          this.x += g.x * sp * dt;
          this.y += g.y * sp * dt;
          this.moving = true;
        } else {
          const m = KS.Input.mouse;
          const game = window.KSDBG && window.KSDBG.game;
          if (game && m.inside) {
            const w = game.mouseWorld();
            const dx = w.x - this.x, dy = w.y - this.y;
            const d = Math.hypot(dx, dy);
            if (d > 14) {
              const s2 = Math.min(sp, d * 6);
              this.x += (dx / d) * s2 * dt;
              this.y += (dy / d) * s2 * dt;
              this.moving = true;
            }
          }
        }
      } else if (ax.x !== 0 || ax.y !== 0) {
        this.x += ax.x * sp * dt;
        this.y += ax.y * sp * dt;
        this.moving = true;
      }

      /* real velocity — enemies that lead their shots read this */
      this.vx = dt > 0 ? (this.x - px0) / dt : 0;
      this.vy = dt > 0 ? (this.y - py0) / dt : 0;
      /* v0.11 fix: last movement heading — the held gun falls back to
         this when no enemy is in reach */
      if (this.vx !== 0 || this.vy !== 0) {
        this.lastMoveAng = Math.atan2(this.vy, this.vx);
      }

      if (this.moving) this.bob += dt * 11;
      const a = KS.arenaSize();
      this.x = Math.min(Math.max(this.x, this.r), a - this.r);
      this.y = Math.min(Math.max(this.y, this.r), a - this.r);
      if (this.invuln > 0) this.invuln -= dt;

      const rate = KS.hpRegenRate(this.stats.hpRegen || 0);
      if (rate > 0 && this.hp < this.maxHP) {
        this.regenAcc += rate * dt;
        while (this.regenAcc >= 1 && this.hp < this.maxHP) {
          this.hp++;
          this.regenAcc -= 1;
        }
        if (this.hp >= this.maxHP) this.regenAcc = 0;
      }
    }

    hurt(dmg) {
      if (this.invuln > 0) return null;
      if (this.noDamage) return null;   // dev command: /stat hp disable
      const dodge = Math.min(60, this.stats.dodge || 0);
      if (dodge > 0 && Math.random() * 100 < dodge) {
        this.invuln = 0.25;
        return 'dodge';
      }
      const red = KS.armorReduction(this.stats.armor || 0);
      this.hp -= dmg * (1 - red / 100);
      this.invuln = C.PLAYER.invulnTime;
      return 'hit';
    }

    /* ---------------- per-player run-state API ---------------- */
    /* effective cooldown of a weapon (attack speed stat + character
       bonuses such as Adkins' +50% with Unarmed weapons).
       v0.11 §1: reloading RANGED weapons use their RELOAD time here —
       the cooldown only returns once the magazine is ready again. */
    weaponCooldown(w) {
      const tdef = w.def.tiers[w.tier];
      let mul = 1 + (this.stats.attackSpeed || 0) / 100;
      if (w.def.classes && w.def.classes.includes('Unarmed') && this.stats.unarmedAS) {
        mul *= 1 + this.stats.unarmedAS / 100;
      }
      return tdef.cooldown / mul;
    }

    /* v0.11 §1: magazine + reload state of a weapon instance */
    weaponMag(w) {
      const M = C.MAGS[w.def.id];
      if (!M) return null;                    // melee / shuriken: no magazine
      return { mag: M.mag[w.tier - 1], reload: M.reload[w.tier - 1] };
    }
    get ammo() { return this._ammoState; }    // debug accessor

    /* current magazine of an instance (init lazily so tier upgrades
       refresh the capacity; partial depletion is preserved) */
    clipOf(w) {
      let st = w.ammo;
      const M = this.weaponMag(w);
      if (!M) { if (w.ammo) w.ammo = null; return null; }
      if (!st || st.mag !== M.mag) {
        w.ammo = st = { mag: M.mag, left: M.mag, reloadT: 0 };
      }
      return st;
    }

    /* reload progress 0..1 of an instance (null = no reload) */
    reloadProgress(w) {
      const st = this.clipOf(w);
      if (!st || st.reloadT <= 0) return null;
      const M = this.weaponMag(w);
      return Math.min(1, st.reloadT / M.reload);
    }

    /* §1: reloading happens automatically when the magazine empties;
       it NEVER interrupts movement (it only gates firing). Returns
       true while the weapon is busy reloading. */
    tickReload(w, dt) {
      const st = this.clipOf(w);
      if (!st || st.reloadT <= 0) return false;
      st.reloadT = Math.max(0, st.reloadT - dt);
      if (st.reloadT <= 0) st.left = st.mag;
      return st.reloadT > 0;
    }

    /* consume one round; starts a reload when the clip runs dry */
    consumeAmmo(w) {
      const st = this.clipOf(w);
      if (!st) return true;                    // no magazine: always fires
      if (st.reloadT > 0) return false;
      st.left--;
      if (st.left <= 0) {
        const M = this.weaponMag(w);
        st.reloadT = M.reload;
      }
      return true;
    }

    weaponReach(w) {
      return (w.def.range + (this.stats.range || 0) * 0.5) * C.MELEE_RANGE_SCALE;
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

    /* character stat-modification scaling (Bair The Builder, spec §8) */
    statGain(key, val) {
      const mods = this.charDef && this.charDef.statMods;
      if (!mods) return val;
      if (key === 'damage' && mods.damageMul != null) return val * mods.damageMul;
      if (key === 'engineering' && mods.engineeringMul != null) return val * mods.engineeringMul;
      return val;
    }

    /* new weapon INSTANCE: unique id, own tier/cooldown/mods (spec §10);
       the uid counter lives on the Game so duo uids never collide */
    mkWeapon(defId, tier) {
      const def = C.WEAPONS[defId];
      if (!def) throw new Error('unknown weapon: ' + defId);
      const counter = this.game && this.game.nextWeaponUid != null
        ? this.game : { nextWeaponUid: 1 };
      return { uid: counter.nextWeaponUid++, def, tier, timer: 0, mods: {} };
    }

    buyWeapon(id, tier) {
      if (this.weapons.length >= C.MAX_WEAPONS) return false;
      const w = this.mkWeapon(id, tier);
      this.weapons.push(w);
      this.applyWeaponFx(w, 1);      // e.g. Hand grants Harvesting
      this.recomputeDyn();           // v0.11 §5-§6 dynamic character bonuses
      return true;
    }
    sellWeapon(idx) {
      const w = this.weapons[idx];
      if (!w) return 0;
      if (this.weapons.length <= 1) return 0;
      const price = KS.Shop.weaponSellPrice(w.def.id, w.tier);
      this.applyWeaponFx(w, -1);     // remove its passive stats
      this.weapons.splice(idx, 1);
      this.recomputeDyn();           // tier counts changed
      this.materials += price;
      return price;
    }
    combineWeapon(idx) {
      const w = this.weapons[idx];
      if (!w || w.tier >= 4) return false;
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
      this.recomputeDyn();           // tier counts changed
      return true;
    }
    buyItem(itemDef) {
      /* v0.9 §6: the Builder's Turret shop item spawns this player's
         structure instead of granting stats; one turret per player.
         v0.11 §4: the NORMAL turret is a separate structure with the
         same one-per-player cap; §3: Builder's Turret is exclusive to
         Bair The Builder (never granted to anyone else, any route). */
      if (itemDef.turret || itemDef.normalTurret) {
        if (this.turret || this.builderTurret) return false;
        if (itemDef.turret && !(this.charDef && this.charDef.id === 'builder')) {
          return false;                       // §3 exclusive to Bair
        }
        if (itemDef.normalTurret && this.charDef &&
            this.charDef.id === 'builder' && this.builderTurret) {
          return false;                       // Bair: no additional structures
        }
        this.turret = 'pending';     // deployed at the next wave start
        this.normalTurret = !!itemDef.normalTurret;
        if (itemDef.normalTurret) this.turretTier = 1;
        this.ownedItems.push(itemDef);
        return true;
      }
      this.ownedItems.push(itemDef);
      for (const [key, val] of itemDef.fx) {
        this.stats[key] = (this.stats[key] || 0) + this.statGain(key, val);
      }
      this.recomputeDyn();           // v0.11 §5-§6: speedPct/tier effects
      this.refreshMaxHp(this.stats);
      return true;
    }
    spendMaterials(n) {
      if (this.materials < n) return false;
      this.materials -= n;
      return true;
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

    /* Builder conversion (spec §9): this player's own Structure Range
       grows from materials left uncollected (shared ground, consumed) */
    convertUncollectedMaterials() {
      const T = C.TURRET;
      let total = 0;
      for (const d of this.game.drops) {
        if (d.type === 'mat') total += d.val || 0;
      }
      const chunks = Math.floor(total / T.matsPerBonus);
      if (chunks <= 0) return 0;
      const add = chunks * T.rangePerChunk;
      this.stats.structureAttackSpeed += add;
      this.stats.structureRange += add;
      this.game.drops = this.game.drops.filter((d) => d.type !== 'mat');
      return add;
    }

    /* resolve THIS player's collected loot crates into item offers */
    resolveCrates() {
      const pairs = this.crates.map((c) => ({
        item: KS.Loot.rollCrateItem(this.game.wave, this.stats.luck || 0, c.special),
        special: !!c.special,
      }));
      this.crates = [];
      return pairs;
    }

    /* data for this player's pause/break screens */
    snapshot() {
      return {
        idx: this.idx,
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
        wave: this.game ? this.game.wave : 0,
        endless: this.game ? this.game.endless : false,
        difficulty: this.game ? this.game.difficulty : 0,
        time: this.game ? this.game.time : 0,
        kills: this.game ? this.game.kills : 0,
        turretOwned: !!(this.turret || this.builderTurret),
      };
    }

    tryLifesteal() {
      const ls = this.stats.lifeSteal || 0;
      if (ls <= 0) return false;
      if (this.age - this.lastSteal < 0.1) return false;
      if (this.hp >= this.maxHP) return false;
      if (Math.random() * 100 < ls) {
        this.hp = Math.min(this.maxHP, this.hp + 1);
        this.lastSteal = this.age;
        return true;
      }
      return false;
    }
  }

  /* ---------------- Enemy ----------------
     The data-driven Enemy (nine types, variants, bosses) now lives
     in enemies.js — see KS.Enemy there. */

  /* ---------------- Floating damage number ---------------- */
  class DamageNumber {
    constructor(x, y, val, crit) {
      this.x = x; this.y = y;
      this.val = typeof val === 'number' ? (Math.round(val * 10) / 10) : val;
      this.crit = crit;
      this.t = 0;
      this.dead = false;
    }
    update(dt) {
      this.t += dt;
      this.y -= C.FX.dmgNumSpeed * dt;
      if (this.t >= C.FX.dmgNumLife) this.dead = true;
    }
  }

  /* ---------------- Weapon strike (lunge out & back) ----------------
     The strike LOCKS its direction the instant it is fired, then flies
     dead straight — it never turns to track enemies mid-flight. It
     travels out to its max distance and retracts, and can hit EVERY
     enemy it touches along the way (infinite piercing). */
  class Strike {
    constructor(x, y, dirX, dirY, dist, opts = {}) {
      this.x = x; this.y = y;
      this.dirX = dirX; this.dirY = dirY;
      this.dist = dist;              // max travel distance (reached halfway)
      this.dmg = opts.dmg || 0;
      this.crit = !!opts.crit;
      this.kb = opts.kb || 0;        // knockback impulse
      this.hitR = opts.hitR || 16;   // collision radius vs enemy circles
      this.hits = new Set();         // enemies already struck (infinite pierce)
      this.stole = false;            // life steal rolls once per swing
      this.img = opts.img || null;   // per-weapon attack visual (spec §5-§6)
      this.size = opts.size || 44;   // art-proportional base height
      /* v0.9 §7: per-weapon art orientation + palm lead offset */
      this.rot = opts.rot || 0;
      this.lead = opts.lead || 0;
      this.t = 0;
      this.dur = 0.18;
      this.dead = false;
    }
    update(dt) {
      this.t += dt;
      if (this.t >= this.dur) this.dead = true;
    }
    /* current distance from the origin: out (fast) then straight back */
    travel() {
      const p = Math.min(1, this.t / this.dur);
      if (p < 0.4) { const t = p / 0.4; return this.dist * (1 - (1 - t) * (1 - t)); }
      const t = (p - 0.4) / 0.6;
      return this.dist * (1 - t);
    }
    pos() {
      const r = this.travel();
      return { x: this.x + this.dirX * r, y: this.y + this.dirY * r };
    }
    /* kept for compatibility: 0..1 progress of the whole lunge */
    progress() {
      const p = Math.min(1, this.t / this.dur);
      if (p < 0.4) { const t = p / 0.4; return 1 - (1 - t) * (1 - t); }
      const t = (p - 0.4) / 0.6;
      return 1 - t;
    }
  }

  /* ---------------- v0.11 §1: ranged weapon projectile ----------------
     Flies straight, dies on first enemy hit (or after its flight time).
     Shuriken is the exception: it pierces exactly ONE extra enemy
     (pierceLeft), keeps flying and spins visually. Shredder rounds
     explode on impact for small area damage (no double-dipping: a
     Set of already-hit enemies per explosion). All fields are plain
     so dead objects can simply be dropped — the Game keeps a pool
     cap so long waves can never grow the list unbounded. */
  class PlayerProj {
    constructor(x, y, ang, opts = {}) {
      const P = C.PROJ;
      this.x = x; this.y = y;
      const speed = opts.speed || P.speed;
      this.vx = Math.cos(ang) * speed;
      this.vy = Math.sin(ang) * speed;
      this.ang = ang;
      this.dmg = opts.dmg || 0;
      this.crit = !!opts.crit;
      this.kb = opts.kb || 0;
      this.r = opts.hitR || P.hitR;
      this.life = opts.life || 0.85;          // flight time (s)
      this.def = opts.def || null;             // weapon def (art/effects)
      this.owner = opts.owner || null;         // firing player (kill credit)
      this.pierceLeft = opts.pierceLeft || 0;  // shuriken: 1 extra enemy
      this.spin = opts.spin || 0;              // shuriken spin (rad/s)
      this.rot = ang;
      this.dead = false;
      this.hits = new Set();                   // enemies already damaged
    }
    update(dt, g) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.rot += this.spin * dt;
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      /* containment: a projectile leaving the arena is done — the
         shuriken can never be "lost" outside the field (§1) */
      const a = KS.arenaSize();
      if (this.x < -40 || this.y < -40 || this.x > a + 40 || this.y > a + 40) {
        this.dead = true;
        return;
      }
      for (const e of g.enemies) {
        if (e.dead || e.spawnT > 0 || this.hits.has(e)) continue;
        const dx = e.x - this.x, dy = e.y - this.y;
        if (dx * dx + dy * dy > (e.r + this.r) * (e.r + this.r)) continue;
        this.hits.add(e);
        const sp = Math.hypot(this.vx, this.vy) || 1;
        const died = e.hit(this.dmg, (this.vx / sp) * this.kb, (this.vy / sp) * this.kb, g);
        g.pushDmg(e.x, e.y - e.r - 6, this.dmg, this.crit);
        if (died) g.onKill(e, this.owner);
        if (this.pierceLeft > 0) { this.pierceLeft--; continue; }
        /* shredder: area damage around the impact, each enemy at most
           once per explosion (this.hits is the guard) */
        if (this.def && this.def.id === 'shredder') g.shredderBlast(this, e);
        this.dead = true;
        return;
      }
    }
    draw(ctx, img) {
      /* v0.11 fix: guns shoot BULLETS, never the weapon's own image.
         Only the shuriken keeps its spinning art (it IS the projectile);
         every other ranged weapon draws a small tracer round with a
         colored core + motion streak, distinguishable per weapon:
         pistol (pale), smg (small rapid), shredder (heavy orange shell),
         revolver (large gold). */
      const fx = KS.Settings ? KS.Settings.get().visualEffects : true;
      ctx.save();
      ctx.translate(this.x, this.y);
      const isShuriken = this.def && this.def.id === 'shuriken';
      if (isShuriken && img) {
        ctx.rotate(this.rot);
        ctx.drawImage(img, -this.r * 2, -this.r * 2, this.r * 4, this.r * 4);
      } else {
        /* bullet style by weapon */
        const id = this.def && this.def.id;
        let core = '#ffe9a8', glow = 'rgba(255,233,168,0.85)', len = 10, rad = 3.2;
        if (id === 'revolver') { core = '#ffd76e'; glow = 'rgba(255,215,110,0.95)'; rad = 4.4; len = 13; }
        else if (id === 'shredder') { core = '#ff9c5b'; glow = 'rgba(255,156,91,0.9)'; rad = 5.2; len = 11; }
        else if (id === 'smg') { rad = 2.6; len = 8.5; }
        if (this.crit) { core = '#ffb020'; glow = 'rgba(255,176,32,0.95)'; }
        const ang = this.spin ? this.rot : Math.atan2(this.vy, this.vx);
        ctx.rotate(ang);
        if (fx) {   // motion streak behind the round
          ctx.strokeStyle = glow;
          ctx.lineWidth = rad * 0.9;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-rad - len, 0);
          ctx.lineTo(-rad * 0.6, 0);
          ctx.stroke();
        }
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, rad * 1.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(0, 0, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  KS.Player = Player;
  KS.DamageNumber = DamageNumber;
  KS.Strike = Strike;
  KS.PlayerProj = PlayerProj;
})();
