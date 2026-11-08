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
        this.nav.focus = 0;
        G.Audio.sfx(this.win ? 'win' : 'lose');
    },

    layout: function () {
        const bw = 240, bh = 54, x = (G.W - bw) / 2, y = Math.round(G.H * 0.66);
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

        if (this.win) G.Art.snakePortrait(ctx, cx, G.H * 0.36, 44);
        else G.Art.zombie(ctx, cx, G.H * 0.32, 40, G.time * 3);

        U.text(ctx, 'Health: ' + Math.ceil(R.health) + ' / ' + R.maxHealth, cx, G.H * 0.53, 14, C.text, 'center', false);
        U.text(ctx, 'Med-kits: ' + R.medkits, cx, G.H * 0.53 + 22, 14, C.text, 'center', false);
        U.text(ctx, 'Dance-off attempts: ' + R.rhythmAttempts, cx, G.H * 0.53 + 44, 14, C.text, 'center', false);

        U.drawButtons(ctx, this.buttons, this.nav);
    }
});
