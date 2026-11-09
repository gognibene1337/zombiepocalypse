'use strict';
/*
 * Phase 2: The Zombie Gate Dance-Off (rhythm QTE). Swipe LEFT / RIGHT on the beat.
 *
 * Music: the recorded track (G.TRACKS.dance, zombie/audio/dance.wav) when it loaded;
 * otherwise a synthesized fallback beat (e.g. page opened from file://).
 *
 * Timing is driven by the AUDIO clock (AudioContext.currentTime), not frames,
 * so a slow phone dropping frames never drifts off the beat.
 *   songTime = ctx.currentTime - start - outputLatency
 * Input events carry performance.now() stamps, converted to song time, so
 * judging is as precise as the touch event, not the frame it lands in.
 *
 * Adaptive tempo (stretch goal): lower health = faster dance, up to +15%.
 * With the recorded track that's playbackRate (pitch rises slightly too).
 * Med-kits carried from the maze each forgive one Miss (counted as Great).
 */
G.States.register('rhythm', {
    pausable: true,
    DIRS: ['left', 'right'],                 // lanes, in screen order
    COLORS: { left: '#d64ba0', right: '#e0a040' },
    PERFECT: 0.07,         // ± seconds
    GREAT: 0.14,           // ± seconds; later than this = Miss
    SPEED: 300,            // arrow scroll speed (units / s)
    PASS: 0.6,             // accuracy needed to pass
    MAX_SPEEDUP: 0.15,     // tempo increase at (almost) zero health
    LOAD_TIMEOUT: 4,       // seconds to wait for the track before using the synth beat
    // Synth fallback: 4-beat count-in, then 4 sections of 8 beats, each faster
    SECTIONS: [
        { bpm: 100, every: 2 },
        { bpm: 110, every: 1 },
        { bpm: 120, every: 1 },
        { bpm: 132, every: 1 }
    ],
    BASS: [110, 110, 87.31, 98],   // A2 A2 F2 G2, one per bar (synth fallback)
    TEST_NOTES: 0,                 // tests can shorten the chart

    enter: function () {
        const R = G.Run;
        R.rhythmAttempts++;
        this.tempoMul = 1 + (1 - R.health / R.maxHealth) * this.MAX_SPEEDUP;

        this.stats = { perfect: 0, great: 0, miss: 0, saved: 0 };
        this.combo = 0;
        this.maxCombo = 0;
        this.judge = null;            // { text, color, t }
        this.flash = { left: 0, right: 0 };
        this.horde = 0;               // how far the horde has advanced (misses)
        this.first = 0;               // index of first note still worth checking
        this.finished = false;
        this.started = false;
        this.waitT = 0;
        this.source = null;
        this.songT = -1;
        this.notes = [];
        this.beats = [];
        G.Audio.unlock();
    },

    exit: function () {
        G.Audio.stopTrack(this.source);
        this.source = null;
    },

    layout: function () {
        this.recY = G.UI.HUD_H + 150;          // receptor row
        this.laneX = [G.W / 2 - 80, G.W / 2 + 80];
    },

    // Begin the song once the track is ready (or we've given up waiting for it)
    startSong: function () {
        const A = G.Audio, ctx = A.ctx;
        this.useAudio = !!(ctx && ctx.state === 'running');
        this.useTrack = this.useAudio && A.trackState('dance') === 'ready';
        this.lat = this.useAudio ? (ctx.outputLatency || ctx.baseLatency || 0) : 0;
        if (this.useTrack) this.buildTrackChart();
        else this.buildSynthChart();

        this.start = this.rawNow() + 0.3;
        if (this.useTrack) this.source = A.playTrack('dance', this.start, this.tempoMul);
        this.nextBeat = 0;
        this.started = true;
    },

    pickDirs: function (count, seed) {
        const rnd = G.rng(seed >>> 0), out = [];
        let p1 = null, p2 = null;
        for (let i = 0; i < count; i++) {
            let d;
            do { d = this.DIRS[(rnd() * 2) | 0]; } while (d === p1 && d === p2); // no triples
            p2 = p1; p1 = d;
            out.push(d);
        }
        return out;
    },

    // Chart from the recorded track's beat grid
    buildTrackChart: function () {
        const T = G.TRACKS.dance, rate = this.tempoMul, spb = 60 / T.bpm;
        const beats = [], beatIdx = [];
        for (let k = 0; T.firstBeat + k * spb < T.duration; k++) {
            beats.push({ t: (T.firstBeat + k * spb) / rate, spb: spb / rate });
        }
        for (let k = T.countInBeat + 4; k <= T.lastNoteBeat && k < beats.length; k++) {
            if (k >= T.denseFromBeat || (k - T.countInBeat) % 2 === 0) beatIdx.push(k);
        }
        const dirs = this.pickDirs(beatIdx.length, G.Run.seed ^ 0x5bd1e995);
        let notes = beatIdx.map(function (k, i) { return { t: beats[k].t, dir: dirs[i], judged: false, result: null }; });
        if (this.TEST_NOTES) notes = notes.slice(0, this.TEST_NOTES);

        this.beats = beats;
        this.notes = notes;
        this.countT = [0, 1, 2, 3].map(function (i) { return beats[T.countInBeat + i].t; });
        this.endT = Math.min(notes[notes.length - 1].t + 1.0, T.duration / rate);
    },

    // Synthesized fallback chart + beat
    buildSynthChart: function () {
        const beats = [], noteTimes = [];
        let t = 0, bpm = this.SECTIONS[0].bpm * this.tempoMul;
        for (let i = 0; i < 4; i++) {                       // count-in
            beats.push({ t: t, spb: 60 / bpm, count: 4 - i, bar: 0 });
            t += 60 / bpm;
        }
        let beatNo = 0;
        for (let s = 0; s < this.SECTIONS.length; s++) {
            const sec = this.SECTIONS[s];
            bpm = sec.bpm * this.tempoMul;
            const spb = 60 / bpm;
            for (let b = 0; b < 8; b++, beatNo++) {
                beats.push({ t: t, spb: spb, count: 0, bar: beatNo >> 2, down: b % 4 === 0 });
                if (b % sec.every === 0) noteTimes.push(t);
                t += spb;
            }
        }
        beats.push({ t: t, spb: 60 / bpm, count: 0, bar: beatNo >> 2, down: true, last: true });
        const dirs = this.pickDirs(noteTimes.length, G.Run.seed ^ 0x5bd1e995);
        let notes = noteTimes.map(function (nt, i) { return { t: nt, dir: dirs[i], judged: false, result: null }; });
        if (this.TEST_NOTES) notes = notes.slice(0, this.TEST_NOTES);

        this.beats = beats;
        this.notes = notes;
        this.countT = [beats[0].t, beats[1].t, beats[2].t, beats[3].t];
        this.endT = notes[notes.length - 1].t + 1.0;
    },

    rawNow: function () {
        return this.useAudio ? G.Audio.ctx.currentTime : performance.now() / 1000;
    },

    // Current song time in seconds (what the player hears right now)
    now: function () {
        return this.rawNow() - this.start - this.lat;
    },

    scheduleSynthBeat: function (b) {
        const A = G.Audio, at = this.start + b.t;
        if (b.count) {                          // count-in clicks
            A.toneAt(b.count === 4 ? 1320 : 990, 0.05, 'square', 0.3, at);
            return;
        }
        A.kick(at, b.down ? 0.95 : 0.7);
        if (b.last) return;
        A.hat(at + b.spb / 2, 0.22);
        A.toneAt(this.BASS[b.bar % 4], b.spb * 0.8, 'triangle', 0.45, at);
    },

    // ------------------------------------------------------------ judging
    hit: function (dir, et) {
        const notes = this.notes;
        let best = null, bd = 1e9;
        for (let i = this.first; i < notes.length; i++) {
            const n = notes[i];
            if (n.t - et > this.GREAT) break;   // notes are sorted by time
            if (n.judged) continue;
            const d = Math.abs(n.t - et);
            if (d <= this.GREAT && d < bd) { best = n; bd = d; }
        }
        if (!best) return;                       // stray swipe between notes: ignored
        if (best.dir !== dir) { this.miss(best, 'WRONG WAY'); return; }

        best.judged = true;
        if (bd <= this.PERFECT) {
            best.result = 'perfect';
            this.stats.perfect++;
            this.setJudge('PERFECT!', G.C.accent);
            G.vibrate(15);
        } else {
            best.result = 'great';
            this.stats.great++;
            this.setJudge('GREAT', '#7fd6ff');
            G.vibrate(10);
        }
        this.combo++;
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    },

    miss: function (n, label) {
        n.judged = true;
        if (G.Run.medkits > 0) {                 // med-kit carryover: forgive the miss
            G.Run.medkits--;
            n.result = 'saved';
            this.stats.saved++;
            this.stats.great++;
            this.setJudge('MED-KIT SAVE', G.C.good);
            G.Audio.sfx('heal');
            return;
        }
        n.result = 'miss';
        this.stats.miss++;
        this.combo = 0;
        this.horde = Math.min(10, this.horde + 1);
        this.setJudge(label || 'MISS', G.C.danger);
        if (!this.useTrack) G.Audio.sfx('growl');   // keep the recorded music clean
        G.vibrate(60);
    },

    setJudge: function (text, color) {
        this.judge = { text: text, color: color, t: 0.6 };
    },

    accuracy: function () {
        const n = this.notes.length;
        return n ? (this.stats.perfect + this.stats.great * 0.6) / n : 0;
    },

    // ------------------------------------------------------------ update
    update: function (dt) {
        if (this.finished) return;

        if (!this.started) {
            // Wait briefly for the track to finish downloading/decoding
            const st = G.Audio.trackState('dance');
            this.waitT += dt;
            const pending = st === 'loading' || st === 'fetched' || st === 'decoding';
            if (!pending || this.waitT >= this.LOAD_TIMEOUT) this.startSong();
            else return;
        }

        const now = this.songT = this.now();

        if (this.useAudio && !this.useTrack) {
            while (this.nextBeat < this.beats.length && this.beats[this.nextBeat].t < now + this.lat + 0.25) {
                this.scheduleSynthBeat(this.beats[this.nextBeat++]);
            }
        }

        const ev = G.Input.events, pnow = performance.now();
        for (let i = 0; i < ev.length; i++) {
            const e = ev[i];
            if (e.type === 'dir' && (e.dir === 'left' || e.dir === 'right')) {
                this.flash[e.dir] = 1;
                this.hit(e.dir, now - (pnow - e.t) / 1000);
            }
        }

        // Notes that scrolled past the window are misses
        const notes = this.notes;
        for (let i = this.first; i < notes.length; i++) {
            const n = notes[i];
            if (n.t > now) break;
            if (!n.judged && now - n.t > this.GREAT) this.miss(n);
        }
        while (this.first < notes.length && notes[this.first].judged &&
               now - notes[this.first].t > 1.5) this.first++;

        if (this.flash.left > 0) this.flash.left = Math.max(0, this.flash.left - dt * 5);
        if (this.flash.right > 0) this.flash.right = Math.max(0, this.flash.right - dt * 5);
        if (this.judge && (this.judge.t -= dt) <= 0) this.judge = null;

        if (now >= this.endT) {
            this.finished = true;
            const acc = this.accuracy();
            G.States.go('result', {
                win: acc >= this.PASS,
                reason: 'rhythm',
                rhythm: {
                    perfect: this.stats.perfect, great: this.stats.great, miss: this.stats.miss,
                    saved: this.stats.saved, acc: acc, maxCombo: this.maxCombo, total: notes.length
                }
            });
        }
    },

    // ------------------------------------------------------------ render
    // 0..1 pulse that peaks on each beat
    beatPulse: function () {
        const t = this.songT, b = this.beats;
        for (let i = b.length - 1; i >= 0; i--) {
            if (b[i].t <= t) return Math.max(0, 1 - (t - b[i].t) / (b[i].spb * 0.5));
        }
        return 0;
    },

    render: function (ctx) {
        const U = G.UI, C = G.C, cx = G.W / 2;

        ctx.fillStyle = '#150f1e';
        ctx.fillRect(0, 0, G.W, G.H);

        if (!this.started) {
            U.text(ctx, 'Loading music...', cx, G.H * 0.5, 16, C.dim, 'center', false);
            U.drawHUD(ctx);
            return;
        }

        const t = this.songT, pulse = this.beatPulse();

        // Horde: dances on the beat, creeps forward on every miss
        const hy = U.HUD_H + 36 + this.horde * 4;
        ctx.fillStyle = '#2a2236';
        ctx.fillRect(0, U.HUD_H, G.W, 92 + this.horde * 4);
        for (let i = 0; i < 5; i++) {
            G.Art.zombie(ctx, 40 + i * 70, hy - pulse * 5, 17, t * 6 + i * 1.3);
        }

        // Lanes
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        for (let i = 0; i < 2; i++) ctx.fillRect(this.laneX[i] - 40, this.recY - 44, 80, G.H);

        // Receptors (pulse on beat, light up on input)
        for (let i = 0; i < 2; i++) {
            const d = this.DIRS[i], f = this.flash[d];
            G.Art.arrow(ctx, this.laneX[i], this.recY, 30 + pulse * 4, d,
                f > 0 ? this.COLORS[d] : '#2c2540', f > 0 ? '#fff' : '#6a6090');
        }

        // Scrolling notes: rise from below toward the receptors
        const notes = this.notes;
        for (let i = this.first; i < notes.length; i++) {
            const n = notes[i];
            const y = this.recY + (n.t - t) * this.SPEED;
            if (y > G.H + 30) break;
            if (n.result === 'perfect' || n.result === 'great' || n.result === 'saved') continue;
            const past = this.recY - y;                    // > 0 once it passed the target
            if (past > 70) continue;                        // gone before reaching the horde
            const lane = n.dir === 'left' ? 0 : 1;
            if (past > 0) ctx.globalAlpha = 1 - past / 70;
            G.Art.arrow(ctx, this.laneX[lane], y, 28, n.dir,
                n.result === 'miss' ? '#444' : this.COLORS[n.dir], 'rgba(0,0,0,0.5)');
            ctx.globalAlpha = 1;
        }

        // Count-in
        if (t < this.countT[3] + 0.4) {
            let label = 'READY';
            for (let i = 3; i >= 0; i--) {
                if (t >= this.countT[i]) { label = i === 3 ? 'DANCE!' : String(3 - i); break; }
            }
            U.textShadow(ctx, label, cx, G.H * 0.52, 48, C.accent);
            U.text(ctx, 'Swipe LEFT / RIGHT on the beat', cx, G.H * 0.52 + 40, 14, C.text, 'center', false);
        }

        // Judgement + combo
        if (this.judge) {
            ctx.globalAlpha = Math.min(1, this.judge.t * 3);
            U.textShadow(ctx, this.judge.text, cx, this.recY + 74, 26, this.judge.color);
            ctx.globalAlpha = 1;
        }
        if (this.combo >= 3) U.text(ctx, this.combo + ' COMBO', cx, this.recY + 106, 15, C.text);

        // Progress + live stats on a solid footer (arrows slide in from under it)
        ctx.fillStyle = '#150f1e';
        ctx.fillRect(0, G.H - 76, G.W, 76);
        ctx.fillStyle = '#2c2540';
        ctx.fillRect(0, G.H - 76, G.W, 2);
        const prog = Math.min(1, Math.max(0, t / this.endT));
        ctx.fillStyle = '#2c2540';
        ctx.fillRect(20, G.H - 44, G.W - 40, 6);
        ctx.fillStyle = C.accent;
        ctx.fillRect(20, G.H - 44, (G.W - 40) * prog, 6);
        const s = this.stats;
        U.text(ctx, 'Perfect ' + s.perfect + '   Great ' + s.great + '   Miss ' + s.miss,
            cx, G.H - 60, 12, C.dim, 'center', false);
        if (this.tempoMul > 1.01) {
            U.text(ctx, 'Low health: tempo +' + Math.round((this.tempoMul - 1) * 100) + '%',
                cx, G.H - 26, 11, C.danger, 'center', false);
        }

        U.drawHUD(ctx);
    }
});
