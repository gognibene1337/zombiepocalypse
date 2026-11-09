'use strict';
/*
 * UI helpers: text, buttons, HUD, debug overlay.
 */
G.UI = (function () {
    const C = G.C;
    const U = {};

    const STYLES = {
        primary: { fill: '#c9302c', press: '#8f1f1c', text: '#fff' },
        secondary: { fill: '#2f3a2a', press: '#1d241a', text: C.text },
        danger: { fill: '#6b1f1f', press: '#4a1414', text: '#fff' },
        good: { fill: '#2e6b3b', press: '#1f4d2a', text: '#fff' },
        xmas: { fill: '#a87a12', press: '#7a580c', text: '#fff' }
    };

    U.font = function (size, bold) {
        return (bold === false ? '' : 'bold ') + size + 'px "Trebuchet MS", Verdana, sans-serif';
    };

    U.text = function (ctx, str, x, y, size, color, align, bold) {
        ctx.font = U.font(size, bold);
        ctx.fillStyle = color || C.text;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    };

    // Cheap drop shadow: dark copy offset by 2 units (no shadowBlur)
    U.textShadow = function (ctx, str, x, y, size, color, align) {
        U.text(ctx, str, x + 2, y + 2, size, '#000', align);
        U.text(ctx, str, x, y, size, color, align);
    };

    U.button = function (label, x, y, w, h, onPress, style) {
        return { label: label, x: x, y: y, w: w, h: h, onPress: onPress, style: style || 'primary' };
    };

    U.hit = function (b, px, py) {
        return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
    };

    /*
     * Process this step's input against a button list.
     * nav (optional) = { focus: index } enables keyboard up/down + Enter.
     * Returns true if a button was activated.
     */
    U.handleButtons = function (buttons, nav) {
        const ev = G.Input.events;
        for (let i = 0; i < ev.length; i++) {
            const e = ev[i];
            if (e.type === 'tap') {
                for (let j = 0; j < buttons.length; j++) {
                    if (U.hit(buttons[j], e.x, e.y)) {
                        if (nav) nav.focus = j;
                        G.Audio.sfx('click');
                        buttons[j].onPress();
                        return true;
                    }
                }
            } else if (nav && e.type === 'dir' && e.src === 'key') {
                const n = buttons.length;
                if (e.dir === 'up') { nav.focus = (nav.focus + n - 1) % n; G.Audio.sfx('tick'); }
                if (e.dir === 'down') { nav.focus = (nav.focus + 1) % n; G.Audio.sfx('tick'); }
            } else if (nav && e.type === 'confirm' && buttons[nav.focus]) {
                G.Audio.sfx('click');
                buttons[nav.focus].onPress();
                return true;
            }
        }
        return false;
    };

    U.drawButton = function (ctx, b, focused) {
        const p = G.Input.pointer;
        const pressed = p.down && U.hit(b, p.x, p.y);
        const s = STYLES[b.style] || STYLES.primary;
        ctx.fillStyle = '#000';
        ctx.fillRect(b.x + 3, b.y + 3, b.w, b.h);
        ctx.fillStyle = pressed ? s.press : s.fill;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        if (focused) {
            ctx.strokeStyle = C.accent;
            ctx.lineWidth = 2;
            ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
        }
        U.text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2 + 1, Math.min(20, Math.round(b.h * 0.4)), s.text);
    };

    U.drawButtons = function (ctx, buttons, nav) {
        for (let i = 0; i < buttons.length; i++) {
            U.drawButton(ctx, buttons[i], nav && nav.focus === i);
        }
    };

    // Top bar: health + med-kits (persists across phases via G.Run)
    U.HUD_H = 38;
    U.drawHUD = function (ctx) {
        const R = G.Run;
        const x = 12, y = 12, w = 140, h = 14;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, G.W, U.HUD_H);

        const f = Math.max(0, R.health / R.maxHealth);
        ctx.fillStyle = '#3a1414';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = f > 0.5 ? C.good : f > 0.25 ? C.accent : C.danger;
        ctx.fillRect(x, y, Math.round(w * f), h);
        ctx.strokeStyle = C.text;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        U.text(ctx, 'HP ' + Math.ceil(R.health), x + w + 8, y + h / 2 + 1, 12, C.text, 'left');

        U.drawPauseButton(ctx);   // between HP and med-kits

        G.Art.medkit(ctx, G.W - 64, 19, 9);
        U.text(ctx, '× ' + R.medkits, G.W - 50, 20, 14, C.text, 'left');
    };

    // ⏸ icon at G.States.pauseRect() (tap handling lives in the state manager)
    U.drawPauseButton = function (ctx) {
        if (!G.States.current || !G.States.current.pausable) return;
        const pr = G.States.pauseRect();
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(pr.x + 6, pr.y + 5, pr.w - 12, pr.h - 10);
        ctx.fillStyle = C.text;
        ctx.fillRect(pr.x + 16, pr.y + 12, 4, 14);
        ctx.fillRect(pr.x + 24, pr.y + 12, 4, 14);
    };

    // Is (x, y) on the HUD med-kit counter? (tap it to heal)
    U.hitMedkit = function (x, y) {
        return x > G.W - 84 && y < U.HUD_H;
    };

    // Bottom-left debug readout: fps | frame work time | state | resolution
    U.drawDebug = function (ctx) {
        const s = G.fps + ' fps  ' + G.workMs.toFixed(1) + 'ms  ' + G.States.name +
            '  ' + G.W + '×' + G.H + ' @' + G.sx.toFixed(2) + 'x' + (G.Audio.muted ? '  MUTED' : '');
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, G.H - 15, ctx.measureText(s).width + 8, 15);
        ctx.fillStyle = G.fps >= 50 ? '#7CFC00' : G.fps >= 30 ? C.accent : '#ff5555';
        ctx.fillText(s, 4, G.H - 3);
    };

    return U;
})();
