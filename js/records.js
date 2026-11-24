/* =========================================================
   Records — per-character persistent stats (localStorage).
   Tracks times played, wins, deaths and which difficulties
   were beaten; powers the Record box + difficulty unlocks.
   ========================================================= */
window.KS = window.KS || {};

KS.Records = (() => {
  const KEY = 'kensinger-survival-records-v1';

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  }
  function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* private mode */ }
  }

  function fresh() {
    return { played: 0, wins: 0, deaths: 0, beaten: [], endlessBestWave: 0 };
  }

  /* mutate one character's record safely, then persist */
  function mutate(charId, fn) {
    const all = load();
    if (!all[charId]) all[charId] = fresh();
    fn(all[charId]);
    save(all);
    return all[charId];
  }

  function get(charId) {
    const all = load();
    if (!all[charId]) { all[charId] = fresh(); save(all); }
    return all[charId];
  }

  return {
    get,

    /* v0.11 §9 (Data tab): full-store export/import. The import is a
       defensive merge: only well-formed per-character records replace
       existing ones; unknown keys are dropped, never executed. */
    exportAll() { return load(); },
    importAll(raw) {
      if (!raw || typeof raw !== 'object') return false;
      const all = load();
      for (const charId of Object.keys(raw)) {
        const r = raw[charId];
        if (!r || typeof r !== 'object') continue;
        const cur = all[charId] || fresh();
        all[charId] = {
          played: Math.max(0, Math.floor(Number(r.played) || 0)),
          wins: Math.max(0, Math.floor(Number(r.wins) || 0)),
          deaths: Math.max(0, Math.floor(Number(r.deaths) || 0)),
          endlessBestWave: Math.max(0, Math.floor(Number(r.endlessBestWave) || 0)),
          beaten: Array.isArray(r.beaten)
            ? r.beaten.map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n <= 6)
            : cur.beaten,
        };
      }
      save(all);
      return true;
    },

    /* call when a run begins */
    addPlayed(charId) {
      return mutate(charId, (r) => { r.played++; });
    },

    /* death in a run */
    addDeath(charId, waveReached, endless) {
      return mutate(charId, (r) => {
        r.deaths++;
        if (endless && waveReached > (r.endlessBestWave || 0)) r.endlessBestWave = waveReached;
      });
    },

    /* beat the final wave of a (non-endless) run */
    addWin(charId, difficulty) {
      return mutate(charId, (r) => {
        r.wins++;
        if (!r.beaten.includes(difficulty)) r.beaten.push(difficulty);
        r.beaten.sort((a, b) => a - b);
      });
    },

    /* difficulty N is playable if N==0 or N-1 has been beaten */
    isDifficultyUnlocked(charId, d) {
      if (d <= 0) return true;
      return get(charId).beaten.includes(d - 1);
    },
  };
})();
