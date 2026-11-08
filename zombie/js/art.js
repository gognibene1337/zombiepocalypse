'use strict';
/*
 * Procedural placeholder art: plain canvas shapes, no image files.
 * Rule for low-end GPUs: no shadowBlur, no filters, few gradients.
 * Fake shadows by drawing a dark copy slightly offset.
 */
G.Art = (function () {
    const C = G.C;
    const TAU = Math.PI * 2;
    // Rotation for sprites drawn facing "up"
    const ANG = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };

    function circle(ctx, x, y, r) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
    }

    function ellipse(ctx, x, y, rx, ry) {
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
        ctx.fill();
    }

    return {
        ANG: ANG,

        // Front-facing portrait for menus. Patch is over his LEFT eye (viewer's right).
        snakePortrait: function (ctx, x, y, r) {
            // Shoulders (black tank top)
            ctx.fillStyle = C.black;
            ctx.beginPath();
            ctx.ellipse(x, y + r * 1.5, r * 1.4, r * 0.75, 0, Math.PI, TAU);
            ctx.fill();
            // Neck
            ctx.fillStyle = '#b98760';
            ctx.fillRect(x - r * 0.3, y + r * 0.6, r * 0.6, r * 0.5);
            // Hair behind head
            ctx.fillStyle = C.hair;
            circle(ctx, x, y - r * 0.1, r * 1.02);
            // Face
            ctx.fillStyle = C.skin;
            ellipse(ctx, x, y + r * 0.1, r * 0.8, r * 0.92);
            // Fringe
            ctx.fillStyle = C.hair;
            ellipse(ctx, x, y - r * 0.72, r * 0.84, r * 0.34);
            // Stubble
            ctx.fillStyle = 'rgba(60,40,30,0.35)';
            ctx.beginPath();
            ctx.ellipse(x, y + r * 0.5, r * 0.62, r * 0.45, 0, 0, Math.PI);
            ctx.fill();
            // Visible eye (his right = viewer's left) + brow
            ctx.fillStyle = '#f3efe6';
            ellipse(ctx, x - r * 0.32, y - r * 0.05, r * 0.16, r * 0.09);
            ctx.fillStyle = '#4a6a7a';
            circle(ctx, x - r * 0.3, y - r * 0.05, r * 0.07);
            ctx.fillStyle = C.hair;
            ctx.fillRect(x - r * 0.52, y - r * 0.26, r * 0.4, r * 0.08);
            // Eyepatch strap + patch
            ctx.strokeStyle = '#050505';
            ctx.lineWidth = Math.max(2, r * 0.08);
            ctx.beginPath();
            ctx.moveTo(x - r * 0.78, y - r * 0.5);
            ctx.lineTo(x + r * 0.33, y - r * 0.05);
            ctx.lineTo(x + r * 0.8, y + r * 0.05);
            ctx.stroke();
            ctx.fillStyle = '#050505';
            ellipse(ctx, x + r * 0.33, y - r * 0.04, r * 0.24, r * 0.19);
            // Mouth (stern)
            ctx.fillStyle = '#7a4a35';
            ctx.fillRect(x - r * 0.22, y + r * 0.48, r * 0.44, r * 0.06);
        },

        // Top-down Snake for the maze. dir: 'up' | 'down' | 'left' | 'right'
        snakeTop: function (ctx, x, y, r, dir) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(ANG[dir] || 0);
            // Arms
            ctx.fillStyle = '#b98760';
            circle(ctx, -r * 0.9, -r * 0.1, r * 0.24);
            circle(ctx, r * 0.9, -r * 0.1, r * 0.24);
            // Shoulders
            ctx.fillStyle = C.black;
            ellipse(ctx, 0, 0, r * 0.85, r * 0.5);
            // Head (hair from above)
            ctx.fillStyle = C.hair;
            circle(ctx, 0, -r * 0.05, r * 0.46);
            // Face edge toward facing direction
            ctx.fillStyle = C.skin;
            ellipse(ctx, 0, -r * 0.4, r * 0.3, r * 0.14);
            // Patch on his left side
            ctx.fillStyle = '#000';
            circle(ctx, -r * 0.13, -r * 0.44, r * 0.09);
            ctx.restore();
        },

        // Front-facing horde zombie. t drives a little sway.
        zombie: function (ctx, x, y, r, t) {
            const s = Math.sin(t) * r * 0.12;
            // Torso (torn shirt)
            ctx.fillStyle = '#3d4a35';
            ctx.fillRect(x - r * 0.75, y + r * 0.65, r * 1.5, r * 1.25);
            // Reaching arms
            ctx.fillStyle = C.zombie;
            ctx.fillRect(x - r * 1.05 + s, y + r * 0.7, r * 0.3, r * 0.95);
            ctx.fillRect(x + r * 0.75 + s, y + r * 0.7, r * 0.3, r * 0.95);
            // Head
            circle(ctx, x + s, y, r * 0.72);
            // Glowing eyes + mouth
            ctx.fillStyle = C.danger;
            ctx.fillRect(x + s - r * 0.36, y - r * 0.15, r * 0.22, r * 0.14);
            ctx.fillRect(x + s + r * 0.14, y - r * 0.15, r * 0.22, r * 0.14);
            ctx.fillStyle = '#1a1a14';
            ctx.fillRect(x + s - r * 0.25, y + r * 0.25, r * 0.5, r * 0.12);
        },

        // DDR-style arrow centred on (x, y). s = half-size.
        arrow: function (ctx, x, y, s, dir, fill, stroke) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(ANG[dir] || 0);
            ctx.beginPath();
            ctx.moveTo(0, -s);
            ctx.lineTo(s * 0.9, -s * 0.05);
            ctx.lineTo(s * 0.38, -s * 0.05);
            ctx.lineTo(s * 0.38, s * 0.85);
            ctx.lineTo(-s * 0.38, s * 0.85);
            ctx.lineTo(-s * 0.38, -s * 0.05);
            ctx.lineTo(-s * 0.9, -s * 0.05);
            ctx.closePath();
            ctx.fillStyle = fill;
            ctx.fill();
            if (stroke) {
                ctx.strokeStyle = stroke;
                ctx.lineWidth = 2;
                ctx.stroke();
            }
            ctx.restore();
        },

        // Med-kit icon centred on (x, y). r = half-size.
        medkit: function (ctx, x, y, r) {
            ctx.fillStyle = '#f4f4f4';
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
            ctx.fillStyle = C.danger;
            const t = r * 0.5;
            ctx.fillRect(x - t / 2, y - r * 0.7, t, r * 1.4);
            ctx.fillRect(x - r * 0.7, y - t / 2, r * 1.4, t);
        }
    };
})();
