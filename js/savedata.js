/* =========================================================
   SaveData — export / import of ALL persistent game data.
   v0.11 §9 (Settings -> Data tab):
   - export: everything persistent (settings, records, unlocks +
     unlock progress, difficulty state) as one JSON download
     (kensinger-survival-save.json) with a format version field.
   - import (file or pasted text): VALIDATED first, applied only
     after explicit confirmation, and a rejected import leaves the
     current save untouched.
   The module is DOM-free and headless-testable; the Settings UI
   (main.js) drives it and renders the confirm dialog + status line.
   ========================================================= */
window.KS = window.KS || {};

KS.SaveData = (() => {
  const FILE_NAME = 'kensinger-survival-save.json';
  /* save-data version field so future updates can identify older
     formats (§9 data-safety requirement) */
  const FORMAT_VERSION = 1;

  /* ---- collect every persistent store ---- */
  function collect() {
    const out = {
      _format: 'kensinger-survival-save',
      _version: FORMAT_VERSION,
      _exportedAt: new Date().toISOString(),
    };
    /* settings: localStorage-backed options (Settings.get() is live) */
    if (KS.Settings) {
      out.settings = JSON.parse(JSON.stringify(KS.Settings.get()));
    }
    /* records: per-character stats + difficulty progress (raw store) */
    if (KS.Records) out.records = KS.Records.exportAll
      ? KS.Records.exportAll() : KS.Records.loadAll();
    /* unlocks: locked/unlocked characters + requirement progress */
    if (KS.Unlocks) out.unlocks = KS.Unlocks.exportData();
    return out;
  }

  /* ---- validation (pure: never touches any store) ----
     Returns { ok: true, data } or { ok: false, error }. Missing or
     optional fields are tolerated; anything malformed is rejected. */
  function validate(raw) {
    if (raw == null) return { ok: false, error: 'empty' };
    let obj;
    try {
      obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
      return { ok: false, error: 'not-json' };
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return { ok: false, error: 'not-object' };
    }
    /* the version/format fields decide compatibility */
    if (obj._format !== 'kensinger-survival-save') {
      return { ok: false, error: 'wrong-format' };
    }
    const v = Number(obj._version);
    if (!Number.isFinite(v) || v < 1 || v > FORMAT_VERSION) {
      return { ok: false, error: 'bad-version' };
    }
    /* optional sections: each must be an OBJECT when present */
    if (obj.settings != null &&
        (typeof obj.settings !== 'object' || Array.isArray(obj.settings))) {
      return { ok: false, error: 'bad-settings' };
    }
    if (obj.records != null &&
        (typeof obj.records !== 'object' || Array.isArray(obj.records))) {
      return { ok: false, error: 'bad-records' };
    }
    if (obj.unlocks != null &&
        (typeof obj.unlocks !== 'object' || Array.isArray(obj.unlocks))) {
      return { ok: false, error: 'bad-unlocks' };
    }
    return { ok: true, data: obj };
  }

  /* ---- apply (only ever called AFTER user confirmation) ----
     Conservative merge per store; never throws on odd input and
     never executes imported text as code (JSON only). */
  function apply(obj) {
    const res = validate(obj);
    if (!res.ok) return res;
    const data = res.data;
    if (data.settings && KS.Settings) {
      KS.Settings.importObject ? KS.Settings.importObject(data.settings)
        : KS.Settings.importAll(data.settings);
    }
    if (data.records && KS.Records) {
      KS.Records.importAll(data.records);
    }
    if (data.unlocks && KS.Unlocks) {
      KS.Unlocks.importData(data.unlocks);
    }
    return { ok: true };
  }

  /* ---- browser download of the current save ---- */
  function download() {
    const payload = JSON.stringify(collect(), null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = FILE_NAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return payload;                       // also returned for tests
  }

  /* ---- file import (browser) ----
     Reads the file as TEXT, validates, and asks before applying;
     the callback receives the validation result so the UI can show
     the confirmation step. Nothing is written until confirmImport. */
  function readImportFile(file, onValidated) {
    if (!file) return onValidated({ ok: false, error: 'no-file' });
    const reader = new FileReader();
    reader.onerror = () => onValidated({ ok: false, error: 'read-failed' });
    reader.onload = () => {
      const res = validate(String(reader.result || ''));
      onValidated(res.ok ? { ok: true, data: res.data, raw: String(reader.result) } : res);
    };
    reader.readAsText(file);
  }

  return {
    FILE_NAME, FORMAT_VERSION, collect, validate, apply,
    download, readImportFile,
  };
})();
