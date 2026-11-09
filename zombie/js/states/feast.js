'use strict';
/*
 * Bonus game: FEAST FLING (Angry Birds-style slingshot)
 * Fling 10 Thanksgiving foods into the basket for their course:
 * MAIN COURSE, SIDES or DESSERT. Correct basket = "Yum, yum!" + hearts.
 *
 * Physics is a simple point projectile with gravity, stepped at the game's
 * fixed 60Hz. The same step() runs the preview dots and the test helper
 * aimFor(), so they match the real flight exactly.
 */
G.FOODS = {
    turkey:     { name: 'Roast Turkey',    course: 'main' },
    ham:        { name: 'Glazed Ham',      course: 'main' },
    leg:        { name: 'Turkey Leg',      course: 'main' },
    yams:       { name: 'Candied Yams',    course: 'sides' },
    beans:      { name: 'Green Beans',     course: 'sides' },
    rolls:      { name: 'Dinner Rolls',    course: 'sides' },
    mash:       { name: 'Mashed Potatoes', course: 'sides' },
    cranberry:  { name: 'Cranberry Sauce', course: 'sides' },
    corn:       { name: 'Corn on the Cob', course: 'sides' },
    pumpkinpie: { name: 'Pumpkin Pie',     course: 'dessert' },
    applepie:   { name: 'Apple Pie',       course: 'dessert' },
    pecanpie:   { name: 'Pecan Pie',       course: 'dessert' }
};

G.States.register('feast', {
    pausable: true,
    N: 10,                 // items per game
    GRAV: 750,             // units / s²
    K: 13,                 // launch speed per unit of pull
    MAXPULL: 95,
    MINPULL: 18,           // shorter pulls cancel instead of firing
    PR: 13,                // projectile radius (collision)
    BW: 86, BH: 46,        // basket size
    KEY: 'spe.feastHigh.v1',
    COURSES: { main: 'MAIN COURSE', sides: 'SIDES', dessert: 'DESSERT' },
    nav: { focus: 0 },

    enter: function () {
        // 3 of each course + 1 wildcard, shuffled
        const by = { main: [], sides: [], dessert: [] }, ids = Object.keys(G.FOODS);
        ids.forEach(function (id) { by[G.FOODS[id].course].push(id); });
        const rnd = Math.random, M = G.Maze, seq = [];
        ['main', 'sides', 'dessert'].forEach(function (c) { seq.push.apply(seq, M.shuffle(by[c].slice(), rnd).slice(0, 3)); });
        seq.push(ids[(rnd() * ids.length) | 0]);
        this.seq = M.shuffle(seq, rnd);
        this.order = M.shuffle(['main', 'sides', 'dessert'], rnd);   // which basket is which course

        this.idx = 0;
        this.score = 0;
        this.results = [];
        this.phase = 'aim';            // aim -> flight -> result -> ... -> done
        this.proj = null;
        this.aiming = false;
        this.pull = { x: 0, y: 0 };
        this.msg = null;               // { text, sub, color, t }
        this.yum = null;               // big "YUM YUM!" pop { x, y, t }
        this.parts = [];               // hearts / rejected food
        this.resultT = 0;
        this.thudT = 0;
        this.high = this.loadHigh();
        this.newHigh = false;
        this.musicOn = false;
        this.doneT = 0;
        this.bonus = false;            // Cat Pump countdown running
        this.unlocked = false;         // scored 80%+ this round
        this.autoT = 0;
        this.buttons = [];
        this.baskets = null;
        this.nav.focus = 0;
    },

    exit: function () {
        G.Audio.stopLoop(0.4);
        this.musicOn = false;
    },

    layout: function () {
        this.anchor = { x: 78, y: G.H - 190 };
        // Staircase (far-high, middle, near-low) so no basket blocks the
        // flight path to another. Tuned with a brute-force shot simulation.
        const spots = [
            { x: 305, y: Math.round(G.H * 0.36) },
            { x: 230, y: Math.round(G.H * 0.50) },
            { x: 165, y: Math.round(G.H * 0.66) }
        ];
        if (!this.baskets) {
            const order = this.order;
            this.baskets = spots.map(function (s, i) { return { x: s.x, y: s.y, course: order[i], contents: [], bounce: 0 }; });
        } else {
            this.baskets.forEach(function (b, i) { b.x = spots[i].x; b.y = spots[i].y; });
        }
        this.buildBackground();
        if (this.phase === 'done') this.makeButtons();
    },

    makeButtons: function () {
        const bw = 220, bh = 50, x = (G.W - bw) / 2, y = Math.round(G.H * 0.62), self = this;
        this.buttons = [
            this.bonus
                ? G.UI.button('CAT PUMP ▶', x, y, bw, bh, function () { self.startBonus(); }, 'xmas')
                : G.UI.button('PLAY AGAIN', x, y, bw, bh, function () { G.States.go('feast'); }, 'xmas'),
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
        if (!this.musicOn && A.ctx && A.ctx.state === 'running' && A.trackState('harvest') === 'ready') {
            this.musicOn = A.startLoop('harvest', G.TRACKS.harvest.volume, G.TRACKS.harvest.overlap);
        }
        if (this.musicOn) A.updateLoop();
    },

    // Autumn evening backdrop, pre-rendered once (1 drawImage per frame)
    buildBackground: function () {
        const c = this.bg || document.createElement('canvas');
        c.width = G.canvas.width;
        c.height = G.canvas.height;
        const x = c.getContext('2d', { alpha: false });
        x.setTransform(G.sx, 0, 0, G.sy, 0, 0);
        const bands = ['#f0954a', '#f3a557', '#f5b565', '#f7c574', '#f8d384'];
        for (let i = 0; i < bands.length; i++) {
            x.fillStyle = bands[i];
            x.fillRect(0, G.H * 0.12 * i, G.W, G.H * 0.12 + 1);
        }
        x.fillStyle = '#f8d384';
        x.fillRect(0, G.H * 0.6, G.W, G.H * 0.4);
        x.fillStyle = '#ffe7a3';                                   // low sun
        x.beginPath(); x.arc(G.W * 0.18, G.H * 0.22, 34, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#c4773a';                                   // far hills
        x.beginPath(); x.ellipse(G.W * 0.2, G.H * 0.8, G.W * 0.6, G.H * 0.12, 0, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#a65f2b';
        x.beginPath(); x.ellipse(G.W * 0.85, G.H * 0.82, G.W * 0.55, G.H * 0.11, 0, 0, Math.PI * 2); x.fill();
        const gy = this.anchor.y + 70;                             // field
        x.fillStyle = '#8a6a2e';
        x.fillRect(0, gy, G.W, G.H - gy);
        x.fillStyle = '#a5823a';
        const rnd = G.rng(11);
        for (let i = 0; i < 70; i++) x.fillRect(rnd() * G.W, gy + 4 + rnd() * (G.H - gy), 6, 2);
        // Hay bale + pumpkins for flavour
        x.fillStyle = '#d9b24a';
        x.fillRect(G.W - 92, gy - 30, 70, 32);
        x.fillStyle = '#b8902e';
        for (let i = 0; i < 3; i++) x.fillRect(G.W - 92, gy - 24 + i * 9, 70, 2);
        [[G.W - 118, 16], [G.W - 14, 11]].forEach(function (pk) {
            x.fillStyle = '#e0701c';
            x.beginPath(); x.ellipse(pk[0], gy - pk[1] * 0.7, pk[1], pk[1] * 0.75, 0, 0, Math.PI * 2); x.fill();
            x.fillStyle = '#4a6b1e';
            x.fillRect(pk[0] - 2, gy - pk[1] * 1.5, 4, 6);
        });
        this.bg = c;
    },

    // ------------------------------------------------------------ physics
    // Advance projectile p by dt. Returns null (still flying), 'out', or { basket: i }.
    step: function (p, dt) {
        p.vy += this.GRAV * dt;
        const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, R = this.PR, w = this.BW, h = this.BH;
        for (let i = 0; i < this.baskets.length; i++) {
            const b = this.baskets[i], l = b.x - w / 2, r = b.x + w / 2;
            // Falling through the mouth of the basket = caught
            if (p.vy > 0 && p.y <= b.y && ny > b.y) {
                const cx = p.x + (nx - p.x) * (b.y - p.y) / (ny - p.y);
                if (cx > l + 5 && cx < r - 5) { p.x = cx; p.y = b.y; return { basket: i }; }
            }
            // Above the opening: let it drop in (no bounce off the open top)
            if (nx > l + 5 && nx < r - 5 && p.y <= b.y) continue;
            // Hitting the outside of the basket = bounce off
            if (nx + R > l && nx - R < r && ny + R > b.y - 4 && ny - R < b.y + h) {
                if (p.x + R <= l || p.x - R >= r) p.vx = -p.vx * 0.45;
                else p.vy = -p.vy * 0.4;
                p.bounced = true;
                p.t += dt;
                return p.t > 5 ? 'out' : null;
            }
        }
        p.x = nx; p.y = ny; p.t += dt;
        if (p.y > G.H + 40 || p.x < -40 || p.x > G.W + 40 || p.t > 5) return 'out';
        return null;
    },

    projFromPull: function (px, py) {
        return { x: this.anchor.x + px, y: this.anchor.y + py, vx: -px * this.K, vy: -py * this.K, t: 0 };
    },

    // Where would this pull land? basket index, or -1 for a miss.
    simulate: function (px, py) {
        const p = this.projFromPull(px, py);
        for (let i = 0; i < 400; i++) {
            const r = this.step(p, G.STEP);
            if (r === 'out') return -1;
            if (r) return r.basket;
        }
        return -1;
    },

    // Find a pull vector that lands in basket i (used by tests). null if none.
    aimFor: function (i) {
        // Collect every pull that works, then return the middle one (most margin)
        const hits = [];
        for (let a = Math.PI / 2; a <= Math.PI; a += 0.02) {
            for (let len = this.MINPULL + 2; len <= this.MAXPULL; len += 3) {
                const px = Math.cos(a) * len, py = Math.sin(a) * len;
                if (this.simulate(px, py) === i) hits.push({ x: px, y: py });
            }
        }
        return hits.length ? hits[hits.length >> 1] : null;
    },

    launch: function (px, py) {
        const p = this.projFromPull(px, py);
        p.id = this.seq[this.idx];
        p.rot = 0;
        p.vr = (px < 0 ? 1 : -1) * (4 + Math.random() * 4);
        this.proj = p;
        this.phase = 'flight';
        this.pull.x = this.pull.y = 0;
        G.Audio.sfx('twang');
    },

    // ------------------------------------------------------------ outcomes
    resolve: function (i) {
        const b = this.baskets[i], id = this.proj.id, food = G.FOODS[id];
        if (b.course === food.course) {
            this.score++;
            this.results.push('yum');
            b.contents.push({ id: id, ox: (Math.random() - 0.5) * this.BW * 0.45, rot: (Math.random() - 0.5) * 0.8 });
            b.bounce = 1;
            this.yum = { x: b.x, y: b.y - 34, t: 1.4 };
            for (let k = 0; k < 14; k++) {
                const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 120 + Math.random() * 160;
                this.parts.push({ kind: 'heart', x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 1,
                    s: 4 + Math.random() * 4, c: Math.random() < 0.5 ? '#e63946' : '#ff8fab' });
            }
            G.Audio.sfx('chime');
            G.Audio.say('Yum, yum!');
            G.vibrate(30);
            this.msg = { text: food.name + '!', sub: 'goes with ' + this.COURSES[food.course], color: '#2e6b3b', t: 1.3 };
        } else {
            this.results.push('wrong');
            // Rejected: the food pops back out of the basket
            this.parts.push({ kind: 'food', id: id, x: b.x, y: b.y - 6, vx: (Math.random() - 0.5) * 160, vy: -380, t: 1.4, rot: 0 });
            b.bounce = 0.5;
            G.Audio.sfx('buzz');
            G.vibrate(80);
            this.msg = { text: 'WRONG COURSE!', sub: food.name + ' → ' + this.COURSES[food.course], color: G.C.danger, t: 1.3 };
        }
        this.proj = null;
        this.phase = 'result';
        this.resultT = 1.3;
    },

    miss: function () {
        const food = G.FOODS[this.proj.id];
        this.results.push('miss');
        G.Audio.sfx('thud');
        this.msg = { text: 'MISSED!', sub: food.name + ' → ' + this.COURSES[food.course], color: '#7a3b12', t: 1.1 };
        this.proj = null;
        this.phase = 'result';
        this.resultT = 1.1;
    },

    startBonus: function () {
        this.autoT = 0;
        this.bonus = false;          // only once
        G.States.go('cat');
    },

    next: function () {
        this.idx++;
        if (this.idx >= this.N) { this.finish(); return; }
        this.phase = 'aim';
    },

    finish: function () {
        this.phase = 'done';
        this.doneT = 0;
        // 7/10+ (G.BONUS.CAT_FROM_FEAST) unlocks the Cat Pump bonus round
        this.bonus = this.score / this.N >= G.BONUS.CAT_FROM_FEAST;
        this.unlocked = this.bonus;
        this.autoT = this.bonus ? G.BONUS.AUTO_START : 0;
        if (this.score > this.high) {
            this.high = this.score;
            this.newHigh = true;
            this.saveHigh(this.score);
            G.Audio.sfx('win');
        }
        this.makeButtons();
    },

    // ------------------------------------------------------------ update
    update: function (dt) {
        this.updateMusic();

        for (let i = this.parts.length - 1; i >= 0; i--) {
            const p = this.parts[i];
            p.vy += (p.kind === 'heart' ? 120 : this.GRAV) * dt;
            p.x += p.vx * dt; p.y += p.vy * dt; p.t -= dt;
            if (p.kind === 'food') p.rot += 8 * dt;
            if (p.t <= 0 || p.y > G.H + 40) this.parts.splice(i, 1);
        }
        for (let i = 0; i < this.baskets.length; i++) {
            if (this.baskets[i].bounce > 0) this.baskets[i].bounce = Math.max(0, this.baskets[i].bounce - dt * 3);
        }
        if (this.yum && (this.yum.t -= dt) <= 0) this.yum = null;
        if (this.msg && (this.msg.t -= dt) <= 0) this.msg = null;
        if (this.thudT > 0) this.thudT -= dt;

        if (this.phase === 'done') {
            this.doneT += dt;
            if (this.doneT > 0.8 && G.UI.handleButtons(this.buttons, this.nav)) return;
            if (this.bonus) {
                this.autoT -= dt;
                if (this.autoT <= 0) this.startBonus();
            }
            return;
        }

        if (this.phase === 'aim') {
            const a = this.anchor, pt = G.Input.pointer, ev = G.Input.events;
            for (let i = 0; i < ev.length; i++) {
                const e = ev[i];
                if (e.type === 'press' && Math.hypot(e.x - a.x, e.y - a.y) < 70) this.aiming = true;
            }
            if (this.aiming) {
                if (pt.down) {
                    let dx = pt.x - a.x, dy = pt.y - a.y;
                    const len = Math.hypot(dx, dy);
                    if (len > this.MAXPULL) { dx *= this.MAXPULL / len; dy *= this.MAXPULL / len; }
                    this.pull.x = dx; this.pull.y = dy;
                } else {
                    this.aiming = false;
                    if (Math.hypot(this.pull.x, this.pull.y) >= this.MINPULL) this.launch(this.pull.x, this.pull.y);
                    else this.pull.x = this.pull.y = 0;
                }
            }
        } else if (this.phase === 'flight') {
            const p = this.proj;
            const r = this.step(p, dt);
            p.rot += p.vr * dt;
            if (p.bounced && this.thudT <= 0) { G.Audio.sfx('thud'); this.thudT = 0.2; }
            p.bounced = false;
            if (r === 'out') this.miss();
            else if (r) this.resolve(r.basket);
        } else if (this.phase === 'result') {
            this.resultT -= dt;
            if (this.resultT <= 0) this.next();
        }
    },

    // ------------------------------------------------------------ render
    render: function (ctx) {
        const U = G.UI, C = G.C, a = this.anchor, cx = G.W / 2;
        ctx.drawImage(this.bg, 0, 0, G.W, G.H);

        // Header
        ctx.fillStyle = 'rgba(60,25,5,0.55)';
        ctx.fillRect(0, 0, G.W, 56);
        U.text(ctx, Math.min(this.idx + 1, this.N) + '/' + this.N, 40, 21, 18, '#fff');
        U.text(ctx, 'ITEM', 40, 42, 10, '#f3d9b0');
        U.text(ctx, String(this.score), cx, 21, 24, C.accent);
        U.text(ctx, 'YUMS', cx, 44, 10, '#f3d9b0');
        U.text(ctx, String(Math.max(this.high, this.score)), G.W - 40, 21, 18, '#fff');
        U.text(ctx, 'BEST', G.W - 40, 42, 10, '#f3d9b0');
        U.drawPauseButton(ctx);

        // Baskets with the foods already caught
        const w = this.BW, h = this.BH;
        for (let i = 0; i < this.baskets.length; i++) {
            const b = this.baskets[i], by = b.y - Math.sin(b.bounce * Math.PI) * 8;
            G.Art.basketBack(ctx, b.x, by, w);
            for (let k = 0; k < b.contents.length && k < 6; k++) {
                const f = b.contents[k];
                G.Art.food(ctx, f.id, b.x + f.ox, by - 2 - (k >> 1) * 3, 11, f.rot);
            }
            G.Art.basketFront(ctx, b.x, by, w, h, this.COURSES[b.course]);
        }

        // Upcoming items waiting on the ground
        for (let k = 1; k <= 3 && this.idx + k < this.N; k++) {
            G.Art.food(ctx, this.seq[this.idx + k], a.x + 44 + k * 30, a.y + 58, 10, 0);
        }

        // Slingshot: back arm, back band, food, front band, front arm
        const lt = { x: a.x - 15, y: a.y - 16 }, rt = { x: a.x + 15, y: a.y - 16 };
        ctx.fillStyle = '#5a3412';
        ctx.fillRect(a.x - 5, a.y - 4, 10, 74);
        ctx.strokeStyle = '#5a3412';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(lt.x, lt.y); ctx.stroke();
        const fx = a.x + this.pull.x, fy = a.y + this.pull.y;
        const onSling = this.phase === 'aim';
        ctx.strokeStyle = '#3a1d08';
        ctx.lineWidth = 4;
        if (onSling) { ctx.beginPath(); ctx.moveTo(lt.x, lt.y); ctx.lineTo(fx - 8, fy); ctx.stroke(); }
        if (onSling) G.Art.food(ctx, this.seq[this.idx], fx, fy, 15, 0);
        if (onSling) { ctx.beginPath(); ctx.moveTo(rt.x, rt.y); ctx.lineTo(fx + 8, fy); ctx.stroke(); }
        else { ctx.beginPath(); ctx.moveTo(lt.x, lt.y); ctx.lineTo(rt.x, rt.y); ctx.stroke(); }
        ctx.strokeStyle = '#6b3f17';
        ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(rt.x, rt.y); ctx.stroke();

        // Aim preview: the first ~0.7s of the arc
        if (this.aiming && Math.hypot(this.pull.x, this.pull.y) >= this.MINPULL) {
            const p = this.projFromPull(this.pull.x, this.pull.y);
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            for (let i = 1; i <= 44; i++) {
                if (this.step(p, G.STEP)) break;
                if (i % 4 === 0) ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
            }
        }

        // Food in flight
        if (this.proj) G.Art.food(ctx, this.proj.id, this.proj.x, this.proj.y, 15, this.proj.rot);

        // Name of the food on the sling
        if (this.phase === 'aim') {
            const name = G.FOODS[this.seq[this.idx]].name;
            ctx.fillStyle = 'rgba(60,25,5,0.7)';
            ctx.fillRect(cx - 120, G.H - 66, 240, 46);
            U.text(ctx, name, cx, G.H - 50, 17, '#fff');
            U.text(ctx, 'Which course? Drag back & let go!', cx, G.H - 30, 11, '#f3d9b0', 'center', false);
        }

        // Hearts + rejected food
        for (let i = 0; i < this.parts.length; i++) {
            const p = this.parts[i];
            ctx.globalAlpha = Math.min(1, p.t * 2);
            if (p.kind === 'heart') G.Art.heart(ctx, p.x, p.y, p.s, p.c);
            else G.Art.food(ctx, p.id, p.x, p.y, 13, p.rot);
        }
        ctx.globalAlpha = 1;

        // Big "YUM YUM!" pop over the basket
        if (this.yum) {
            const age = 1.4 - this.yum.t, k = age < 0.25 ? 0.5 + age / 0.25 * 0.7 : 1.2 - Math.min(0.2, (age - 0.25) * 0.6);
            ctx.globalAlpha = Math.min(1, this.yum.t * 2.5);
            const yx = Math.min(G.W - 80, Math.max(80, this.yum.x));
            U.textShadow(ctx, 'YUM YUM!', yx, this.yum.y - age * 22, Math.round(26 * k), '#e63946');
            ctx.globalAlpha = 1;
        }

        if (this.msg) {
            ctx.globalAlpha = Math.min(1, this.msg.t * 3);
            ctx.fillStyle = 'rgba(255,248,230,0.92)';
            ctx.fillRect(20, 66, G.W - 40, 48);
            U.text(ctx, this.msg.text, cx, 82, 17, this.msg.color);
            U.text(ctx, this.msg.sub, cx, 102, 12, '#5a3412', 'center', false);
            ctx.globalAlpha = 1;
        }

        if (this.phase === 'done') {
            ctx.fillStyle = 'rgba(40,18,4,0.78)';
            ctx.fillRect(0, 0, G.W, G.H);
            U.textShadow(ctx, 'FEAST COMPLETE!', cx, G.H * 0.2, 28, C.accent);
            U.textShadow(ctx, this.score + ' / ' + this.N, cx, G.H * 0.31, 44, '#fff');
            const rating = this.score >= 9 ? 'Master Chef!' : this.score >= 6 ? 'Tasty work!' : this.score >= 3 ? 'Needs more gravy.' : 'Kitchen nightmare!';
            U.text(ctx, rating, cx, G.H * 0.38, 16, '#f3d9b0', 'center', false);
            U.text(ctx, this.newHigh ? 'NEW BEST!' : 'Best: ' + this.high, cx, G.H * 0.43, 15, this.newHigh ? C.accent : '#f3d9b0');
            // Shot-by-shot strip
            for (let i = 0; i < this.results.length; i++) {
                const r = this.results[i], x = cx + (i - 4.5) * 30, y = G.H * 0.51;
                G.Art.food(ctx, this.seq[i], x, y, 11, 0);
                ctx.fillStyle = r === 'yum' ? C.good : C.danger;
                ctx.fillRect(x - 10, y + 15, 20, 4);
            }
            if (this.unlocked) {
                U.textShadow(ctx, 'CAT PUMP UNLOCKED!', cx, G.H * 0.565, 17, C.accent);
                if (this.bonus) U.text(ctx, 'Starting in ' + Math.max(1, Math.ceil(this.autoT)) + '...', cx, G.H * 0.595, 12, '#f3d9b0', 'center', false);
            } else {
                U.text(ctx, 'Score ' + Math.ceil(G.BONUS.CAT_FROM_FEAST * this.N) + '+ to unlock the Cat Pump bonus', cx, G.H * 0.575, 12, '#f3d9b0', 'center', false);
            }
            U.drawButtons(ctx, this.buttons, this.nav);
        }
    }
});
