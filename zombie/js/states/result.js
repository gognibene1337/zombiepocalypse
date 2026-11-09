'use strict';
/*
 * Win / Loss screen.
 * params: { win: bool, reason: 'maze' | 'rhythm' }
 *  - Lost the dance-off -> retry the rhythm phase (health/med-kits kept)
 *  - Died in the maze   -> new run
 *  - Won with >= 60% dance accuracy -> Feast Fling bonus round (auto-starts)
 */
G.States.register('result', {
    nav: { focus: 0 },

    enter: function (p) {
        this.win = !!p.win;
        this.reason = p.reason || 'maze';
        this.rhythm = p.rhythm || null;     // dance-off breakdown, if any
        this.nav.focus = 0;
        // Great dancing unlocks the Feast Fling bonus round
        this.bonus = this.win && !!this.rhythm && this.rhythm.acc >= G.BONUS.FEAST_FROM_DANCE;
        this.autoT = this.bonus ? G.BONUS.AUTO_START : 0;
        G.Audio.sfx(this.win ? 'win' : 'lose');
    },

    startBonus: function () {
        this.autoT = 0;
        this.bonus = false;          // only once
        G.States.go('feast');
    },

    layout: function () {
        const bw = 240, bh = 54, x = (G.W - bw) / 2, y = Math.round(G.H * 0.72);
        const toMenu = function () { G.States.go('menu'); };
        const newRun = function () { G.Run.reset(); G.States.go('maze'); };
        const self = this;
        let primary;
        if (this.bonus) primary = G.UI.button('FEAST FLING ▶', x, y, bw, bh, function () { self.startBonus(); }, 'xmas');
        else if (this.win) primary = G.UI.button('PLAY AGAIN', x, y, bw, bh, newRun, 'primary');
        else if (this.reason === 'rhythm') primary = G.UI.button('RETRY DANCE-OFF', x, y, bw, bh, function () { G.States.go('rhythm'); }, 'primary');
        else primary = G.UI.button('TRY AGAIN', x, y, bw, bh, newRun, 'primary');
        this.buttons = [primary, G.UI.button('MAIN MENU', x, y + bh + 14, bw, bh, toMenu, 'secondary')];
    },

    update: function (dt) {
        if (G.UI.handleButtons(this.buttons, this.nav)) return;
        if (this.bonus) {
            this.autoT -= dt;
            if (this.autoT <= 0) this.startBonus();
        }
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
            if (this.bonus || (this.win && rh.acc >= G.BONUS.FEAST_FROM_DANCE)) {
                U.text(ctx, 'BONUS ROUND UNLOCKED!', cx, y + 24, 13, C.accent);
            } else {
                U.text(ctx, this.win ? 'score ' + Math.round(G.BONUS.FEAST_FROM_DANCE * 100) + '% to unlock a bonus round' : 'need 60% to pass',
                    cx, y + 24, 11, C.dim, 'center', false);
            }
            U.text(ctx, 'Perfect ' + rh.perfect + '   Great ' + rh.great + '   Miss ' + rh.miss, cx, y + 46, 13, C.text, 'center', false);
            U.text(ctx, 'Max combo ' + rh.maxCombo + (rh.saved ? '   Med-kit saves ' + rh.saved : ''), cx, y + 66, 13, C.text, 'center', false);
            y += 92;
        } else {
            y += 10;
        }
        U.text(ctx, 'Health ' + Math.ceil(R.health) + '/' + R.maxHealth + '   Med-kits ' + R.medkits +
            '   Attempts ' + R.rhythmAttempts, cx, y, 12, C.dim, 'center', false);

        U.drawButtons(ctx, this.buttons, this.nav);
        if (this.bonus) {
            U.text(ctx, 'Feast Fling starts in ' + Math.max(1, Math.ceil(this.autoT)) + '...',
                cx, this.buttons[0].y - 16, 12, C.accent, 'center', false);
        }
    }
});
