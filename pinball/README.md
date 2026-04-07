# Neon Pinball

A standalone HTML5 Canvas pinball game with an arcade/neon aesthetic. No frameworks, no build step — just vanilla HTML, CSS, and JavaScript.

## Quick Start

```bash
# Using npm/node:
cd pinball
npm start
# → http://localhost:3737

# Using bun:
cd pinball
bun run serve:bun
# → http://localhost:3737

# Custom port:
PORT=8080 node server.js
```

Then open [http://localhost:3737](http://localhost:3737) in your browser.

## Controls

| Action        | Keyboard                      | Mobile/Touch          |
| ------------- | ----------------------------- | --------------------- |
| Left flipper  | `A` or `←`                    | Tap left side         |
| Right flipper | `D` or `→`                    | Tap right side        |
| Launch ball   | Hold `Space`, release to fire | Tap **LAUNCH** button |

## Scoring

- **Bumper hit**: 100–250 pts (varies by bumper)
- **Slingshot hit**: 50 pts
- **Rollover lane**: 200 pts each
- **All 3 lanes**: 1,000 pt bonus
- **Combo multiplier**: Hit targets in quick succession for up to 5x multiplier

You start with 3 balls. Game ends when all balls drain. High scores are saved to localStorage.

## Features

- 6 circular bumpers with varied point values
- Left/right slingshot kickers
- 3 rollover lanes with an all-lanes bonus
- Plunger/spring launcher with charge mechanic
- Combo multiplier system
- Particle effects, screen shake, and ball trails
- Web Audio API synthesized sound effects (no external files)
- CRT scanline overlay for retro feel
- Mobile/touch support
- High score persistence (localStorage)

## Files

- `index.html` — Entry point
- `style.css` — Dark/neon arcade theme
- `game.js` — Full pinball engine (physics, rendering, audio)
- `server.js` — Zero-dependency Node.js static file server
- `server.ts` — Bun-native static file server variant
- `package.json` — Scripts for launching the dev server
