'use strict';
/*
 * Dance-off music track + its beat grid.
 * Values measured with: node tools/prep-track.js <in.wav> zombie/audio/dance.wav
 * Beat k is at  firstBeat + k * 60 / bpm  seconds into the file.
 */
G.TRACK = {
    url: 'audio/dance.wav',
    bpm: 133.08,
    firstBeat: 0.256,     // seconds
    duration: 37.96,      // seconds
    countInBeat: 4,       // "3, 2, 1, DANCE!" on beats 4-7; first note on beat 8
    denseFromBeat: 64,    // notes every 2 beats before this, every beat after
    lastNoteBeat: 79
};
