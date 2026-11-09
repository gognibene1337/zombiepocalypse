'use strict';
/*
 * Maze generation + grid pathfinding.
 *
 * Grid of tiles: 1 = hedge (wall), 0 = path. Cells live on odd coordinates;
 * walls on even ones (classic "recursive backtracker" layout).
 * After carving, some dead ends are knocked open ("braiding") so the maze
 * has loops: zombies can then be dodged instead of trapping you.
 */
G.Maze = (function () {
    const D4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];           // up, right, down, left
    const DIR_NAMES = ['up', 'right', 'down', 'left'];
    const DIR_VEC = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
    const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

    function generate(cols, rows, seed, braid) {
        const rnd = G.rng(seed);
        const g = new Uint8Array(cols * rows).fill(1);
        const idx = (c, r) => r * cols + c;
        const inner = (c, r) => c > 0 && c < cols - 1 && r > 0 && r < rows - 1;

        // Start bottom-middle, exit top-middle (both on odd columns)
        const mid = (cols >> 1) | 1;
        const start = { c: mid, r: rows - 2 };
        const exit = { c: mid, r: 0 };

        // Iterative recursive-backtracker
        const stack = [start.c, start.r];
        g[idx(start.c, start.r)] = 0;
        const opts = [];
        while (stack.length) {
            const r = stack[stack.length - 1], c = stack[stack.length - 2];
            opts.length = 0;
            for (let i = 0; i < 4; i++) {
                const nc = c + D4[i][0] * 2, nr = r + D4[i][1] * 2;
                if (inner(nc, nr) && g[idx(nc, nr)] === 1) opts.push(i);
            }
            if (!opts.length) { stack.length -= 2; continue; }
            const d = D4[opts[(rnd() * opts.length) | 0]];
            g[idx(c + d[0], r + d[1])] = 0;
            g[idx(c + d[0] * 2, r + d[1] * 2)] = 0;
            stack.push(c + d[0] * 2, r + d[1] * 2);
        }

        // Braid: open a wall at a share of dead ends to create loops
        for (let r = 1; r < rows - 1; r += 2) {
            for (let c = 1; c < cols - 1; c += 2) {
                if (wallCount(g, cols, c, r) !== 3 || rnd() > braid) continue;
                const cand = [];
                for (let i = 0; i < 4; i++) {
                    const wc = c + D4[i][0], wr = r + D4[i][1];
                    const nc = c + D4[i][0] * 2, nr = r + D4[i][1] * 2;
                    if (g[idx(wc, wr)] === 1 && inner(nc, nr)) cand.push(idx(wc, wr));
                }
                if (cand.length) g[cand[(rnd() * cand.length) | 0]] = 0;
            }
        }

        g[idx(exit.c, exit.r)] = 0; // the gate opening in the top hedge

        // Remaining dead ends (good spots for med-kits)
        const deadEnds = [];
        for (let r = 1; r < rows - 1; r += 2) {
            for (let c = 1; c < cols - 1; c += 2) {
                if (wallCount(g, cols, c, r) === 3 && !(c === start.c && r === start.r)) deadEnds.push({ c: c, r: r });
            }
        }

        return {
            cols: cols, rows: rows, grid: g, start: start, exit: exit, deadEnds: deadEnds,
            dist: new Int16Array(cols * rows),        // BFS distance field (from player)
            queue: new Int32Array(cols * rows),       // preallocated BFS queue
            rnd: rnd
        };
    }

    function wallCount(g, cols, c, r) {
        let n = 0;
        for (let i = 0; i < 4; i++) if (g[(r + D4[i][1]) * cols + c + D4[i][0]]) n++;
        return n;
    }

    function isOpen(m, c, r) {
        return c >= 0 && r >= 0 && c < m.cols && r < m.rows && m.grid[r * m.cols + c] === 0;
    }

    /*
     * Breadth-first distance from (c, r) to every reachable tile, written into
     * m.dist (-1 = unreachable). 15x61 grid = ~900 tiles: well under 0.1ms.
     * Recomputed only when the player enters a new tile.
     */
    function bfs(m, c, r) {
        const dist = m.dist, q = m.queue, cols = m.cols, g = m.grid;
        dist.fill(-1);
        let head = 0, tail = 0;
        const s = r * cols + c;
        dist[s] = 0;
        q[tail++] = s;
        while (head < tail) {
            const cur = q[head++];
            const cc = cur % cols, cr = (cur / cols) | 0;
            const nd = dist[cur] + 1;
            for (let i = 0; i < 4; i++) {
                const nc = cc + D4[i][0], nr = cr + D4[i][1];
                if (nc < 0 || nr < 0 || nc >= cols || nr >= m.rows) continue;
                const ni = nr * cols + nc;
                if (g[ni] === 0 && dist[ni] === -1) { dist[ni] = nd; q[tail++] = ni; }
            }
        }
    }

    function distAt(m, c, r) {
        return m.dist[r * m.cols + c];
    }

    // In-place Fisher-Yates shuffle with a seeded rnd()
    function shuffle(a, rnd) {
        for (let i = a.length - 1; i > 0; i--) {
            const j = (rnd() * (i + 1)) | 0;
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    // True if cell is at least minDist (Manhattan) from every item in list
    function farFrom(cell, list, minDist) {
        for (let i = 0; i < list.length; i++) {
            if (Math.abs(list[i].c - cell.c) + Math.abs(list[i].r - cell.r) < minDist) return false;
        }
        return true;
    }

    return {
        D4: D4, DIR_NAMES: DIR_NAMES, DIR_VEC: DIR_VEC, OPPOSITE: OPPOSITE,
        generate: generate, isOpen: isOpen, bfs: bfs, distAt: distAt, wallCount: wallCount,
        shuffle: shuffle, farFrom: farFrom
    };
})();
