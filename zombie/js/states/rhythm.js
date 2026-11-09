'use strict';
/*
 * Phase 2: The Zombie Gate Dance-Off (rhythm QTE)
 *
 * Timing is driven by the AUDIO clock (AudioContext.currentTime), not frames,
 * so a slow phone dropping frames never drifts off the beat.
 *   songTime = ctx.currentTime - start - outputLatency
 * Music is synthesized and scheduled ~250ms ahead (lookahead scheduler).
 * Input events carry performance.now() stamps, converted to song time, so
 * judging is as precise as the touch event itself, not the frame it lands in.
 *
 * Adaptive tempo (stretch goal): the lower Snake's health, the faster the
 * horde dances (up to +25% BPM). Tempo also ramps up section by section.
 * Med-kits carried from the maze each forgive one Miss (counted as Great).
 */
G.States.register('rhythm', {
    pausable: true,
    DIRS: ['left', 'down', 'up', 'right'],
    COLORS: { left: '#d64ba0', down: '#4b9bd6', up: '#4bd67a', right: '#e0a040' },
    PERFECT: 0.07,         // ± seconds
    GREAT: 0.14,           // ± seconds; later than this = Miss
    SPEED: 300,            // arrow scroll speed (units / s)
    PASS: 0.6,             // accuracy needed to pass
    MAX_BPM: 150,
    // Song shape: 4-beat count-in, then 4 sections of 8 beats, each faster
    SECTIONS: [
        { bpm: 100, every: 2 },
        { bpm: 110, every: 1 },
        { bpm: 120, every: 1 },
        { bpm: 132, every: 1 }
    ],
    BASS: [110, 110, 87.31, 98],   // A2 A2 F2 G2, one per bar
    TEST_NOTES: 0,                 // tests can shorten the chart

    enter: function () {
        const R = G.Run;
        R.rhythmAttempts++;
        this.tempoMul = 1 + (1 - R.health / R.maxHealth) * 0.25;
        this.buildChart();

        this.stats = { perfect: 0, great: 0, miss: 0, saved: 0 };
        this.combo = 0;
        this.maxCombo = 0;
        this.judge = null;            // { text, color, t }
        this.flash = { left: 0, down: 0, up: 0, right: 0 };
        this.horde = 0;               // how far the horde has advanced (misses)
        this.first = 0;               // index of first note still worth checking

        G.Audio.unlock();
        const ctx = G.Audio.ctx;
        this.useAudio = !!(ctx && ctx.state === 'running');
        this.lat = this.useAudio ? (ctx.outputLatency || ctx.baseLatency || 0) : 0;
        this.start = this.rawNow() + 0.4;
        this.nextBeat = 0;
        this.songT = -0.4;
        this.finished = false;
    },

    layout: function () {
        this.recY = G.UI.HUD_H + 150;          // receptor row
        this.laneX = [];
        for (let i = 0; i < 4; i++) this.laneX.push(G.W / 2 + (i - 1.5) * 76);
    },

    buildChart: function () {
        const rnd = G.rng((G.Run.seed ^ 0x5bd1e995) >>> 0);
        const beats = [], notes = [];
        let t = 0, bpm = Math.min(this.MAX_BPM, this.SECTIONS[0].bpm * this.tempoMul);
        for (let i = 0; i < 4; i++) {                       // count-in
            beats.push({ t: t, spb: 60 / bpm, count: 4 - i, bar: 0 });
            t += 60 / bpm;
        }
        let p1 = null, p2 = null, beatNo = 0;
        for (let s = 0; s < this.SECTIONS.length; s++) {
            const sec = this.SECTIONS[s];
            bpm = Math.min(this.MAX_BPM, sec.bpm * this.tempoMul);
            const spb = 60 / bpm;
            for (let b = 0; b < 8; b++, beatNo++) {
                beats.push({ t: t, spb: spb, count: 0, bar: beatNo >> 2, down: b % 4 === 0 });
                if (b % sec.every === 0) {
                    let d;
                    do { d = this.DIRS[(rnd() * 4) | 0]; } while (d === p1 && d === p2); // no triples
                    p2 = p1; p1 = d;
                    notes.push({ t: t, dir: d, judged: false, result: null });
                }
                t += spb;
            }
        }
        beats.push({ t: t, spb: 60 / bpm, count: 0, bar: beatNo >> 2, down: true, last: true });
        this.beats = beats;
        this.notes = this.TEST_NOTES ? notes.slice(0, this.TEST_NOTES) : notes;
        this.endT = this.notes[this.notes.length - 1].t + 1.0;
    },

    rawNow: function () {
        return this.useAudio ? G.Audio.ctx.currentTime : performance.now() / 1000;
    },

    // Current song time in seconds (what the player hears right now)
    now: function () {
        return this.rawNow() - this.start - this.lat;
    },

    scheduleBeat: function (b) {
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
        G.Audio.sfx('growl');
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
        const now = this.songT = this.now();

        if (this.useAudio) {
            while (this.nextBeat < this.beats.length && this.beats[this.nextBeat].t < now + this.lat + 0.25) {
                this.scheduleBeat(this.beats[this.nextBeat++]);
            }
        }

        const ev = G.Input.events, pnow = performance.now();
        for (let i = 0; i < ev.length; i++) {
            const e = ev[i];
            if (e.type === 'dir') {
                this.flash[e.dir] = 1;
                this.hit(e.dir, now - (pnow - e.t) / 1000);
            } else if (e.type === 'back') {
                G.States.go('menu');
                this.finished = true;
                return;
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

        for (let i = 0; i < 4; i++) {
            const d = this.DIRS[i];
            if (this.flash[d] > 0) this.flash[d] = Math.max(0, this.flash[d] - dt * 5);
        }
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
        const U = G.UI, C = G.C, cx = G.W / 2, t = this.songT;
        const pulse = this.beatPulse();

        ctx.fillStyle = '#150f1e';
        ctx.fillRect(0, 0, G.W, G.H);

        // Horde: dances on the beat, creeps forward on every miss
        const hy = U.HUD_H + 36 + this.horde * 4;
        ctx.fillStyle = '#2a2236';
        ctx.fillRect(0, U.HUD_H, G.W, 92 + this.horde * 4);
        for (let i = 0; i < 5; i++) {
            G.Art.zombie(ctx, 40 + i * 70, hy - pulse * 5, 17, t * 6 + i * 1.3);
        }

        // Lanes
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        for (let i = 0; i < 4; i++) ctx.fillRect(this.laneX[i] - 32, this.recY - 40, 64, G.H);

        // Receptors (pulse on beat, light up on input)
        for (let i = 0; i < 4; i++) {
            const d = this.DIRS[i], f = this.flash[d];
            G.Art.arrow(ctx, this.laneX[i], this.recY, 26 + pulse * 3, d,
                f > 0 ? this.COLORS[d] : '#2c2540', f > 0 ? '#fff' : '#6a6090');
        }

        // Scrolling notes: rise from below toward the receptors
        const notes = this.notes;
        for (let i = this.first; i < notes.length; i++) {
            const n = notes[i];
            const y = this.recY + (n.t - t) * this.SPEED;
            if (y > G.H + 30) break;
            if (n.result === 'perfect' || n.result === 'great' || n.result === 'saved') continue;
            if (y < U.HUD_H - 30) continue;
            const lane = this.DIRS.indexOf(n.dir);
            G.Art.arrow(ctx, this.laneX[lane], y, 24, n.dir,
                n.result === 'miss' ? '#444' : this.COLORS[n.dir], 'rgba(0,0,0,0.5)');
        }

        // Count-in
        if (t < this.beats[4].t) {
            let label = 'READY';
            for (let i = 3; i >= 0; i--) {
                if (t >= this.beats[i].t) { label = i === 3 ? 'DANCE!' : String(3 - i); break; }
            }
            U.textShadow(ctx, label, cx, G.H * 0.55, 48, C.accent);
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
