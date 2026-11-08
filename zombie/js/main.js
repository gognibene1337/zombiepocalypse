'use strict';
/* Boot: wire the loop to the state manager and start. */
G.update = function (dt) {
    G.States.update(dt);
    G.Input.endStep();   // events are valid for exactly one update step
};

G.render = function () {
    G.States.render(G.ctx);
    if (G.debug) G.UI.drawDebug(G.ctx);
};

window.addEventListener('resize', G.resize);
window.addEventListener('orientationchange', G.resize);

G.resize();
G.Run.reset();
G.States.go('menu', null, true);
G.start();
