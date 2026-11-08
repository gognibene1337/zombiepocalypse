'use strict';
/*
 * Phase 1: Hedge Maze (PLACEHOLDER)
 * The real maze engine (tiles, collision, zombies, pickups) is the next step.
 * For now this screen tests movement input, HUD, and the transitions.
 */
G.States.register('maze', {
    SPEED: 110, // logical units per second
    R: 14,      // Snake radius

    enter: function () {
        this.dir = null;        // current movement direction
        this.dirSrc = null;     // 'key' or 'swipe'
        this.facing = 'up';
        this.lastInput = '-';
        this.x = G.W / 2;
        this.y = G.H * 0.6;
    },

    layout: function () {
        // Play area between HUD and the debug buttons
        this.area = { l: 12, t: G.UI.HUD_H + 12, r: G.W - 12, b: G.H - 96 };
        this.gate = { x: G.W / 2 - 36, w: 72 };
        this.x = Math.min(Math.max(this.x, this.area.l + this.R), this.area.r - this.R);
        this.y = Math.min(Math.max(this.y, this.area.t + this.R), this.area.b - this.R);

        const self = this;
        const bw = 104, bh = 44, gap = 8;
        const x0 = (G.W - (bw * 3 + gap * 2)) / 2, y = G.H - 76;
        this.buttons = [
            G.UI.button('Take Hit', x0, y, bw, bh, function () { self.hurt(25); }, 'danger'),
            G.UI.button('+ Med-Kit', x0 + bw + gap, y, bw, bh, function () { G.Run.addMedkit(); }, 'good'),
            G.UI.button('Gate ▶', x0 + (bw + gap) * 2, y, bw, bh, function () { G.States.go('rhythm'); }, 'secondary')
        ];
    },

    hurt: function (n) {
        if (G.Run.damage(n)) G.States.go('result', { win: false, reason: 'maze' });
    },

    update: function (dt) {
        if (G.UI.handleButtons(this.buttons)) return;

        const ev = G.Input.events;
        for (let i = 0; i < ev.length; i++) {
            const e = ev[i];
            if (e.type === 'dir') {
                this.dir = e.dir;
                this.dirSrc = e.src;
                this.facing = e.dir;
                this.lastInput = e.dir + ' (' + e.src + ')';
            } else if (e.type === 'tap') {
                if (G.UI.hitMedkit(e.x, e.y)) G.Run.useMedkit();
                else this.dir = null;                     // tap elsewhere = stop
            } else if (e.type === 'key' && e.code === 'KeyH') {
                G.Run.useMedkit();
            } else if (e.type === 'back') {
                G.States.go('menu');
                return;
            }
        }

        // Keyboard: move only while held. Swipe: keep moving until next input.
        if (this.dirSrc === 'key' && this.dir && !G.Input.held[this.dir]) {
            const h = G.Input.held;
            this.dir = h.up ? 'up' : h.down ? 'down' : h.left ? 'left' : h.right ? 'right' : null;
            if (this.dir) this.facing = this.dir;
        }

        if (this.dir) {
            const d = this.SPEED * dt;
            if (this.dir === 'up') this.y -= d;
            else if (this.dir === 'down') this.y += d;
            else if (this.dir === 'left') this.x -= d;
            else this.x += d;
        }

        const a = this.area, r = this.R;
        // Walk into the gate gap at the top = reach the exit
        if (this.y - r <= a.t && this.x > this.gate.x && this.x < this.gate.x + this.gate.w) {
            G.States.go('rhythm');
            return;
        }
        this.x = Math.min(Math.max(this.x, a.l + r), a.r - r);
        this.y = Math.min(Math.max(this.y, a.t + r), a.b - r);
    },

    render: function (ctx) {
        const U = G.UI, C = G.C, a = this.area, cx = G.W / 2;

        ctx.fillStyle = C.ground;
        ctx.fillRect(0, 0, G.W, G.H);

        // Hedge border with a gate gap at the top
        ctx.fillStyle = C.hedge;
        ctx.fillRect(0, a.t - 12, this.gate.x, 12);
        ctx.fillRect(this.gate.x + this.gate.w, a.t - 12, G.W - this.gate.x - this.gate.w, 12);
        ctx.fillRect(0, a.t - 12, 12, a.b - a.t + 24);
        ctx.fillRect(G.W - 12, a.t - 12, 12, a.b - a.t + 24);
        ctx.fillRect(0, a.b, G.W, 12);
        // Gate bars
        ctx.fillStyle = C.accent;
        for (let i = 0; i < 6; i++) ctx.fillRect(this.gate.x + 4 + i * 12, a.t - 12, 3, 12);

        U.text(ctx, 'GATE', cx, a.t + 12, 11, C.accent);
        U.textShadow(ctx, 'PHASE 1: HEDGE MAZE', cx, a.t + 48, 18, C.text);
        U.text(ctx, 'Placeholder. Real maze comes next.', cx, a.t + 72, 12, C.dim, 'center', false);
        U.text(ctx, 'Move with swipes or arrows/WASD', cx, a.t + 100, 12, C.dim, 'center', false);
        U.text(ctx, 'Walk into the gate to finish', cx, a.t + 118, 12, C.dim, 'center', false);
        U.text(ctx, 'Tap the med-kit counter (or H) to heal', cx, a.t + 136, 12, C.dim, 'center', false);
        U.text(ctx, 'Last input: ' + this.lastInput, cx, a.b - 16, 12, C.accent, 'center', false);

        G.Art.snakeTop(ctx, this.x, this.y, this.R, this.facing);

        U.drawHUD(ctx);
        U.drawButtons(ctx, this.buttons);
    }
});
