/* =========================================================
   Input — keyboard (WASD + Arrows), mouse, gamepad.
   - Esc / P toggles pause during a run.
   - F / E are forwarded to the wave-break screens
     (F = reroll, E = lock) via hotkey handlers.
   - Mouse position drives Manual Aim / Mouse Only settings;
     gamepad left stick drives movement when enabled.
   ========================================================= */
window.KS = window.KS || {};

KS.Input = (() => {
  const down = new Set();
  const MAP = {
    KeyW: 'up',    ArrowUp: 'up',
    KeyS: 'down',  ArrowDown: 'down',
    KeyA: 'left',  ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
  };
  /* v0.9 §1: per-player movement keys for local multiplayer.
     Player 1 = WASD, Player 2 = arrow keys — the sets never overlap. */
  const P1_KEYS = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };
  const P2_KEYS = { ArrowUp: 'up', ArrowDown: 'down',
    ArrowLeft: 'left', ArrowRight: 'right' };
  let onPause = null;
  const hotkeys = {};                 // { KeyF: fn, KeyE: fn }
  const mouse = { x: 0, y: 0, inside: false, down: false };

  window.addEventListener('keydown', (e) => {
    if (KS.DevMode && KS.DevMode.isOpen()) return;  // console owns the keyboard
    const dir = MAP[e.code];
    /* v0.9.1 fix: store the real KeyboardEvent.code (not the mapped
       direction) — per-player axes look codes up; storing directions
       here made axisFor() see an empty set so NOBODY could move */
    if (dir) { down.add(e.code); e.preventDefault(); } // stop page scrolling
    if ((e.code === 'Escape' || e.code === 'KeyP') && onPause) {
      onPause();
      e.preventDefault();
      return;
    }
    if (!e.repeat && hotkeys[e.code]) { hotkeys[e.code](); e.preventDefault(); }
  });

  window.addEventListener('keyup', (e) => {
    const dir = MAP[e.code];
    if (dir) down.delete(e.code);       // v0.9.1 fix: codes, not directions
  });

  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true;
  });
  window.addEventListener('mousedown', (e) => { if (e.button === 0) mouse.down = true; });
  window.addEventListener('mouseup',   (e) => { if (e.button === 0) mouse.down = false; });
  window.addEventListener('mouseleave', () => { mouse.inside = false; mouse.down = false; });

  window.addEventListener('blur', () => { down.clear(); mouse.down = false; });

  /* gamepad left-stick / d-pad movement */
  function gamepadAxis() {
    if (!KS.Settings.get().gamepadMove) return { x: 0, y: 0 };
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      let x = 0, y = 0;
      const [lx, ly] = [pad.axes[0] || 0, pad.axes[1] || 0];
      if (Math.abs(lx) > 0.22) x += lx;
      if (Math.abs(ly) > 0.22) y += ly;
      const b = pad.buttons;
      if (b[12] && b[12].pressed) y -= 1;   // d-pad up
      if (b[13] && b[13].pressed) y += 1;
      if (b[14] && b[14].pressed) x -= 1;
      if (b[15] && b[15].pressed) x += 1;
      if (x !== 0 || y !== 0) {
        const d = Math.hypot(x, y);
        if (d > 1) { x /= d; y /= d; }
        return { x, y };
      }
    }
    return { x: 0, y: 0 };
  }

  return {
    setPauseHandler(fn) { onPause = fn; },
    /* test hook: simulate a real keydown/keyup by CODE (headless
       tests + browser event simulation) */
    testPress(code, isDown) {
      if (isDown) down.add(code); else down.delete(code);
    },
    setHotkey(code, fn) { if (fn) hotkeys[code] = fn; else delete hotkeys[code]; },
    clearHotkeys() { for (const k of Object.keys(hotkeys)) delete hotkeys[k]; },
    mouse,
    gamepadAxis,
    axis() {
      let x = 0, y = 0;
      /* v0.9.1 fix: read real key codes (the set stores e.code now) */
      if (down.has('KeyA') || down.has('ArrowLeft'))  x -= 1;
      if (down.has('KeyD') || down.has('ArrowRight')) x += 1;
      if (down.has('KeyW') || down.has('ArrowUp'))    y -= 1;
      if (down.has('KeyS') || down.has('ArrowDown'))  y += 1;
      if (x === 0 && y === 0) {
        const g = gamepadAxis();
        x = g.x; y = g.y;
      }
      /* Mouse Only: keyboard disabled, walk toward the cursor */
      if (KS.Settings.get().mouseOnly) return { x: 0, y: 0, mouseOnly: true };
      if (x !== 0 && y !== 0) { const k = Math.SQRT1_2; x *= k; y *= k; }
      return { x, y };
    },

    /* v0.9 §1: independent per-player axes (local multiplayer).
       Player 0 drives with WASD (+ first gamepad), player 1 with the
       arrow keys (+ second gamepad). No shared keys, no interference.
       The key set stores real e.code values (v0.9.1 fix). */
    axisFor(idx) {
      const keys = idx === 1 ? P2_KEYS : P1_KEYS;
      let x = 0, y = 0;
      for (const [code, dir] of Object.entries(keys)) {
        if (!down.has(code)) continue;
        if (dir === 'left') x -= 1;
        else if (dir === 'right') x += 1;
        else if (dir === 'up') y -= 1;
        else y += 1;
      }
      if (x === 0 && y === 0) {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        const pad = pads[idx];
        if (pad && KS.Settings.get().gamepadMove) {
          const lx = pad.axes[0] || 0, ly = pad.axes[1] || 0;
          if (Math.abs(lx) > 0.22) x += lx;
          if (Math.abs(ly) > 0.22) y += ly;
          const b = pad.buttons;
          if (b[12] && b[12].pressed) y -= 1;
          if (b[13] && b[13].pressed) y += 1;
          if (b[14] && b[14].pressed) x -= 1;
          if (b[15] && b[15].pressed) x += 1;
        }
      }
      if (x !== 0 && y !== 0) { const k = Math.SQRT1_2; x *= k; y *= k; }
      return { x, y };
    },
  };
})();
