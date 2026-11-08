'use strict';
/*
 * Phase 2: Zombie Gate Dance-Off (PLACEHOLDER)
 * The real rhythm engine (beat clock, scrolling arrows, Perfect/Great/Miss)
 * comes later. For now this screen tests the swipe detector and audio.
 */
G.States.register('rhythm', {
    DIRS: ['left', 'down', 'up', 'right'],

    enter: function () {
        G.Run.rhythmAttempts++;
        this.flash = { left: 0, down: 0, up: 0, right: 0 };
        this.count = 0;
        this.lastDir = '-';
    },

    layout: function () {
        const bw = 150, bh = 48, gap = 12;
        const x0 = (G.W - (bw * 2 + gap)) / 2, y = G.H - 80;
        this.buttons = [
            G.UI.button('Pass ✔', x0, y, bw, bh, function () {
                G.States.go('result', { win: true });
            }, 'good'),
            G.UI.button('Fail ✖', x0 + bw + gap, y, bw, bh, function () {
                G.States.go('result', { win: false, reason: 'rhythm' });
            }, 'danger')
        ];
    },

    update: function (dt) {
        if (G.UI.handleButtons(this.buttons)) return;

        const ev = G.Input.events;
        for (let i = 0; i < ev.length; i++) {
            const e = ev[i];
            if (e.type === 'dir') {
                this.flash[e.dir] = 1;
                this.count++;
                this.lastDir = e.dir + ' (' + e.src + ')';
                G.Audio.sfx(e.dir);
            } else if (e.type === 'back') {
                G.States.go('menu');
                return;
            }
        }
        for (let i = 0; i < 4; i++) {
            const d = this.DIRS[i];
            if (this.flash[d] > 0) this.flash[d] = Math.max(0, this.flash[d] - dt * 4);
        }
    },

    render: function (ctx) {
        const U = G.UI, C = G.C, cx = G.W / 2;

        ctx.fillStyle = '#150f1e';
        ctx.fillRect(0, 0, G.W, G.H);

        // Horde blocking the gate
        ctx.fillStyle = '#2a2236';
        ctx.fillRect(0, U.HUD_H, G.W, 120);
        for (let i = 0; i < 5; i++) {
            G.Art.zombie(ctx, 40 + i * 70, U.HUD_H + 40, 18, G.time * 3 + i);
        }

        U.textShadow(ctx, 'PHASE 2: GATE DANCE-OFF', cx, G.H * 0.33, 18, C.text);
        U.text(ctx, 'Placeholder. Rhythm engine comes later.', cx, G.H * 0.33 + 24, 12, C.dim, 'center', false);
        U.text(ctx, 'Attempt #' + G.Run.rhythmAttempts, cx, G.H * 0.33 + 44, 12, C.accent, 'center', false);

        // Receptor arrows light up on each detected swipe / key
        const y = G.H * 0.52, gap = 76, x0 = cx - gap * 1.5;
        for (let i = 0; i < 4; i++) {
            const d = this.DIRS[i];
            const lit = this.flash[d] > 0;
            G.Art.arrow(ctx, x0 + i * gap, y, 26, d, lit ? C.accent : '#3a3350', lit ? '#fff' : '#6a6090');
        }

        U.text(ctx, 'Swipe or press arrows to test', cx, G.H * 0.52 + 50, 12, C.dim, 'center', false);
        U.text(ctx, 'Detected: ' + this.count + '   Last: ' + this.lastDir, cx, G.H * 0.52 + 70, 12, C.accent, 'center', false);

        U.drawHUD(ctx);
        U.drawButtons(ctx, this.buttons);
    }
});
