'use strict';
/*
 * Automated browser tests (puppeteer-core + installed Chrome).
 *
 *   node tests/run.js            run all scenarios
 *   node tests/run.js maze       run scenarios whose name contains "maze"
 *   HEADED=1 node tests/run.js   watch it in a visible window
 *
 * Emulates the target device: 360x800 portrait, DPR 2, touch, CPU 4x slower.
 * Screenshots go to tests/shots/. Exit code 1 if anything fails.
 */
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const CHROME = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe')
].find(p => p && fs.existsSync(p));

// Pages are served over a tiny local HTTP server (fetch() of the music track
// doesn't work from file://). Scenarios with `file: true` use file:// instead.
const http = require('http');
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wav': 'audio/wav', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const FILE_URL = 'file:///' + path.join(ROOT, 'zombie/index.html').replace(/\\/g, '/') + '?seed=12345';
let URL = null; // set once the server is listening

function startServer() {
    const server = http.createServer((req, res) => {
        const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
        if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
            res.writeHead(404); res.end(); return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
        fs.createReadStream(p).pipe(res);
    });
    return new Promise(r => server.listen(0, '127.0.0.1', () => {
        URL = 'http://127.0.0.1:' + server.address().port + '/zombie/index.html?seed=12345';
        r(server);
    }));
}
const SHOTS = path.join(__dirname, 'shots');
const CPU_THROTTLE = 4;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- helpers
function makeHelpers(page) {
    const h = {
        page,
        // Evaluate in page
        ev: (fn, ...args) => page.evaluate(fn, ...args),
        state: () => page.evaluate(() => G.States.name),

        async waitState(name, timeout = 5000) {
            await page.waitForFunction(n => G.States.name === n && !G.States.busy(), { timeout, polling: 50 }, name);
            await sleep(60);
        },

        // Logical game coords -> CSS page coords
        async toPage(x, y) {
            return page.evaluate((x, y) => {
                const r = G.canvas.getBoundingClientRect();
                return { x: r.left + x * r.width / G.W, y: r.top + y * r.height / G.H };
            }, x, y);
        },

        async tap(x, y) {
            const p = await h.toPage(x, y);
            await page.touchscreen.touchStart(p.x, p.y);
            await sleep(40);
            await page.touchscreen.touchEnd();
            await sleep(60);
        },

        // Tap a button by label on the current state
        async tapButton(label) {
            const b = await page.evaluate(l => {
                const btn = G.States.activeButtons().find(b => b.label === l);
                return btn ? { x: btn.x + btn.w / 2, y: btn.y + btn.h / 2 } : null;
            }, label);
            if (!b) throw new Error('No button "' + label + '" on state ' + await h.state());
            await h.tap(b.x, b.y);
        },

        async swipe(dir, fromX, fromY) {
            const x0 = fromX == null ? 180 : fromX, y0 = fromY == null ? 400 : fromY;
            const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
            const a = await h.toPage(x0, y0);
            const b = await h.toPage(x0 + d[0] * 60, y0 + d[1] * 60);
            await page.touchscreen.touchStart(a.x, a.y);
            for (let i = 1; i <= 4; i++) {
                await page.touchscreen.touchMove(a.x + (b.x - a.x) * i / 4, a.y + (b.y - a.y) * i / 4);
            }
            await page.touchscreen.touchEnd();
            await sleep(30);
        },

        async key(code, holdMs = 0) {
            await page.keyboard.down(code);
            if (holdMs) await sleep(holdMs);
            await page.keyboard.up(code);
        },

        async shot(name) {
            await page.screenshot({ path: path.join(SHOTS, name + '.png') });
        },

        // Average FPS over a window (reads the game's own counter)
        async sampleFps(ms = 2000) {
            const samples = [];
            const end = Date.now() + ms;
            while (Date.now() < end) {
                await sleep(500);
                samples.push(await page.evaluate(() => ({ fps: G.fps, work: G.workMs })));
            }
            const fps = samples.reduce((s, v) => s + v.fps, 0) / samples.length;
            const work = samples.reduce((s, v) => s + v.work, 0) / samples.length;
            return { fps: Math.round(fps), workMs: +work.toFixed(2) };
        }
    };
    return h;
}

function assert(cond, msg) {
    if (!cond) throw new Error('Assertion failed: ' + msg);
}

// -------------------------------------------------------------- scenarios
const scenarios = require('./scenarios');

// ------------------------------------------------------------------ main
(async () => {
    if (!CHROME) { console.error('Chrome not found. Set CHROME_PATH.'); process.exit(2); }
    fs.mkdirSync(SHOTS, { recursive: true });
    const server = await startServer();

    const filter = process.argv[2] || '';
    const list = scenarios.filter(s => s.name.includes(filter));
    const baseArgs = ['--disable-background-timer-throttling',
        '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
    const launch = args => puppeteer.launch({
        executablePath: CHROME,
        headless: process.env.HEADED ? false : 'new',
        args: baseArgs.concat(args)
    });
    // Most scenarios skip Chrome's autoplay rule for speed. Scenarios marked
    // `realAutoplay: true` get a browser with the real rule (audio needs a gesture),
    // which is what players' browsers do.
    const browser = await launch(['--autoplay-policy=no-user-gesture-required']);
    let strictBrowser = null;

    let failed = 0;
    for (const sc of list) {
        if (sc.realAutoplay && !strictBrowser) strictBrowser = await launch([]);
        const page = await (sc.realAutoplay ? strictBrowser : browser).newPage();
        const errors = [];
        page.on('pageerror', e => errors.push('pageerror: ' + e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

        await page.emulate({
            viewport: { width: 360, height: 800, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
            userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'
        });
        const cdp = await page.createCDPSession();
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });

        const t0 = Date.now();
        const notes = [];
        try {
            await page.goto(sc.file ? FILE_URL : URL, { waitUntil: 'load' });
            await page.waitForFunction(() => window.G && G.States && G.States.name === 'menu', { timeout: 5000 });
            const h = makeHelpers(page);
            h.note = s => notes.push(s);
            await sc.run(h, assert);
            assert(errors.length === 0, 'no JS errors:\n    ' + errors.join('\n    '));
            console.log('PASS  ' + sc.name + '  (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
        } catch (e) {
            failed++;
            console.log('FAIL  ' + sc.name + '\n      ' + e.message.split('\n').join('\n      '));
            if (errors.length) console.log('      JS errors:\n        ' + errors.join('\n        '));
            try { await page.screenshot({ path: path.join(SHOTS, 'FAIL-' + sc.name + '.png') }); } catch (_) { /* ignore */ }
        }
        notes.forEach(n => console.log('      - ' + n));
        await Promise.race([page.close(), sleep(2000)]);
    }
    // browser.close() can hang on Windows; don't let it block the exit
    for (const b of [browser, strictBrowser]) {
        if (!b) continue;
        await Promise.race([b.close(), sleep(3000)]);
        try { b.process() && b.process().kill(); } catch (_) { /* ignore */ }
    }
    server.close();
    console.log(failed ? '\n' + failed + ' FAILED' : '\nALL PASSED (' + list.length + ')');
    process.exit(failed ? 1 : 0);
})();
