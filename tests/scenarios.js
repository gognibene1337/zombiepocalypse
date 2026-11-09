'use strict';
/* Test scenarios. Each gets (h = helpers, assert). See run.js for helpers.
 * The page loads with ?seed=12345 so the maze is identical every run. */

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Start a run and wait for the maze. opts.noZombies clears them for input tests.
async function startMaze(h, opts = {}) {
    await h.tapButton('START');
    await h.waitState('maze');
    if (opts.noZombies) await h.ev(() => { G.States.current.zombies.length = 0; });
}

// Teleport Snake to tile (c, r)
function tp(h, c, r) {
    return h.ev((c, r) => {
        const s = G.States.current, p = s.p, T = s.T;
        p.c = p.tc = c; p.r = p.tr = r;
        p.x = c * T + T / 2; p.y = r * T + T / 2;
        p.moving = false; p.want = null; p.mode = 'hold';
    }, c, r);
}

const player = h => h.ev(() => { const p = G.States.current.p; return { c: p.c, r: p.r, x: p.x, y: p.y, moving: p.moving }; });

// First open direction from Snake's current tile
const openDir = h => h.ev(() => {
    const s = G.States.current, p = s.p;
    return G.Maze.DIR_NAMES.find(d => {
        const v = G.Maze.DIR_VEC[d];
        return G.Maze.isOpen(s.m, p.c + v[0], p.r + v[1]);
    });
});

const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

// Enter the dance-off with a shortened chart. setup(G) runs first in the page.
async function startRhythm(h, notes, setup) {
    await startMaze(h, { noZombies: true });
    await h.ev((n, setupSrc) => {
        G.States.list.rhythm.TEST_NOTES = n;
        if (setupSrc) (new Function('G', setupSrc))(G);
        G.States.go('rhythm');
    }, notes, setup || '');
    await h.waitState('rhythm');
    await h.page.waitForFunction(() => G.States.current.started, { timeout: 6000, polling: 50 });
}

// In-page autoplayer: dispatch key presses at each note's time (+offsetMs).
// wrong=true presses the opposite direction.
function autoplay(h, offsetMs, wrong) {
    return h.ev((offsetMs, wrong) => {
        const s = G.States.current;
        const CODES = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };
        const OPP = { left: 'right', right: 'left', up: 'down', down: 'up' };
        window.__lateness = [];
        s.notes.forEach(n => {
            const delay = (n.t - s.now()) * 1000 + offsetMs;
            setTimeout(() => {
                window.__lateness.push(Math.round((s.now() - n.t) * 1000));
                const code = CODES[wrong ? OPP[n.dir] : n.dir];
                window.dispatchEvent(new KeyboardEvent('keydown', { code }));
                window.dispatchEvent(new KeyboardEvent('keyup', { code }));
            }, delay);
        });
    }, offsetMs, !!wrong);
}

const resultInfo = h => h.ev(() => {
    const s = G.States.current;
    return { win: s.win, reason: s.reason, rhythm: s.rhythm, kits: G.Run.medkits, attempts: G.Run.rhythmAttempts };
});

module.exports = [
    {
        name: 'flow-menu-to-result',
        async run(h, assert) {
            await h.shot('01-menu');
            await startMaze(h);
            await h.ev(() => G.States.go('rhythm'));
            await h.waitState('rhythm');
            await h.shot('03-rhythm');
            await h.ev(() => G.States.go('result', { win: false, reason: 'rhythm' }));
            await h.waitState('result');
            await h.tapButton('RETRY DANCE-OFF');
            await h.waitState('rhythm');
            assert(await h.ev(() => G.Run.rhythmAttempts) === 2, 'retry increments attempts');
            await h.ev(() => G.States.go('result', { win: true }));
            await h.waitState('result');
            await h.tapButton('MAIN MENU');
            await h.waitState('menu');
        }
    },
    {
        name: 'menu-dance-off-shortcut',
        async run(h, assert) {
            await h.ev(() => { G.Run.medkits = 3; G.Run.health = 10; });   // leftovers from a previous run
            await h.tapButton('DANCE-OFF ▶');
            await h.waitState('rhythm');
            const r = await h.ev(() => ({ hp: G.Run.health, kits: G.Run.medkits }));
            assert(r.hp === 100 && r.kits === 0, 'shortcut starts a fresh run');
            await h.page.waitForFunction(() => G.States.current.started, { timeout: 6000, polling: 50 });
            assert(await h.ev(() => G.States.current.useTrack), 'dance track plays');
        }
    },
    {
        // Real browsers: audio only unlocks after a gesture. Tap the menu like a player.
        name: 'autoplay-dance-off-plays-track',
        realAutoplay: true,
        async run(h, assert) {
            await h.tapButton('DANCE-OFF ▶');
            await h.waitState('rhythm');
            await h.page.waitForFunction(() => G.States.current.started, { timeout: 8000, polling: 50 });
            const r = await h.ev(() => ({
                ctx: G.Audio.ctx && G.Audio.ctx.state, track: G.Audio.trackState('dance'),
                useAudio: G.States.current.useAudio, useTrack: G.States.current.useTrack
            }));
            h.note(JSON.stringify(r));
            assert(r.useTrack, 'dance track plays after tapping DANCE-OFF from a cold start');
        }
    },
    {
        name: 'autoplay-maze-music-plays',
        realAutoplay: true,
        async run(h, assert) {
            await h.tapButton('START');
            await h.waitState('maze');
            await h.page.waitForFunction(() => G.Audio.loopInfo() !== null, { timeout: 8000, polling: 100 });
            assert(await h.ev(() => G.Audio.ctx.state) === 'running', 'audio running in the maze');
        }
    },
    {
        name: 'cat-pump-high-score-and-presents',
        async run(h, assert) {
            await h.ev(() => localStorage.removeItem('spe.catHigh.v1'));
            await h.tapButton('CAT PUMP');
            await h.waitState('cat');
            const cat = await h.ev(() => G.States.current.cat);
            await h.shot('40-cat-ready');

            // Round 1: first tap starts the clock; 5 pumps
            for (let i = 0; i < 5; i++) await h.tap(cat.x + (i % 2 ? 20 : -20), cat.y);
            let s = await h.ev(() => ({ phase: G.States.current.phase, count: G.States.current.count }));
            assert(s.phase === 'play' && s.count === 5, 'taps on the cat count (' + JSON.stringify(s) + ')');
            await h.tap(30, 760);                                   // off the cat: ignored
            assert(await h.ev(() => G.States.current.count) === 5, 'taps off the cat do not count');
            const tl = await h.ev(() => G.States.current.timeLeft);
            assert(tl < 60 && tl > 55, 'clock is running (' + tl.toFixed(2) + 's left)');

            await h.ev(() => { G.States.current.timeLeft = 0.05; });  // fast-forward to the end
            await h.page.waitForFunction(() => G.States.current.phase === 'done', { timeout: 3000 });
            s = await h.ev(() => ({ high: G.States.current.high, nh: G.States.current.newHigh,
                presents: G.States.current.presents.length, saved: localStorage.getItem('spe.catHigh.v1') }));
            assert(s.high === 5 && s.nh && s.saved === '5', 'first round sets best = 5 and saves it');
            assert(s.presents > 0, 'presents fly on a new best');
            await sleep(250);
            await h.shot('41-cat-first-best');

            // Round 2: passing the old best (5) triggers presents mid-round
            await sleep(700);                                       // button lock after time's up
            await h.tapButton('PLAY AGAIN');
            await h.waitState('cat');
            for (let i = 0; i < 5; i++) await h.tap(cat.x, cat.y);
            assert(await h.ev(() => G.States.current.presents.length) === 0, 'no presents while still below best');
            await h.tap(cat.x, cat.y);                              // 6th pump beats 5
            s = await h.ev(() => ({ nh: G.States.current.newHigh, presents: G.States.current.presents.length, phase: G.States.current.phase }));
            assert(s.nh && s.presents > 0 && s.phase === 'play', 'beating the best mid-round launches presents');
            const k = await h.ev(() => ({
                sprite: !!G.Kiwi.sprite, pop: G.States.current.kiwiT,
                flying: G.States.current.presents.filter(p => p.kiwi).length
            }));
            h.note('Kiwi: big pop-up ' + k.pop.toFixed(1) + 's, ' + k.flying + ' flying Kiwis');
            assert(k.sprite, "Kiwi's photo loaded");
            assert(k.pop > 0, 'big Kiwi pops up on a new best');
            assert(k.flying > 0, 'some flying presents are Kiwi photos');
            await sleep(200);
            await h.shot('42-cat-live-celebration');
            await h.ev(() => { G.States.current.timeLeft = 0.05; });
            await h.page.waitForFunction(() => G.States.current.phase === 'done', { timeout: 3000 });
            assert(await h.ev(() => localStorage.getItem('spe.catHigh.v1')) === '6', 'new best 6 saved');

            // Round 3: lower score keeps the best
            await sleep(900);
            await h.tapButton('PLAY AGAIN');
            await h.waitState('cat');
            await h.tap(cat.x, cat.y);
            await h.ev(() => { G.States.current.timeLeft = 0.05; });
            await h.page.waitForFunction(() => G.States.current.phase === 'done', { timeout: 3000 });
            s = await h.ev(() => ({ nh: G.States.current.newHigh, saved: localStorage.getItem('spe.catHigh.v1') }));
            assert(!s.nh && s.saved === '6', 'lower score keeps best at 6');
            await h.shot('43-cat-done');
            await sleep(900);
            await h.tapButton('MAIN MENU');
            await h.waitState('menu');
        }
    },
    {
        name: 'cat-pump-music-and-pause',
        async run(h, assert) {
            await h.tapButton('CAT PUMP');
            await h.waitState('cat');
            await h.page.waitForFunction(() => G.Audio.loopInfo() !== null, { timeout: 6000, polling: 100 });
            const info = await h.ev(() => G.Audio.loopInfo());
            assert(info.name === 'santa', 'Santa track loops in the bonus game');
            const cat = await h.ev(() => G.States.current.cat);
            await h.tap(cat.x, cat.y);
            await h.key('Escape');
            await sleep(100);
            const t1 = await h.ev(() => G.States.current.timeLeft);
            await sleep(800);
            const t2 = await h.ev(() => G.States.current.timeLeft);
            assert(Math.abs(t2 - t1) < 0.001, 'clock frozen while paused');
            await h.tapButton('QUIT TO MENU');
            await h.waitState('menu');
            assert(await h.ev(() => G.Audio.loopInfo()) === null, 'music stops on leaving');
        }
    },
    {
        name: 'perf-cat-celebration',
        async run(h, assert) {
            await h.tapButton('CAT PUMP');
            await h.waitState('cat');
            await h.ev(() => { const s = G.States.current; s.celebrate(); s.burst(80); s.rainT = 10; });
            const p = await h.sampleFps(2500);
            h.note('cat + presents @4x CPU: ' + p.workMs + ' ms/frame work');
            assert(p.workMs < 8, 'celebration work < 8ms/frame (got ' + p.workMs + ')');
        }
    },
    {
        name: 'feast-every-basket-reachable',
        async run(h, assert) {
            await h.tapButton('FEAST FLING');
            await h.waitState('feast');
            const r = await h.ev(() => {
                const s = G.States.current;
                return s.baskets.map((b, i) => ({ course: b.course, aim: s.aimFor(i) }));
            });
            h.note(r.map(b => b.course + (b.aim ? ' ok' : ' UNREACHABLE')).join(', '));
            assert(r.every(b => b.aim), 'every basket can be hit');
            const seq = await h.ev(() => G.States.current.seq.map(id => G.FOODS[id].course));
            assert(seq.length === 10, '10 items per game');
            ['main', 'sides', 'dessert'].forEach(c => assert(seq.filter(x => x === c).length >= 3, 'at least 3 ' + c));
            await h.shot('50-feast-start');
        }
    },
    {
        name: 'feast-full-game-yum-wrong-miss',
        async run(h, assert) {
            await h.ev(() => localStorage.removeItem('spe.feastHigh.v1'));
            await h.tapButton('FEAST FLING');
            await h.waitState('feast');
            const waitAim = () => h.page.waitForFunction(() => G.States.current.phase === 'aim' || G.States.current.phase === 'done', { timeout: 8000, polling: 50 });
            const courseIdx = (wantCorrect) => h.ev(wc => {
                const s = G.States.current, c = G.FOODS[s.seq[s.idx]].course;
                return s.baskets.findIndex(b => wc ? b.course === c : b.course !== c);
            }, wantCorrect);

            // Shot 1: a real touch drag-and-release into the correct basket
            const bi = await courseIdx(true);
            const pull = await h.ev(i => G.States.current.aimFor(i), bi);
            const a = await h.ev(() => G.States.current.anchor);
            const p0 = await h.toPage(a.x, a.y);
            await h.page.touchscreen.touchStart(p0.x, p0.y);
            for (let k = 1; k <= 6; k++) {
                const pk = await h.toPage(a.x + pull.x * k / 6, a.y + pull.y * k / 6);
                await h.page.touchscreen.touchMove(pk.x, pk.y);
            }
            await sleep(120);
            await h.shot('51-feast-aiming');
            await h.page.touchscreen.touchEnd();
            await h.page.waitForFunction(() => G.States.current.results.length === 1, { timeout: 6000, polling: 30 });
            let s = await h.ev(() => ({ r: G.States.current.results[0], score: G.States.current.score, yum: !!G.States.current.yum,
                hearts: G.States.current.parts.filter(p => p.kind === 'heart').length }));
            assert(s.r === 'yum' && s.score === 1, 'drag-and-release into the right basket scores (' + JSON.stringify(s) + ')');
            assert(s.yum && s.hearts > 0, 'yum animation plays');
            await sleep(250);
            await h.shot('52-feast-yum');

            // Shot 2: wrong basket
            await waitAim();
            const wi = await courseIdx(false);
            await h.ev(i => { const s = G.States.current, p = s.aimFor(i); s.launch(p.x, p.y); }, wi);
            await h.page.waitForFunction(() => G.States.current.results.length === 2, { timeout: 6000, polling: 30 });
            assert(await h.ev(() => G.States.current.results[1]) === 'wrong', 'wrong basket is marked wrong');
            await sleep(150);
            await h.shot('53-feast-wrong');

            // Shot 3: fling it backwards off-screen
            await waitAim();
            await h.ev(() => G.States.current.launch(40, -10));
            await h.page.waitForFunction(() => G.States.current.results.length === 3, { timeout: 6000, polling: 30 });
            assert(await h.ev(() => G.States.current.results[2]) === 'miss', 'off-screen shot is a miss');

            // Shots 4-10: all correct
            for (let n = 4; n <= 10; n++) {
                await waitAim();
                const ci = await courseIdx(true);
                await h.ev(i => { const s = G.States.current, p = s.aimFor(i); s.launch(p.x, p.y); }, ci);
                await h.page.waitForFunction(k => G.States.current.results.length === k, { timeout: 6000, polling: 30 }, n);
            }
            await h.page.waitForFunction(() => G.States.current.phase === 'done', { timeout: 6000, polling: 50 });
            s = await h.ev(() => ({ score: G.States.current.score, res: G.States.current.results.join(','),
                saved: localStorage.getItem('spe.feastHigh.v1'), filled: G.States.current.baskets.map(b => b.contents.length) }));
            h.note('results: ' + s.res + '  baskets hold ' + s.filled.join('/'));
            assert(s.score === 8 && s.saved === '8', 'final score 8/10 saved as best');
            await sleep(300);
            await h.shot('54-feast-done');
            await sleep(600);
            await h.tapButton('MAIN MENU');
            await h.waitState('menu');
        }
    },
    {
        name: 'feast-music-and-pause',
        async run(h, assert) {
            await h.tapButton('FEAST FLING');
            await h.waitState('feast');
            await h.page.waitForFunction(() => G.Audio.loopInfo() !== null, { timeout: 6000, polling: 100 });
            assert(await h.ev(() => G.Audio.loopInfo().name) === 'harvest', 'harvest track loops');
            await h.ev(() => { const s = G.States.current, p = s.aimFor(0); s.launch(p.x, p.y); });
            await sleep(150);
            await h.key('Escape');
            await sleep(100);
            const y1 = await h.ev(() => G.States.current.proj && G.States.current.proj.y);
            await sleep(500);
            const y2 = await h.ev(() => G.States.current.proj && G.States.current.proj.y);
            assert(y1 != null && y1 === y2, 'food freezes mid-air while paused');
            await h.tapButton('QUIT TO MENU');
            await h.waitState('menu');
            assert(await h.ev(() => G.Audio.loopInfo()) === null, 'music stops on leaving');
        }
    },
    {
        name: 'perf-feast-aiming',
        async run(h, assert) {
            await h.tapButton('FEAST FLING');
            await h.waitState('feast');
            // Hold an aim so the preview arc is simulated every frame
            await h.ev(() => { const s = G.States.current; s.aiming = true; s.pull.x = -60; s.pull.y = 60; });
            const a = await h.ev(() => G.States.current.anchor);
            const p0 = await h.toPage(a.x - 60, a.y + 60);
            await h.page.touchscreen.touchStart(p0.x, p0.y);
            const p = await h.sampleFps(2500);
            await h.page.touchscreen.touchEnd();
            h.note('feast aiming @4x CPU: ' + p.workMs + ' ms/frame work');
            assert(p.workMs < 8, 'feast work < 8ms/frame (got ' + p.workMs + ')');
        }
    },
    {
        // Dance-off 60%+ -> Feast Fling starts by itself -> 80%+ -> Cat Pump starts by itself
        name: 'bonus-chain-dance-feast-cat',
        async run(h, assert) {
            await startRhythm(h, 8);
            await autoplay(h, 0);
            await h.waitState('result', 20000);
            const r = await h.ev(() => ({ bonus: G.States.current.bonus, acc: G.States.current.rhythm.acc,
                label: G.States.current.buttons[0].label }));
            assert(r.bonus && r.acc >= 0.6, 'dance-off 60%+ unlocks the bonus (acc ' + r.acc + ')');
            assert(r.label === 'FEAST FLING ▶', 'result offers Feast Fling');
            await sleep(1200);
            await h.shot('60-bonus-unlocked');
            await h.waitState('feast', 8000);                            // no tap: auto-start

            // Finish Feast Fling with 8/10
            await h.ev(() => {
                const s = G.States.current;
                s.score = 8; s.idx = 9; s.results = ['yum','yum','yum','yum','yum','yum','yum','yum','miss','wrong'];
                s.next();
            });
            const f = await h.ev(() => ({ bonus: G.States.current.bonus, label: G.States.current.buttons[0].label }));
            assert(f.bonus && f.label === 'CAT PUMP ▶', 'Feast Fling 8/10 unlocks Cat Pump');
            await sleep(1200);
            await h.shot('61-cat-unlocked');
            await h.waitState('cat', 8000);                              // no tap: auto-start
        }
    },
    {
        name: 'bonus-chain-thresholds',
        async run(h, assert) {
            // Failed the dance-off at 55%: retry, no bonus
            await h.ev(() => G.States.go('result', { win: false, reason: 'rhythm',
                rhythm: { perfect: 4, great: 2, miss: 4, saved: 0, acc: 0.52, maxCombo: 3, total: 10 } }));
            await h.waitState('result');
            let r = await h.ev(() => ({ bonus: G.States.current.bonus, label: G.States.current.buttons[0].label }));
            assert(!r.bonus && r.label === 'RETRY DANCE-OFF', 'a failed dance-off gives no bonus');
            // Exactly 60% (the pass mark) unlocks
            await h.ev(() => G.States.go('result', { win: true, reason: 'rhythm',
                rhythm: { perfect: 6, great: 0, miss: 4, saved: 0, acc: 0.6, maxCombo: 6, total: 10 } }));
            await h.page.waitForFunction(() => G.States.current.rhythm && G.States.current.rhythm.acc === 0.6 && !G.States.busy(), { timeout: 3000 });
            assert(await h.ev(() => G.States.current.bonus), 'exactly 60% unlocks the bonus');
            // Tapping the button skips the countdown
            await h.tapButton('FEAST FLING ▶');
            await h.waitState('feast', 3000);
            // Feast Fling 6/10: no Cat Pump
            await h.ev(() => { const s = G.States.current; s.score = 6; s.idx = 9; s.next(); });
            r = await h.ev(() => ({ bonus: G.States.current.bonus, label: G.States.current.buttons[0].label }));
            assert(!r.bonus && r.label === 'PLAY AGAIN', '6/10 does not unlock Cat Pump');
            await sleep(4500);
            assert(await h.ev(() => G.States.name) === 'feast', 'no auto-start without the unlock');
            // Feast Fling exactly 7/10: Cat Pump
            await h.tapButton('PLAY AGAIN');
            await h.waitState('feast', 3000);
            await h.ev(() => { const s = G.States.current; s.score = 7; s.idx = 9; s.next(); });
            r = await h.ev(() => ({ bonus: G.States.current.bonus, label: G.States.current.buttons[0].label }));
            assert(r.bonus && r.label === 'CAT PUMP ▶', 'exactly 7/10 unlocks Cat Pump');
            await h.waitState('cat', 8000);
        }
    },
    {
        name: 'maze-generation',
        async run(h, assert) {
            await startMaze(h);
            const info = await h.ev(() => {
                const s = G.States.current, m = s.m;
                G.Maze.bfs(m, m.start.c, m.start.r);
                const zOnStart = s.zombies.some(z => Math.abs(z.r - m.start.r) < 10);
                return {
                    solvable: G.Maze.distAt(m, m.exit.c, m.exit.r) > 0,
                    pathLen: G.Maze.distAt(m, m.exit.c, m.exit.r),
                    kits: s.kits.length, zombies: s.zombies.length,
                    kitsReachable: s.kits.every(k => G.Maze.distAt(m, k.c, k.r) > 0),
                    zOnStart
                };
            });
            h.note('path start->gate: ' + info.pathLen + ' tiles, kits ' + info.kits + ', zombies ' + info.zombies);
            assert(info.solvable, 'gate reachable from start');
            assert(info.kitsReachable, 'all med-kits reachable');
            assert(info.kits >= 4, 'at least 4 med-kits');
            assert(info.zombies >= 6, 'at least 6 zombies');
            assert(!info.zOnStart, 'no zombie spawns near the start');
            await h.shot('10-maze-start');
        }
    },
    {
        name: 'maze-swipe-moves',
        async run(h, assert) {
            await startMaze(h, { noZombies: true });
            const dir = await openDir(h);
            const a = await player(h);
            await h.swipe(dir, 100, 500);
            await sleep(500);
            const b = await player(h);
            assert(a.x !== b.x || a.y !== b.y, 'swipe ' + dir + ' moved Snake');
            await sleep(1500);
            const c = await player(h);
            assert(c.x !== b.x || c.y !== b.y || !c.moving, 'swipe keeps moving until blocked');
        }
    },
    {
        name: 'maze-keyboard-hold-and-stop',
        async run(h, assert) {
            await startMaze(h, { noZombies: true });
            const dir = await openDir(h);
            const a = await player(h);
            await h.key(KEY[dir], 350);
            await sleep(400);
            const b = await player(h);
            assert(a.x !== b.x || a.y !== b.y, 'held key moved Snake');
            assert(!b.moving, 'Snake stops after key release');
            assert((b.x - 12) % 24 === 0 && (b.y - 12) % 24 === 0, 'stops on a tile centre');
        }
    },
    {
        name: 'maze-dpad',
        async run(h, assert) {
            assert(await h.ev(() => G.Settings.dpad) === true, 'd-pad is ON when the app starts');
            await h.tapButton('D-PAD: ON');
            assert(await h.ev(() => G.Settings.dpad) === false, 'menu button turns it off');
            await h.tapButton('D-PAD: OFF');
            assert(await h.ev(() => G.Settings.dpad) === true, 'and back on');
            await startMaze(h, { noZombies: true });
            const dir = await openDir(h);
            const pos = await h.ev(d => {
                const s = G.States.current, v = G.Maze.DIR_VEC[d];
                return { x: s.dpad.x + v[0] * s.dpad.r * 0.6, y: s.dpad.y + v[1] * s.dpad.r * 0.6 };
            }, dir);
            const a = await player(h);
            const pp = await h.toPage(pos.x, pos.y);
            await h.page.touchscreen.touchStart(pp.x, pp.y);
            await sleep(400);
            await h.shot('11-maze-dpad');
            await h.page.touchscreen.touchEnd();
            await sleep(300);
            const b = await player(h);
            assert(a.x !== b.x || a.y !== b.y, 'd-pad ' + dir + ' moved Snake');
            assert(!b.moving, 'stops after releasing d-pad');
        }
    },
    {
        name: 'maze-pickup-and-heal',
        async run(h, assert) {
            await startMaze(h, { noZombies: true });
            const k = await h.ev(() => G.States.current.kits[0]);
            await h.ev(() => { G.Run.health = 50; });
            await tp(h, k.c, k.r);
            await sleep(150);
            let r0 = await h.ev(() => ({ hp: G.Run.health, kits: G.Run.medkits }));
            assert(r0.kits === 1, 'picked up a med-kit');
            assert(r0.hp === 70, 'pickup restores 20% health instantly (50 -> ' + r0.hp + ')');
            await h.shot('12-maze-pickup');

            // At 90 HP a pickup only tops up to 100 (no overheal)
            const k2 = await h.ev(() => G.States.current.kits[1]);
            await h.ev(() => { G.Run.health = 90; });
            await tp(h, k2.c, k2.r);
            await sleep(150);
            r0 = await h.ev(() => ({ hp: G.Run.health, kits: G.Run.medkits }));
            assert(r0.hp === 100 && r0.kits === 2, 'pickup heal caps at max health (hp ' + r0.hp + ')');
            await h.ev(() => { G.Run.medkits = 1; });
            await h.ev(() => { G.Run.health = 50; });
            await h.key('KeyH');
            await sleep(100);
            const r = await h.ev(() => ({ hp: G.Run.health, kits: G.Run.medkits }));
            assert(r.hp === 85 && r.kits === 0, 'H heals 35 using one kit (hp ' + r.hp + ')');
        }
    },
    {
        name: 'maze-zombie-hit-iframes',
        async run(h, assert) {
            await startMaze(h);
            await h.ev(() => {
                const s = G.States.current, z = s.zombies[0], p = s.p;
                s.zombies.length = 1;
                z.c = z.tc = p.c; z.r = z.tr = p.r; z.x = p.x; z.y = p.y; z.moving = false;
            });
            await sleep(200);
            const hp1 = await h.ev(() => G.Run.health);
            assert(hp1 === 80, 'zombie contact deals 20 (hp ' + hp1 + ')');
            await h.shot('13-maze-hit');
            await sleep(300);
            assert(await h.ev(() => G.Run.health) === 80, 'no extra damage during invulnerability');
        }
    },
    {
        name: 'maze-death-to-bitten',
        async run(h, assert) {
            await startMaze(h);
            await h.ev(() => {
                G.Run.health = 20;
                const s = G.States.current, z = s.zombies[0], p = s.p;
                z.c = z.tc = p.c; z.r = z.tr = p.r; z.x = p.x; z.y = p.y;
            });
            await h.waitState('result');
            assert(await h.ev(() => G.States.current.reason) === 'maze', 'death -> BITTEN screen');
            await h.tapButton('TRY AGAIN');
            await h.waitState('maze');
            assert(await h.ev(() => G.Run.health) === 100, 'try again resets health');
        }
    },
    {
        name: 'maze-zombie-chases',
        async run(h, assert) {
            await startMaze(h);
            // Put a zombie 5 path-steps from Snake (using the BFS field)
            const start = await h.ev(() => {
                const s = G.States.current, m = s.m;
                s.zombies.length = 1;
                const z = s.zombies[0];
                G.Maze.bfs(m, s.p.c, s.p.r);
                for (let r = 1; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
                    if (G.Maze.distAt(m, c, r) === 5) {
                        z.c = z.tc = c; z.r = z.tr = r; z.x = c * 24 + 12; z.y = r * 24 + 12; z.moving = false;
                        return 5;
                    }
                }
                return -1;
            });
            assert(start === 5, 'placed zombie 5 steps away');
            await sleep(700);
            const r = await h.ev(() => {
                const s = G.States.current, z = s.zombies[0];
                return { chasing: z.chasing, hp: G.Run.health, d: G.Maze.distAt(s.m, z.c, z.r) };
            });
            assert(r.chasing || r.hp < 100, 'zombie switched to chase');
            assert(r.d < 5 || r.hp < 100, 'zombie closed the distance (d=' + r.d + ')');
        }
    },
    {
        name: 'maze-reach-gate',
        async run(h, assert) {
            await startMaze(h, { noZombies: true });
            const ex = await h.ev(() => G.States.current.m.exit);
            await tp(h, ex.c, 1);
            await sleep(100);
            await h.shot('14-maze-gate');
            await h.key('ArrowUp', 300);
            await h.waitState('rhythm');
        }
    },
    {
        name: 'rhythm-autoplay-passes',
        async run(h, assert) {
            await startRhythm(h, 12);
            const clock = await h.ev(() => ({ audio: G.States.current.useAudio, lat: G.States.current.lat }));
            h.note('audio clock: ' + clock.audio + ', output latency ' + Math.round(clock.lat * 1000) + 'ms');
            await autoplay(h, 0);
            await sleep(3200);
            await h.shot('20-rhythm-play');
            await h.waitState('result', 20000);
            const r = await resultInfo(h);
            const late = await h.ev(() => window.__lateness);
            h.note('timer lateness (ms): ' + late.join(' '));
            h.note('result: ' + JSON.stringify(r.rhythm));
            await h.shot('21-rhythm-win');
            assert(r.win === true, 'perfect autoplay passes');
            assert(r.rhythm.perfect + r.rhythm.great === 12, 'all 12 notes hit');
        }
    },
    {
        name: 'maze-music-loops-and-stops',
        async run(h, assert) {
            await startMaze(h, { noZombies: true });
            await h.page.waitForFunction(() => G.Audio.loopInfo() !== null, { timeout: 6000, polling: 100 });
            const a = await h.ev(() => ({
                info: G.Audio.loopInfo(), now: G.Audio.ctx.currentTime, state: G.Audio.trackState('maze')
            }));
            h.note('maze music ' + a.state + ', copies scheduled ' + a.info.copies + ', next repeat in ' + (a.info.next - a.now).toFixed(1) + 's');
            assert(a.info.name === 'maze' && a.info.playing >= 1, 'maze loop is playing');
            // Next copy is scheduled to overlap the previous one's fade-out
            const gap = a.info.next - a.now;
            assert(gap > 30 && gap < 39.96 - 1.2 + 0.1, 'next repeat starts before the track ends (in ' + gap.toFixed(1) + 's)');

            // Pausing suspends the audio clock (music pauses with it)
            await h.key('Escape');
            await sleep(300);
            assert(await h.ev(() => G.Audio.ctx.state) === 'suspended', 'pause suspends music');
            await h.tapButton('RESUME');
            await sleep(300);
            assert(await h.ev(() => G.Audio.ctx.state) === 'running', 'resume restarts music');

            // Leaving the maze stops the loop; the dance track takes over
            await h.ev(() => { G.States.list.rhythm.TEST_NOTES = 4; G.States.go('rhythm'); });
            await h.waitState('rhythm');
            assert(await h.ev(() => G.Audio.loopInfo()) === null, 'maze music stops at the dance-off');
        }
    },
    {
        name: 'maze-music-chains-copies',
        async run(h, assert) {
            await startMaze(h, { noZombies: true });
            await h.page.waitForFunction(() => G.Audio.loopInfo() !== null, { timeout: 6000, polling: 100 });
            // Restart the loop with a huge overlap so the 2nd copy gets scheduled right away
            const r = await h.ev(() => {
                G.Audio.startLoop('maze', 1.2, 39.8);
                G.Audio.updateLoop();
                return G.Audio.loopInfo();
            });
            assert(r.copies >= 2 && r.playing >= 2, 'consecutive copies chain without a gap (copies ' + r.copies + ')');
        }
    },
    {
        name: 'rhythm-idle-fails-and-retry',
        async run(h, assert) {
            await startRhythm(h, 6);
            await h.waitState('result', 20000);
            const r = await resultInfo(h);
            await h.shot('22-rhythm-fail');
            assert(r.win === false && r.reason === 'rhythm', 'no input fails the dance-off');
            assert(r.rhythm.miss === 6, 'all 6 notes missed (got ' + r.rhythm.miss + ')');
            await h.tapButton('RETRY DANCE-OFF');
            await h.waitState('rhythm');
            assert(await h.ev(() => G.Run.rhythmAttempts) === 2, 'retry counts as attempt 2');
        }
    },
    {
        name: 'rhythm-wrong-direction-misses',
        async run(h, assert) {
            await startRhythm(h, 6);
            await autoplay(h, 0, true);
            await h.waitState('result', 20000);
            const r = await resultInfo(h);
            assert(r.rhythm.miss === 6 && !r.win, 'wrong-way swipes are misses');
        }
    },
    {
        name: 'rhythm-medkits-forgive-misses',
        async run(h, assert) {
            await startRhythm(h, 4, 'G.Run.medkits = 2;');
            await h.waitState('result', 20000);
            const r = await resultInfo(h);
            assert(r.rhythm.saved === 2 && r.rhythm.miss === 2, 'two misses saved by med-kits');
            assert(r.kits === 0, 'med-kits consumed');
        }
    },
    {
        name: 'rhythm-adaptive-tempo',
        async run(h, assert) {
            await startRhythm(h, 0, 'G.Run.health = 40;');
            const r = await h.ev(() => {
                const s = G.States.current;
                return { mul: s.tempoMul, spb: s.beats[1].spb, rate: s.source && s.source.playbackRate.value };
            });
            h.note('health 40 -> tempo x' + r.mul.toFixed(2) + ', beat ' + Math.round(r.spb * 1000) + 'ms, playbackRate ' + r.rate);
            assert(Math.abs(r.mul - 1.09) < 0.001, 'tempo +9% at 40 health');
            assert(Math.abs(r.rate - r.mul) < 0.001, 'track playbackRate matches tempo');
            assert(Math.abs(r.spb - 60 / 133.08 / 1.09) < 0.001, 'beat grid scaled by tempo');
        }
    },
    {
        name: 'rhythm-uses-track-left-right',
        async run(h, assert) {
            await startRhythm(h, 0);
            const r = await h.ev(() => {
                const s = G.States.current, T = G.TRACKS.dance, spb = 60 / T.bpm;
                // Every note must sit exactly on a beat of the track's grid
                const offGrid = s.notes.filter(n => {
                    const k = (n.t * s.tempoMul - T.firstBeat) / spb;
                    return Math.abs(k - Math.round(k)) > 1e-6;
                }).length;
                return {
                    track: s.useTrack, state: G.Audio.trackState('dance'), n: s.notes.length,
                    dirs: [...new Set(s.notes.map(n => n.dir))].sort().join(','),
                    offGrid, playing: !!s.source, end: s.endT
                };
            });
            h.note('track ' + r.state + ', ' + r.n + ' notes, dirs ' + r.dirs + ', song ' + r.end.toFixed(1) + 's');
            assert(r.track && r.playing, 'recorded track is playing');
            assert(r.dirs === 'left,right', 'only left/right notes');
            assert(r.offGrid === 0, 'all notes on the beat grid');
            await sleep(4500);
            await h.shot('23-rhythm-track');
        }
    },
    {
        name: 'rhythm-ignores-up-down',
        async run(h, assert) {
            await startRhythm(h, 4);
            const n0 = await h.ev(() => { const s = G.States.current; return (s.notes[0].t - s.now()) * 1000; });
            await sleep(Math.max(0, n0 - 20));
            await h.key('ArrowUp');
            await h.key('ArrowDown');
            await sleep(60);
            const r = await h.ev(() => G.States.current.notes[0].result);
            assert(r === null || r === 'miss', 'up/down swipes do not count as hits (got ' + r + ')');
        }
    },
    {
        name: 'rhythm-file-url-falls-back-to-synth',
        file: true,
        async run(h, assert) {
            await startRhythm(h, 6);
            const r = await h.ev(() => ({ track: G.States.current.useTrack, state: G.Audio.trackState('dance') }));
            assert(!r.track && r.state === 'unavailable', 'file:// uses synth beat (state ' + r.state + ')');
            await autoplay(h, 0);
            await h.waitState('result', 20000);
            assert((await resultInfo(h)).win, 'synth fallback is playable');
        }
    },
    {
        name: 'rhythm-swipe-input',
        async run(h, assert) {
            await startRhythm(h, 4);
            // Wait until the first note is ~20ms away, then swipe it
            const n0 = await h.ev(() => { const s = G.States.current; return { dir: s.notes[0].dir, wait: (s.notes[0].t - s.now()) * 1000 }; });
            await sleep(Math.max(0, n0.wait - 60));
            await h.swipe(n0.dir, 180, 600);
            await sleep(200);
            const res = await h.ev(() => G.States.current.notes[0].result);
            h.note('first note via touch swipe: ' + res);
            assert(res === 'perfect' || res === 'great', 'touch swipe hit the note (got ' + res + ')');
        }
    },
    {
        name: 'full-run-maze-to-escape',
        async run(h, assert) {
            await startMaze(h, { noZombies: true });
            const ex = await h.ev(() => G.States.current.m.exit);
            await tp(h, ex.c, 1);
            await h.ev(() => { G.States.list.rhythm.TEST_NOTES = 8; });
            await h.key('ArrowUp', 300);
            await h.waitState('rhythm');
            await autoplay(h, 0);
            await h.waitState('result', 20000);
            const r = await resultInfo(h);
            assert(r.win, 'reached gate and won the dance-off');
        }
    },
    {
        name: 'perf-rhythm',
        async run(h, assert) {
            await startRhythm(h, 0);
            await autoplay(h, 0);
            await sleep(2500);
            const p = await h.sampleFps(3000);
            h.note('rhythm @4x CPU: ' + p.workMs + ' ms/frame work (' + p.fps + ' fps uncapped)');
            assert(p.workMs < 8, 'rhythm work < 8ms/frame (got ' + p.workMs + ')');
        }
    },
    {
        name: 'pause-maze-resume-quit',
        async run(h, assert) {
            await startMaze(h, { noZombies: true });
            const pr = await h.ev(() => G.States.pauseRect());
            await h.tap(pr.x + pr.w / 2, pr.y + pr.h / 2);
            assert(await h.ev(() => G.States.paused), 'HUD pause button pauses');
            await h.shot('30-paused');
            const dir = await openDir(h);
            const a = await player(h);
            await h.key(KEY[dir], 300);
            const b = await player(h);
            assert(a.x === b.x && a.y === b.y, 'no movement while paused');
            await h.tapButton('RESUME');
            assert(!(await h.ev(() => G.States.paused)), 'resume unpauses');
            await h.key('Escape');
            await sleep(100);
            assert(await h.ev(() => G.States.paused), 'Esc pauses too');
            await h.tapButton('QUIT TO MENU');
            await h.waitState('menu');
        }
    },
    {
        name: 'pause-rhythm-freezes-clock',
        async run(h, assert) {
            await startRhythm(h, 6);
            await sleep(500);
            await h.key('Escape');
            await sleep(300);
            const t1 = await h.ev(() => G.States.current.songT);
            await sleep(1000);
            const t2 = await h.ev(() => G.States.current.songT);
            assert(Math.abs(t2 - t1) < 0.05, 'song clock frozen while paused (moved ' + (t2 - t1).toFixed(3) + 's)');
            await h.tapButton('RESUME');
            await sleep(500);
            const t3 = await h.ev(() => G.States.current.songT);
            assert(t3 > t2 + 0.2, 'song clock runs again after resume');
            await autoplay(h, 0);
            await h.waitState('result', 20000);
            const r = await resultInfo(h);
            assert(r.win, 'can still win after pause/resume (' + JSON.stringify(r.rhythm) + ')');
        }
    },
    {
        name: 'perf-maze',
        async run(h, assert) {
            await startMaze(h);
            // Keep Snake walking so the camera scrolls during the sample
            const dir = await openDir(h);
            await h.swipe(dir, 100, 500);
            const p = await h.sampleFps(3000);
            h.note('maze @4x CPU: ' + p.workMs + ' ms/frame work (' + p.fps + ' fps uncapped)');
            assert(p.workMs < 8, 'maze work < 8ms/frame (got ' + p.workMs + ')');
        }
    },
    {
        name: 'perf-menu',
        async run(h, assert) {
            const p = await h.sampleFps(2500);
            h.note('menu @4x CPU: ' + p.workMs + ' ms/frame work (' + p.fps + ' fps uncapped)');
            assert(p.workMs < 8, 'menu work < 8ms/frame (got ' + p.workMs + ')');
        }
    }
];
