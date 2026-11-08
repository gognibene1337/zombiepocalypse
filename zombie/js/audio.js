'use strict';
/*
 * Synthesized audio via Web Audio API (no media files).
 * The AudioContext can only start after a user gesture, so Input calls
 * G.Audio.unlock() on the first key press / touch.
 */
G.Audio = (function () {
    const VOLUME = 0.25;
    const A = { ctx: null, muted: false };
    let master = null;

    A.unlock = function () {
        if (!A.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            A.ctx = new AC({ latencyHint: 'interactive' });
            master = A.ctx.createGain();
            master.gain.value = A.muted ? 0 : VOLUME;
            master.connect(A.ctx.destination);
            A.master = master;
        }
        if (A.ctx.state === 'suspended') A.ctx.resume();
    };

    A.suspend = function () { if (A.ctx && A.ctx.state === 'running') A.ctx.suspend(); };
    A.resume = function () { if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume(); };

    A.toggleMute = function () {
        A.muted = !A.muted;
        if (master) master.gain.value = A.muted ? 0 : VOLUME;
    };

    // One short enveloped oscillator note. delay is seconds from now.
    A.tone = function (freq, dur, type, vol, delay) {
        const c = A.ctx;
        if (!c || A.muted) return;
        const t = c.currentTime + (delay || 0);
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = type || 'square';
        o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(vol == null ? 0.4 : vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g);
        g.connect(master);
        o.start(t);
        o.stop(t + dur + 0.02);
    };

    const SFX = {
        click:  function () { A.tone(880, 0.05, 'square', 0.3); },
        tick:   function () { A.tone(660, 0.03, 'square', 0.2); },
        hurt:   function () { A.tone(160, 0.18, 'sawtooth', 0.5); A.tone(110, 0.2, 'square', 0.3, 0.05); },
        pickup: function () { A.tone(660, 0.07, 'square', 0.3); A.tone(990, 0.1, 'square', 0.3, 0.07); },
        heal:   function () { [523, 659, 784].forEach(function (f, i) { A.tone(f, 0.08, 'triangle', 0.4, i * 0.06); }); },
        win:    function () { [523, 659, 784, 1047].forEach(function (f, i) { A.tone(f, 0.16, 'square', 0.35, i * 0.12); }); },
        lose:   function () { [392, 330, 262, 196].forEach(function (f, i) { A.tone(f, 0.22, 'triangle', 0.45, i * 0.15); }); },
        // One pitch per dance direction
        left:   function () { A.tone(392, 0.09, 'square', 0.35); },
        down:   function () { A.tone(440, 0.09, 'square', 0.35); },
        up:     function () { A.tone(523, 0.09, 'square', 0.35); },
        right:  function () { A.tone(587, 0.09, 'square', 0.35); }
    };

    A.sfx = function (name) {
        const f = SFX[name];
        if (f) f();
    };

    return A;
})();
