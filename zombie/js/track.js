'use strict';
/*
 * Recorded music tracks.
 * Prepare a new WAV with: node tools/prep-track.js <in.wav> zombie/audio/<name>.wav
 * (makes it mono and prints its tempo / first beat).
 */
G.TRACKS = {
    // Phase 2 dance-off. Beat k is at  firstBeat + k * 60 / bpm  seconds.
    dance: {
        url: 'audio/dance.wav',
        bpm: 133.08,
        firstBeat: 0.256,     // seconds
        duration: 37.96,      // seconds
        countInBeat: 4,       // "3, 2, 1, DANCE!" on beats 4-7; first note on beat 8
        denseFromBeat: 64,    // notes every 2 beats before this, every beat after
        lastNoteBeat: 79
    },

    // Phase 1 maze background loop ("Survival Loop", ~40s).
    // The file fades out over its last ~1.2s, so each repeat starts that much
    // early and the fade becomes a crossfade.
    maze: {
        url: 'audio/maze.wav',
        volume: 1.2,          // relative to master (0.25)
        overlap: 1.2          // seconds
    }
};
