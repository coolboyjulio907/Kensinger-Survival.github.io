/* =========================================================
   ENEMY SYSTEM — behaviors, projectiles, hazards, bosses,
   spawn director.  All balance numbers live in KS.CONFIG
   (ENEMIES / VARIANTS / WAVE_SCHEDULE / BOSSES).

   Systems kept separate (spec §11):
     1. Enemy definitions ............ KS.CONFIG.ENEMIES
     2. Enemy AI + movement .......... TYPES / MOVE helpers
     3. Attack + projectile handling . EProj, e.fire()
     4. Variant modifiers ............ KS.CONFIG.VARIANTS (+TWEAKS)
     5. Boss behavior ................ BOSSAI (phases 0/1/2)
     6. Wave progression ............. game.js wave clock
     7. Spawn scheduling ............. SpawnDirector (quota queue)
     8. Reward handling .............. game.onKill()
   ========================================================= */
window.KS = window.KS || {};
(function () {
  const C = KS.CONFIG;
  const TAU = Math.PI * 2;
  const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';

  /* ---------------- tiny math helpers ---------------- */
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

  /* =====================================================
     SPRITES — trimmed PNGs + dark-red tinted boss copies.
     AirPods have no sprite: each bud is drawn as a vector.
     ===================================================== */
  const Sprites = {
    map: {},
    tinted: {},
    init(imgs) {
      this.map = imgs || {};
      this.tinted = {};
      for (const [type, img] of Object.entries(this.map)) {
        if (!img) continue;
        const cv = document.createElement('canvas');
        cv.width = img.width; cv.height = img.height;
        const g = cv.getContext('2d');
        g.drawImage(img, 0, 0);
        /* dark-red overlay blended with the original logo (boss look) */
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = 'rgba(150, 12, 20, 0.62)';
        g.fillRect(0, 0, cv.width, cv.height);
        g.globalCompositeOperation = 'source-over';
        this.tinted[type] = cv;
      }
    },
    get(type) { return this.map[type] || null; },
    bossOf(type) { return this.tinted[type] || this.map[type] || null; },
  };

  /* vector-drawn AirPod bud (white head + stem) */
  function drawPod(ctx, x, y, r, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = '#f4f5f7';
    ctx.strokeStyle = 'rgba(60,64,72,0.85)';
    ctx.lineWidth = Math.max(1.2, r * 0.12);
    // stem
    ctx.beginPath();
    ctx.roundRect(-r * 0.22, 0, r * 0.44, r * 1.5, r * 0.22);
    ctx.fill(); ctx.stroke();
    // head
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill(); ctx.stroke();
    // speaker grille dot
    ctx.fillStyle = 'rgba(120,126,138,0.9)';
    ctx.beginPath();
    ctx.arc(-r * 0.32, -r * 0.3, r * 0.16, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /* =====================================================
     ENEMY PROJECTILES — one class, per-kind drawing.
     ===================================================== */
  class EProj {
    /* opts: { life, r, split, dmg } */
    constructor(x, y, ang, speed, dmg, kind, opts = {}) {
      this.x = x; this.y = y;
      this.vx = Math.cos(ang) * speed;
      this.vy = Math.sin(ang) * speed;
      this.dmg = dmg;
      this.kind = kind;
      this.r = opts.r || 7;
      this.life = opts.life || 3.2;
      this.split = opts.split || 0;      // children spawned on expiry
      this.t = 0;
      this.dead = false;
    }
    update(dt) {
      this.t += dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.t >= this.life) this.dead = true;
      const a = KS.arenaSize();
      if (this.x < -30 || this.y < -30 || this.x > a + 30 || this.y > a + 30) this.dead = true;
    }
    draw(ctx, fxOn) {
      const ang = Math.atan2(this.vy, this.vx);
      ctx.save();
      ctx.translate(this.x, this.y);
      if (fxOn) { ctx.shadowBlur = 8; }
      switch (this.kind) {
        case 'notif': {           // iPhone notification bubble
          if (fxOn) ctx.shadowColor = 'rgba(255,255,255,0.8)';
          ctx.rotate(ang);
          ctx.fillStyle = '#f5f7fb';
          ctx.strokeStyle = 'rgba(30,40,60,0.9)';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.roundRect(-8, -6, 17, 12, 4);
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#ff3b30';
          ctx.beginPath(); ctx.arc(5, 0, 2.6, 0, TAU); ctx.fill();
          break;
        }
        case 'shot': {            // camera flash shot
          if (fxOn) ctx.shadowColor = 'rgba(255,255,220,0.9)';
          ctx.fillStyle = '#fffbe8';
          ctx.beginPath(); ctx.arc(0, 0, this.r, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(60,60,60,0.9)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          break;
        }
        case 'text': {            // ChatGPT text-bubble
          if (fxOn) ctx.shadowColor = 'rgba(16,163,127,0.8)';
          ctx.rotate(ang);
          ctx.fillStyle = '#1d2a32';
          ctx.strokeStyle = 'rgba(16,163,127,0.95)';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.roundRect(-9, -6.5, 18, 13, 5);
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#e8fff6';
          ctx.font = `bold 10px ${FONT}`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('A', 0, 0.5);
          break;
        }
        case 'video': {           // TikTok video frame
          if (fxOn) ctx.shadowColor = 'rgba(255,0,80,0.8)';
          ctx.rotate(ang);
          ctx.fillStyle = '#101014';
          ctx.strokeStyle = '#25f4ee';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.roundRect(-9, -7, 18, 14, 3);
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#fe2c55';
          ctx.beginPath();
          ctx.moveTo(-2.5, -3.5); ctx.lineTo(4.5, 0); ctx.lineTo(-2.5, 3.5);
          ctx.closePath(); ctx.fill();
          break;
        }
        case 'gem': {             // Gemini star shard
          if (fxOn) ctx.shadowColor = 'rgba(66,133,244,0.9)';
          ctx.rotate(this.t * 4);
          const g2 = ctx.createLinearGradient(-8, -8, 8, 8);
          g2.addColorStop(0, '#4285f4');
          g2.addColorStop(0.5, '#9b72cb');
          g2.addColorStop(1, '#d96570');
          ctx.fillStyle = g2;
          ctx.beginPath();
          ctx.moveTo(0, -8); ctx.lineTo(5.5, 0); ctx.lineTo(0, 8); ctx.lineTo(-5.5, 0);
          ctx.closePath(); ctx.fill();
          break;
        }
        case 'heavy': {           // Claude heavy ember
          if (fxOn) ctx.shadowColor = 'rgba(217,119,87,0.95)';
          ctx.fillStyle = '#e8895e';
          ctx.beginPath(); ctx.arc(0, 0, this.r, 0, TAU); ctx.fill();
          ctx.fillStyle = '#fff1e6';
          ctx.beginPath(); ctx.arc(0, 0, this.r * 0.45, 0, TAU); ctx.fill();
          break;
        }
        case 'bigsplit': {        // ChatGPT boss — large splitting orb
          const p = 1 + Math.sin(this.t * 10) * 0.15;
          if (fxOn) ctx.shadowColor = 'rgba(16,163,127,0.95)';
          ctx.fillStyle = '#0e3f33';
          ctx.strokeStyle = '#10a37f';
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(0, 0, this.r * p, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#bdf5e3';
          ctx.beginPath(); ctx.arc(0, 0, this.r * 0.4 * p, 0, TAU); ctx.fill();
          break;
        }
        default: {
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(0, 0, this.r, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  /* =====================================================
     HAZARDS — flush waves, soundwaves, distraction clouds,
     claude protective zones.  Update + draw helpers.
     v0.10 §13 (toilet-explosion performance):
       - hazards are POOLED objects (no per-explosion allocation);
       - wave collision checks hit EVERY player once (duo fix: the
         old code only ever tested players[0]);
       - per-player one-hit sets replace the single hitPlayer flag;
       - a cap recycles the oldest wave hazards so overlapping
         explosions can never accumulate unbounded.
     ===================================================== */
  const MAX_WAVE_HAZARDS = 12;
  function spawnHazard(g, def) {
    const pool = g.hazPool || (g.hazPool = []);
    const h = pool.length ? pool.pop() : { hitBy: new Set() };
    if (!h.hitBy) h.hitBy = new Set();
    /* reset every mutable field (pool objects are reused verbatim) */
    for (const k of Object.keys(h)) {
      if (k !== 'hitBy' && !(k in def)) delete h[k];
    }
    Object.assign(h, def);
    h.dead = false;
    h.t = 0;
    h.R = 0;
    h.hitPlayer = false;
    h.hitBy.clear();
    h._grad = null;                       // cached visual, rebuilt lazily
    /* cap overlapping explosions: recycle the OLDEST active wave
       immediately (straight back to the pool — no corpses lingering) */
    if (h.kind === 'wave') {
      let waves = 0;
      for (const o of g.hazards) if (o.kind === 'wave' && !o.dead) waves++;
      if (waves >= MAX_WAVE_HAZARDS) {
        const pool = g.hazPool || (g.hazPool = []);
        const idx = g.hazards.findIndex((o) => o.kind === 'wave' && !o.dead);
        if (idx >= 0) pool.push(g.hazards.splice(idx, 1)[0]);
      }
    }
    g.hazards.push(h);
    return h;
  }

  function updateHazards(list, dt, g) {
    /* duo: EVERY alive player is tested (the old loop tested only
       players[0], making flush waves harmless to Player 2) */
    const players = (g.players || [g.player]).filter((p) => p && !p.eliminated);
    for (const h of list) {
      h.t += dt;
      if (h.kind === 'wave') {
        if (h.t >= h.warn) {
          const R = (h.t - h.warn) * h.speed;
          h.R = R;
          /* cheap band check per player — no allocations, no sqrt-heavy
             work beyond one dist() per player per hazard per frame */
          for (const p of players) {
            if (h.hitBy.has(p.idx)) continue;
            const d = dist(h.x, h.y, p.x, p.y);
            if (Math.abs(d - R) < 16 + p.r * 0.4) {
              h.hitBy.add(p.idx);
              h.hitPlayer = true;
              const res = p.hurt(h.dmg);
              if (res === 'dodge') g.pushDmg(p.x, p.y - p.r - 10, 'DODGE', false);
              else if (res === 'hit') {
                if (KS.Settings.get().screenshake) g.shakeT = C.FX.shakeTime;
                if (p.hp <= 0) g.eliminate(p);
              }
            }
          }
          if (R > h.maxR) h.dead = true;
        }
      } else if (h.kind === 'cloud') {
        if (h.t >= h.dur) h.dead = true;
      } else if (h.kind === 'zone') {
        if (h.t >= h.dur) h.dead = true;
      }
    }
    /* completed effects return to the pool immediately (§13) */
    const pool = g.hazPool || (g.hazPool = []);
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].dead) { pool.push(list.splice(i, 1)[0]); }
    }
  }

  /* slow factor from distraction clouds: strongest applies, never stacks */
  function cloudSlow(list, p) {
    if (!p) return 1;
    let slow = 0;
    for (const h of list) {
      if (h.kind !== 'cloud') continue;
      if (dist(h.x, h.y, p.x, p.y) < h.r + p.r * 0.5) slow = Math.max(slow, h.slow);
    }
    return 1 - slow / 100;
  }

  function drawHazards(ctx, list, fxOn) {
    const now = performance.now() / 1000;
    /* overlapping explosions: when many waves are live, skip the
       expensive glow layers (identical visual property recalculation
       per frame was the main lag source — v0.10 §13) */
    let waveCount = 0;
    for (const h of list) if (h.kind === 'wave' && !h.dead) waveCount++;
    const cheapWaves = waveCount > 5;
    for (const h of list) {
      ctx.save();
      if (h.kind === 'cloud') {
        /* distraction cloud — soft drifting haze (fictional hazard).
           The gradient only depends on x/y/r (fixed per cloud), so it
           is built ONCE per hazard and reused every frame. */
        const life = clamp(1 - h.t / h.dur, 0, 1);
        const a = 0.30 * Math.min(1, h.t * 3, life + 0.15);
        if (!h._grad) {
          h._grad = ctx.createRadialGradient(h.x, h.y, h.r * 0.2, h.x, h.y, h.r);
          h._grad.addColorStop(0, 'rgba(168,140,90,0.32)');
          h._grad.addColorStop(1, 'rgba(168,140,90,0)');
        }
        ctx.globalAlpha = Math.max(0.05, a / 0.30);
        ctx.fillStyle = h._grad;
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        if (fxOn) {
          ctx.fillStyle = `rgba(210,180,120,${a * 0.7})`;
          for (let i = 0; i < 4; i++) {
            const w = h.t * 1.3 + i * 1.05;
            ctx.beginPath();
            ctx.arc(h.x + Math.cos(w * 0.9 + i) * h.r * 0.55,
                    h.y + Math.sin(w + i * 2.1) * h.r * 0.55, 7, 0, TAU);
            ctx.fill();
          }
        }
      } else if (h.kind === 'wave') {
        if (h.t < h.warn) {
          /* pre-attack warning: target radius + growing inner fill */
          const k = h.t / h.warn;
          ctx.setLineDash([7, 6]);
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = h.color;
          ctx.globalAlpha = 0.4 + 0.35 * Math.abs(Math.sin(now * 9));
          ctx.beginPath(); ctx.arc(h.x, h.y, h.maxR, 0, TAU); ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 0.18;
          ctx.fillStyle = h.color;
          ctx.beginPath(); ctx.arc(h.x, h.y, h.maxR * k, 0, TAU); ctx.fill();
        } else {
          const R = h.R || 0;
          const fade = clamp(1 - R / h.maxR, 0, 1);
          ctx.globalAlpha = 0.85 * fade + 0.15;
          ctx.lineWidth = 7;
          ctx.strokeStyle = h.color;
          /* shadowBlur per ring per frame is the single most expensive
             draw op here — only when few waves are live */
          if (fxOn && !cheapWaves) { ctx.shadowColor = h.color; ctx.shadowBlur = 12; }
          ctx.beginPath(); ctx.arc(h.x, h.y, R, 0, TAU); ctx.stroke();
          if (!cheapWaves) {
            ctx.globalAlpha = 0.25 * fade;
            ctx.lineWidth = 14;
            ctx.beginPath(); ctx.arc(h.x, h.y, R, 0, TAU); ctx.stroke();
          }
        }
      } else if (h.kind === 'zone') {
        /* claude protective zone */
        const life = clamp(1 - h.t / h.dur, 0, 1);
        ctx.globalAlpha = 0.16 * Math.min(1, h.t * 4) * (0.5 + life * 0.5);
        ctx.fillStyle = '#ffb060';
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.75;
        ctx.setLineDash([10, 5]);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(255,176,96,0.9)';
        ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }
  }

  /* =====================================================
     ENEMY — data-driven entity.  Movement / attack / ability
     dispatch goes through TYPES[id]; bosses through BOSSAI.
     ===================================================== */
  /* shortest signed angle difference (radians, -PI..PI) */
  function angDiff(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  function lerpAng(a, b, t) {
    const d = ((b - a + Math.PI * 3) % TAU) - Math.PI;
    return a + d * t;
  }
  /* v0.9 §1: stable per-enemy targeting — each enemy keeps a target
     PLAYER (retargeted every few seconds, never every frame) and its
     speed follows that player's EFFECTIVE speed (spec §3) */
  function tgtOf(e, g) {
    if (e.tgt && e.tgt.hp > 0) return e.tgt;
    const alive = (g.players || [g.player]).filter((p) => p && p.hp > 0);
    return alive[0] || g.player || g.players[0];
  }
  function pickTarget(e, g) {
    const players = (g.players || [g.player]).filter((p) => p && p.hp > 0);
    if (!players.length) return g.player || null;
    let best = null, bestScore = Infinity;
    for (const p of players) {
      /* current target gets a hysteresis bonus so enemies do not flip
         back and forth every frame (spec §1: stable targeting) */
      const d = dist(e.x || 0, e.y || 0, p.x, p.y) * (p === e.tgt ? 0.8 : 1);
      if (d < bestScore) { bestScore = d; best = p; }
    }
    return best || players[0];
  }
  function toPlayerAng(e, g) {
    const t = tgtOf(e, g);
    return Math.atan2(t.y - e.y, t.x - e.x);
  }
  function toPlayerDist(e, g) { return dist(e.x, e.y, tgtOf(e, g).x, tgtOf(e, g).y); }
  function moveAng(e, ang, sp, dt) {
    e.x += Math.cos(ang) * sp * dt;
    e.y += Math.sin(ang) * sp * dt;
  }
  /* fire one projectile (kind/dmg/speed default from the enemy def) */
  function fireProj(e, g, ang, opts = {}) {
    const def = e.def;
    const proj = new EProj(e.x, e.y, ang,
      opts.speed || 260,
      opts.dmg != null ? opts.dmg : e.projDmg,
      opts.kind || def.projKind,
      opts.projOpts || {});
    g.eprojs.push(proj);
    return proj;
  }
  /* radial / spread volleys */
  function fireSpread(e, g, count, arc, ang = null) {
    if (count <= 1) { fireProj(e, g, ang == null ? toPlayerAng(e, g) : ang); return; }
    const base = ang == null ? toPlayerAng(e, g) : ang;
    for (let i = 0; i < count; i++) {
      const off = count === 1 ? 0 : (i / (count - 1) - 0.5) * arc * 2;
      fireProj(e, g, base + off);
    }
  }
  function fireRadial(e, g, count, offset = 0, speedMul = 1) {
    for (let i = 0; i < count; i++) {
      fireProj(e, g, offset + i * TAU / count, { speed: e.projSpd * speedMul });
    }
  }

  class Enemy {
    /* type/variant ids, g = game (wave, mods, eprojs...), opts:
       { boss:{name,hpMul,dmgMul,sizeMul,reward,entrance}, pairId, pairSlot, partner } */
    constructor(typeId, variantId, g, x, y, opts = {}) {
      const def = C.ENEMIES[typeId];
      const variant = C.VARIANTS[variantId] || C.VARIANTS.standard;
      /* per-enemy variant tweaks — one or two meaningful behavior changes */
      const tweaks = (C.VARIANT_TWEAKS[typeId] || {})[variantId];
      const d2 = Object.assign({}, def);
      if (tweaks) {
        for (const [k, v] of Object.entries(tweaks)) {
          d2[k] = (k === 'ability') ? Object.assign({}, def.ability, v) : v;
        }
      }
      this.def = d2;
      this.variant = variant;
      this.typeId = typeId;
      this.bossCfg = opts.boss || null;
      this.boss = !!opts.boss;

      const mods = g.mods || {};
      const wave = g.wave;
      const hpMul = this.boss ? this.bossCfg.hpMul : variant.hp;
      const dmgMul = this.boss ? this.bossCfg.dmgMul : variant.dmg;
      /* early-game balance curves (spec §1): soften damage / speed /
         projectile speed and lengthen attack intervals in the opening
         waves; everything tapers to 1.0 by wave 9 */
      const bal = KS.earlyBalance(wave);
      this.dmgScale = KS.waveScaleDmg(wave) * dmgMul * bal.dmg;
      this.maxHP = this.hp = Math.max(1,
        Math.round(def.hp * hpMul * KS.waveScaleHp(wave) * (mods.enemyHpMul || 1)));
      /* v0.9 §3: speed = exact % of the TARGET player's effective
        speed. Old fixed speeds, variant speed multipliers, difficulty
        speed multipliers and the early-wave speed curve are REPLACED
        (never stacked). Smoothly re-lerped every frame. */
      this.speedPct = C.SPEED_PCT[this.typeId] != null
        ? C.SPEED_PCT[this.typeId] : 0.75;
      this.tgt = null;
      this.retargetT = 0;
      this.tgt = pickTarget(this, g);
      this.speed = this.tgt.effSpeed * this.speedPct;
      this.dmg = Math.max(this.boss ? 1 : 0,
        Math.round(def.contactDmg * this.dmgScale + (mods.enemyDmgAdd || 0)));
      this.projDmg = Math.max(1,
        Math.round((def.projDmg || 1) * this.dmgScale + (mods.enemyDmgAdd || 0)));
      this.projSpd = (def.projSpeed || 0) * bal.projSpd;   // dodged easier early
      this.atkCd = (def.cooldown || 3) * bal.atkCd;        // attacks less frequent early
      this.r = (def.diameter / 2) * (this.boss ? this.bossCfg.sizeMul : variant.scale);
      this.x = x; this.y = y;
      this.color = def.color;
      this.rewardTotal = this.boss
        ? this.bossCfg.reward
        : Math.max(1, Math.round(def.reward * variant.reward));
      /* raw pieces for the loot system (fractional rolls in loot.js) */
      this.rewardBase = this.boss ? this.bossCfg.reward : Math.max(1, def.reward);
      this.rewardMul = this.boss ? 1 : variant.reward;

      /* --- AI state --- */
      this.atkT = rand(0.7, 1.6) + rand(bal.jitter[0], bal.jitter[1]);
      this.atkIdx = 0;
      this.patIdx = 0;
      this.abilityT = d2.ability && d2.ability.every ? d2.ability.every * rand(0.5, 0.85) : Infinity;
      this.zoneT = 6;                       // claude boss protective zone timer
      this.windup = null;                   // { kind, t, ... }
      this.seq = null;                      // queued sequential shots
      this.dash = null;                     // locked-direction dash
      this.recover = 0;
      this.frenzyT = 0; this.frenzySlowT = 0;
      this.shieldHp = 0; this.shieldT = 0;
      this.shieldAbsorb = (d2.ability && d2.ability.absorb) || 0;
      this.orbPhase = opts.orbPhase != null ? opts.orbPhase : rand(0, TAU);
      this.orbDir = opts.orbDir || (Math.random() < 0.5 ? 1 : -1);
      this.pairId = opts.pairId || null;
      this.pairSlot = opts.pairSlot || 0;
      this.partner = opts.partner || null;
      this.isEmitter = opts.pairSlot !== 1;   // slot 0 emits the pair's soundwave
      this.phase0 = rand(0, TAU);
      this.strafeDir = Math.random() < 0.5 ? 1 : -1;
      this.strafeT = rand(1.6, 3);
      this.aimAng = toPlayerAng(this, g);
      this.spawnT = this.boss ? (this.bossCfg.entrance || 1.6) : C.ENEMY.spawnFade;
      this.kx = 0; this.ky = 0;
      this.flash = 0;
      this.pulse = rand(0, TAU);
      this.vx = 0; this.vy = 0;
      this.age = 0;
      this.dead = false;
      this.sacrificed = false;
    }

    /* boss phase by HP: 0 above 70%, 1 between 70-35%, 2 below 35% */
    phase() {
      const f = this.hp / this.maxHP;
      return f > 0.7 ? 0 : f > 0.35 ? 1 : 2;
    }

    hit(dmg, kbx, kby, g) {
      if (this.dead) return false;
      let d = dmg;
      /* claude boss: inside a protective zone incoming damage halves */
      if (g && g.hazards && this.boss) {
        for (const h of g.hazards) {
          if (h.kind === 'zone' && h.owner === this &&
              dist(h.x, h.y, this.x, this.y) < h.r) { d *= 0.5; break; }
        }
      }
      /* constitution shield absorbs incoming damage first */
      if (this.shieldHp > 0) {
        const absorbed = Math.min(this.shieldHp, d);
        this.shieldHp -= absorbed;
        d -= absorbed;
      }
      if (d > 0) this.hp -= d;
      this.flash = 0.12;
      const kbMul = this.boss ? 0.12
        : this.variant.id === 'elite' ? 0.55
        : this.variant.id === 'advanced' ? 0.8 : 1;
      this.kx += kbx * kbMul; this.ky += kby * kbMul;
      if (this.hp <= 0) { this.hp = 0; this.dead = true; }
      return this.dead;
    }

    moveMul() {
      if (this.frenzyT > 0) return this.def.ability.mult || 1.7;
      if (this.frenzySlowT > 0) return this.def.ability.slowMul || 0.55;
      if (this.recover > 0) return 0.15;
      if (this.windup) {
        if (this.windup.kind === 'dash' || this.windup.kind === 'lock') return 0;
        if (this.windup.kind === 'aim') return 0.35;   // telegraph ≠ frozen
        return 0.2;
      }
      return 1;
    }

    update(dt, g) {
      if (this.dead) return;
      if (this.spawnT > 0) { this.spawnT -= dt; return; }
      this.age += dt;
      if (this.flash > 0) this.flash -= dt;
      this.pulse += dt * 5;

      /* knockback drift */
      const px0 = this.x, py0 = this.y;
      this.x += this.kx * dt; this.y += this.ky * dt;
      const decay = Math.exp(-C.FX.knockbackDecay * dt);
      this.kx *= decay; this.ky *= decay;

      /* v0.9 §1/§3: stable retargeting + smooth speed transitions.
         Speed always follows the CURRENT target's effective speed, so
         upgrades/characters on the targeted player apply immediately. */
      this.retargetT -= dt;
      if (this.retargetT <= 0 || !this.tgt || this.tgt.hp <= 0) {
        this.retargetT = rand(1.4, 2.6);
        this.tgt = pickTarget(this, g);
      }
      {
        const want = tgtOf(this, g).effSpeed * this.speedPct;
        this.speed += (want - this.speed) * Math.min(1, dt * 3.5);
      }

      /* tiktok scroll frenzy lifecycle */
      if (this.frenzyT > 0) {
        this.frenzyT -= dt;
        if (this.frenzyT <= 0) this.frenzySlowT = this.def.ability.slowDur || 1.2;
      } else if (this.frenzySlowT > 0) this.frenzySlowT -= dt;

      /* claude constitution shield duration */
      if (this.shieldHp > 0) {
        this.shieldT -= dt;
        if (this.shieldT <= 0) this.shieldHp = 0;
      }

      /* locked-direction dash (iphone rush / boss reposition) */
      if (this.dash) {
        this.dash.t -= dt;
        moveAng(this, this.dash.ang, this.dash.speed, dt);
        if (this.dash.t <= 0) {
          this.dash = null;
          this.recover = this.def.ability && this.def.ability.recover ? this.def.ability.recover : 0.7;
        }
      }

      /* windup -> execute */
      if (this.windup) {
        this.windup.t -= dt;
        if (this.windup.t <= 0) this.execWindup(g);
      }

      /* sequential shots (generated response / boss aimed sequences) */
      if (this.seq) {
        this.seq.t -= dt;
        if (this.seq.t <= 0) {
          const s = this.seq;
          s.idx++;
          let ang;
          if (s.predict && s.idx > 1 && g.player) {
            /* aim at the player's predicted position (imperfect) */
            const p = g.player;
            const tx = p.x + (p.vx || 0) * s.predictT + rand(-30, 30);
            const ty = p.y + (p.vy || 0) * s.predictT + rand(-30, 30);
            ang = Math.atan2(ty - this.y, tx - this.x);
          } else if (g.player) {
            ang = toPlayerAng(this, g);
          } else { ang = 0; }
          fireProj(this, g, ang, { kind: s.kind, dmg: s.dmg, speed: s.speed,
            projOpts: s.projOpts });
          s.left--;
          s.t = s.gap;
          if (s.left <= 0) this.seq = null;
        }
      }

      /* per-type behavior (movement + attacks + abilities) */
      if (!this.windup || this.windup.kind === 'dash') {
        if (this.boss && BOSSAI[this.bossCfg.base]) BOSSAI[this.bossCfg.base](this, dt, g);
        else if (TYPES[this.typeId]) TYPES[this.typeId](this, dt, g);
      }

      /* track real movement (tilt / prediction source) */
      this.vx = (this.x - px0) / Math.max(dt, 1e-5);
      this.vy = (this.y - py0) / Math.max(dt, 1e-5);

      /* stay in the arena */
      const a = KS.arenaSize();
      this.x = clamp(this.x, this.r, a - this.r);
      this.y = clamp(this.y, this.r, a - this.r);
    }

    /* windup finished -> perform the telegraphed action */
    execWindup(g) {
      const w = this.windup;
      /* v0.9 §8: pre-fire 'aim' telegraph -> the shot/spread fires NOW,
         re-aimed at the target's position at this instant */
      if (w.kind === 'aim') {
        const a = w.act;
        const ang = toPlayerAng(this, g) + (a.jitter ? rand(-a.jitter, a.jitter) : 0);
        if (a.kind === 'spread') fireSpread(this, g, a.count, a.arc);
        else fireProj(this, g, ang, { speed: a.speed });
        this.windup = null;
        this.atkT = this.atkCd;
        return;
      }
      this.windup = null;
      const ab = this.def.ability || {};
      switch (w.kind) {
        case 'dash': {
          /* Notification Rush (v0.9 §4): surge at 100% of the targeted
             player's EFFECTIVE speed (was a fixed 300 px/s) */
          this.dash = {
            t: ab.dur || 0.45,
            speed: tgtOf(this, g).effSpeed * C.IPHONE_CHASE_PCT,
            ang: toPlayerAng(this, g),
          };
          KS.Audio.abilitySfx('dash');
          break;
        }
        case 'lock': {
          /* Target Lock: fire toward the player's position NOW */
          const pc = this.def.projCount || 1;
          if (pc > 1) {
            this.seq = { left: pc, gap: 0.14, t: 0, idx: 0, kind: this.def.projKind,
              dmg: this.projDmg, speed: this.projSpd, predict: false };
          } else {
            fireProj(this, g, toPlayerAng(this, g));
          }
          this.atkT = this.atkCd;
          break;
        }
        case 'cast': {
          /* ChatGPT: fired after stopping — normal burst or a generated response */
          const burst = Math.min(3, (this.def.projCount || 1) + (g.wave >= 10 ? 1 : 0));
          if (w.seq) {
            this.seq = { left: 2, gap: ab.delay || 0.35, t: 0, idx: 0,
              kind: this.def.projKind, dmg: this.projDmg, speed: this.projSpd,
              predict: true, predictT: ab.predict || 0.4 };
          } else {
            fireSpread(this, g, burst, 0.14);
          }
          this.atkT = this.atkCd;
          break;
        }
        case 'flush': {
          spawnHazard(g, { kind: 'wave', x: this.x, y: this.y,
            warn: 0.02, maxR: w.radius, speed: ab.waveSpeed || 260,
            dmg: this.projDmg, color: 'rgba(96,178,231,0.95)', owner: this });
          KS.Audio.abilitySfx('flush');
          this.atkT = this.atkCd;
          break;
        }
        case 'sound': {
          spawnHazard(g, { kind: 'wave', x: this.x, y: this.y,
            warn: 0.02, maxR: w.radius, speed: ab.waveSpeed || 240,
            dmg: this.projDmg, color: 'rgba(80,240,255,0.95)', owner: this });
          KS.Audio.abilitySfx('soundwave');
          this.atkT = this.atkCd;
          break;
        }
        case 'multimodal': {
          fireSpread(this, g, w.count, ab.arc || 0.38);
          this.atkT = this.atkCd;
          break;
        }
        case 'cloud': {
          /* distraction cloud (fictional hazard) — strongest applies, no stacking */
          const clouds = g.hazards.filter((h) => h.kind === 'cloud');
          if (clouds.length >= 8 && clouds[0]) clouds[0].dead = true;  // no infinite stacking
          const n = ab.count || 1;
          for (let i = 0; i < n; i++) {
            const off = n === 1 ? 0 : (i - (n - 1) / 2) * w.radius * 1.7;
            spawnHazard(g, { kind: 'cloud', x: this.x + off, y: this.y,
              r: w.radius, dur: ab.dur || 4, slow: ab.slow || 35 });
          }
          KS.Audio.abilitySfx('cloud');
          this.atkT = this.atkCd;
          break;
        }
      }
    }

    /* ---------------- drawing ---------------- */
    draw(ctx, g) {
      const S = KS.Settings.get();
      const fx = S.visualEffects;
      const def = this.def;
      const fade = this.spawnT > 0
        ? clamp(1 - this.spawnT / (this.boss ? (this.bossCfg.entrance || 1.6) : C.ENEMY.spawnFade), 0, 1)
        : 1;
      const vis = this.r * 2 * 1.28;       // sprite drawn slightly larger than hitbox
      const tilt = clamp(this.vx * 0.0028, -0.16, 0.16);
      const wobble = 1 + Math.sin(this.pulse) * 0.035;

      ctx.save();
      ctx.globalAlpha = this.boss ? 0.25 + 0.75 * fade : fade;

      /* --- under-sprite: variant ring / boss aura --- */
      if (this.boss) {
        const pul = 1 + Math.sin(this.pulse * 2) * 0.06;
        if (fx) {
          const gr = ctx.createRadialGradient(this.x, this.y, this.r * 0.4, this.x, this.y, this.r * 1.7 * pul);
          gr.addColorStop(0, 'rgba(190,20,25,0.34)');
          gr.addColorStop(1, 'rgba(190,20,25,0)');
          ctx.fillStyle = gr;
          ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 1.7 * pul, 0, TAU); ctx.fill();
        }
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = 'rgba(255,60,50,0.9)';
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 1.12, 0, TAU); ctx.stroke();
      } else if (this.variant.id !== 'standard') {
        ctx.lineWidth = 3;
        ctx.strokeStyle = this.variant.ring;
        if (fx && this.variant.id === 'elite') { ctx.shadowColor = '#ffb020'; ctx.shadowBlur = 10; }
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 1.18, 0, TAU); ctx.stroke();
        ctx.shadowBlur = 0;
        if (this.variant.id === 'elite') {
          /* four crown ticks around elites */
          ctx.lineWidth = 3.5;
          for (let i = 0; i < 4; i++) {
            const a = this.pulse * 0.5 + i * Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(this.x + Math.cos(a) * this.r * 1.28, this.y + Math.sin(a) * this.r * 1.28);
            ctx.lineTo(this.x + Math.cos(a) * this.r * 1.45, this.y + Math.sin(a) * this.r * 1.45);
            ctx.stroke();
          }
        }
      }

      /* --- area telegraphs (under the sprite) --- */
      if (this.windup) {
        const w = this.windup;
        const now = performance.now() / 1000;
        if (w.kind === 'flush' || w.kind === 'sound') {
          const k = 1 - w.t / w.warnT;
          ctx.globalAlpha *= 1;
          ctx.setLineDash([7, 6]);
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = w.kind === 'flush' ? 'rgba(96,178,231,0.95)' : 'rgba(80,240,255,0.95)';
          ctx.beginPath(); ctx.arc(this.x, this.y, w.radius, 0, TAU); ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha *= 0.85;
          ctx.fillStyle = w.kind === 'flush' ? 'rgba(96,178,231,0.3)' : 'rgba(80,240,255,0.3)';
          ctx.beginPath(); ctx.arc(this.x, this.y, w.radius * k, 0, TAU); ctx.fill();
        } else if (w.kind === 'cloud') {
          ctx.setLineDash([5, 5]);
          ctx.lineWidth = 2;
          ctx.strokeStyle = 'rgba(210,180,120,0.85)';
          ctx.beginPath(); ctx.arc(this.x, this.y, w.radius, 0, TAU); ctx.stroke();
          ctx.setLineDash([]);
        }
        void now;
      }

      /* --- sprite --- */
      const img = Sprites.get(def.sprite);
      if (img) {
        const use = this.boss ? Sprites.bossOf(def.sprite) : img;
        const sc = (vis / Math.max(use.width, use.height)) * wobble;
        const dw = use.width * sc, dh = use.height * sc;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(tilt);
        if (fx && this.frenzyT > 0) { ctx.shadowColor = 'rgba(0,224,224,0.9)'; ctx.shadowBlur = 14; }
        ctx.drawImage(use, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();
      } else {
        /* vector AirPod bud */
        const rot = Math.atan2(this.vy, this.vx) + Math.PI / 2;
        if (fx && this.frenzyT > 0) {
          ctx.shadowColor = 'rgba(0,224,224,0.9)'; ctx.shadowBlur = 14;
        }
        drawPod(ctx, this.x, this.y, this.r * wobble, rot);
        ctx.shadowBlur = 0;
      }

      /* --- point telegraphs --- */
      if (this.windup) {
        const w = this.windup;
        if (w.kind === 'lock') {
          /* camera targeting line toward the player */
          ctx.save();
          ctx.globalAlpha *= 0.75;
          ctx.setLineDash([4, 7]);
          ctx.lineWidth = 1.8;
          ctx.strokeStyle = 'rgba(255,80,60,0.95)';
          const ct = tgtOf(this, g);
          ctx.beginPath();
          ctx.moveTo(this.x, this.y);
          ctx.lineTo(ct.x, ct.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(255,80,60,0.95)';
          ctx.beginPath(); ctx.arc(ct.x, ct.y, 4 + (1 - w.t / w.warnT) * 4, 0, TAU); ctx.fill();
          ctx.restore();
        } else if (w.kind === 'dash') {
          /* Notification Rush warning: flashing ring + arrow */
          const k = 1 - w.t / w.warnT;
          ctx.globalAlpha *= 0.6 + 0.4 * Math.abs(Math.sin(this.age * 18));
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#ffd23f';
          ctx.beginPath(); ctx.arc(this.x, this.y, this.r * (1.2 + k * 0.5), 0, TAU); ctx.stroke();
          const a = toPlayerAng(this, g);
          ctx.fillStyle = '#ffd23f';
          ctx.save();
          ctx.translate(this.x + Math.cos(a) * this.r * 1.7, this.y + Math.sin(a) * this.r * 1.7);
          ctx.rotate(a);
          ctx.beginPath();
          ctx.moveTo(9, 0); ctx.lineTo(-5, 6); ctx.lineTo(-5, -6);
          ctx.closePath(); ctx.fill();
          ctx.restore();
        } else if (w.kind === 'cast' || w.kind === 'multimodal') {
          const k = 1 - w.t / w.warnT;
          ctx.globalAlpha *= 0.7;
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = this.boss ? 'rgba(255,70,60,0.95)'
            : this.typeId === 'gemini' ? 'rgba(155,114,203,0.95)' : 'rgba(16,163,127,0.95)';
          ctx.beginPath(); ctx.arc(this.x, this.y, this.r * (1.1 + k * 0.4), 0, TAU); ctx.stroke();
        } else if (w.kind === 'aim') {
          /* v0.9 §8: pre-fire warning — charging ring + dashed line that
             tracks the target so the attack DIRECTION is readable */
          const k = 1 - w.t / w.warnT;
          const t = tgtOf(this, g);
          ctx.globalAlpha *= 0.8;
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = 'rgba(255,176,64,0.95)';
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.r * (1.15 + k * 0.45), -Math.PI / 2,
            -Math.PI / 2 + TAU * k);
          ctx.stroke();
          ctx.setLineDash([5, 6]);
          ctx.lineWidth = 1.6;
          ctx.globalAlpha *= 0.75;
          ctx.beginPath();
          ctx.moveTo(this.x, this.y);
          ctx.lineTo(t.x, t.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(255,176,64,0.9)';
          ctx.beginPath();
          ctx.arc(t.x, t.y, 3 + k * 4, 0, TAU);
          ctx.fill();
        }
      }

      /* --- constitution shield --- */
      if (this.shieldHp > 0) {
        const a = clamp(this.shieldHp / Math.max(1, this.shieldAbsorb), 0.25, 1);
        ctx.globalAlpha *= 1;
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = `rgba(255,176,96,${0.5 + 0.45 * a})`;
        if (fx) { ctx.shadowColor = 'rgba(255,176,96,0.9)'; ctx.shadowBlur = 10; }
        for (let i = 0; i < 6; i++) {
          const a0 = this.pulse * 0.6 + i * TAU / 6;
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.r * 1.32, a0, a0 + TAU / 6 * 0.72);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }

      /* --- hit flash --- */
      if (this.flash > 0) {
        ctx.globalAlpha = Math.min(1, (this.flash / 0.12) * 0.7);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, TAU); ctx.fill();
      }

      /* --- small HP bar (once damaged; bosses use the HUD bar) --- */
      if (!this.boss && this.hp < this.maxHP) {
        const bw = Math.max(26, this.r * 2.1), bh = 4;
        const bx = this.x - bw / 2, by = this.y - this.r * 1.35 - 8;
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = this.variant.id === 'elite' ? '#ffb020'
          : this.variant.id === 'advanced' ? '#5aa2ff' : '#ff5b5b';
        ctx.fillRect(bx, by, bw * clamp(this.hp / this.maxHP, 0, 1), bh);
      }
      ctx.restore();
    }
  }

  /* =====================================================
     TYPES — per-enemy identity: movement + attacks + ability.
     ===================================================== */
  const TYPES = {
    /* iPhone: DEDICATED pursuer (v0.9 §4) — every projectile behavior
       removed; pressure comes from movement only. Notification Rush
       surge closes distance at 100% of the target's effective speed. */
    iphone(e, dt, g) {
      const ab = e.def.ability;
      if (e.dash) return;                       // rushing — no other action
      e.abilityT -= dt;
      if (e.abilityT <= 0) {
        e.abilityT = ab.every;
        e.windup = { kind: 'dash', t: ab.warn, warnT: ab.warn };
        KS.Audio.abilitySfx('rushWarn');
        return;
      }
      moveAng(e, toPlayerAng(e, g), e.speed * e.moveMul(), dt);
    },

    /* Camera: mobile ranged pursuer (Brotato ranged style) —
       continuously chases the player, holds a useful firing distance,
       and pauses only for the Target-Lock flash. Uses the same
       movement primitives and arena clamping as every other enemy. */
    camera(e, dt, g) {
      const ab = e.def.ability;
      const dist = toPlayerDist(e, g);
      e.aimAng = lerpAng(e.aimAng, toPlayerAng(e, g), Math.min(1, dt * 6));
      e.atkT -= dt;
      if (e.windup) return;             // brief pause while flashing
      if (e.atkT <= 0 && dist < e.def.atkRange) {
        e.windup = { kind: 'lock', t: ab.warn, warnT: ab.warn };
        KS.Audio.abilitySfx('lock');
        return;
      }
      /* pursue: advance when far, hold at the ring's edge, back off
         slowly when the player crowds the lens */
      const keep = e.def.atkRange * (e.def.keepDist || 0.55);
      const mul = dist > keep ? 1 : dist < keep * 0.6 ? -0.45 : 0.12;
      moveAng(e, toPlayerAng(e, g), e.speed * e.moveMul() * mul, dt);
    },

    /* ChatGPT: pursuer that stops to answer — generated responses.
       Every ranged attack is telegraphed first (v0.9 §8). */
    chatgpt(e, dt, g) {
      const ab = e.def.ability;
      e.atkT -= dt;
      if (!e.windup && e.atkT <= 0 && toPlayerDist(e, g) < e.def.atkRange) {
        e.atkIdx++;
        if (e.atkIdx % ab.everyN === 0) {
          /* Generated Response: two projectiles, the 2nd aims at the
             player's predicted position */
          e.windup = { kind: 'cast', t: e.def.stopTime, warnT: e.def.stopTime, seq: true };
        } else if (Math.random() < (e.def.stopChance || 0.4)) {
          e.windup = { kind: 'cast', t: e.def.stopTime, warnT: e.def.stopTime, seq: false };
        } else {
          /* burst now shows a pre-fire aim telegraph */
          const burst = Math.min(3, (e.def.projCount || 1) + (g.wave >= 10 ? 1 : 0));
          e.windup = { kind: 'aim', t: C.AIM_WARN.chatgpt,
            warnT: C.AIM_WARN.chatgpt,
            act: { kind: 'spread', count: burst, arc: 0.14 } };
        }
        return;
      }
      moveAng(e, toPlayerAng(e, g), e.speed * e.moveMul(), dt);
    },

    /* Toilet: slow pressure enemy — Flush circular water wave */
    toilet(e, dt, g) {
      const ab = e.def.ability;
      e.abilityT -= dt;
      if (e.abilityT <= 0) {
        e.abilityT = ab.every;
        if (toPlayerDist(e, g) < e.def.atkRange * 1.6) {
          e.windup = { kind: 'flush', t: ab.warn, warnT: ab.warn, radius: ab.radius };
        }
        return;
      }
      moveAng(e, toPlayerAng(e, g), e.speed * e.moveMul(), dt);
    },

    /* Gemini: strafing ranged attacker — single / spread / Multimodal Burst */
    gemini(e, dt, g) {
      const ab = e.def.ability;
      /* kite with an oscillating preferred radius — the low point dips
         into melee reach (a strike connects at dist <= reach + e.r) */
      const pref = e.r + 70 + (e.def.atkRange * 0.5)
        * (0.5 + 0.5 * Math.sin(g.time * 0.45 + e.phase0));
      const d = toPlayerDist(e, g);
      const toP = toPlayerAng(e, g);
      e.strafeT -= dt;
      if (e.strafeT <= 0) { e.strafeDir *= -1; e.strafeT = rand(1.6, 3); }
      let ang;
      if (d > pref + 40) ang = toP;
      else if (d < pref - 40) ang = toP + Math.PI;
      else ang = toP + Math.PI / 2 * e.strafeDir;
      moveAng(e, ang, e.speed * e.moveMul(), dt);

      e.atkT -= dt;
      if (e.atkT <= 0 && d < e.def.atkRange && !e.windup) {
        e.atkIdx++;
        if (e.atkIdx % ab.every === 0) {
          e.windup = { kind: 'multimodal', t: ab.warn, warnT: ab.warn, count: ab.count };
        } else if (e.atkIdx % 2 === 0) {
          e.windup = { kind: 'aim', t: C.AIM_WARN.gemini, warnT: C.AIM_WARN.gemini,
            act: { kind: 'spread', count: e.def.spread || 3,
              arc: e.def.spreadArc || 0.22 } };
        } else {
          e.windup = { kind: 'aim', t: C.AIM_WARN.gemini, warnT: C.AIM_WARN.gemini,
            act: { kind: 'shot', speed: e.projSpd * 1.1 } };
        }
      }
    },

    /* TikTok: fast evasive — video-frame shots + Scroll Frenzy */
    tiktok(e, dt, g) {
      const ab = e.def.ability;
      e.abilityT -= dt;
      if (e.abilityT <= 0) {
        e.abilityT = ab.every;
        e.frenzyT = ab.dur;
        KS.Audio.abilitySfx('frenzy');
      }
      e.atkT -= dt;
      if (e.atkT <= 0 && toPlayerDist(e, g) < e.def.atkRange && !e.windup) {
        /* video-frame shot: charge telegraph, then fire (v0.9 §8) */
        e.windup = { kind: 'aim', t: C.AIM_WARN.tiktok, warnT: C.AIM_WARN.tiktok,
          act: { kind: 'shot', jitter: 0.08 } };
      }
      /* erratic approach with direction wobble (wilder while frenzied) */
      const wobF = e.frenzyT > 0 ? 7 : 3;
      const wobA = e.frenzyT > 0 ? 1.15 : 0.7;
      const ang = toPlayerAng(e, g) + Math.sin(e.age * wobF + e.phase0) * wobA;
      moveAng(e, ang, e.speed * e.moveMul(), dt);
    },

    /* AirPods: ONE complete entity (v0.9 §9) — the whole pair is a
       single enemy with one HP bar, one body and one reward roll */
    airpods(e, dt, g) {
      const ab = e.def.ability;
      e.abilityT -= dt;
      if (e.abilityT <= 0) {
        e.abilityT = ab.every;
        if (toPlayerDist(e, g) < e.def.atkRange * 2.2) {
          e.windup = { kind: 'sound', t: ab.warn, warnT: ab.warn, radius: ab.radius };
        }
      }
      /* orbit the target — the inner pass dips into melee reach */
      const t = tgtOf(e, g);
      const orb = 70 + 80 * (0.5 + 0.5 * Math.sin(g.time * 0.9 + e.orbPhase));
      const ang = e.orbPhase + g.time * 1.15 * e.orbDir;
      const tx = t.x + Math.cos(ang) * orb;
      const ty = t.y + Math.sin(ang) * orb;
      const ta = Math.atan2(ty - e.y, tx - e.x);
      moveAng(e, ta, e.speed * e.moveMul(), dt);
    },

    /* Claude: defensive kiter — heavy shots + Constitution Shield */
    claude(e, dt, g) {
      const ab = e.def.ability;
      e.abilityT -= dt;
      if (e.abilityT <= 0) {
        e.abilityT = ab.every;
        if (e.shieldHp <= 0) {
          e.shieldHp = ab.absorb;
          e.shieldT = ab.maxDur;
          KS.Audio.abilitySfx('shield');
        }
      }
      e.atkT -= dt;
      if (e.atkT <= 0 && toPlayerDist(e, g) < e.def.atkRange && !e.windup) {
        /* heavy shot: visible charge-up before firing (v0.9 §8) */
        e.windup = { kind: 'aim', t: C.AIM_WARN.claude, warnT: C.AIM_WARN.claude,
          act: { kind: 'shot', jitter: 0.03 } };
      }
      /* kite with an oscillating preferred radius (melee can reach it) */
      const pref = e.r + 70 + (e.def.kiteR * 0.6)
        * (0.5 + 0.5 * Math.sin(g.time * 0.4 + e.phase0));
      const d = toPlayerDist(e, g);
      const toP = toPlayerAng(e, g);
      let ang;
      if (d > pref + 40) ang = toP;
      else if (d < pref - 40) ang = toP + Math.PI;
      else ang = toP + Math.PI / 2 * e.strafeDir;
      moveAng(e, ang, e.speed * e.moveMul(), dt);
    },

    /* Drug Bottle: zigzag movement — drops distraction clouds */
    drugbottle(e, dt, g) {
      const ab = e.def.ability;
      e.abilityT -= dt;
      if (e.abilityT <= 0) {
        e.abilityT = ab.every;
        e.windup = { kind: 'cloud', t: 0.6, warnT: 0.6, radius: ab.radius };
        return;
      }
      /* irregular zigzag toward the principal */
      const ang = toPlayerAng(e, g) + Math.sin(e.age * 3.4 + e.phase0) * 0.85;
      moveAng(e, ang, e.speed * e.moveMul(), dt);
    },
  };

  /* =====================================================
     BOSSAI — the three AI-company bosses (spec §5).
     Phases: 0 above 70% HP, 1 between 70-35%, 2 below 35%.
     ===================================================== */
  const BOSSAI = {
    /* ADVANCED CHATGPT — text spreads, aimed sequences, splitting orb */
    chatgpt(e, dt, g) {
      const ph = e.phase();
      /* brief defensive repositioning: quick sideways dash */
      e.abilityT -= dt;
      if (e.abilityT <= 0) {
        e.abilityT = 6;
        const toP = toPlayerAng(e, g);
        e.dash = { t: 0.3, speed: e.speed * 4.2,
          ang: toP + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2 };
        return;
      }
      e.atkT -= dt;
      if (e.atkT > 0) { moveAng(e, toPlayerAng(e, g), e.speed * e.moveMul(), dt); return; }
      e.patIdx++;
      e.atkT = e.def.cooldown * [1, 0.85, 0.7][ph];
      const cyc = e.patIdx % 3;
      if (cyc === 1) {
        /* spread of text projectiles */
        fireSpread(e, g, 3 + ph, 0.3);
      } else if (cyc === 2) {
        /* aimed sequence — later shots track the predicted position */
        e.seq = { left: 3 + ph, gap: 0.25, t: 0, idx: 0, kind: 'text',
          dmg: e.projDmg, speed: e.projSpd, predict: true, predictT: 0.45 };
      } else {
        /* large slow orb that splits into smaller projectiles */
        fireProj(e, g, toPlayerAng(e, g), {
          kind: 'bigsplit', speed: 120, dmg: e.projDmg,
          projOpts: { r: 12, life: 1.7, split: 6 },
        });
        KS.Audio.abilitySfx('split');
      }
    },

    /* ADVANCED GEMINI — alternates radial bursts, aimed spreads,
       and a projectile ring with a gap */
    gemini(e, dt, g) {
      const ph = e.phase();
      /* kite with an oscillating preferred radius (melee-reachable low point) */
      const pref = e.r + 70 + 170 * (0.5 + 0.5 * Math.sin(g.time * 0.4 + e.phase0));
      const d = toPlayerDist(e, g);
      const toP = toPlayerAng(e, g);
      e.strafeT -= dt;
      if (e.strafeT <= 0) { e.strafeDir *= -1; e.strafeT = rand(1.4, 2.6); }
      let ang;
      if (d > pref + 40) ang = toP;
      else if (d < pref - 40) ang = toP + Math.PI;
      else ang = toP + Math.PI / 2 * e.strafeDir;
      moveAng(e, ang, e.speed * e.moveMul(), dt);

      e.atkT -= dt;
      if (e.atkT > 0) return;
      e.patIdx++;
      e.atkT = e.def.cooldown * [1, 0.8, 0.65][ph];
      const cyc = e.patIdx % 3;
      if (cyc === 1) {
        fireRadial(e, g, 8 + 2 * ph, e.patIdx * 0.35, 0.92);
      } else if (cyc === 2) {
        fireSpread(e, g, 3 + 2 * ph, 0.4);
      } else {
        /* ring of projectiles with one safe gap */
        const n = 10 + 2 * ph;
        const gapStart = rand(0, TAU);
        for (let i = 0; i < n; i++) {
          const a = i * TAU / n;
          let inGap = false;
          const rel = ((a - gapStart + Math.PI * 3) % TAU) - Math.PI;
          if (Math.abs(rel) < TAU / n) inGap = true;
          if (!inGap) fireProj(e, g, a, { speed: e.projSpd * 0.85 });
        }
      }
    },

    /* ADVANCED CLAUDE — heavy shots, Constitution Shield,
       protective zones, wide fans */
    claude(e, dt, g) {
      const ph = e.phase();
      const ab = e.def.ability;
      /* constitution shield cycles (more frequent in later phases) */
      e.abilityT -= dt;
      if (e.abilityT <= 0) {
        e.abilityT = Math.max(5, ab.every - ph * 1.5);
        if (e.shieldHp <= 0) {
          e.shieldHp = e.shieldAbsorb = ab.absorb + ph * 15;
          e.shieldT = ab.maxDur;
          KS.Audio.abilitySfx('shield');
        }
      }
      /* temporary protective zone: incoming damage halves while inside */
      e.zoneT -= dt;
      if (e.zoneT <= 0) {
        e.zoneT = 12;
        spawnHazard(g, { kind: 'zone', x: e.x, y: e.y, r: 130, dur: 4, owner: e });
      }
      /* kite; below 35% HP it turns aggressive */
      const pref = e.r + 70 + (ph === 2 ? 110 : 150)
        * (0.5 + 0.5 * Math.sin(g.time * 0.4 + e.phase0));
      const d = toPlayerDist(e, g);
      const toP = toPlayerAng(e, g);
      let ang;
      if (d > pref + 40) ang = toP;
      else if (d < pref - 40) ang = toP + Math.PI;
      else ang = toP + Math.PI / 2 * e.strafeDir;
      const spd = e.speed * (ph === 2 ? 1.25 : 1);
      moveAng(e, ang, spd * e.moveMul(), dt);

      e.atkT -= dt;
      if (e.atkT > 0) return;
      e.patIdx++;
      e.atkT = e.def.cooldown * [1, 0.85, 0.7][ph];
      if (e.patIdx % 3 === 2) {
        /* wide fan of heavy projectiles */
        fireSpread(e, g, 5, 0.5);
      } else {
        fireProj(e, g, toP + rand(-0.03, 0.03), { speed: e.projSpd * 0.95 });
      }
    },
  };

  /* =====================================================
     SPAWN DIRECTOR — quota-based scheduling (spec §6-§7).
     Distributes each wave's exact spawn events across the wave,
     honors the active-enemy cap (holds the queue), rolls
     variants, and schedules boss entrances.
     ===================================================== */
  class SpawnDirector {
    constructor(g) { this.g = g; }

    /* quota row for a wave; endless waves grow from the wave-19 row.
       v0.9 §1: duo passes mult=2 — the ordinary quotas DOUBLE while the
       boss schedule, identities, order and variant odds stay untouched. */
    static scheduleFor(wave, mult = 1) {
      const S = C.WAVE_SCHEDULE;
      const row = (w) => {
        if (w <= S.length) return S[w - 1];
        const base = S[S.length - 2];        // wave 19 as the endless template
        const k = 1 + (w - S.length) * 0.05;
        const out = {};
        for (const [t, n] of Object.entries(base)) out[t] = Math.min(30, Math.ceil(n * k));
        return out;
      };
      const src = row(wave);
      if (mult === 1) return src;
      const out = {};
      for (const [t, n] of Object.entries(src)) out[t] = n * 2;
      return out;
    }

    /* boss events for a wave: [{ t, boss }] — bosses spawn at the START
       of the wave and take a 3-second introduction sequence */
    static bossesFor(wave) {
      const evs = [];
      if (wave === C.COUNCIL.wave) {
        C.COUNCIL.members.forEach((m, i) => {
          evs.push({ t: 0.2 + i * 0.9, boss: Object.assign({ name: m.name }, m, { entrance: C.COUNCIL.entrance }) });
        });
      } else if (wave > C.WAVES.length) {
        /* endless: rotating single boss, council every 5th wave */
        if (wave % 5 === 0) {
          C.COUNCIL.members.forEach((m, i) => {
            evs.push({ t: 0.2 + i * 0.9, boss: Object.assign({ name: m.name }, m, { entrance: C.COUNCIL.entrance }) });
          });
        } else {
          const id = C.ENDLESS_BOSS_ROTATION[(wave - C.WAVES.length - 1) % C.ENDLESS_BOSS_ROTATION.length];
          evs.push({ t: 0.2, boss: C.BOSSES[id] });
        }
      } else {
        for (const b of Object.values(C.BOSSES)) {
          if (b.wave === wave) evs.push({ t: 0.2, boss: b });
        }
      }
      return evs;
    }

    /* roll a variant for this wave (elite > advanced > standard) */
    static rollVariant(wave) {
      const r = Math.random();
      if (wave >= C.VARIANTS.elite.unlock && r < C.VARIANTS.elite.chance(wave)) return 'elite';
      if (wave >= C.VARIANTS.advanced.unlock && r < C.VARIANTS.advanced.chance(wave)) return 'advanced';
      return 'standard';
    }

    /* target interval / group size band for this wave (spec §2) */
    static bandFor(wave) {
      const bands = C.ENEMY.spawnGroups.bands;
      for (const b of bands) if (wave <= b.maxWave) return b;
      return bands[bands.length - 1];
    }

    /* ------------------------------------------------------------
       Adaptive scheduling (spec §2-§4): chunk the wave's exact quota
       into GROUPS, space them across [startFrac, endFrac] of the
       wave's ACTUAL duration using the band's target interval.
       Intervals are targets, not rigid timers — when a short wave
       carries a large quota, group sizes stretch before intervals
       shrink, and a cap hold re-times the remaining groups into the
       time that's left.  Nothing is discarded; nothing spawns after
       the timer expires.
       ------------------------------------------------------------ */
    startWave(wave) {
      this.wave = wave;
      this.t = 0;
      this.spawned = {};
      this.held = false;
      this.retimer = C.ENEMY.spawnGroups.retargetEvery;
      this.duration = KS.waveDuration(wave);
      const G = C.ENEMY.spawnGroups;
      const band = SpawnDirector.bandFor(wave);

      /* 1. event list, shuffled so groups mix enemy identities */
      const sched = SpawnDirector.scheduleFor(wave, this.g.duo ? 2 : 1);
      const events = [];
      for (const [type, count] of Object.entries(sched)) {
        if (!C.ENEMIES[type] || count <= 0) continue;
        this.spawned[type] = 0;
        for (let i = 0; i < count; i++) events.push({ type });
        /* pairs: keep both pods of one event together */
        if (C.ENEMIES[type].pair) {
          for (let i = events.length - count; i < events.length; i++) events[i].units = 2;
        }
      }
      for (let i = events.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [events[i], events[j]] = [events[j], events[i]];
      }

      /* 2. decide group count from the window and the band interval,
            stretched only as far as feasibility requires */
      const win0 = this.duration * G.startFrac;
      const win1 = Math.max(win0 + band.interval[0], this.duration * G.endFrac);
      const span = win1 - win0;
      const n = events.length;
      const maxTypical = band.size[1];
      const sizeGuard = Math.max(1, Math.floor(maxTypical * 2));   // burst guard: never > 2x typical
      const minGroups = Math.max(1, Math.ceil(n / sizeGuard));
      const maxGroups = Math.max(minGroups, Math.floor(span / band.interval[0]));
      const ideal = Math.max(1, Math.round(span / ((band.interval[0] + band.interval[1]) / 2)));
      const groups = Math.max(minGroups, Math.min(maxGroups, ideal));

      /* 3. chunk events into `groups` groups (evenly, ±1) */
      const chunks = [];
      let idx = 0;
      for (let gi = 0; gi < groups; gi++) {
        const size = Math.min(n - idx, Math.round((n - idx) / (groups - gi)));
        chunks.push(events.slice(idx, idx + Math.max(1, size)));
        idx += Math.max(1, size);
        if (idx >= n) break;
      }
      while (idx < n) { chunks[chunks.length - 1].push(events[idx++]); }

      /* 4. space group times across [win0, win1] with jitter */
      this.groups = chunks.map((evs, gi) => {
        const baseT = chunks.length === 1
          ? (win0 + win1) / 2
          : win0 + span * (gi / (chunks.length - 1));
        const jitter = (Math.random() * 2 - 1) * 0.5;
        return { t: Math.min(win1 + 1, Math.max(0.3, baseT + jitter)), events: evs };
      });

      this.bossQueue = SpawnDirector.bossesFor(wave);
    }

    /* after a cap hold (or periodically): compress the remaining
       groups into the wave time that is left (spec §4) */
    retarget() {
      const rem = this.groups;
      if (!rem.length) return;
      const G = C.ENEMY.spawnGroups;
      let winEnd = Math.max(this.t + 2, this.duration * G.endFrac);
      winEnd = Math.min(winEnd, Math.max(this.t + 2, this.duration - 0.5));
      const winStart = Math.min(this.t + 0.8, winEnd - 0.5);
      const span = Math.max(0.5, winEnd - winStart);
      rem.forEach((grp, i) => {
        grp.t = rem.length === 1
          ? winStart + span / 2
          : winStart + span * (i / (rem.length - 1));
      });
    }

    aliveOrdinary() {
      const g = this.g;
      return g.enemies.reduce((n, e) => n + (!e.dead && !e.boss ? 1 : 0), 0) + g.markers.length;
    }

    update(dt) {
      const g = this.g;
      this.t += dt;
      /* boss entrances first (they never count toward the ordinary cap) */
      while (this.bossQueue.length && this.bossQueue[0].t <= this.t) {
        const ev = this.bossQueue.shift();
        g.spawnBoss(ev.boss);
      }
      /* the timer has expired: stop scheduling new ordinary enemies —
         the player must finish whatever is on the field (spec §5) */
      if (g.waveTime <= 0) return;

      let cap = g.bossAlive()
        ? C.ENEMY.bossOrdinaryCap
        : Math.min(KS.maxAliveFor(g.wave), C.ENEMY.maxAlive);
      /* v0.9 §1: duo doubles the ordinary cap (boss COUNT and HP are
         never doubled) */
      if (g.duo) cap *= 2;
      if (this.aliveOrdinary() >= cap) {
        /* active-enemy cap reached: pause, keep the queue, resume
           (and re-time remaining groups) once space frees up */
        this.held = true;
        return;
      }
      if (this.held) {
        this.held = false;
        this.retarget();
      }
      this.retimer -= dt;
      if (this.retimer <= 0) {
        this.retimer = C.ENEMY.spawnGroups.retargetEvery;
        this.retarget();
      }
      /* release due groups; a large group stops at the cap and the
         remainder is re-queued a beat later */
      while (this.groups.length && this.groups[0].t <= this.t) {
        const grp = this.groups.shift();
        const leftover = [];
        for (const ev of grp.events) {
          if (this.aliveOrdinary() >= cap) { leftover.push(ev); continue; }
          this.spawned[ev.type] = (this.spawned[ev.type] || 0) + 1;
          g.queueEnemySpawn(ev.type);
        }
        if (leftover.length) {
          this.groups.unshift({ t: this.t + 0.75, events: leftover });
          this.held = true;
          break;
        }
      }
    }

    /* total enemy units this wave schedules (pairs count as 2) —
       feeds the horde-wave loot rule */
    totalUnits() {
      let n = 0;
      for (const grp of this.groups) {
        for (const ev of grp.events) {
          n += C.ENEMIES[ev.type] && C.ENEMIES[ev.type].pair ? 2 : 1;
        }
      }
      for (const [type, count] of Object.entries(this.spawned || {})) {
        n += C.ENEMIES[type] && C.ENEMIES[type].pair ? count * 2 : count;
      }
      return n;
    }

    /* remaining quota per type (debug overlay) */
    remaining() {
      const out = {};
      for (const grp of this.groups) {
        for (const ev of grp.events) out[ev.type] = (out[ev.type] || 0) + 1;
      }
      return out;
    }
  }

  /* ---------------- exports ---------------- */
  KS.EnemySprites = Sprites;
  KS.EProj = EProj;
  KS.Enemy = Enemy;
  KS.SpawnDirector = SpawnDirector;
  KS.updateHazards = updateHazards;
  KS.spawnHazard = spawnHazard;   // exposed for tests
  KS.cloudSlow = cloudSlow;
  KS.drawHazards = drawHazards;
  KS.drawPod = drawPod;
})();


/* =========================================================
   Builder's Turret (spec §8-§9) — the unique structure of
   Bair The Builder. The supplied art is single-frame per tier,
   so the animation comes from aiming rotation, a subtle idle
   pulse, firing recoil and a muzzle flash, plus the visible
   projectiles it launches.
   ========================================================= */
class TurretShot {
  constructor(x, y, ang, speed, dmg, owner = null) {
    this.x = x; this.y = y;
    this.vx = Math.cos(ang) * speed;
    this.vy = Math.sin(ang) * speed;
    this.dmg = dmg;
    this.owner = owner;          // kill credit -> the turret's owner
    this.r = KS.CONFIG.TURRET.hitR;
    this.life = 1.6;
    this.dead = false;
  }
  update(dt, g) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    for (const e of g.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      const dx = e.x - this.x, dy = e.y - this.y;
      if (dx * dx + dy * dy < (e.r + this.r) * (e.r + this.r)) {
        const sp = Math.hypot(this.vx, this.vy) || 1;
        const kb = KS.CONFIG.TURRET.knockback || 8;
        const died = e.hit(this.dmg, (this.vx / sp) * kb, (this.vy / sp) * kb, g);
        g.pushDmg(e.x, e.y - e.r - 6, this.dmg, false);
        if (died) g.onKill(e, this.owner);
        this.dead = true;
        return;
      }
    }
  }
}

/* local angle helpers (the enemy-AI ones live in the AI closure) */
function turretLerpAng(a, b, t) {
  const d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}
function turretAngDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

class Turret {
  constructor(g, owner = null, slot = 0.5, opts = {}) {
    const T = KS.CONFIG.TURRET;
    const a = KS.arenaSize();
    /* duo: each builder deploys beside their own half of the arena */
    const lateral = (slot - 0.5) * a * 0.22;
    const off = T.spawnOffset * (Math.random() * 2 - 1);
    this.g = g;
    this.owner = owner;
    /* v0.11 §4: NORMAL turret — a separate purchasable structure with
       its own tier ladder (NORMAL_TURRET.tiers), fixed price upgrades
       and the SAME existing T1-T4 art. Everything else (targeting =
       nearest eligible enemy, body visually upright) matches the
       existing structure system. */
    this.normal = !!opts.normal;
    this.turretTier = this.normal ? ((owner && owner.turretTier) || 1) : 1;
    this.x = a / 2 + off + lateral;
    this.y = a / 2 + (Math.random() * 2 - 1) * T.spawnOffset * 0.6;
    this.r = 24;
    this.tier = 1;
    this.aimAng = -Math.PI / 2;
    this.target = null;
    this.timer = 0;
    this.recoil = 0;      // firing kick (px backward)
    this.flash = 0;       // muzzle flash alpha
    this.t = 0;           // idle-animation clock
    this.shots = [];
    this.refreshStats();
  }

  /* v0.11 §4: fixed-price tier upgrade (normal turret only).
     Returns false past T4 or on a bad tier. */
  upgradeTier() {
    if (!this.normal) return false;
    const NT = KS.CONFIG.NORMAL_TURRET;
    if (this.turretTier >= NT.tiers.length) return false;
    this.turretTier++;
    if (this.owner) this.owner.turretTier = this.turretTier;
    this.refreshStats();
    return true;
  }
  /* current upgrade cost of the NEXT tier (null at max) */
  nextUpgradePrice() {
    if (!this.normal) return null;
    const NT = KS.CONFIG.NORMAL_TURRET;
    if (this.turretTier >= NT.tiers.length) return null;
    return NT.upgradePrice[this.turretTier];   // price of tier+1
  }

  /* tier + total projectiles from the Structure Range stat
     (thresholds are cumulative — spec §9 table).
     Normal turret: pure tier ladder from NORMAL_TURRET. */
  refreshStats() {
    if (this.normal) {
      const NT = KS.CONFIG.NORMAL_TURRET;
      const tr = NT.tiers[Math.min(this.turretTier, NT.tiers.length) - 1];
      this.tier = this.turretTier;      // art tier = stat tier (T1-T4)
      this.extraShots = 0;
      this.spread = 0;
      this.range = tr.range;
      this.cooldown = tr.cooldown /
        (1 + ((this.owner && this.owner.stats.structureAttackSpeed) || 0) / 100);
      return;
    }
    const T = KS.CONFIG.TURRET;
    const st = this.owner ? this.owner.stats : this.g.stats;
    const sr = st.structureRange || 0;
    let tier = 1;
    for (let i = 0; i < T.tiers.length; i++) {
      if (sr >= T.tiers[i].threshold) tier = i + 1;
    }
    this.tier = tier;
    this.extraShots = T.tiers[tier - 1].extraShots;
    this.spread = T.tiers[tier - 1].spread;
    this.range = T.baseRange + sr;
    this.cooldown = T.baseCooldown /
      (1 + (st.structureAttackSpeed || 0) / 100);
  }

  /* damage: builder's turret scales with the owner's best ranged
     weapon + Engineering; the normal turret's damage comes from its
     own tier ladder scaled by Engineering (§4 stat table) */
  damage() {
    const st = this.owner ? this.owner.stats : this.g.stats;
    const T = KS.CONFIG.TURRET;
    let base;
    if (this.normal) {
      const NT = KS.CONFIG.NORMAL_TURRET;
      base = NT.tiers[Math.min(this.turretTier, NT.tiers.length) - 1].damage;
      const eng = 1 + (st.engineering || 0) * NT.engineeringScale;
      return Math.max(1, base * eng * (1 + (st.damage || 0) / 100));
    }
    /* stats/weapons come from the owning player (duo: per player) */
    const weapons = this.owner ? this.owner.weapons : this.g.weapons;
    base = T.baseDamage;
    let best = null;
    for (const w of weapons) {
      if (w.def.classes && w.def.classes.includes('Ranged')) {
        if (!best || w.tier > best.tier) best = w;
      }
    }
    if (best) base = best.def.tiers[best.tier].damage;
    const eng = 1 + (st.engineering || 0) * T.engineeringScale;
    return Math.max(1, base * eng * (1 + (st.damage || 0) / 100));
  }

  update(dt) {
    const g = this.g;
    const T = KS.CONFIG.TURRET;
    const NT = KS.CONFIG.NORMAL_TURRET;
    this.t += dt;
    this.recoil = Math.max(0, this.recoil - dt * 60);
    this.flash = Math.max(0, this.flash - dt * 5);
    this.refreshStats();
    /* nearest valid enemy in range (targeting: nearest eligible) */
    this.target = null;
    let bestD = Infinity;
    for (const e of g.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d < this.range && d < bestD) { bestD = d; this.target = e; }
    }
    if (this.target) {
      const want = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      this.aimAng = turretLerpAng(this.aimAng, want, Math.min(1, dt * 8));
    }
    /* fire on its own cooldown (aim within a small cone) */
    this.timer -= dt;
    if (this.target && this.timer <= 0 &&
        Math.abs(turretAngDiff(this.aimAng,
          Math.atan2(this.target.y - this.y, this.target.x - this.x))) < 0.35) {
      this.timer = this.cooldown;
      const dmg = this.damage();
      const n = 1 + this.extraShots;
      /* v0.11 §4 performance: normal turret shots share ONE global
         pool cap; the builder's turret keeps its per-turret lists */
      const speed = this.normal ? NT.projSpeed : T.projSpeed;
      for (let i = 0; i < n; i++) {
        const a = this.aimAng + (n > 1
          ? (i - (n - 1) / 2) * this.spread : 0);
        this.shots.push(new TurretShot(
          this.x + Math.cos(a) * this.r * 1.25,
          this.y + Math.sin(a) * this.r * 1.25,
          a, speed, dmg, this.owner));
      }
      this.recoil = 5;         // kick backward
      this.flash = 1;          // muzzle flash
      KS.Audio.punchSfx();
    }
    for (const s of this.shots) s.update(dt, g);
    this.shots = this.shots.filter((s2) => !s2.dead);
    /* hard cap on live normal-turret shots (many turrets, §4) */
    if (this.normal && this.shots.length > NT.poolCap) {
      this.shots.length = NT.poolCap;
    }
  }

  draw(ctx) {
    const T = KS.CONFIG.TURRET;
    const img = KS.Turret.images &&
      KS.Turret.images['T' + this.tier];
    /* subtle idle pulse + recoil offset along the aim axis */
    const pulse = 1 + Math.sin(this.t * 2.4) * 0.02;
    const size = this.r * 2 * pulse;
    const kick = this.recoil;
    const bx = this.x - Math.cos(this.aimAng) * kick;
    const by = this.y - Math.sin(this.aimAng) * kick;
    ctx.save();
    ctx.translate(bx, by);
    /* base plate so the structure reads as anchored */
    ctx.fillStyle = 'rgba(20,26,20,0.55)';
    ctx.beginPath();
    ctx.ellipse(0, this.r * 0.8, this.r * 1.05, this.r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    /* v0.9 §5: the turret BODY stays upright — the intended art
       orientation never rotates toward enemies. A small rotating
       barrel stub under the body indicates the firing direction. */
    ctx.save();
    ctx.rotate(this.aimAng);
    ctx.fillStyle = 'rgba(58,66,58,0.9)';
    ctx.fillRect(this.r * 0.35, -4.5, this.r * 0.85, 9);
    if (this.flash > 0) {
      ctx.globalAlpha = this.flash * 0.85;
      ctx.fillStyle = '#fff3c0';
      ctx.beginPath();
      ctx.arc(this.r * 1.25, 0, 6 + this.flash * 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (img) {
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = '#7b8794';
      ctx.beginPath();
      ctx.arc(0, 0, this.r * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    for (const s of this.shots) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(Math.atan2(s.vy, s.vx));
      ctx.fillStyle = '#ffd977';
      ctx.beginPath();
      ctx.ellipse(0, 0, s.r * 1.6, s.r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

KS.Turret = Turret;
KS.Turret.images = KS.Turret.images || null;   // set by main.js at boot
