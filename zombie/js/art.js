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

        // Top-down zombie for the maze: arms reaching forward. alert = chasing.
        zombieTop: function (ctx, x, y, r, dir, alert) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(ANG[dir] || 0);
            ctx.fillStyle = C.zombie;
            ctx.fillRect(-r * 0.78, -r * 1.15, r * 0.3, r * 0.85);
            ctx.fillRect(r * 0.48, -r * 1.15, r * 0.3, r * 0.85);
            ctx.fillStyle = '#3d4a35';
            ellipse(ctx, 0, r * 0.1, r * 0.85, r * 0.5);
            ctx.fillStyle = C.zombie;
            circle(ctx, 0, -r * 0.05, r * 0.45);
            ctx.fillStyle = alert ? '#ff3b3b' : '#5a1a1a';
            ctx.fillRect(-r * 0.27, -r * 0.4, r * 0.17, r * 0.13);
            ctx.fillRect(r * 0.1, -r * 0.4, r * 0.17, r * 0.13);
            ctx.restore();
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

        /*
         * Black cat in a Santa hat, sitting, facing the viewer. (x, y) = centre,
         * r = size. sx/sy squash the cat from its base (press animation).
         * t drives the tail swish.
         */
        santaCat: function (ctx, x, y, r, sx, sy, t) {
            ctx.save();
            ctx.translate(x, y + r);            // anchor squash at the paws
            ctx.scale(sx, sy);
            ctx.translate(0, -r);

            // Tail
            ctx.strokeStyle = '#141414';
            ctx.lineWidth = r * 0.16;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(r * 0.5, r * 0.8);
            ctx.quadraticCurveTo(r * 1.25, r * 0.7, r * 1.0, r * 0.05 + Math.sin(t) * r * 0.12);
            ctx.stroke();

            // Body + paws
            ctx.fillStyle = '#141414';
            ellipse(ctx, 0, r * 0.45, r * 0.72, r * 0.55);
            ellipse(ctx, -r * 0.28, r * 0.93, r * 0.19, r * 0.1);
            ellipse(ctx, r * 0.28, r * 0.93, r * 0.19, r * 0.1);
            // Head
            circle(ctx, 0, -r * 0.25, r * 0.56);
            // Ears
            ctx.beginPath();
            ctx.moveTo(-r * 0.52, -r * 0.42); ctx.lineTo(-r * 0.44, -r * 0.98); ctx.lineTo(-r * 0.1, -r * 0.72);
            ctx.moveTo(r * 0.52, -r * 0.42); ctx.lineTo(r * 0.44, -r * 0.98); ctx.lineTo(r * 0.1, -r * 0.72);
            ctx.fill();
            ctx.fillStyle = '#5a2a3a';
            ctx.beginPath();
            ctx.moveTo(-r * 0.44, -r * 0.5); ctx.lineTo(-r * 0.4, -r * 0.84); ctx.lineTo(-r * 0.2, -r * 0.68);
            ctx.moveTo(r * 0.44, -r * 0.5); ctx.lineTo(r * 0.4, -r * 0.84); ctx.lineTo(r * 0.2, -r * 0.68);
            ctx.fill();

            // Eyes: green with slit pupils (squint while squashed)
            const squint = Math.max(0.35, 1 - (1 - sy) * 4);
            ctx.fillStyle = '#c8e04a';
            ellipse(ctx, -r * 0.21, -r * 0.27, r * 0.13, r * 0.15 * squint);
            ellipse(ctx, r * 0.21, -r * 0.27, r * 0.13, r * 0.15 * squint);
            ctx.fillStyle = '#000';
            ellipse(ctx, -r * 0.21, -r * 0.27, r * 0.035, r * 0.12 * squint);
            ellipse(ctx, r * 0.21, -r * 0.27, r * 0.035, r * 0.12 * squint);
            ctx.fillStyle = '#fff';
            ctx.fillRect(-r * 0.27, -r * 0.35, r * 0.04, r * 0.04);
            ctx.fillRect(r * 0.15, -r * 0.35, r * 0.04, r * 0.04);

            // Nose, mouth, whiskers
            ctx.fillStyle = '#e88aa0';
            ctx.beginPath();
            ctx.moveTo(-r * 0.06, -r * 0.1); ctx.lineTo(r * 0.06, -r * 0.1); ctx.lineTo(0, -r * 0.03);
            ctx.fill();
            ctx.strokeStyle = '#8a8a8a';
            ctx.lineWidth = Math.max(1, r * 0.018);
            ctx.beginPath();
            ctx.moveTo(0, -r * 0.03); ctx.quadraticCurveTo(-r * 0.06, r * 0.04, -r * 0.12, -r * 0.01);
            ctx.moveTo(0, -r * 0.03); ctx.quadraticCurveTo(r * 0.06, r * 0.04, r * 0.12, -r * 0.01);
            ctx.moveTo(-r * 0.18, -r * 0.06); ctx.lineTo(-r * 0.62, -r * 0.14);
            ctx.moveTo(-r * 0.18, -r * 0.02); ctx.lineTo(-r * 0.62, r * 0.02);
            ctx.moveTo(r * 0.18, -r * 0.06); ctx.lineTo(r * 0.62, -r * 0.14);
            ctx.moveTo(r * 0.18, -r * 0.02); ctx.lineTo(r * 0.62, r * 0.02);
            ctx.stroke();

            // Santa hat, tilted, tip flopping to the right
            ctx.save();
            ctx.translate(r * 0.04, -r * 0.7);
            ctx.rotate(0.22);
            ctx.fillStyle = '#d62828';
            ctx.beginPath();
            ctx.moveTo(-r * 0.46, 0);
            ctx.quadraticCurveTo(-r * 0.15, -r * 0.95, r * 0.6, -r * 0.72);
            ctx.lineTo(r * 0.46, 0);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#f4f4f4';
            ctx.fillRect(-r * 0.5, -r * 0.08, r * 1.0, r * 0.2);
            circle(ctx, -r * 0.5, r * 0.02, r * 0.1);
            circle(ctx, r * 0.5, r * 0.02, r * 0.1);
            circle(ctx, r * 0.62, -r * 0.74, r * 0.13);     // pom-pom
            ctx.restore();

            ctx.restore();
        },

        // Wrapped present centred on (x, y), half-size s, rotation rot. c = { box, ribbon }
        present: function (ctx, x, y, s, rot, c) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(rot);
            ctx.fillStyle = c.box;
            ctx.fillRect(-s, -s, s * 2, s * 2);
            ctx.fillStyle = c.ribbon;
            ctx.fillRect(-s * 0.18, -s, s * 0.36, s * 2);
            ctx.fillRect(-s, -s * 0.18, s * 2, s * 0.36);
            circle(ctx, -s * 0.28, -s * 1.1, s * 0.3);         // bow
            circle(ctx, s * 0.28, -s * 1.1, s * 0.3);
            ctx.restore();
        },

        /*
         * Thanksgiving foods for the Feast Fling bonus game, centred on (x, y),
         * size r (~radius), rotated by rot. id = key in G.FOODS.
         */
        food: function (ctx, id, x, y, r, rot) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(rot || 0);
            switch (id) {
                case 'turkey':
                    ctx.fillStyle = '#f2ead8';                       // bone tips
                    circle(ctx, -r * 0.95, -r * 0.55, r * 0.2); circle(ctx, r * 0.95, -r * 0.55, r * 0.2);
                    ctx.fillStyle = '#8b4513';                       // drumsticks
                    ellipse(ctx, -r * 0.62, -r * 0.3, r * 0.34, r * 0.24);
                    ellipse(ctx, r * 0.62, -r * 0.3, r * 0.34, r * 0.24);
                    ctx.fillStyle = '#a0522d';                       // body
                    ellipse(ctx, 0, r * 0.08, r * 0.9, r * 0.66);
                    ctx.fillStyle = '#c87a3e';                       // shine
                    ellipse(ctx, -r * 0.2, -r * 0.12, r * 0.4, r * 0.22);
                    break;
                case 'ham':
                    ctx.fillStyle = '#f2ead8';
                    ctx.fillRect(r * 0.6, -r * 0.12, r * 0.5, r * 0.24);
                    ctx.fillStyle = '#b5523b';
                    ellipse(ctx, 0, 0, r * 0.82, r * 0.68);
                    ctx.fillStyle = '#e88a7a';
                    ellipse(ctx, -r * 0.08, -r * 0.05, r * 0.6, r * 0.48);
                    ctx.strokeStyle = '#a3402a';
                    ctx.lineWidth = Math.max(1, r * 0.06);
                    ctx.beginPath();
                    for (let i = -1; i <= 1; i++) {
                        ctx.moveTo(-r * 0.5 + i * r * 0.25, -r * 0.4); ctx.lineTo(r * 0.2 + i * r * 0.25, r * 0.4);
                        ctx.moveTo(r * 0.2 + i * r * 0.25, -r * 0.4); ctx.lineTo(-r * 0.5 + i * r * 0.25, r * 0.4);
                    }
                    ctx.stroke();
                    break;
                case 'leg':
                    ctx.fillStyle = '#f2ead8';
                    ctx.fillRect(r * 0.3, -r * 0.12, r * 0.7, r * 0.24);
                    circle(ctx, r * 1.0, -r * 0.16, r * 0.17); circle(ctx, r * 1.0, r * 0.16, r * 0.17);
                    ctx.fillStyle = '#9a4a1c';
                    ellipse(ctx, -r * 0.2, 0, r * 0.7, r * 0.5);
                    ctx.fillStyle = '#c4703a';
                    ellipse(ctx, -r * 0.35, -r * 0.15, r * 0.3, r * 0.15);
                    break;
                case 'yams':
                    for (let i = 0; i < 2; i++) {
                        const oy = (i - 0.5) * r * 0.62;
                        ctx.fillStyle = '#7a3a1a';
                        ellipse(ctx, i ? r * 0.12 : -r * 0.12, oy, r * 0.88, r * 0.34);
                        ctx.fillStyle = '#e8772e';
                        ellipse(ctx, i ? r * 0.12 : -r * 0.12, oy, r * 0.72, r * 0.26);
                    }
                    break;
                case 'beans':
                    ctx.strokeStyle = '#2f8a2f';
                    ctx.lineCap = 'round';
                    ctx.lineWidth = r * 0.26;
                    ctx.beginPath();
                    ctx.moveTo(-r * 0.8, -r * 0.4); ctx.quadraticCurveTo(0, -r * 0.6, r * 0.8, -r * 0.3);
                    ctx.moveTo(-r * 0.85, 0.05 * r); ctx.quadraticCurveTo(0, -r * 0.15, r * 0.85, r * 0.1);
                    ctx.moveTo(-r * 0.75, r * 0.5); ctx.quadraticCurveTo(0, r * 0.3, r * 0.75, r * 0.55);
                    ctx.stroke();
                    break;
                case 'rolls':
                    for (let i = 0; i < 2; i++) {
                        const ox = (i - 0.5) * r * 0.9;
                        ctx.fillStyle = '#c98a3e';
                        ellipse(ctx, ox, r * 0.05, r * 0.55, r * 0.5);
                        ctx.fillStyle = '#e8b064';
                        ellipse(ctx, ox - r * 0.08, -r * 0.1, r * 0.35, r * 0.24);
                    }
                    break;
                case 'mash':
                    ctx.fillStyle = '#5b6b8a';                       // bowl
                    ctx.beginPath(); ctx.ellipse(0, r * 0.15, r * 0.95, r * 0.6, 0, 0, Math.PI); ctx.fill();
                    ctx.fillStyle = '#f5ecd4';                       // potatoes
                    ellipse(ctx, 0, r * 0.1, r * 0.85, r * 0.55);
                    circle(ctx, 0, -r * 0.2, r * 0.45);
                    ctx.fillStyle = '#ffd84a';                       // butter
                    ctx.fillRect(-r * 0.18, -r * 0.55, r * 0.36, r * 0.26);
                    break;
                case 'cranberry':
                    ctx.fillStyle = '#9c1c2e';
                    ctx.fillRect(-r * 0.6, -r * 0.7, r * 1.2, r * 1.4);
                    ctx.fillStyle = '#c42a40';
                    ctx.fillRect(-r * 0.6, -r * 0.7, r * 0.35, r * 1.4);
                    ctx.fillStyle = '#7a1424';
                    for (let i = 1; i < 4; i++) ctx.fillRect(-r * 0.6, -r * 0.7 + i * r * 0.35, r * 1.2, r * 0.06);
                    break;
                case 'corn':
                    ctx.fillStyle = '#5c9a3a';                       // husk
                    ellipse(ctx, -r * 0.55, 0, r * 0.5, r * 0.3);
                    ctx.fillStyle = '#f2c230';
                    ellipse(ctx, r * 0.1, 0, r * 0.85, r * 0.38);
                    ctx.fillStyle = '#d9a514';
                    for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) ctx.fillRect(r * 0.1 + i * r * 0.28 - 1.5, j * r * 0.2 - 1.5, 3, 3);
                    break;
                case 'pumpkinpie':
                    ctx.fillStyle = '#c98a3e';                       // crust
                    ctx.beginPath(); ctx.moveTo(-r * 0.9, -r * 0.55); ctx.lineTo(r * 0.9, -r * 0.55); ctx.lineTo(0, r * 0.85); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = '#e07b24';
                    ctx.beginPath(); ctx.moveTo(-r * 0.7, -r * 0.38); ctx.lineTo(r * 0.7, -r * 0.38); ctx.lineTo(0, r * 0.65); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = '#fffaf0';                       // whipped cream
                    circle(ctx, 0, -r * 0.35, r * 0.28); circle(ctx, 0, -r * 0.6, r * 0.18);
                    break;
                case 'applepie':
                    ctx.fillStyle = '#b8742e';
                    circle(ctx, 0, 0, r * 0.9);
                    ctx.fillStyle = '#e6b866';
                    circle(ctx, 0, 0, r * 0.74);
                    ctx.strokeStyle = '#b8742e';
                    ctx.lineWidth = r * 0.14;
                    ctx.beginPath();
                    for (let i = -1; i <= 1; i++) {
                        ctx.moveTo(i * r * 0.36, -r * 0.68); ctx.lineTo(i * r * 0.36, r * 0.68);
                        ctx.moveTo(-r * 0.68, i * r * 0.36); ctx.lineTo(r * 0.68, i * r * 0.36);
                    }
                    ctx.stroke();
                    break;
                case 'pecanpie':
                    ctx.fillStyle = '#c98a3e';
                    circle(ctx, 0, 0, r * 0.9);
                    ctx.fillStyle = '#6b3410';
                    circle(ctx, 0, 0, r * 0.74);
                    ctx.fillStyle = '#9a5a26';
                    for (let i = 0; i < 7; i++) {
                        const a = i * 0.9, d = i ? r * 0.45 : 0;
                        ellipse(ctx, Math.cos(a) * d, Math.sin(a) * d, r * 0.17, r * 0.1);
                    }
                    break;
            }
            ctx.restore();
        },

        // Woven harvest basket. (x, y) = centre of the rim top; w/h = size.
        basketBack: function (ctx, x, y, w) {
            ctx.fillStyle = '#5e3a17';                               // inside shadow
            ellipse(ctx, x, y + 3, w * 0.46, 7);
        },
        basketFront: function (ctx, x, y, w, h, label) {
            const l = x - w / 2, r = x + w / 2;
            ctx.fillStyle = '#b07a3c';
            ctx.beginPath();
            ctx.moveTo(l, y); ctx.lineTo(r, y); ctx.lineTo(r - w * 0.12, y + h); ctx.lineTo(l + w * 0.12, y + h);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#8a5a26';                             // weave
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 1; i < 4; i++) { const yy = y + h * i / 4; ctx.moveTo(l + w * 0.03 * i, yy); ctx.lineTo(r - w * 0.03 * i, yy); }
            for (let i = 1; i < 6; i++) { const xx = l + w * i / 6; ctx.moveTo(xx, y); ctx.lineTo(x + (xx - x) * 0.76, y + h); }
            ctx.stroke();
            ctx.fillStyle = '#d29a55';                               // rim
            ctx.fillRect(l - 3, y - 4, w + 6, 8);
            if (label) {
                ctx.fillStyle = 'rgba(40,20,5,0.75)';
                ctx.fillRect(x - w * 0.46, y + h * 0.36, w * 0.92, 18);
                ctx.font = 'bold 11px "Trebuchet MS", Verdana, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#ffe9b0';
                ctx.fillText(label, x, y + h * 0.36 + 10);
            }
        },

        // Little heart (yum particles)
        heart: function (ctx, x, y, s, color) {
            ctx.fillStyle = color;
            circle(ctx, x - s * 0.5, y - s * 0.2, s * 0.55);
            circle(ctx, x + s * 0.5, y - s * 0.2, s * 0.55);
            ctx.beginPath();
            ctx.moveTo(x - s * 1.02, y); ctx.lineTo(x + s * 1.02, y); ctx.lineTo(x, y + s * 1.2);
            ctx.closePath();
            ctx.fill();
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
