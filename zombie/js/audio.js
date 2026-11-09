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
        decodePending();
    };

    // ---- Recorded music tracks (WAV), by name ----
    // States: idle -> loading -> fetched -> decoding -> ready | failed | unavailable
    // Fetch starts at boot; decoding waits for the AudioContext (first user gesture).
    const tracks = {};   // name -> { state, raw, buffer }

    A.loadTrack = function (name, url) {
        const tr = tracks[name] = { state: 'loading', raw: null, buffer: null };
        if (location.protocol === 'file:') {     // Chrome blocks fetch() from file:// pages
            tr.state = 'unavailable';
            return;
        }
        fetch(url)
            .then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
            .then(function (ab) { tr.raw = ab; tr.state = 'fetched'; decodePending(); })
            .catch(function () { tr.state = 'failed'; });
    };

    A.trackState = function (name) { return tracks[name] ? tracks[name].state : 'idle'; };

    function decodePending() {
        if (!A.ctx) return;
        Object.keys(tracks).forEach(function (name) {
            const tr = tracks[name];
            if (tr.state !== 'fetched') return;
            const ab = tr.raw;
            tr.raw = null;                        // let the compressed copy be GC'd
            tr.state = 'decoding';
            A.ctx.decodeAudioData(ab)
                .then(function (buf) { tr.buffer = buf; tr.state = 'ready'; })
                .catch(function () { tr.state = 'failed'; });
        });
    }

    // Play a track once from absolute context time `at`. rate > 1 = faster (and higher pitch).
    A.playTrack = function (name, at, rate, vol) {
        const tr = tracks[name];
        if (!A.ctx || !tr || !tr.buffer) return null;
        const s = A.ctx.createBufferSource(), g = A.ctx.createGain();
        s.buffer = tr.buffer;
        s.playbackRate.value = rate || 1;
        g.gain.value = vol == null ? 1.6 : vol;  // master is 0.25; the track is pre-mixed
        s.connect(g);
        g.connect(master);
        s.start(at);
        return s;
    };

    A.stopTrack = function (s) {
        if (!s) return;
        try { s.stop(); } catch (_) { /* already stopped */ }
        try { s.disconnect(); } catch (_) { /* ignore */ }
    };

    /*
     * Background music loop. Copies of the track are chained with an overlap:
     * each next copy starts `overlap` seconds before the previous one ends,
     * so the track's own fade-out becomes a crossfade. Scheduling uses the
     * audio clock, so pausing (ctx.suspend) pauses the loop too.
     * Call A.updateLoop() regularly (every frame is fine; it's cheap).
     */
    let loop = null;

    A.startLoop = function (name, vol, overlap) {
        const tr = tracks[name];
        if (!A.ctx || !tr || !tr.buffer) return false;
        A.stopLoop(0);
        const c = A.ctx, g = c.createGain(), now = c.currentTime;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(vol, now + 0.8);      // gentle fade-in
        g.connect(master);
        loop = { name: name, buffer: tr.buffer, gain: g, next: now + 0.05, overlap: overlap || 0, srcs: [], copies: 0 };
        A.updateLoop();
        return true;
    };

    A.updateLoop = function () {
        if (!loop) return;
        const c = A.ctx, L = loop;
        while (L.next < c.currentTime + 0.5) {                // schedule ~0.5s ahead
            const s = c.createBufferSource();
            s.buffer = L.buffer;
            s.connect(L.gain);
            s.start(L.next);
            s.onended = function () {
                const i = L.srcs.indexOf(s);
                if (i >= 0) L.srcs.splice(i, 1);
                try { s.disconnect(); } catch (_) { /* ignore */ }
            };
            L.srcs.push(s);
            L.copies++;
            L.next += L.buffer.duration - L.overlap;
        }
    };

    A.stopLoop = function (fade) {
        if (!loop) return;
        const c = A.ctx, L = loop, t = c.currentTime, f = fade || 0;
        loop = null;
        L.gain.gain.cancelScheduledValues(t);
        L.gain.gain.setValueAtTime(L.gain.gain.value, t);
        L.gain.gain.linearRampToValueAtTime(0, t + f + 0.01);
        L.srcs.forEach(function (s) { try { s.stop(t + f + 0.05); } catch (_) { /* ignore */ } });
        setTimeout(function () { try { L.gain.disconnect(); } catch (_) { /* ignore */ } }, (f + 0.2) * 1000);
    };

    // For tests / debugging
    A.loopInfo = function () {
        return loop ? { name: loop.name, copies: loop.copies, playing: loop.srcs.length, next: loop.next } : null;
    };

    A.suspend = function () { if (A.ctx && A.ctx.state === 'running') A.ctx.suspend(); };
    A.resume = function () { if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume(); };

    A.toggleMute = function () {
        A.muted = !A.muted;
        if (master) master.gain.value = A.muted ? 0 : VOLUME;
    };

    // One short enveloped oscillator note. delay is seconds from now.
    A.tone = function (freq, dur, type, vol, delay) {
        if (!A.ctx) return;
        A.toneAt(freq, dur, type, vol, A.ctx.currentTime + (delay || 0));
    };

    // ---- Music primitives, scheduled at absolute AudioContext time t ----
    let noiseBuf = null;

    A.kick = function (t, vol) {
        const c = A.ctx;
        if (!c || A.muted) return;
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
        g.gain.setValueAtTime(vol == null ? 0.9 : vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + 0.18);
    };

    A.hat = function (t, vol) {
        const c = A.ctx;
        if (!c || A.muted) return;
        if (!noiseBuf) {                       // 50ms of white noise, built once
            noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.05), c.sampleRate);
            const d = noiseBuf.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
        s.buffer = noiseBuf;
        f.type = 'highpass';
        f.frequency.value = 7000;
        g.gain.setValueAtTime(vol == null ? 0.25 : vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
        s.connect(f); f.connect(g); g.connect(master);
        s.start(t); s.stop(t + 0.05);
    };

    A.toneAt = function (freq, dur, type, vol, t) {
        const c = A.ctx;
        if (!c || A.muted) return;
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = type || 'square';
        o.frequency.setValueAtTime(freq, t);   // t: absolute context time
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
        growl:  function () { A.tone(90, 0.35, 'sawtooth', 0.35); A.tone(70, 0.3, 'sawtooth', 0.25, 0.12); },
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
