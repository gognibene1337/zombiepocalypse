'use strict';
/*
 * Bonus game: CAT PUMP
 * Tap ("pump") the black cat in the Santa hat as many times as possible in
 * 60 seconds. The clock starts on the first tap. Beat the best score and
 * presents burst across the screen (live, the moment you pass it).
 * Best score is kept in localStorage on this device.
 *
 * Presses count on finger-DOWN ('press' events), every finger, so fast
 * tapping isn't limited by waiting for release.
 *
 * Kiwi (the real cat, img/kiwi.jpg) joins the celebration: a big framed photo
 * pops up over the cartoon cat and some of the flying presents are Kiwi photos.
 */

// Kiwi's photo, pre-rendered once as a round, gold-framed sprite (cheap to draw
// many times; no per-frame clipping). Missing image = celebration without Kiwi.
G.Kiwi = (function () {
    const K = { sprite: null };
    const img = new Image();
    img.onload = function () {
        const S = 192, c = document.createElement('canvas');
        c.width = c.height = S;
        const x = c.getContext('2d');
        x.save();
        x.beginPath();
        x.arc(S / 2, S / 2, S / 2 - 6, 0, Math.PI * 2);
        x.clip();
        x.drawImage(img, 0, 0, S, S);
        x.restore();
        x.strokeStyle = '#ffd23f';
        x.lineWidth = 10;
        x.beginPath();
        x.arc(S / 2, S / 2, S / 2 - 6, 0, Math.PI * 2);
        x.stroke();
        K.sprite = c;
    };
    img.src = 'img/kiwi.jpg';
    return K;
})();

G.States.register('cat', {
    pausable: true,
    DURATION: 60,                      // seconds per round
    KEY: 'spe.catHigh.v1',             // localStorage key for the best score
    MAX_PRESENTS: 140,
    KIWI_TIME: 3,                      // seconds the big Kiwi photo stays up
    PRESENT_COLORS: [
        { box: '#d62828', ribbon: '#ffd23f' },
        { box: '#2a9d4b', ribbon: '#f4f4f4' },
        { box: '#2b6cd6', ribbon: '#ffd23f' },
        { box: '#ffd23f', ribbon: '#d62828' },
        { box: '#8e44ad', ribbon: '#f4f4f4' }
    ],
    nav: { focus: 0 },

    enter: function () {
        this.phase = 'ready';          // ready -> play -> done
        this.count = 0;
        this.timeLeft = this.DURATION;
        this.high = this.loadHigh();
        this.prevHigh = this.high;     // the score to beat this round
        this.newHigh = false;
        this.celebrated = false;
        this.squash = 0;
        this.pops = [];                // floating "+1"
        this.presents = [];
        this.rainT = 0;                // seconds of presents raining from the top
        this.bannerT = 0;
        this.kiwiT = 0;                // big Kiwi pop-up timer
        this.doneT = 0;
        this.musicOn = false;
        this.buttons = [];
        this.nav.focus = 0;
        const rnd = G.rng(7);
        this.snow = [];
        for (let i = 0; i < 40; i++) {
            this.snow.push({ x: rnd() * G.W, y: rnd() * G.H, s: 1 + rnd() * 2, v: 20 + rnd() * 40, ph: rnd() * 6 });
        }
    },

    exit: function () {
        G.Audio.stopLoop(0.4);
        this.musicOn = false;
    },

    layout: function () {
        this.cat = { x: G.W / 2, y: G.H * 0.47, r: Math.min(118, G.W * 0.33) };
        if (this.phase === 'done') this.makeButtons();
    },

    makeButtons: function () {
        const bw = 220, bh = 50, x = (G.W - bw) / 2, y = Math.round(G.H * 0.8);
        this.buttons = [
            G.UI.button('PLAY AGAIN', x, y, bw, bh, function () { G.States.go('cat'); }, 'xmas'),
            G.UI.button('MAIN MENU', x, y + bh + 12, bw, 44, function () { G.States.go('menu'); }, 'secondary')
        ];
    },

    loadHigh: function () {
        try { return parseInt(localStorage.getItem(this.KEY), 10) || 0; } catch (_) { return 0; }
    },

    saveHigh: function (v) {
        try { localStorage.setItem(this.KEY, String(v)); } catch (_) { /* ignore */ }
    },

    updateMusic: function () {
        const A = G.Audio;
        if (!this.musicOn && A.ctx && A.ctx.state === 'running' && A.trackState('santa') === 'ready') {
            this.musicOn = A.startLoop('santa', G.TRACKS.santa.volume, G.TRACKS.santa.overlap);
        }
        if (this.musicOn) A.updateLoop();
    },

    // ------------------------------------------------------------ gameplay
    hitCat: function (x, y) {
        const c = this.cat, dx = x - c.x, dy = y - c.y;
        return dx * dx + dy * dy <= (c.r * 1.25) * (c.r * 1.25);
    },

    pump: function () {
        if (this.phase === 'ready') this.phase = 'play';
        this.count++;
        this.squash = 1;
        G.Audio.sfx(this.count % 25 === 0 ? 'meow' : 'pump');
        G.vibrate(8);
        if (this.pops.length < 24) {
            this.pops.push({ x: this.cat.x + (Math.random() - 0.5) * this.cat.r * 1.4, y: this.cat.y - this.cat.r * 0.9, t: 0.7 });
        }
        // Passing the best score mid-round: celebrate right away
        if (!this.newHigh && this.prevHigh > 0 && this.count > this.prevHigh) {
            this.newHigh = true;
            this.celebrate();
        }
    },

    finish: function () {
        this.phase = 'done';
        this.timeLeft = 0;
        this.doneT = 0;
        if (this.count > this.prevHigh) {
            this.high = this.count;
            this.saveHigh(this.count);
            this.newHigh = true;
            if (!this.celebrated) this.celebrate();     // first-ever round: celebrate now
            else { this.burst(30); this.kiwiT = this.KIWI_TIME; }   // encore
        } else {
            G.Audio.sfx('click');
        }
        this.makeButtons();
    },

    celebrate: function () {
        this.celebrated = true;
        this.bannerT = 2.5;
        this.kiwiT = this.KIWI_TIME;
        this.rainT = 3;
        this.burst(45);
        G.Audio.sfx('win');
        G.vibrate([60, 40, 60]);
    },

    // Presents explode outward from the cat
    burst: function (n) {
        const c = this.cat;
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, sp = 220 + Math.random() * 380;
            this.addPresent(c.x, c.y - c.r * 0.2, Math.cos(a) * sp, Math.sin(a) * sp - 260);
        }
    },

    addPresent: function (x, y, vx, vy) {
        if (this.presents.length >= this.MAX_PRESENTS) return;
        const kiwi = !!G.Kiwi.sprite && Math.random() < 0.25;    // 1 in 4 is a flying Kiwi
        this.presents.push({
            x: x, y: y, vx: vx, vy: vy,
            rot: Math.random() * 6, vr: (Math.random() - 0.5) * (kiwi ? 5 : 10),
            s: kiwi ? 16 + Math.random() * 10 : 9 + Math.random() * 9,
            kiwi: kiwi,
            c: this.PRESENT_COLORS[(Math.random() * this.PRESENT_COLORS.length) | 0]
        });
    },

    update: function (dt) {
        this.updateMusic();

        // Effects run in every phase
        for (let i = 0; i < this.snow.length; i++) {
            const f = this.snow[i];
            f.y += f.v * dt;
            f.x += Math.sin(G.time + f.ph) * 10 * dt;
            if (f.y > G.H) { f.y = -4; f.x = Math.random() * G.W; }
        }
        if (this.squash > 0) this.squash = Math.max(0, this.squash - dt * 9);
        for (let i = this.pops.length - 1; i >= 0; i--) {
            const p = this.pops[i];
            p.t -= dt; p.y -= 70 * dt;
            if (p.t <= 0) this.pops.splice(i, 1);
        }
        if (this.rainT > 0) {
            this.rainT -= dt;
            if (Math.random() < dt * 14) this.addPresent(Math.random() * G.W, -20, (Math.random() - 0.5) * 60, 40 + Math.random() * 80);
        }
        for (let i = this.presents.length - 1; i >= 0; i--) {
            const p = this.presents[i];
            p.vy += 650 * dt;                       // gravity
            p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
            if (p.y > G.H + 40 || p.x < -60 || p.x > G.W + 60) this.presents.splice(i, 1);
        }
        if (this.bannerT > 0) this.bannerT -= dt;
        if (this.kiwiT > 0) this.kiwiT -= dt;

        if (this.phase === 'done') {
            this.doneT += dt;
            if (this.doneT > 0.8) G.UI.handleButtons(this.buttons, this.nav);  // brief lock: no accidental taps
            return;
        }

        const ev = G.Input.events;
        for (let i = 0; i < ev.length; i++) {
            const e = ev[i];
            if ((e.type === 'press' && this.hitCat(e.x, e.y)) || e.type === 'confirm') this.pump();
        }

        if (this.phase === 'play') {
            this.timeLeft -= dt;
            if (this.timeLeft <= 0) this.finish();
        }
    },

    // ------------------------------------------------------------ render
    render: function (ctx) {
        const U = G.UI, C = G.C, cx = G.W / 2, c = this.cat;

        // Night sky + snowy ground
        ctx.fillStyle = '#101a35';
        ctx.fillRect(0, 0, G.W, G.H);
        ctx.fillStyle = '#dfe8f0';
        ctx.beginPath();
        ctx.ellipse(cx, c.y + c.r * 1.05 + G.H * 0.5, G.W * 0.9, G.H * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        for (let i = 0; i < this.snow.length; i++) {
            const f = this.snow[i];
            ctx.fillRect(f.x, f.y, f.s, f.s);
        }

        // Header: time, score, best
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, G.W, 64);
        const tl = Math.max(0, this.timeLeft);
        U.text(ctx, tl.toFixed(1), 46, 24, 22, tl < 10 && this.phase === 'play' ? C.danger : '#fff');
        U.text(ctx, 'TIME', 46, 47, 10, C.dim);
        U.text(ctx, String(this.count), cx, 26, 30, C.accent);
        U.text(ctx, 'PUMPS', cx, 50, 10, C.dim);
        U.text(ctx, String(Math.max(this.high, this.newHigh ? this.count : 0)), G.W - 46, 24, 22, '#fff');
        U.text(ctx, 'BEST', G.W - 46, 47, 10, C.dim);
        U.drawPauseButton(ctx);

        // Title / instructions
        if (this.phase === 'ready') {
            U.textShadow(ctx, 'CAT PUMP', cx, 100, 30, C.accent);
            U.text(ctx, 'Tap the cat as fast as you can!', cx, 128, 14, '#fff', 'center', false);
            U.text(ctx, '60 seconds. Clock starts on your first tap.', cx, 148, 12, C.dim, 'center', false);
        }

        // Moon glow behind the cat so the black silhouette reads on the night sky
        ctx.fillStyle = '#1e2c5a';
        ctx.beginPath();
        ctx.arc(c.x, c.y - c.r * 0.25, c.r * 1.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#26386e';
        ctx.beginPath();
        ctx.arc(c.x, c.y - c.r * 0.25, c.r * 1.0, 0, Math.PI * 2);
        ctx.fill();

        // The cat (squashes on each pump)
        const sq = this.squash;
        G.Art.santaCat(ctx, c.x, c.y, c.r, 1 + sq * 0.08, 1 - sq * 0.12, G.time * 3);

        for (let i = 0; i < this.pops.length; i++) {
            const p = this.pops[i];
            ctx.globalAlpha = Math.min(1, p.t * 2);
            U.textShadow(ctx, '+1', p.x, p.y, 18, C.accent);
        }
        ctx.globalAlpha = 1;

        if (this.phase === 'done') {
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(0, G.H * 0.66, G.W, G.H * 0.34);
            U.textShadow(ctx, "TIME'S UP!", cx, G.H * 0.7, 26, '#fff');
            U.text(ctx, this.count + (this.count === 1 ? ' pump' : ' pumps') + (this.newHigh ? '  —  NEW BEST!' : '   (best ' + this.high + ')'),
                cx, G.H * 0.7 + 30, 15, this.newHigh ? C.accent : C.text, 'center', false);
            U.drawButtons(ctx, this.buttons, this.nav);
        }

        // Big Kiwi pops up over the cartoon cat: bouncy zoom in, hold, shrink away
        const ks = G.Kiwi.sprite;
        if (ks && this.kiwiT > 0) {
            const age = this.KIWI_TIME - this.kiwiT;
            let k;
            if (age < 0.35) {                                   // overshoot to 1.15, settle to 1
                const u = age / 0.35;
                k = u < 0.7 ? (u / 0.7) * 1.15 : 1.15 - (u - 0.7) / 0.3 * 0.15;
            } else if (this.kiwiT < 0.3) {
                k = this.kiwiT / 0.3;
            } else {
                k = 1 + Math.sin(G.time * 6) * 0.03;            // gentle breathing
            }
            const R = c.r * 0.95 * k;
            ctx.drawImage(ks, c.x - R, c.y - c.r * 0.3 - R, R * 2, R * 2);
        }

        // Presents (and flying Kiwis) over everything
        for (let i = 0; i < this.presents.length; i++) {
            const p = this.presents[i];
            if (p.kiwi) {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.drawImage(ks, -p.s, -p.s, p.s * 2, p.s * 2);
                ctx.restore();
            } else {
                G.Art.present(ctx, p.x, p.y, p.s, p.rot, p.c);
            }
        }

        if (this.bannerT > 0) {
            const a = Math.min(1, this.bannerT * 2), pulse = 1 + Math.sin(G.time * 12) * 0.04;
            ctx.globalAlpha = a;
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(0, G.H * 0.2 - 26, G.W, 52);
            U.textShadow(ctx, 'NEW HIGH SCORE!', cx, G.H * 0.2, Math.round(28 * pulse), C.accent);
            ctx.globalAlpha = 1;
        }
    }
});
