# Role & Project Scope
You are an expert mobile game developer assisting in "vibe coding" a web-based mobile game designed for low-end Android devices (specifically targeting entry-level Samsung Galaxy A-series specs, e.g., A10/A14/A15 series with 3GB-4GB RAM and Mali/Adreno entry-level GPUs). 

The game is a 2D top-down / arcade survival experience titled **"Snake Plissken's Escape from Zombiepocalypse"**.

The entire scope of this project is scheduled across a strict 12-hour development budget.

---

# Development Environment, Prerequisites & AI Agent Skills

### IDE & Project Setup
- **IDE:** Visual Studio Code with the official **Claude Code extension** and **Live Server extension**.
- **Project Type:** Plain workspace folder (`File -> Open Folder` pointing to `SnakePlisskenEscape`).
- **Runtime & OS:** Windows 11 (64-bit), Node.js LTS (npm / npx command-line environment).
- **Testing Setup:** Google Chrome DevTools Device Mode (Target resolution: 360x800 portrait, CPU throttled 4x to match entry-level ARM processors).
- **Official Agent Skills Integration:** 
  - Utilize Google's official Android Agent Skills repository (`android/skills` on GitHub: `https://github.com/android/skills`) for mobile optimization guidelines, touch gesture handling, performance profiling, and memory efficiency patterns.
  - CLI Plugin Command: `/plugin marketplace add android/skills`

---

# Gameplay Architecture & Requirements

### 1. Phase 1: The Mansion Hedge Maze (Escape Loop)
- **Protagonist:** Snake Plissken (represented by an eyepatch-wearing hero placeholder sprite/shape).
- **Goal:** Snake must navigate a top-down, maze-like hedge puzzle on the mansion grounds while avoiding roaming zombies and collecting scattered medical kits.
- **Controls:** Touch-based directional controls (virtual d-pad or swipe-to-move) optimized for low-end touchscreens.
- **Victory Condition:** Reaching the property gate exit unlocks Phase 2.

### 2. Phase 2: The Zombie Gate Dance-Off (Rhythm Loop)
- **Goal:** Upon reaching the gate, Snake enters a quick-time-event (QTE) rhythm battle against a zombie horde blocking the exit, inspired by Dance Dance Revolution.
- **Controls:** On-screen indicators specify swipe directions (Left, Right, Up, Down). The player must execute directional swipes perfectly synced to beat timestamps.
- **Scoring:** Tracks "Perfect", "Great", "Miss", and outputs a final Pass/Fail score. Passing unlocks the final escape; failing requires retrying the rhythm sequence.

### 3. Asset & Platform Constraints
- **Target Device:** Low-end Android (Samsung entry-level specs). Keep canvas draw calls light, visual asset overhead low, and avoid complex 3D math or unoptimized shaders.
- **Placeholders Only:** Do NOT rely on external media files. Generate lightweight inline canvas assets, CSS shapes, procedural color blocks, or Web Audio API synthetic audio beeps/clicks for all graphics and sound effects.

---

# System Goals & Deliverables

- **Goal 1 (Maze Navigation Engine):** Top-down grid/tile collision system, touch movement controls, roaming zombie pathfinding, and item pickup logic.
- **Goal 2 (Rhythm QTE Engine):** Directional swipe gesture detector, dynamic scrolling arrow timeline, rhythm hit-timing evaluator (Perfect/Great/Miss), and Pass/Fail score screen.
- **Goal 3 (State Transition & Integration):** Unified state manager (Start Menu -> Phase 1 Maze -> Phase 2 Rhythm -> Win/Loss Screen) with persistent health/med-kit carryover.
- **Stretch Goal (Adaptive Tempo & Mobile Haptics):** Dynamic beat tempo acceleration based on remaining