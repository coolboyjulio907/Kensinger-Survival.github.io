/* =========================================================
   Settings — persisted player options (localStorage) with
   defaults per spec. Apply side-effects (volumes, font
   scale, fullscreen, FPS cap) through KS.Settings.apply().
   ========================================================= */
window.KS = window.KS || {};

KS.Settings = (() => {
  const KEY = 'kensinger-survival-settings-v1';

  const DEFAULTS = {
    /* ---- sound ---- */
    master: 50,            // % (0-100)
    sound: 75,             // % (0-100)
    music: 25,             // % (0-100)
    muteOnFocusLoss: false,
    /* ---- video ---- */
    language: 'en',        // 'en' | 'es' | 'he'
    devMode: false,        // hidden developer console (accessibility toggle)
    screenshake: true,
    fullscreen: true,      // applied on first gesture (browsers require one)
    visualEffects: true,
    damageDisplay: true,
    optimizeEndOfWaves: false,
    limitFps: false,       // 30 FPS cap when on
    /* ---- gameplay ---- */
    mouseOnly: false,
    manualAim: false,
    manualAimPress: true,
    gamepadMove: true,
    hpBarChar: true,
    hpBarBosses: true,     // used once bosses exist
    /* ---- accessibility ---- */
    explosionOpacity: 100,
    projectileOpacity: 100,
    petOpacity: 100,
    fontSize: 100,         // 80-125
    hlCharacter: false,
    hlWeapons: false,
    hlProjectiles: false,
    hlTurrets: false,
    hlPets: false,
    showEffectIcons: true,
    changeMaterialSounds: false,
    screenDarkening: true,
    retryFailedWaves: false,
  };

  let data = load();

  function load() {
    try {
      return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY)) || {});
    } catch (e) { return Object.assign({}, DEFAULTS); }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* private mode */ }
  }

  function set(key, value) {
    data[key] = value;
    save();
    apply(key);
  }

  /* side effects for a single key (or 'all') */
  function apply(key) {
    const S = data;
    if (key === 'all' || key === 'master' || key === 'sound' || key === 'music') {
      if (KS.Audio) KS.Audio.applyVolumes();
    }
    if (key === 'all' || key === 'fontSize') {
      document.documentElement.style.setProperty('--fscale', (S.fontSize / 100));
    }
    if (key === 'all' || key === 'language') {
      KS.applyI18n();
      /* v0.9 §11: language NEVER changes the devMode state — the
         toggle's VISIBILITY (Hebrew-only) is handled in i18n/CSS.
         An explicit ON/OFF choice persists across language switches. */
      /* Hebrew uses a right-to-left interface; gameplay is untouched */
      const lang = S.language || 'en';
      document.documentElement.dir = (lang === 'he') ? 'rtl' : 'ltr';
      document.documentElement.classList.toggle('rtl', lang === 'he');
      /* Dev Mode toggle is only VISIBLE in Hebrew; its state is separate */
      if (KS.DevMode && KS.DevMode.syncVisibility) KS.DevMode.syncVisibility();
    }
    if (key === 'fullscreen') {
      if (S.fullscreen && document.fullscreenElement == null) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else if (!S.fullscreen && document.fullscreenElement != null) {
        document.exitFullscreen?.().catch(() => {});
      }
    }
  }

  /* first user gesture — browsers only allow fullscreen after one */
  window.addEventListener('pointerdown', function onFirst() {
    if (data.fullscreen && document.fullscreenElement == null) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
    window.removeEventListener('pointerdown', onFirst);
  }, { once: false });

  /* v0.11 §9 (Data tab): import a settings object from an exported
     save. Defensive: only KNOWN setting keys are copied (unknown or
     odd keys never touch the store), values are coerced to their
     DEFAULTS' type so a bad import cannot break the game. */
  function importObject(raw) {
    if (!raw || typeof raw !== 'object') return false;
    for (const key of Object.keys(DEFAULTS)) {
      if (!(key in raw)) continue;
      const ref = DEFAULTS[key];
      let v = raw[key];
      if (typeof ref === 'number') {
        v = Number(v);
        if (!Number.isFinite(v)) continue;
      } else if (typeof ref === 'boolean') {
        v = !!v;
      } else {
        if (typeof v !== 'string') continue;
      }
      data[key] = v;
    }
    save();
    apply('all');
    return true;
  }

  return {
    get: () => data,
    set,
    apply,
    importObject,
    DEFAULTS,
  };
})();
