'use strict';
/*
 * Core engine: canvas scaling, fixed-timestep game loop, shared helpers.
 * Everything hangs off the global G namespace.
 *
 * Coordinate system: the game always works in LOGICAL units.
 *   - Width is fixed at 360.
 *   - Height follows the screen's aspect ratio (clamped 560..800),
 *     so a 360x800 phone gets a 360x800 logical canvas.
 * The backing store is scaled by devicePixelRatio (capped) for crisp output.
 */
window.G = {
    W: 360,            // logical width (fixed)
    H: 640,            // logical height (set in resize)
    MAX_DPR: 2,        // cap backing resolution: protects fill-rate on entry-level GPUs
    STEP: 1 / 60,      // fixed update step in seconds
    debug: true,       // FPS / debug overlay (toggle with F or `)
    fps: 0,
    workMs: 0,         // average ms spent in update+render per frame
    time: 0,           // game time in seconds (stops while tab is hidden)

    // Shared palette
    C: {
        bg: '#0b0f0a',
        ground: '#5b4d36',     // gravel path: high contrast vs hedges on dim screens
        hedge: '#1f4d2a',
        hedgeLight: '#2e6b3b',
        text: '#e8e6d9',
        dim: '#9a9a8a',
        accent: '#f2c14e',
        danger: '#d64545',
        good: '#4caf50',
        zombie: '#7fa36b',
        skin: '#d9a77c',
        hair: '#2a2018',
        black: '#141414'
    }
};

G.canvas = document.getElementById('game');
G.ctx = G.canvas.getContext('2d', { alpha: false });

G.resize = function () {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Logical height follows the viewport aspect, clamped to a sane portrait range
    G.H = Math.max(560, Math.min(800, Math.round(G.W * vh / vw)));

    const scale = Math.min(vw / G.W, vh / G.H);       // CSS px per logical unit
    const dpr = Math.min(window.devicePixelRatio || 1, G.MAX_DPR);
    const c = G.canvas;
    const cssW = Math.floor(G.W * scale);
    const cssH = Math.floor(G.H * scale);

    c.style.width = cssW + 'px';
    c.style.height = cssH + 'px';
    c.width = Math.floor(cssW * dpr);                   // resets context state
    c.height = Math.floor(cssH * dpr);

    G.sx = c.width / G.W;                               // backing px per logical unit
    G.sy = c.height / G.H;
    G.ctx.setTransform(G.sx, 0, 0, G.sy, 0, 0);

    if (G.Input) G.Input.onResize();
    if (G.States && G.States.current && G.States.current.layout) G.States.current.layout();
};

// Small seeded RNG (mulberry32) for deterministic procedural layouts
G.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

// Haptic buzz where supported (Android Chrome). Silently ignored elsewhere.
G.vibrate = function (ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) { /* ignore */ }
};

// Persistent player settings (localStorage can be blocked: always try/catch)
G.Settings = (function () {
    const KEY = 'spe.settings.v1';
    const s = { dpad: false };
    try { Object.assign(s, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) { /* ignore */ }
    s.save = function () {
        try { localStorage.setItem(KEY, JSON.stringify({ dpad: s.dpad })); } catch (_) { /* ignore */ }
    };
    return s;
})();

// Optional URL overrides for testing, e.g. index.html?seed=42
G.params = new URLSearchParams(location.search);

/*
 * Game loop: fixed-timestep updates (stable physics/timing on slow devices),
 * one render per animation frame. G.update / G.render are set in main.js.
 */
(function () {
    let last = 0, acc = 0, rafId = 0, running = false;
    let fpsFrames = 0, fpsTimer = 0, workSum = 0;
    const MAX_STEPS = 5;              // avoid a "spiral of death" on very slow frames
    const EPS = 0.002;                // tolerate rAF jitter around 1/60s

    function frame(now) {
        rafId = requestAnimationFrame(frame);
        if (!last) { last = now; return; }

        let dt = (now - last) / 1000;
        last = now;
        if (dt > 0.25) dt = 0.25;

        const t0 = performance.now();
        acc += dt;
        let steps = 0;
        while (acc >= G.STEP - EPS && steps < MAX_STEPS) {
            G.update(G.STEP);
            G.time += G.STEP;
            acc -= G.STEP;
            steps++;
        }
        if (steps === MAX_STEPS) acc = 0;
        G.render();
        workSum += performance.now() - t0;

        fpsFrames++;
        fpsTimer += dt;
        if (fpsTimer >= 0.5) {
            G.fps = Math.round(fpsFrames / fpsTimer);
            G.workMs = workSum / fpsFrames;
            fpsFrames = 0; fpsTimer = 0; workSum = 0;
        }
    }

    G.start = function () {
        if (running) return;
        running = true;
        last = 0; acc = 0;
        rafId = requestAnimationFrame(frame);
    };

    G.stop = function () {
        running = false;
        cancelAnimationFrame(rafId);
    };
})();

// Pause everything when the tab/app goes to the background (saves battery)
document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
        G.stop();
        G.Audio.suspend();
        if (G.States.current && G.States.current.pause) G.States.current.pause();
    } else {
        G.Audio.resume();
        G.start();
    }
});
