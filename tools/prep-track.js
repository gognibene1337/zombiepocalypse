'use strict';
/*
 * Prepare a music track for the dance-off.
 *
 *   node tools/prep-track.js <input.wav> <output.wav>
 *
 * 1. Reads a PCM WAV (16-bit), mixes it down to mono (halves size + phone RAM)
 * 2. Detects tempo (BPM) and the beat grid from onset energy
 * 3. Snaps each grid beat to the nearest real onset (handles slight drift)
 * 4. Writes the mono WAV and prints a JS snippet for zombie/js/track.js
 */
const fs = require('fs');

function readWav(file) {
    const b = fs.readFileSync(file);
    if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Not a WAV');
    let pos = 12, fmt = null, data = null;
    while (pos < b.length - 8) {
        const id = b.toString('ascii', pos, pos + 4), size = b.readUInt32LE(pos + 4);
        if (id === 'fmt ') fmt = { format: b.readUInt16LE(pos + 8), ch: b.readUInt16LE(pos + 10), rate: b.readUInt32LE(pos + 12), bits: b.readUInt16LE(pos + 22) };
        else if (id === 'data') { data = b.subarray(pos + 8, pos + 8 + size); break; }
        pos += 8 + size + (size % 2);
    }
    if (!fmt || !data || fmt.format !== 1 || fmt.bits !== 16) throw new Error('Need 16-bit PCM WAV');
    const n = data.length / 2 / fmt.ch, mono = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        let s = 0;
        for (let c = 0; c < fmt.ch; c++) s += data.readInt16LE((i * fmt.ch + c) * 2);
        mono[i] = s / fmt.ch / 32768;
    }
    return { rate: fmt.rate, mono };
}

function writeWavMono16(file, rate, x) {
    const b = Buffer.alloc(44 + x.length * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVE', 8);
    b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
    b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
    b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
    for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
    fs.writeFileSync(file, b);
}

// Onset strength: rise in log energy, full band + low band (kick drum)
function onsets(x, rate, hop) {
    const n = Math.floor(x.length / hop), full = new Float32Array(n), low = new Float32Array(n);
    const a = Math.exp(-2 * Math.PI * 150 / rate);      // one-pole low-pass ~150Hz
    let lp = 0;
    for (let f = 0; f < n; f++) {
        let ef = 0, el = 0;
        for (let i = f * hop; i < (f + 1) * hop; i++) {
            lp = a * lp + (1 - a) * x[i];
            ef += x[i] * x[i]; el += lp * lp;
        }
        full[f] = Math.log(1e-9 + ef); low[f] = Math.log(1e-9 + el);
    }
    const o = new Float32Array(n);
    for (let f = 1; f < n; f++) o[f] = Math.max(0, full[f] - full[f - 1]) + 1.5 * Math.max(0, low[f] - low[f - 1]);
    return o;
}

function sampleAt(o, t) {       // linear interpolation, t in frames
    const i = Math.floor(t);
    if (i < 0 || i + 1 >= o.length) return 0;
    return o[i] + (o[i + 1] - o[i]) * (t - i);
}

function main() {
    const [inp, out] = process.argv.slice(2);
    if (!inp || !out) { console.error('usage: node tools/prep-track.js in.wav out.wav'); process.exit(2); }
    const { rate, mono } = readWav(inp);
    const dur = mono.length / rate;
    const hop = 256, hopS = hop / rate;
    const o = onsets(mono, rate, hop);

    // Comb search: score(bpm, phase) = mean onset strength on the beat grid
    const cands = [];
    for (let bpm = 80; bpm <= 170; bpm += 0.02) {
        const per = 60 / bpm / hopS;
        let best = -1, bestPh = 0;
        for (let ph = 0; ph < per; ph += 0.5) {
            let s = 0, k = 0;
            for (let t = ph; t < o.length; t += per, k++) s += sampleAt(o, t);
            s /= k;
            if (s > best) { best = s; bestPh = ph; }
        }
        cands.push({ bpm, score: best, phase: bestPh * hopS });
    }
    cands.sort((a, b) => b.score - a.score);
    const top = [];
    for (const c of cands) {
        if (top.every(t => Math.abs(t.bpm - c.bpm) > 1)) top.push(c);
        if (top.length === 5) break;
    }
    const pick = top[0];
    const spb = 60 / pick.bpm;

    // Grid beats; snap each to the strongest onset within ±40ms
    const beats = [];
    const thresh = (() => {
        const v = [];
        for (let t = pick.phase; t < dur; t += spb) v.push(sampleAt(o, t / hopS));
        v.sort((a, b) => a - b);
        return v[Math.floor(v.length / 2)] * 0.35;       // 35% of median beat strength
    })();
    let firstStrong = -1, drift = [];
    for (let t = pick.phase, k = 0; t < dur - 0.05; t += spb, k++) {
        let bt = t, bs = sampleAt(o, t / hopS);
        for (let d = -0.04; d <= 0.04; d += hopS) {
            const s = sampleAt(o, (t + d) / hopS);
            if (s > bs) { bs = s; bt = t + d; }
        }
        if (firstStrong < 0 && bs >= thresh) firstStrong = k;
        drift.push(bt - t);
        beats.push(+bt.toFixed(4));
    }
    const absDrift = drift.map(Math.abs).sort((a, b) => a - b);

    const outMono = new Float32Array(mono.length);
    outMono.set(mono);
    writeWavMono16(out, rate, outMono);

    console.log('duration     ' + dur.toFixed(2) + 's @ ' + rate + 'Hz');
    console.log('tempo cands  ' + top.map(c => c.bpm.toFixed(2) + ' (' + c.score.toFixed(3) + ')').join('  '));
    console.log('picked       ' + pick.bpm.toFixed(2) + ' BPM, first grid beat ' + pick.phase.toFixed(3) + 's');
    console.log('first strong beat index ' + firstStrong + ' at ' + beats[firstStrong] + 's');
    console.log('snap drift   median ' + (absDrift[absDrift.length >> 1] * 1000).toFixed(1) + 'ms, max ' + (absDrift[absDrift.length - 1] * 1000).toFixed(1) + 'ms');
    console.log('beats        ' + beats.length);
    console.log('wrote        ' + out + ' (' + (fs.statSync(out).size / 1048576).toFixed(2) + ' MB mono)');
    console.log('\nPaste into zombie/js/track.js:\n' +
        '    bpm: ' + pick.bpm.toFixed(2) + ',\n' +
        '    firstBeat: ' + pick.phase.toFixed(3) + ',\n' +
        '    duration: ' + dur.toFixed(2) + ',\n' +
        '    (beats in file: ' + beats.length + ', last usable note beat ~' + (beats.length - 5) + ')');
}

main();
