'use strict';
/* Test scenarios. Each gets (h = helpers, assert). See run.js for helpers. */
module.exports = [
    {
        name: 'flow-menu-to-result',
        async run(h, assert) {
            await h.shot('01-menu');
            await h.tapButton('START');
            await h.waitState('maze');
            await h.shot('02-maze');

            await h.ev(() => G.States.go('rhythm'));
            await h.waitState('rhythm');
            await h.shot('03-rhythm');

            await h.ev(() => G.States.go('result', { win: false, reason: 'rhythm' }));
            await h.waitState('result');
            await h.shot('04-result-lose');
            await h.tapButton('RETRY DANCE-OFF');
            await h.waitState('rhythm');
            assert(await h.ev(() => G.Run.rhythmAttempts) === 2, 'retry increments attempts');

            await h.ev(() => G.States.go('result', { win: true }));
            await h.waitState('result');
            await h.shot('05-result-win');
            await h.tapButton('MAIN MENU');
            await h.waitState('menu');
        }
    },
    {
        name: 'perf-menu',
        async run(h, assert) {
            const p = await h.sampleFps(2500);
            // Headless rAF isn't vsync-capped, so judge by work time per frame.
            // Budget: 16.7ms/frame at 60fps; keep well under half of it.
            h.note('menu @4x CPU: ' + p.workMs + ' ms/frame work (' + p.fps + ' fps uncapped)');
            assert(p.workMs < 8, 'menu work < 8ms/frame (got ' + p.workMs + ')');
        }
    }
];
