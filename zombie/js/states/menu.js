'use strict';
/* Start menu */
G.States.register('menu', {
    bg: null,
    nav: { focus: 0 },

    enter: function () {
        this.nav.focus = 0;
    },

    layout: function () {
        const bw = 220, bh = 56, x = (G.W - bw) / 2, y = Math.round(G.H * 0.58);
        const dpadBtn = G.UI.button(this.dpadLabel(), x + 30, y + bh + 14, bw - 60, 40, function () {
            G.Settings.dpad = !G.Settings.dpad;
            G.Settings.save();
            dpadBtn.label = G.States.list.menu.dpadLabel();
        }, 'secondary');
        this.buttons = [
            G.UI.button('START', x, y, bw, bh, function () {
                G.Run.reset();
                G.States.go('maze');
            }, 'primary'),
            dpadBtn
        ];
        this.buildBackground();
    },

    dpadLabel: function () {
        return 'D-PAD: ' + (G.Settings.dpad ? 'ON' : 'OFF');
    },

    // Hedge pattern is static, so pre-render it once to an offscreen canvas:
    // one drawImage per frame instead of ~200 fillRects.
    buildBackground: function () {
        const c = this.bg || document.createElement('canvas');
        c.width = G.canvas.width;
        c.height = G.canvas.height;
        const x = c.getContext('2d', { alpha: false });
        x.setTransform(G.sx, 0, 0, G.sy, 0, 0);

        x.fillStyle = '#16210f';
        x.fillRect(0, 0, G.W, G.H);
        const rnd = G.rng(1337);
        const T = 24;
        const cols = Math.ceil(G.W / T), rows = Math.ceil(G.H / T);
        for (let r = 0; r < rows; r++) {
            for (let col = 0; col < cols; col++) {
                const border = r === 0 || col === 0 || r === rows - 1 || col === cols - 1;
                if (border || (r % 2 === 0 && col % 2 === 0) || rnd() < 0.28) {
                    x.fillStyle = G.C.hedge;
                    x.fillRect(col * T, r * T, T, T);
                    x.fillStyle = G.C.hedgeLight;
                    x.fillRect(col * T, r * T, T, 4);
                }
            }
        }
        // Dark panel so the title stays readable
        x.fillStyle = 'rgba(5,8,4,0.78)';
        x.fillRect(20, G.H * 0.05, G.W - 40, G.H * 0.88);
        this.bg = c;
    },

    update: function () {
        G.UI.handleButtons(this.buttons, this.nav);
    },

    render: function (ctx) {
        const U = G.UI, C = G.C, cx = G.W / 2;
        ctx.drawImage(this.bg, 0, 0, G.W, G.H);

        U.textShadow(ctx, "SNAKE PLISSKEN'S", cx, G.H * 0.12, 22, C.accent);
        U.textShadow(ctx, 'ESCAPE FROM', cx, G.H * 0.12 + 30, 16, C.text);
        U.textShadow(ctx, 'ZOMBIEPOCALYPSE', cx, G.H * 0.12 + 64, 30, C.danger);

        const bob = Math.sin(G.time * 2) * 3;
        G.Art.snakePortrait(ctx, cx, G.H * 0.4 + bob, 48);

        U.drawButtons(ctx, this.buttons, this.nav);

        U.text(ctx, 'Swipe, d-pad or arrow keys to move', cx, G.H * 0.78, 13, C.dim, 'center', false);
        U.text(ctx, 'Escape the hedge maze.', cx, G.H * 0.78 + 20, 13, C.dim, 'center', false);
        U.text(ctx, 'Out-dance the horde at the gate.', cx, G.H * 0.78 + 40, 13, C.dim, 'center', false);
        U.text(ctx, 'M = mute   F = debug', cx, G.H * 0.89, 11, '#666', 'center', false);
    }
});
