'use strict';
/*
 * Phase 1: The Mansion Hedge Maze
 *
 * - Tile grid (24-unit tiles, 15 x 61 = one screen wide, ~2 screens tall)
 * - Snake moves tile-to-tile with smooth motion (no free-form physics:
 *   collision is just "is the next tile open?")
 * - Swipe = keep moving that way, turn at the next opening (buffered turn)
 *   Keys / d-pad = move while held
 * - Zombies wander; within CHASE_RANGE path-steps they chase using a BFS
 *   distance field computed from Snake's tile (only when Snake changes tile)
 * - Med-kits sit in dead ends; reaching the gate at the top -> Phase 2
 */
G.States.register('maze', {
    T: 24,               // tile size (logical units)
    COLS: 15,
    ROWS: 61,
    BRAID: 0.45,         // share of dead ends opened into loops
    P_SPEED: 5.0,        // Snake speed, tiles/s
    Z_WANDER: 2.0,       // zombie speeds, tiles/s
    Z_CHASE: 3.4,
    CHASE_RANGE: 9,      // path distance (tiles) at which zombies notice Snake
    N_ZOMBIES: 7,
    N_KITS: 5,
    HIT_DMG: 20,
    IFRAMES: 1.2,        // seconds of invulnerability after a hit
    Z_STUN: 1.0,         // zombie pause after landing a hit
    HIT_DIST: 16,
    SPRITE_R: 10,

    // ------------------------------------------------------------ setup
    enter: function () {
        const M = G.Maze;
        const m = this.m = M.generate(this.COLS, this.ROWS, G.Run.seed, this.BRAID);
        const rnd = m.rnd;

        this.p = this.makeEnt(m.start.c, m.start.r, false);
        this.p.want = null;       // requested direction
        this.p.mode = 'swipe';    // 'swipe' (sticky) or 'hold' (keys/d-pad)
        this.p.facing = 'up';
        this.p.inv = 0;           // invulnerability timer
        this.lastKey = null;
        this.tileKey = -1;
        M.bfs(m, m.start.c, m.start.r);

        // Med-kits in dead ends away from the start, spread apart
        const ends = M.shuffle(m.deadEnds.filter(function (d) { return m.start.r - d.r > 6; }), rnd);
        this.kits = [];
        for (let i = 0; i < ends.length && this.kits.length < this.N_KITS; i++) {
            if (M.farFrom(ends[i], this.kits, 8)) this.kits.push({ c: ends[i].c, r: ends[i].r, taken: false });
        }

        // Zombies on cells in the upper part of the maze, spread apart
        const cells = [];
        for (let r = 1; r < this.ROWS - 14; r += 2) {
            for (let c = 1; c < this.COLS - 1; c += 2) cells.push({ c: c, r: r });
        }
        M.shuffle(cells, rnd);
        this.zombies = [];
        for (let i = 0; i < cells.length && this.zombies.length < this.N_ZOMBIES; i++) {
            if (!M.farFrom(cells[i], this.zombies, 6)) continue;
            const z = this.makeEnt(cells[i].c, cells[i].r, true);
            z.stun = 0;
            z.chasing = false;
            z.facing = 'down';
            this.zombies.push(z);
        }

        this.camY = null;         // set in layout
        this.shake = 0;
        this.hintT = 4;
        this.growlT = 0;
        this.fx = [];             // floating texts
        this.done = false;
    },

    layout: function () {
        this.viewTop = G.UI.HUD_H;
        this.viewH = G.H - this.viewTop;
        const r = 62;
        this.dpad = { x: G.W - r - 14, y: G.H - r - 24, r: r };
        this.buildBackground();
        const maxCam = Math.max(0, this.ROWS * this.T - this.viewH);
        if (this.camY == null) this.camY = maxCam;
        this.camY = Math.min(Math.max(this.camY, 0), maxCam);
    },

    makeEnt: function (c, r, zombie) {
        const T = this.T;
        return { c: c, r: r, tc: c, tr: r, x: c * T + T / 2, y: r * T + T / 2, dir: null, moving: false, zombie: zombie };
    },

    // Static maze art pre-rendered once; each frame blits the visible slice.
    buildBackground: function () {
        const m = this.m, T = this.T, H = this.ROWS * T;
        const k = Math.min(G.sx, 4096 / H);      // stay under common max texture size
        this.bgScale = k;
        const c = this.bg || document.createElement('canvas');
        c.width = Math.round(G.W * k);
        c.height = Math.round(H * k);
        const x = c.getContext('2d', { alpha: false });
        x.setTransform(k, 0, 0, k, 0, 0);

        x.fillStyle = G.C.ground;
        x.fillRect(0, 0, G.W, H);
        const rnd = G.rng(99);
        x.fillStyle = 'rgba(0,0,0,0.16)';
        for (let i = 0; i < 500; i++) x.fillRect(rnd() * G.W, rnd() * H, 2, 2);

        for (let r = 0; r < m.rows; r++) {
            for (let col = 0; col < m.cols; col++) {
                if (G.Maze.isOpen(m, col, r)) continue;
                const px = col * T, py = r * T;
                x.fillStyle = '#123018';                       // hedge base / shadow
                x.fillRect(px, py, T, T);
                x.fillStyle = G.C.hedge;                       // hedge top
                x.fillRect(px, py, T, T - 5);
                if (r === 0 || G.Maze.isOpen(m, col, r - 1)) { // lit top edge
                    x.fillStyle = G.C.hedgeLight;
                    x.fillRect(px, py, T, 3);
                }
                x.fillStyle = '#18401f';                       // leaf texture
                x.fillRect(px + 4 + rnd() * 12, py + 5 + rnd() * 8, 3, 3);
                x.fillRect(px + 4 + rnd() * 12, py + 5 + rnd() * 8, 3, 3);
            }
        }

        // The property gate in the top hedge
        const gx = m.exit.c * T, gy = m.exit.r * T;
        x.fillStyle = '#2a2414';
        x.fillRect(gx, gy, T, T);
        x.fillStyle = G.C.accent;
        x.fillRect(gx - 3, gy, 3, T);
        x.fillRect(gx + T, gy, 3, T);
        for (let i = 0; i < 4; i++) x.fillRect(gx + 3 + i * 6, gy + 2, 2, T - 6);

        // Start patch
        x.fillStyle = 'rgba(242,193,78,0.18)';
        x.fillRect(m.start.c * T + 2, m.start.r * T + 2, T - 4, T - 4);
        this.bg = c;
    },

    // ------------------------------------------------------------ movement
    openFor: function (e, c, r) {
        // Zombies never step into the gate opening
        return G.Maze.isOpen(this.m, c, r) && !(e.zombie && r === 0);
    },

    setTarget: function (e, dir) {
        const v = G.Maze.DIR_VEC[dir];
        const nc = e.c + v[0], nr = e.r + v[1];
        if (!this.openFor(e, nc, nr)) return false;
        e.tc = nc; e.tr = nr; e.dir = dir; e.moving = true;
        return true;
    },

    // Move e up to `dist` units along the grid; choose() picks a direction at tile centres.
    advance: function (e, dist, choose) {
        const T = this.T;
        for (let guard = 0; guard < 4 && dist > 0; guard++) {
            if (!e.moving) {
                const d = choose.call(this, e);
                if (!d || !this.setTarget(e, d)) return;
            }
            const tx = e.tc * T + T / 2, ty = e.tr * T + T / 2;
            const rem = Math.abs(tx - e.x) + Math.abs(ty - e.y);
            if (rem <= dist) {
                e.x = tx; e.y = ty; e.c = e.tc; e.r = e.tr; e.moving = false;
                dist -= rem;
            } else {
                e.x += Math.sign(tx - e.x) * dist;
                e.y += Math.sign(ty - e.y) * dist;
                return;
            }
        }
    },

    choosePlayer: function (p) {
        const V = G.Maze.DIR_VEC;
        if (p.want && this.openFor(p, p.c + V[p.want][0], p.r + V[p.want][1])) return p.want;
        if (p.mode === 'swipe' && p.dir && this.openFor(p, p.c + V[p.dir][0], p.r + V[p.dir][1])) return p.dir;
        return null;
    },

    chooseZombie: function (z) {
        const M = G.Maze, m = this.m;
        const opts = [];
        for (let i = 0; i < 4; i++) {
            if (this.openFor(z, z.c + M.D4[i][0], z.r + M.D4[i][1])) opts.push(M.DIR_NAMES[i]);
        }
        if (!opts.length) return null;

        const d0 = M.distAt(m, z.c, z.r);
        const wasChasing = z.chasing;
        z.chasing = d0 >= 0 && d0 <= this.CHASE_RANGE;
        if (z.chasing && !wasChasing && this.growlT <= 0) {
            G.Audio.sfx('growl');
            this.growlT = 2;
        }
        if (z.chasing) {
            let best = opts[0], bd = 1e9;
            for (let i = 0; i < opts.length; i++) {
                const v = M.DIR_VEC[opts[i]];
                const d = M.distAt(m, z.c + v[0], z.r + v[1]);
                if (d >= 0 && d < bd) { bd = d; best = opts[i]; }
            }
            return best;
        }
        // Wander: don't turn back unless it's a dead end
        if (opts.length > 1 && z.dir) {
            const back = opts.indexOf(M.OPPOSITE[z.dir]);
            if (back >= 0) opts.splice(back, 1);
        }
        return opts[(Math.random() * opts.length) | 0];
    },

    // ------------------------------------------------------------ input
    inDpad: function (x, y) {
        if (!G.Settings.dpad) return false;
        const d = this.dpad, dx = x - d.x, dy = y - d.y;
        return dx * dx + dy * dy <= (d.r + 10) * (d.r + 10);
    },

    dpadDir: function () {
        const pt = G.Input.pointer;
        if (!G.Settings.dpad || !pt.down || !this.inDpad(pt.x, pt.y)) return null;
        const dx = pt.x - this.dpad.x, dy = pt.y - this.dpad.y;
        if (dx * dx + dy * dy < 144) return null; // dead zone
        return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    },

    heldDir: function () {
        const d = this.dpadDir();
        if (d) return d;
        const h = G.Input.held;
        if (this.lastKey && h[this.lastKey]) return this.lastKey;
        return h.up ? 'up' : h.down ? 'down' : h.left ? 'left' : h.right ? 'right' : null;
    },

    handleInput: function () {
        const p = this.p, ev = G.Input.events;
        for (let i = 0; i < ev.length; i++) {
            const e = ev[i];
            if (e.type === 'dir') {
                if (e.src === 'swipe' && this.inDpad(e.sx, e.sy)) continue;
                p.want = e.dir;
                p.mode = e.src === 'key' ? 'hold' : 'swipe';
                if (e.src === 'key') this.lastKey = e.dir;
            } else if (e.type === 'tap') {
                if (this.inDpad(e.x, e.y)) continue;
                if (G.UI.hitMedkit(e.x, e.y)) G.Run.useMedkit();
                else { p.mode = 'hold'; p.want = null; }   // tap = stop at next tile
            } else if (e.type === 'key' && e.code === 'KeyH') {
                G.Run.useMedkit();
            } else if (e.type === 'back') {
                G.States.go('menu');
                return false;
            }
        }
        const held = this.heldDir();
        if (held && this.dpadDir()) p.mode = 'hold';
        if (p.mode === 'hold') p.want = held;
        return true;
    },

    // ------------------------------------------------------------ update
    update: function (dt) {
        if (this.done) return;
        if (!this.handleInput()) return;

        const M = G.Maze, m = this.m, p = this.p, T = this.T;

        // Instant reversal mid-tile feels much better than waiting for the centre
        if (p.moving && p.want && p.want === M.OPPOSITE[p.dir]) {
            const oc = p.c, or = p.r;
            p.c = p.tc; p.r = p.tr; p.tc = oc; p.tr = or; p.dir = p.want;
        }
        this.advance(p, this.P_SPEED * T * dt, this.choosePlayer);
        if (p.moving) p.facing = p.dir;

        // Re-path zombies only when Snake enters a new tile
        const key = p.r * m.cols + p.c;
        if (key !== this.tileKey) {
            this.tileKey = key;
            M.bfs(m, p.c, p.r);
        }

        // Gate reached
        if (!p.moving && p.c === m.exit.c && p.r === m.exit.r) {
            this.done = true;
            G.Audio.sfx('win');
            G.States.go('rhythm');
            return;
        }

        // Pickups
        for (let i = 0; i < this.kits.length; i++) {
            const k = this.kits[i];
            if (k.taken) continue;
            const kx = k.c * T + T / 2, ky = k.r * T + T / 2;
            if (Math.abs(p.x - kx) < 12 && Math.abs(p.y - ky) < 12) {
                k.taken = true;
                G.Run.addMedkit();
                this.fx.push({ text: '+1 MED-KIT', x: kx, y: ky, t: 1 });
            }
        }

        // Zombies
        if (this.growlT > 0) this.growlT -= dt;
        if (p.inv > 0) p.inv -= dt;
        for (let i = 0; i < this.zombies.length; i++) {
            const z = this.zombies[i];
            if (z.stun > 0) { z.stun -= dt; continue; }
            this.advance(z, (z.chasing ? this.Z_CHASE : this.Z_WANDER) * T * dt, this.chooseZombie);
            if (z.moving) z.facing = z.dir;

            if (p.inv <= 0) {
                const dx = z.x - p.x, dy = z.y - p.y;
                if (dx * dx + dy * dy < this.HIT_DIST * this.HIT_DIST) {
                    p.inv = this.IFRAMES;
                    z.stun = this.Z_STUN;
                    this.shake = 0.25;
                    G.vibrate(80);
                    this.fx.push({ text: '-' + this.HIT_DMG, x: p.x, y: p.y - 10, t: 1, bad: true });
                    if (G.Run.damage(this.HIT_DMG)) {
                        this.done = true;
                        G.States.go('result', { win: false, reason: 'maze' });
                        return;
                    }
                }
            }
        }

        // Camera follows Snake vertically (maze is exactly one screen wide)
        const maxCam = Math.max(0, this.ROWS * T - this.viewH);
        const target = Math.min(Math.max(p.y - this.viewH * 0.55, 0), maxCam);
        this.camY += (target - this.camY) * Math.min(1, dt * 6);

        if (this.shake > 0) this.shake -= dt;
        if (this.hintT > 0) this.hintT -= dt;
        for (let i = this.fx.length - 1; i >= 0; i--) {
            this.fx[i].t -= dt;
            this.fx[i].y -= 20 * dt;
            if (this.fx[i].t <= 0) this.fx.splice(i, 1);
        }
    },

    // ------------------------------------------------------------ render
    render: function (ctx) {
        const T = this.T, top = this.viewTop, R = this.SPRITE_R;
        // Snap camera to whole device pixels to avoid shimmering
        const cam = Math.round(this.camY * G.sy) / G.sy;
        const k = this.bgScale;
        const sh = this.shake > 0 ? (Math.random() - 0.5) * 5 : 0;

        ctx.drawImage(this.bg, 0, Math.round(cam * k), this.bg.width, Math.round(this.viewH * k), sh, top, G.W, this.viewH);

        ctx.save();
        ctx.translate(sh, top - cam);
        const y0 = cam - T, y1 = cam + this.viewH + T;   // cull off-screen sprites

        const bob = Math.sin(G.time * 4) * 2;
        for (let i = 0; i < this.kits.length; i++) {
            const kt = this.kits[i];
            const ky = kt.r * T + T / 2;
            if (kt.taken || ky < y0 || ky > y1) continue;
            G.Art.medkit(ctx, kt.c * T + T / 2, ky + bob, 7);
        }

        for (let i = 0; i < this.zombies.length; i++) {
            const z = this.zombies[i];
            if (z.y < y0 || z.y > y1) continue;
            G.Art.zombieTop(ctx, z.x, z.y, R, z.facing, z.chasing && z.stun <= 0);
        }

        const p = this.p;
        // Faint ring under Snake so he's easy to spot
        ctx.fillStyle = 'rgba(242,193,78,0.28)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, R + 3, 0, Math.PI * 2);
        ctx.fill();
        if (p.inv <= 0 || ((G.time * 10) | 0) % 2 === 0) G.Art.snakeTop(ctx, p.x, p.y, R, p.facing);

        for (let i = 0; i < this.fx.length; i++) {
            const f = this.fx[i];
            ctx.globalAlpha = Math.min(1, f.t * 2);
            G.UI.textShadow(ctx, f.text, f.x, f.y, 12, f.bad ? G.C.danger : G.C.accent);
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        if (this.hintT > 0) {
            ctx.globalAlpha = Math.min(1, this.hintT);
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(30, top + 14, G.W - 60, 46);
            G.UI.text(ctx, 'Find the gate at the top!', G.W / 2, top + 30, 14, G.C.accent);
            G.UI.text(ctx, 'Avoid zombies. Grab med-kits.', G.W / 2, top + 48, 12, G.C.text, 'center', false);
            ctx.globalAlpha = 1;
        }

        if (G.Settings.dpad) this.drawDpad(ctx);
        G.UI.drawHUD(ctx);
    },

    drawDpad: function (ctx) {
        const d = this.dpad, active = this.dpadDir();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        const names = G.Maze.DIR_NAMES;
        for (let i = 0; i < 4; i++) {
            const v = G.Maze.DIR_VEC[names[i]];
            G.Art.arrow(ctx, d.x + v[0] * d.r * 0.6, d.y + v[1] * d.r * 0.6, 15, names[i],
                active === names[i] ? G.C.accent : 'rgba(232,230,217,0.6)');
        }
    }
});
