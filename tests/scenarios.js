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
            await h.tapButton('D-PAD: OFF');
            assert(await h.ev(() => G.Settings.dpad) === true, 'd-pad setting toggled on');
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
            await h.ev(() => { G.Settings.dpad = false; G.Settings.save(); });
        }
    },
    {
        name: 'maze-pickup-and-heal',
        async run(h, assert) {
            await startMaze(h, { noZombies: true });
            const k = await h.ev(() => G.States.current.kits[0]);
            await tp(h, k.c, k.r);
            await sleep(150);
            assert(await h.ev(() => G.Run.medkits) === 1, 'picked up a med-kit');
            await h.shot('12-maze-pickup');
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
                return { mul: s.tempoMul, spb: s.beats[0].spb };
            });
            h.note('health 40 -> tempo x' + r.mul.toFixed(2) + ', beat ' + Math.round(r.spb * 1000) + 'ms');
            assert(Math.abs(r.mul - 1.15) < 0.001, 'tempo +15% at 40 health');
            assert(r.spb < 0.6, 'beats shorter than the 100bpm baseline');
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
