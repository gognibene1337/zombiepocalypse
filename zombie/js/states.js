'use strict';
/*
 * State manager + persistent run data.
 *
 * Flow: menu -> maze -> rhythm -> result (win / lose)
 *
 * A state is a plain object with optional hooks:
 *   enter(params)  called when the state becomes active
 *   exit()         called before leaving
 *   layout()       (re)compute positions; called on enter and on resize
 *   update(dt)     fixed-step logic; read G.Input.events here
 *   render(ctx)    draw the frame
 *   pause()        tab/app went to background
 */
G.States = (function () {
    const FADE = 0.18; // seconds for each half of the fade transition
    const S = { current: null, name: '', list: {} };
    let fade = 0, fadeDir = 0, pending = null;

    S.register = function (name, state) {
        S.list[name] = state;
    };

    function swap(name, params) {
        if (S.current && S.current.exit) S.current.exit();
        S.name = name;
        S.current = S.list[name];
        if (!S.current) throw new Error('Unknown state: ' + name);
        if (S.current.enter) S.current.enter(params || {});
        if (S.current.layout) S.current.layout();
    }

    // Switch state with a quick fade to black (or instantly).
    S.go = function (name, params, instant) {
        if (fadeDir !== 0) return; // already transitioning
        if (instant || !S.current) { swap(name, params); return; }
        pending = { name: name, params: params };
        fadeDir = 1;
    };

    // True while a fade transition is running (used by tests)
    S.busy = function () { return fadeDir !== 0; };

    // ---- Pause (only for states that set pausable: true)
    const PAUSE_BTN = { x: 0, y: 0, w: 44, h: 38 };   // HUD hit area, left of the med-kit counter
    let pauseButtons = null;
    const pauseNav = { focus: 0 };
    S.paused = false;

    S.pauseRect = function () {
        PAUSE_BTN.x = G.W - 134;
        return PAUSE_BTN;
    };

    S.pause = function () {
        if (S.paused || !S.current || !S.current.pausable || fadeDir !== 0) return;
        S.paused = true;
        G.Audio.suspend();     // freezes the audio clock, so the rhythm phase resumes in sync
        const bw = 220, bh = 52, x = (G.W - bw) / 2, y = G.H * 0.45;
        pauseNav.focus = 0;
        pauseButtons = [
            G.UI.button('RESUME', x, y, bw, bh, S.resume, 'primary'),
            G.UI.button('QUIT TO MENU', x, y + bh + 14, bw, bh, function () {
                S.resume();
                S.go('menu');
            }, 'secondary')
        ];
    };

    // Buttons currently on screen (pause overlay wins). Used by tests.
    S.activeButtons = function () {
        return S.paused ? pauseButtons : (S.current && S.current.buttons) || [];
    };

    S.resume = function () {
        if (!S.paused) return;
        S.paused = false;
        G.Audio.resume();
    };

    S.update = function (dt) {
        if (S.paused) {
            const ev = G.Input.events;
            for (let i = 0; i < ev.length; i++) if (ev[i].type === 'back') { S.resume(); return; }
            G.UI.handleButtons(pauseButtons, pauseNav);
            return;
        }
        // Pause button / back key in pausable states
        if (fadeDir === 0 && S.current && S.current.pausable) {
            const ev = G.Input.events, pr = S.pauseRect();
            for (let i = 0; i < ev.length; i++) {
                const e = ev[i];
                if (e.type === 'back' || (e.type === 'tap' && G.UI.hit(pr, e.x, e.y))) {
                    G.Input.endStep();
                    S.pause();
                    return;
                }
            }
        }
        if (fadeDir === 1) {                  // fading out: freeze the old state
            fade += dt / FADE;
            if (fade >= 1) {
                fade = 1;
                swap(pending.name, pending.params);
                pending = null;
                fadeDir = -1;
            }
            return;
        }
        if (fadeDir === -1) {                 // fading in: new state runs
            fade -= dt / FADE;
            if (fade <= 0) { fade = 0; fadeDir = 0; }
        }
        if (S.current && S.current.update) S.current.update(dt);
    };

    S.render = function (ctx) {
        if (S.current && S.current.render) S.current.render(ctx);
        if (S.paused) {
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(0, 0, G.W, G.H);
            G.UI.textShadow(ctx, 'PAUSED', G.W / 2, G.H * 0.33, 34, G.C.accent);
            G.UI.drawButtons(ctx, pauseButtons, pauseNav);
        }
        if (fade > 0) {
            ctx.globalAlpha = fade;
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, G.W, G.H);
            ctx.globalAlpha = 1;
        }
    };

    return S;
})();

/*
 * Bonus round chain:
 *   Dance-off accuracy >= 70%  ->  Feast Fling
 *   Feast Fling score  >= 80%  ->  Cat Pump
 * The unlock screen counts down, then starts the bonus game on its own
 * (or tap the button to go right away).
 */
G.BONUS = {
    FEAST_FROM_DANCE: 0.7,
    CAT_FROM_FEAST: 0.8,
    AUTO_START: 4          // seconds before the bonus game starts by itself
};

/*
 * Data that carries across phases for one playthrough.
 * Health and med-kits collected in the maze carry into the dance-off.
 */
G.Run = {
    HEAL_AMOUNT: 35,          // using a carried med-kit
    PICKUP_HEAL: 0.2,         // instant heal when collecting one (share of max health)

    reset: function () {
        // Each run gets a fresh maze; ?seed=N in the URL pins it (testing)
        const s = parseInt(G.params.get('seed'), 10);
        this.seed = isNaN(s) ? (Math.random() * 1e9) | 0 : s;
        this.maxHealth = 100;
        this.health = 100;
        this.medkits = 0;
        this.rhythmAttempts = 0;
    },

    // Returns true if this hit was fatal
    damage: function (n) {
        this.health = Math.max(0, this.health - n);
        G.Audio.sfx('hurt');
        return this.health <= 0;
    },

    // Collecting a med-kit: heal 20% straight away AND keep the kit
    // (it still carries over to the dance-off / can be used later).
    // Returns the HP actually restored.
    addMedkit: function () {
        this.medkits++;
        const before = this.health;
        this.health = Math.min(this.maxHealth, this.health + this.maxHealth * this.PICKUP_HEAL);
        G.Audio.sfx('pickup');
        return Math.round(this.health - before);
    },

    useMedkit: function () {
        if (this.medkits <= 0 || this.health >= this.maxHealth) return false;
        this.medkits--;
        this.health = Math.min(this.maxHealth, this.health + this.HEAL_AMOUNT);
        G.Audio.sfx('heal');
        return true;
    }
};
