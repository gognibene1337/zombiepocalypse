# Escape from Zombiepocalypse

A small mobile web game built for low-end Android phones. You play an eyepatch-wearing hero who has to get out of a zombie-infested mansion. There are two phases:

1. **The Hedge Maze.** Find your way through a randomly generated hedge maze to the gate. Zombies wander the paths and chase you when you get close. Med-kits are hidden in dead ends.
2. **The Gate Dance-Off.** A zombie horde blocks the gate. Swipe left or right in time with the music, as in Dance Dance Revolution. You need 60% accuracy to escape.

Your health and med-kits carry over from the maze into the dance-off:
- Each med-kit forgives one missed note.
- The lower your health, the faster the music plays.

## Play it locally

The game is plain HTML5 Canvas and JavaScript, with no build step or libraries. The music files have to be served over HTTP, because browsers won't load them from a page opened directly from disk.

```bash
node tools/serve.js        # then open http://localhost:8080/
```

Or, in VS Code, right-click `zombie/index.html` and choose **Open with Live Server**.

For a phone-like view on desktop, open Chrome DevTools (F12), press Ctrl+Shift+M, and choose 360×800.

## Controls

| | Touch | Keyboard |
|---|---|---|
| Move (maze) | Swipe, or the on-screen d-pad (switch it on from the menu) | Arrow keys / WASD |
| Heal | Tap the med-kit counter | H |
| Dance | Swipe left / right on the beat | ← / → |
| Pause | ⏸ button | Esc |
| Mute / debug overlay | — | M / F |

The **DANCE-OFF ▶** button on the main menu skips straight to phase 2.

## Tests

Automated browser tests use [puppeteer-core](https://pptr.dev/) with your installed Chrome. They emulate a 360×800 touch phone with the CPU slowed 4× and save screenshots to `tests/shots/`.

```bash
npm install
npm test                   # all scenarios
node tests/run.js rhythm   # only scenarios whose name contains "rhythm"
```

## Project layout

```
zombie/              the game (open index.html)
  js/engine.js       canvas scaling, fixed-timestep loop, settings
  js/input.js        touch swipes, taps and keyboard
  js/audio.js        Web Audio: sound effects, music tracks, looping
  js/mazegen.js      maze generation and pathfinding
  js/states/         menu, maze, rhythm and result screens
  audio/             music (mono WAV)
tests/               puppeteer test runner and scenarios
tools/serve.js       local static server for play-testing
tools/prep-track.js  converts a WAV to mono and detects its tempo for the rhythm chart
```

## Credits

- All graphics and sound effects are drawn and synthesized in code.
- The music was generated with [Suno](https://suno.com).
