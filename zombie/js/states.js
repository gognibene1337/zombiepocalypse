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

    S.update = function (dt) {
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
 * Data that carries across phases for one playthrough.
 * Health and med-kits collected in the maze carry into the dance-off.
 */
G.Run = {
    HEAL_AMOUNT: 35,

    reset: function () {
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

    addMedkit: function () {
        this.medkits++;
        G.Audio.sfx('pickup');
    },

    useMedkit: function () {
        if (this.medkits <= 0 || this.health >= this.maxHealth) return false;
        this.medkits--;
        this.health = Math.min(this.maxHealth, this.health + this.HEAL_AMOUNT);
        G.Audio.sfx('heal');
        return true;
    }
};
