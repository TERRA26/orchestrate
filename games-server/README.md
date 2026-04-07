# Games Portal

A polished, interactive games portal serving 6 classic browser games. Built with plain HTML, CSS, and vanilla JavaScript — no framework dependencies.

## Games Included

| Game                     | Description                                                        |
| ------------------------ | ------------------------------------------------------------------ |
| 🐍 **Snake**             | Classic grid-based snake with score tracking and increasing speed  |
| ⭕ **Tic-Tac-Toe**       | Two-player local mode and AI opponent with win/draw detection      |
| 🃏 **Memory Match**      | Flip cards to find matching pairs — tracks moves and time          |
| 🧱 **Breakout**          | Canvas-based paddle-and-ball brick breaker with lives and levels   |
| 💣 **Minesweeper**       | Three difficulty levels, reveal/flag mechanics, win/loss detection |
| ⌨️ **Typing Speed Test** | Measure your WPM and accuracy with real-time feedback              |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16+) **or** [Bun](https://bun.sh/)

### Install & Run

```bash
# Navigate to the games-server directory
cd games-server

# Start the server with Node.js
npm start

# — or directly —
node server.js

# — or with Bun —
bun server.js
```

The server starts on **port 3333**. Open your browser to:

```
http://localhost:3333
```

### No Dependencies

This project has **zero npm dependencies**. The server uses Node's built-in `http` and `fs` modules. No `npm install` required.

## Project Structure

```
games-server/
├── server.js              # HTTP server entry point (port 3333)
├── package.json           # npm scripts
├── README.md              # This file
└── public/                # Static files served by the server
    ├── index.html         # Landing page / games hub
    ├── styles.css         # Shared design system (CSS variables, components)
    └── games/
        ├── snake.html         # Snake game
        ├── tic-tac-toe.html   # Tic-Tac-Toe game
        ├── memory.html        # Memory card matching game
        ├── breakout.html      # Breakout / Brick Breaker game
        ├── minesweeper.html   # Minesweeper game
        └── typing-test.html   # Typing speed test
```

## Design System

All pages share a unified dark theme defined via CSS custom properties in `styles.css`:

- **Font**: Space Grotesk (Google Fonts)
- **Color palette**: Deep navy backgrounds with purple accent colors
- **Components**: Shared button styles, score bars, modal overlays, header bars
- **Responsive**: Cards reflow on narrow viewports; games remain usable on mobile

## License

MIT
