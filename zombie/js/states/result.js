'use strict';
/*
 * Win / Loss screen.
 * params: { win: bool, reason: 'maze' | 'rhythm' }
 *  - Lost the dance-off -> retry the rhythm phase (health/med-kits kept)
 *  - Died in the maze   -> new run
 */
G.States.register('result', {
    nav: { focus: 0 },

    enter: function (p) {
        this.win = !!p.win;
        this.reason = p.reason || 'maze';
        this.rhythm = p.rhythm || null;     // dance-off breakdown, if any
        this.nav.focus = 0;
        G.Audio.sfx(this.win ? 'win' : 'lose');
    },

    layout: function () {
        const bw = 240, bh = 54, x = (G.W - bw) / 2, y = Math.round(G.H * 0.72);
        const toMenu = function () { G.States.go('menu'); };
        const newRun = function () { G.Run.reset(); G.States.go('maze'); };
        let primary;
        if (this.win) primary = G.UI.button('PLAY AGAIN', x, y, bw, bh, newRun, 'primary');
        else if (this.reason === 'rhythm') primary = G.UI.button('RETRY DANCE-OFF', x, y, bw, bh, function () { G.States.go('rhythm'); }, 'primary');
        else primary = G.UI.button('TRY AGAIN', x, y, bw, bh, newRun, 'primary');
        this.buttons = [primary, G.UI.button('MAIN MENU', x, y + bh + 14, bw, bh, toMenu, 'secondary')];
    },

    update: function () {
        G.UI.handleButtons(this.buttons, this.nav);
    },

    render: function (ctx) {
        const U = G.UI, C = G.C, cx = G.W / 2, R = G.Run;

        ctx.fillStyle = this.win ? '#0f1a10' : '#1a0d0d';
        ctx.fillRect(0, 0, G.W, G.H);

        let title, sub;
        if (this.win) { title = 'YOU ESCAPED!'; sub = 'The horde stepped aside.'; }
        else if (this.reason === 'rhythm') { title = 'OUT-DANCED'; sub = "The horde won't budge."; }
        else { title = 'BITTEN'; sub = 'The maze claimed another one.'; }

        U.textShadow(ctx, title, cx, G.H * 0.14, 32, this.win ? C.accent : C.danger);
        U.text(ctx, sub, cx, G.H * 0.14 + 34, 14, C.text, 'center', false);

        if (this.win) G.Art.snakePortrait(ctx, cx, G.H * 0.32, 40);
        else G.Art.zombie(ctx, cx, G.H * 0.28, 36, G.time * 3);

        let y = G.H * 0.5;
        const rh = this.rhythm;
        if (rh) {
            const pct = Math.round(rh.acc * 100);
            U.textShadow(ctx, pct + '%', cx, y, 30, this.win ? C.good : C.danger);
            U.text(ctx, 'need 60% to pass', cx, y + 24, 11, C.dim, 'center', false);
            U.text(ctx, 'Perfect ' + rh.perfect + '   Great ' + rh.great + '   Miss ' + rh.miss, cx, y + 46, 13, C.text, 'center', false);
            U.text(ctx, 'Max combo ' + rh.maxCombo + (rh.saved ? '   Med-kit saves ' + rh.saved : ''), cx, y + 66, 13, C.text, 'center', false);
            y += 92;
        } else {
            y += 10;
        }
        U.text(ctx, 'Health ' + Math.ceil(R.health) + '/' + R.maxHealth + '   Med-kits ' + R.medkits +
            '   Attempts ' + R.rhythmAttempts, cx, y, 12, C.dim, 'center', false);

        U.drawButtons(ctx, this.buttons, this.nav);
    }
});
