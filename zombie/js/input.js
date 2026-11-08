'use strict';
/*
 * Unified input: keyboard + pointer (touch and mouse via Pointer Events).
 *
 * Discrete events, valid for ONE update step (read G.Input.events):
 *   { type: 'dir',  dir, src: 'key'|'swipe', t }   arrow/WASD press or swipe
 *   { type: 'tap',  x, y, t }                       short press without swiping
 *   { type: 'confirm' }                             Enter / Space
 *   { type: 'back' }                                Esc / P
 *   { type: 'key',  code }                          any other key (e.g. 'KeyH')
 * Continuous state:
 *   held.up/down/left/right   keyboard directions currently held
 *   pointer.down, pointer.x, pointer.y   (logical coords)
 *
 * Swipes fire DURING the drag as soon as the finger travels SWIPE_MIN,
 * not on release. That cuts latency, which matters for the rhythm phase.
 */
G.Input = (function () {
    const SWIPE_MIN = 22;   // logical units of travel to count as a swipe
    const TAP_MAX = 12;     // max travel for a tap
    const TAP_MS = 600;     // max press duration for a tap

    const KEYS = {
        ArrowUp: 'up', KeyW: 'up',
        ArrowDown: 'down', KeyS: 'down',
        ArrowLeft: 'left', KeyA: 'left',
        ArrowRight: 'right', KeyD: 'right'
    };

    const I = {
        events: [],
        held: { up: false, down: false, left: false, right: false },
        pointer: { down: false, x: 0, y: 0 }
    };

    let rect = null;      // cached canvas bounding rect
    let gesture = null;   // active single-finger gesture

    function push(e) {
        if (I.events.length < 32) I.events.push(e);
    }

    function toLogical(e) {
        if (!rect) rect = G.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * G.W / rect.width,
            y: (e.clientY - rect.top) * G.H / rect.height
        };
    }

    function releaseAll() {
        I.held.up = I.held.down = I.held.left = I.held.right = false;
        I.pointer.down = false;
        gesture = null;
    }

    I.onResize = function () { rect = null; };

    // Called by the engine after every update step
    I.endStep = function () { I.events.length = 0; };

    // ---- Keyboard ----
    window.addEventListener('keydown', function (e) {
        G.Audio.unlock();
        const dir = KEYS[e.code];
        if (dir) {
            e.preventDefault();
            if (e.repeat) return;
            I.held[dir] = true;
            push({ type: 'dir', dir: dir, src: 'key', t: performance.now() });
            return;
        }
        if (e.repeat) return;
        switch (e.code) {
            case 'Enter':
            case 'Space':
                e.preventDefault();
                push({ type: 'confirm' });
                break;
            case 'Escape':
            case 'KeyP':
                push({ type: 'back' });
                break;
            case 'KeyF':
            case 'Backquote':
                G.debug = !G.debug;
                break;
            case 'KeyM':
                G.Audio.toggleMute();
                break;
            default:
                push({ type: 'key', code: e.code });
        }
    });

    window.addEventListener('keyup', function (e) {
        const dir = KEYS[e.code];
        if (dir) I.held[dir] = false;
    });

    window.addEventListener('blur', releaseAll);

    // ---- Pointer (touch + mouse) ----
    const c = G.canvas;

    c.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        G.Audio.unlock();
        if (gesture) return; // ignore extra fingers
        try { c.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        const p = toLogical(e);
        gesture = {
            id: e.pointerId,
            sx: p.x, sy: p.y,     // start point (tap detection)
            ax: p.x, ay: p.y,     // anchor point (swipe detection, re-anchored)
            t: performance.now(),
            lastDir: null
        };
        I.pointer.down = true;
        I.pointer.x = p.x;
        I.pointer.y = p.y;
    });

    c.addEventListener('pointermove', function (e) {
        if (!gesture || e.pointerId !== gesture.id) return;
        const p = toLogical(e);
        I.pointer.x = p.x;
        I.pointer.y = p.y;

        const dx = p.x - gesture.ax;
        const dy = p.y - gesture.ay;
        if (dx * dx + dy * dy >= SWIPE_MIN * SWIPE_MIN) {
            const dir = Math.abs(dx) > Math.abs(dy)
                ? (dx > 0 ? 'right' : 'left')
                : (dy > 0 ? 'down' : 'up');
            // A continuing drag in the same direction doesn't re-fire;
            // changing direction mid-drag does (lets you steer without lifting).
            if (dir !== gesture.lastDir) {
                push({ type: 'dir', dir: dir, src: 'swipe', t: performance.now() });
                gesture.lastDir = dir;
            }
            gesture.ax = p.x;
            gesture.ay = p.y;
        }
    });

    function endGesture(e, cancelled) {
        if (!gesture || e.pointerId !== gesture.id) return;
        const p = toLogical(e);
        const dx = p.x - gesture.sx;
        const dy = p.y - gesture.sy;
        if (!cancelled && !gesture.lastDir &&
            dx * dx + dy * dy <= TAP_MAX * TAP_MAX &&
            performance.now() - gesture.t <= TAP_MS) {
            push({ type: 'tap', x: p.x, y: p.y, t: performance.now() });
        }
        gesture = null;
        I.pointer.down = false;
    }

    c.addEventListener('pointerup', function (e) { endGesture(e, false); });
    c.addEventListener('pointercancel', function (e) { endGesture(e, true); });

    // Block long-press menus and any leftover browser touch scrolling
    window.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });

    return I;
})();
