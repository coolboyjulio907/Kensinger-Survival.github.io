/* =========================================================
   Unlocks — persistent character unlock state (localStorage).
   v0.11 §5-§7: Barry Adkins (+50% Movement Speed in any run) and
   King Kensinger (three Tier IV weapons owned simultaneously) are
   locked by default; progress is tracked across runs and credited
   to the player who achieves it (works in co-op too).
   The module is DOM-free and headless-testable.
   ========================================================= */
window.KS = window.KS || {};

KS.Unlocks = (() => {
  const KEY = 'kensinger-survival-unlocks-v1';
  /* save-format version field so future updates can identify older
     formats (mirrors the Data tab export contract, §9) */
  const FORMAT_VERSION = 1;

  const DEFAULTS = {
    _v: FORMAT_VERSION,
    unlocked: {},            // charId -> true
    /* best progress toward each requirement, for the select screen */
    progress: {
      speed50: 0,            // highest total % Movement Speed reached in a run
      tier4Weapons: 0,       // most Tier IV weapons owned at once
    },
  };

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (!raw || typeof raw !== 'object') return fresh();
      const out = fresh();
      /* merge defensively: missing/optional fields are safe */
      if (raw.unlocked && typeof raw.unlocked === 'object') {
        for (const k of Object.keys(raw.unlocked)) {
          if (raw.unlocked[k] === true) out.unlocked[k] = true;
        }
      }
      if (raw.progress && typeof raw.progress === 'object') {
        out.progress.speed50 = Math.max(0, Number(raw.progress.speed50) || 0);
        out.progress.tier4Weapons = Math.max(0,
          Math.floor(Number(raw.progress.tier4Weapons) || 0));
      }
      return out;
    } catch (e) { return fresh(); }
  }
  function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* private mode */ }
  }
  function fresh() { return JSON.parse(JSON.stringify(DEFAULTS)); }

  let data = load();

  /* characters that start locked (§5-§6). Everyone else is unlocked. */
  const LOCKED_DEFAULT = { barry: true, king: true };

  function isUnlocked(charId) {
    if (LOCKED_DEFAULT[charId] && !data.unlocked[charId]) return false;
    return true;
  }
  function unlock(charId) {
    if (!LOCKED_DEFAULT[charId]) return false;   // not a lockable character
    if (data.unlocked[charId]) return false;
    data.unlocked[charId] = true;
    save(data);
    return true;
  }
  function lock(charId) {
    if (!LOCKED_DEFAULT[charId]) return false;
    if (!data.unlocked[charId]) return false;
    delete data.unlocked[charId];
    /* keep best-progress numbers so the requirement still shows */
    save(data);
    return true;
  }

  /* ---- run-time progress reporting ----
     Each player's HUD state calls these during a run; a satisfying
     result unlocks IMMEDIATELY (§5/§6). Returns the charId unlocked
     by this call, or null. */
  function reportSpeed(pct) {
    const v = Math.max(0, Math.round(Number(pct) || 0));
    if (v > data.progress.speed50) {
      data.progress.speed50 = v;
      save(data);
    }
    if (v >= 50 && !data.unlocked.barry) {
      unlock('barry');
      return 'barry';
    }
    return null;
  }
  function reportTier4Weapons(count) {
    const v = Math.max(0, Math.floor(Number(count) || 0));
    if (v > data.progress.tier4Weapons) {
      data.progress.tier4Weapons = v;
      save(data);
    }
    if (v >= 3 && !data.unlocked.king) {
      unlock('king');
      return 'king';
    }
    return null;
  }

  /* requirement text + progress for the character-select screen */
  function requirementInfo(charId) {
    if (charId === 'barry') {
      return {
        key: 'unlockSpeed',
        cur: Math.min(50, data.progress.speed50),
        need: 50,
      };
    }
    if (charId === 'king') {
      return {
        key: 'unlockTier4',
        cur: Math.min(3, data.progress.tier4Weapons),
        need: 3,
      };
    }
    return null;
  }

  /* unlock state snapshot for exports (§9 Data tab) */
  function exportData() {
    return JSON.parse(JSON.stringify(data));
  }
  /* import from an export (§9): validated, merged conservatively */
  function importData(raw) {
    if (!raw || typeof raw !== 'object') return false;
    const cur = fresh();
    if (raw.unlocked && typeof raw.unlocked === 'object') {
      for (const k of Object.keys(raw.unlocked)) {
        if (raw.unlocked[k] === true && LOCKED_DEFAULT[k]) cur.unlocked[k] = true;
      }
    }
    if (raw.progress && typeof raw.progress === 'object') {
      cur.progress.speed50 = Math.max(cur.progress.speed50,
        Math.max(0, Number(raw.progress.speed50) || 0));
      cur.progress.tier4Weapons = Math.max(cur.progress.tier4Weapons,
        Math.max(0, Math.floor(Number(raw.progress.tier4Weapons) || 0)));
    }
    data = cur;
    save(data);
    return true;
  }

  /* test hook: wipe the in-memory + persisted state */
  function resetForTest() {
    data = fresh();
    try { localStorage.removeItem(KEY); } catch (e) {}
  }
  function setDataForTest(raw) {
    data = loadFrom(raw);
    function loadFrom(r) {
      const out = fresh();
      if (r && r.unlocked) for (const k of Object.keys(r.unlocked)) {
        if (r.unlocked[k] === true) out.unlocked[k] = true;
      }
      if (r && r.progress) {
        out.progress.speed50 = Math.max(0, Number(r.progress.speed50) || 0);
        out.progress.tier4Weapons = Math.max(0, Math.floor(Number(r.progress.tier4Weapons) || 0));
      }
      return out;
    }
  }

  return {
    FORMAT_VERSION, isUnlocked, unlock, lock, reportSpeed,
    reportTier4Weapons, requirementInfo, exportData, importData,
    resetForTest, setDataForTest,
    get data() { return data; },
    LOCKED_DEFAULT,
  };
})();
