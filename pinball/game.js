/* ═══════════════════════════════════════════════════════════
   NEON PINBALL – HTML5 Canvas 2D Pinball Engine
   ═══════════════════════════════════════════════════════════ */

(() => {
  "use strict";

  // ── Constants ──────────────────────────────────────────
  const CANVAS_W = 480;
  const CANVAS_H = 720;
  const GRAVITY = 980; // px/s²
  const BALL_RADIUS = 8;
  const FRICTION = 0.998;
  const WALL_RESTITUTION = 0.4;
  const BUMPER_RESTITUTION = 1.4;
  const SLINGSHOT_RESTITUTION = 1.2;
  const MAX_LAUNCH_POWER = 1200;
  const LAUNCH_CHARGE_RATE = 2400; // power / second
  const FLIPPER_LENGTH = 60;
  const FLIPPER_WIDTH = 12;
  const FLIPPER_SPEED = 12; // rad/s
  const FLIPPER_REST_ANGLE_L = 0.45; // radians from horizontal
  const FLIPPER_MAX_ANGLE_L = -0.65;
  const FLIPPER_REST_ANGLE_R = Math.PI - 0.45;
  const FLIPPER_MAX_ANGLE_R = Math.PI + 0.65;
  const SUB_STEPS = 4;
  const INITIAL_LIVES = 3;
  const COMBO_DECAY_TIME = 2.0; // seconds until combo resets
  const TRAIL_LENGTH = 12;

  // ── DOM refs ───────────────────────────────────────────
  const canvas = document.getElementById("pinball-canvas");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const ballsEl = document.getElementById("balls");
  const launchBtn = document.getElementById("launch-btn");
  const gameOverOverlay = document.getElementById("game-over-overlay");
  const finalScoreEl = document.getElementById("final-score");
  const restartBtn = document.getElementById("restart-btn");

  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;

  // ── Audio (Web Audio synth) ────────────────────────────
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }
  function playTone(freq, duration, type = "square", vol = 0.1) {
    try {
      ensureAudio();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (_) {
      /* audio not critical */
    }
  }
  const sfx = {
    bumper: () => playTone(880, 0.08, "square", 0.08),
    slingshot: () => playTone(660, 0.06, "triangle", 0.08),
    flipper: () => playTone(220, 0.04, "square", 0.05),
    launch: () => playTone(150, 0.15, "sawtooth", 0.06),
    drain: () => playTone(100, 0.3, "sine", 0.1),
    lane: () => playTone(1200, 0.1, "sine", 0.07),
    bonus: () => playTone(1400, 0.25, "square", 0.09),
    combo: () => playTone(1600, 0.15, "triangle", 0.1),
    multiball: () => {
      playTone(440, 0.1, "square", 0.06);
      setTimeout(() => playTone(660, 0.1, "square", 0.06), 100);
      setTimeout(() => playTone(880, 0.1, "square", 0.06), 200);
    },
    gameOver: () => {
      playTone(300, 0.2, "sawtooth", 0.08);
      setTimeout(() => playTone(200, 0.3, "sawtooth", 0.08), 200);
      setTimeout(() => playTone(100, 0.5, "sawtooth", 0.08), 400);
    },
  };

  // ── Game state ─────────────────────────────────────────
  let state;

  function initState() {
    state = {
      score: 0,
      displayScore: 0,
      ballsRemaining: INITIAL_LIVES,
      ballInPlay: false,
      gameOver: false,

      // Ball
      ball: { x: 0, y: 0, vx: 0, vy: 0 },

      // Ball trail
      trail: [],

      // Launch
      launching: false,
      launchPower: 0,

      // Flippers
      leftFlipperActive: false,
      rightFlipperActive: false,
      leftFlipperAngle: FLIPPER_REST_ANGLE_L,
      rightFlipperAngle: FLIPPER_REST_ANGLE_R,

      // Rollover lanes tracking
      lanesLit: [false, false, false],
      lanesBonusAwarded: false,

      // Particles
      particles: [],

      // Floating score texts
      floatingTexts: [],

      // Bumper flash timers (index → remaining seconds)
      bumperFlash: [0, 0, 0, 0, 0, 0],

      // Combo system
      comboCount: 0,
      comboTimer: 0,

      // Screen shake
      shakeAmount: 0,
      shakeX: 0,
      shakeY: 0,

      // Game time (for animations)
      time: 0,

      // High score
      highScore: parseInt(localStorage.getItem("pinball_highscore") || "0", 10),

      // Stars background (fixed positions)
      stars: Array.from({ length: 40 }, () => ({
        x: Math.random() * CANVAS_W,
        y: Math.random() * CANVAS_H,
        size: 0.5 + Math.random() * 1.5,
        speed: 0.3 + Math.random() * 0.7,
      })),
    };
  }

  // ── Table geometry ─────────────────────────────────────
  // Walls defined as line segments [x1,y1,x2,y2]
  const CHUTE_X = CANVAS_W - 30; // left edge of launch chute
  const CHUTE_WIDTH = 26;
  const TABLE_LEFT = 20;
  const TABLE_RIGHT = CHUTE_X;
  const TABLE_TOP = 40;
  const TABLE_BOTTOM = CANVAS_H - 20;

  // The main playfield walls (without drain)
  const walls = [
    // Left wall
    [TABLE_LEFT, TABLE_TOP + 40, TABLE_LEFT, TABLE_BOTTOM - 80],
    // Top-left curve (approximated with segments)
    [TABLE_LEFT, TABLE_TOP + 40, TABLE_LEFT + 40, TABLE_TOP],
    [TABLE_LEFT + 40, TABLE_TOP, TABLE_RIGHT - 40, TABLE_TOP],
    // Top-right curve into chute wall
    [TABLE_RIGHT - 40, TABLE_TOP, TABLE_RIGHT, TABLE_TOP + 40],
    // Right side above chute entrance
    [TABLE_RIGHT, TABLE_TOP + 40, TABLE_RIGHT, TABLE_BOTTOM - 80],
    // Chute right wall
    [CHUTE_X + CHUTE_WIDTH, TABLE_TOP, CHUTE_X + CHUTE_WIDTH, TABLE_BOTTOM],
    // Chute left wall (partial - from chute entrance down)
    [CHUTE_X, TABLE_BOTTOM - 45, CHUTE_X, TABLE_BOTTOM],
    // Bottom-right wall (from right to drain)
    [TABLE_RIGHT, TABLE_BOTTOM - 80, TABLE_RIGHT - 50, TABLE_BOTTOM],
    // Bottom-left wall (from left to drain)
    [TABLE_LEFT, TABLE_BOTTOM - 80, TABLE_LEFT + 50, TABLE_BOTTOM],
    // Chute top blocker (one-way: ball goes up from chute into table)
    [TABLE_RIGHT, TABLE_TOP + 40, CHUTE_X + CHUTE_WIDTH, TABLE_TOP + 40],
  ];

  // Drain zone: between bottom-left and bottom-right walls
  const DRAIN_LEFT = TABLE_LEFT + 50;
  const DRAIN_RIGHT = TABLE_RIGHT - 50;
  const DRAIN_Y = TABLE_BOTTOM;

  // Bumpers (circular) — varied sizes for visual interest
  const bumpers = [
    { x: 180, y: 200, r: 22, points: 100, color: "#ff00ff" },
    { x: 260, y: 170, r: 24, points: 150, color: "#ff44aa" },
    { x: 340, y: 210, r: 22, points: 100, color: "#ff00ff" },
    { x: 210, y: 310, r: 20, points: 200, color: "#ff8800" },
    { x: 300, y: 290, r: 20, points: 200, color: "#ff8800" },
    { x: 255, y: 400, r: 18, points: 250, color: "#00ffcc" },
  ];

  // Slingshot triangles (defined by 3 vertices + normal push direction)
  const slingshots = [
    {
      // Left slingshot
      verts: [
        { x: TABLE_LEFT + 20, y: TABLE_BOTTOM - 170 },
        { x: TABLE_LEFT + 20, y: TABLE_BOTTOM - 100 },
        { x: TABLE_LEFT + 65, y: TABLE_BOTTOM - 105 },
      ],
      nx: 0.7,
      ny: -0.3,
      flash: 0,
    },
    {
      // Right slingshot
      verts: [
        { x: TABLE_RIGHT - 20, y: TABLE_BOTTOM - 170 },
        { x: TABLE_RIGHT - 20, y: TABLE_BOTTOM - 100 },
        { x: TABLE_RIGHT - 65, y: TABLE_BOTTOM - 105 },
      ],
      nx: -0.7,
      ny: -0.3,
      flash: 0,
    },
  ];

  // Convert slingshot edges to wall segments for collision
  const slingshotWalls = [];
  for (const sl of slingshots) {
    const v = sl.verts;
    slingshotWalls.push(
      { seg: [v[0].x, v[0].y, v[1].x, v[1].y], slingshot: sl },
      { seg: [v[1].x, v[1].y, v[2].x, v[2].y], slingshot: sl },
      { seg: [v[2].x, v[2].y, v[0].x, v[0].y], slingshot: sl },
    );
  }

  // Rollover lanes at top
  const lanes = [
    { x: 140, y: TABLE_TOP + 60, w: 30, h: 50, label: "T" },
    { x: 230, y: TABLE_TOP + 50, w: 30, h: 50, label: "3" },
    { x: 320, y: TABLE_TOP + 60, w: 30, h: 50, label: "!" },
  ];

  // Guide rails (decorative ramps near the top)
  const guideRails = [
    // Left orbit entry
    [TABLE_LEFT + 35, TABLE_TOP + 100, TABLE_LEFT + 80, TABLE_TOP + 45],
    // Right orbit entry
    [TABLE_RIGHT - 35, TABLE_TOP + 100, TABLE_RIGHT - 80, TABLE_TOP + 45],
  ];

  // Add guide rails as collidable walls
  for (const rail of guideRails) {
    walls.push(rail);
  }

  // Flipper pivots
  const FLIPPER_PIVOT_L = { x: TABLE_LEFT + 68, y: TABLE_BOTTOM - 40 };
  const FLIPPER_PIVOT_R = { x: TABLE_RIGHT - 68, y: TABLE_BOTTOM - 40 };

  // ── Input handling ─────────────────────────────────────
  const keys = {};

  document.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (e.code === "Space") e.preventDefault();
    if (e.code === "ArrowLeft" || e.code === "ArrowRight") e.preventDefault();
    ensureAudio();
  });
  document.addEventListener("keyup", (e) => {
    keys[e.code] = false;
  });

  // Touch / click zones for mobile flippers
  canvas.addEventListener("pointerdown", (e) => {
    ensureAudio();
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    if (x < 0.4) keys["_touchL"] = true;
    else if (x > 0.6) keys["_touchR"] = true;
  });
  canvas.addEventListener("pointerup", () => {
    keys["_touchL"] = false;
    keys["_touchR"] = false;
  });
  canvas.addEventListener("pointerleave", () => {
    keys["_touchL"] = false;
    keys["_touchR"] = false;
  });

  // Launch button (touch/click)
  let launchBtnDown = false;
  launchBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    ensureAudio();
    launchBtnDown = true;
  });
  launchBtn.addEventListener("pointerup", (e) => {
    e.preventDefault();
    launchBtnDown = false;
  });
  launchBtn.addEventListener("pointerleave", () => {
    launchBtnDown = false;
  });

  restartBtn.addEventListener("click", () => {
    initState();
    gameOverOverlay.classList.add("hidden");
    updateHUD();
  });

  // ── Helpers ────────────────────────────────────────────
  function vec2Len(x, y) {
    return Math.sqrt(x * x + y * y);
  }
  function vec2Norm(x, y) {
    const l = vec2Len(x, y) || 1;
    return { x: x / l, y: y / l };
  }
  function dot(ax, ay, bx, by) {
    return ax * bx + ay * by;
  }
  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Closest point on segment to point
  function closestPointOnSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return { x: x1, y: y1 };
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = clamp(t, 0, 1);
    return { x: x1 + t * dx, y: y1 + t * dy };
  }

  // ── Scoring ────────────────────────────────────────────
  function addScore(pts, x, y) {
    // Apply combo multiplier
    const multiplier = Math.min(1 + state.comboCount * 0.5, 5); // max 5x
    const finalPts = Math.round(pts * multiplier);
    state.score += finalPts;

    // Bump combo
    state.comboCount++;
    state.comboTimer = COMBO_DECAY_TIME;

    // Trigger HUD pop animation
    scoreEl.classList.add("pop");
    setTimeout(() => scoreEl.classList.remove("pop"), 150);

    // Show floating score text
    if (x !== undefined && y !== undefined) {
      const comboText = state.comboCount > 2 ? ` x${multiplier.toFixed(1)}` : "";
      state.floatingTexts.push({
        x,
        y,
        text: `+${finalPts}${comboText}`,
        life: 1.0,
        maxLife: 1.0,
        color: state.comboCount > 4 ? "#ffff00" : state.comboCount > 2 ? "#ff8800" : "#ffffff",
        size: state.comboCount > 2 ? 16 : 12,
      });
    }
  }

  function updateHUD() {
    ballsEl.textContent = state.ballsRemaining;
  }

  // ── Particles ──────────────────────────────────────────
  function spawnParticles(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 200;
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.3 + Math.random() * 0.3,
        maxLife: 0.3 + Math.random() * 0.3,
        color,
        r: 2 + Math.random() * 3,
      });
    }
  }

  // ── Screen shake ───────────────────────────────────────
  function triggerShake(amount) {
    state.shakeAmount = Math.max(state.shakeAmount, amount);
  }

  // ── Ball spawn ─────────────────────────────────────────
  function spawnBallInChute() {
    state.ball.x = CHUTE_X + CHUTE_WIDTH / 2;
    state.ball.y = TABLE_BOTTOM - 50;
    state.ball.vx = 0;
    state.ball.vy = 0;
    state.ballInPlay = false;
    state.launching = false;
    state.launchPower = 0;
    state.trail = [];
  }

  // ── Flipper capsule collision ──────────────────────────
  function flipperCollision(pivotX, pivotY, angle, angVel, isLeft) {
    const ball = state.ball;
    // Flipper tip position
    const tipX = pivotX + Math.cos(angle) * FLIPPER_LENGTH;
    const tipY = pivotY + Math.sin(angle) * FLIPPER_LENGTH;

    // Closest point on flipper segment to ball
    const cp = closestPointOnSeg(ball.x, ball.y, pivotX, pivotY, tipX, tipY);
    const dx = ball.x - cp.x;
    const dy = ball.y - cp.y;
    const dist = vec2Len(dx, dy);
    const minDist = BALL_RADIUS + FLIPPER_WIDTH / 2;

    if (dist < minDist && dist > 0) {
      // Push ball out
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = minDist - dist;
      ball.x += nx * overlap;
      ball.y += ny * overlap;

      // Relative velocity of flipper surface at contact point
      const rx = cp.x - pivotX;
      const ry = cp.y - pivotY;
      // Tangential velocity = angVel × r (perpendicular)
      const surfVx = -angVel * ry;
      const surfVy = angVel * rx;

      // Relative ball velocity
      const relVx = ball.vx - surfVx;
      const relVy = ball.vy - surfVy;
      const relDot = dot(relVx, relVy, nx, ny);

      if (relDot < 0) {
        const restitution = 0.6;
        const impulse = -(1 + restitution) * relDot;
        ball.vx += impulse * nx;
        ball.vy += impulse * ny;

        // Extra kick when flipper is actively moving
        const flipperActive = isLeft ? state.leftFlipperActive : state.rightFlipperActive;
        if (flipperActive) {
          const kickStrength = 280;
          ball.vx += surfVx * 0.5;
          ball.vy -= kickStrength;
          spawnParticles(cp.x, cp.y, "#00ccff", 5);
        }
      }
    }
  }

  // ── Wall segment collision ─────────────────────────────
  function wallCollision(x1, y1, x2, y2, restitution) {
    const ball = state.ball;
    const cp = closestPointOnSeg(ball.x, ball.y, x1, y1, x2, y2);
    const dx = ball.x - cp.x;
    const dy = ball.y - cp.y;
    const dist = vec2Len(dx, dy);

    if (dist < BALL_RADIUS && dist > 0) {
      const nx = dx / dist;
      const ny = dy / dist;
      ball.x = cp.x + nx * BALL_RADIUS;
      ball.y = cp.y + ny * BALL_RADIUS;

      const velDot = dot(ball.vx, ball.vy, nx, ny);
      if (velDot < 0) {
        ball.vx -= (1 + restitution) * velDot * nx;
        ball.vy -= (1 + restitution) * velDot * ny;
      }
      return true;
    }
    return false;
  }

  // ── Bumper collision ───────────────────────────────────
  function bumperCollision(bmp, index) {
    const ball = state.ball;
    const dx = ball.x - bmp.x;
    const dy = ball.y - bmp.y;
    const dist = vec2Len(dx, dy);
    const minDist = BALL_RADIUS + bmp.r;

    if (dist < minDist && dist > 0) {
      const nx = dx / dist;
      const ny = dy / dist;
      ball.x = bmp.x + nx * minDist;
      ball.y = bmp.y + ny * minDist;

      const velDot = dot(ball.vx, ball.vy, nx, ny);
      ball.vx -= (1 + BUMPER_RESTITUTION) * velDot * nx;
      ball.vy -= (1 + BUMPER_RESTITUTION) * velDot * ny;

      // Ensure minimum bounce-away speed
      const speed = vec2Len(ball.vx, ball.vy);
      if (speed < 300) {
        const s = 300 / (speed || 1);
        ball.vx *= s;
        ball.vy *= s;
      }

      addScore(bmp.points, bmp.x, bmp.y - bmp.r - 10);
      state.bumperFlash[index] = 0.15;
      sfx.bumper();
      spawnParticles(bmp.x, bmp.y, bmp.color, 12);
      triggerShake(3);
      return true;
    }
    return false;
  }

  // ── Lane detection ─────────────────────────────────────
  function checkLanes() {
    const ball = state.ball;
    for (let i = 0; i < lanes.length; i++) {
      const ln = lanes[i];
      if (ball.x > ln.x && ball.x < ln.x + ln.w && ball.y > ln.y && ball.y < ln.y + ln.h) {
        if (!state.lanesLit[i]) {
          state.lanesLit[i] = true;
          addScore(200, ln.x + ln.w / 2, ln.y - 10);
          sfx.lane();
          spawnParticles(ln.x + ln.w / 2, ln.y + ln.h / 2, "#00ffff", 8);

          // Check bonus
          if (
            state.lanesLit[0] &&
            state.lanesLit[1] &&
            state.lanesLit[2] &&
            !state.lanesBonusAwarded
          ) {
            state.lanesBonusAwarded = true;
            addScore(1000, CANVAS_W / 2, TABLE_TOP + 75);
            sfx.bonus();
            spawnParticles(CANVAS_W / 2, TABLE_TOP + 75, "#ffff00", 25);
            triggerShake(6);
            state.floatingTexts.push({
              x: CANVAS_W / 2,
              y: TABLE_TOP + 100,
              text: "★ ALL LANES BONUS ★",
              life: 2.0,
              maxLife: 2.0,
              color: "#ffff00",
              size: 18,
            });
          }
        }
      }
    }
  }

  // ── Drain detection ────────────────────────────────────
  function checkDrain() {
    const ball = state.ball;
    if (ball.y > DRAIN_Y + BALL_RADIUS + 20) {
      sfx.drain();
      state.ballsRemaining--;
      state.comboCount = 0;
      state.comboTimer = 0;
      updateHUD();

      if (state.ballsRemaining <= 0) {
        state.gameOver = true;
        // Update high score
        if (state.score > state.highScore) {
          state.highScore = state.score;
          localStorage.setItem("pinball_highscore", String(state.score));
        }
        finalScoreEl.textContent = state.score.toLocaleString();
        // Show high score in game over overlay
        const hsEl = document.getElementById("high-score-text");
        if (hsEl) {
          hsEl.textContent = `HIGH SCORE: ${state.highScore.toLocaleString()}`;
          hsEl.style.display = "block";
        }
        gameOverOverlay.classList.remove("hidden");
        sfx.gameOver();
        triggerShake(8);
      } else {
        // Reset lanes for new ball
        state.lanesLit = [false, false, false];
        state.lanesBonusAwarded = false;
        spawnBallInChute();
      }
    }
  }

  // ── Physics update ─────────────────────────────────────
  function update(dt) {
    if (state.gameOver) return;

    state.time += dt;

    // ── Input: flippers ──
    state.leftFlipperActive = keys["ArrowLeft"] || keys["KeyA"] || keys["_touchL"];
    state.rightFlipperActive = keys["ArrowRight"] || keys["KeyD"] || keys["_touchR"];

    // Flipper angle update
    const targetL = state.leftFlipperActive ? FLIPPER_MAX_ANGLE_L : FLIPPER_REST_ANGLE_L;
    const targetR = state.rightFlipperActive ? FLIPPER_MAX_ANGLE_R : FLIPPER_REST_ANGLE_R;

    const prevAngleL = state.leftFlipperAngle;
    const prevAngleR = state.rightFlipperAngle;

    if (state.leftFlipperAngle < targetL) {
      state.leftFlipperAngle = Math.min(state.leftFlipperAngle + FLIPPER_SPEED * dt, targetL);
    } else {
      state.leftFlipperAngle = Math.max(state.leftFlipperAngle - FLIPPER_SPEED * dt, targetL);
    }

    if (state.rightFlipperAngle > targetR) {
      state.rightFlipperAngle = Math.max(state.rightFlipperAngle - FLIPPER_SPEED * dt, targetR);
    } else {
      state.rightFlipperAngle = Math.min(state.rightFlipperAngle + FLIPPER_SPEED * dt, targetR);
    }

    // Play flipper sound on activation edge
    if (state.leftFlipperActive && prevAngleL === FLIPPER_REST_ANGLE_L) sfx.flipper();
    if (state.rightFlipperActive && prevAngleR === FLIPPER_REST_ANGLE_R) sfx.flipper();

    // ── Input: launch ──
    const launchKeyDown = keys["Space"] || launchBtnDown;
    if (!state.ballInPlay) {
      if (launchKeyDown) {
        state.launching = true;
        state.launchPower = Math.min(state.launchPower + LAUNCH_CHARGE_RATE * dt, MAX_LAUNCH_POWER);
      } else if (state.launching) {
        // Release!
        state.ball.vy = -state.launchPower;
        state.ballInPlay = true;
        state.launching = false;
        sfx.launch();
        spawnParticles(state.ball.x, state.ball.y + 10, "#ffaa00", 8);
      }
    }

    // ── Ball physics (sub-stepped) ──
    if (state.ballInPlay) {
      const subDt = dt / SUB_STEPS;
      for (let s = 0; s < SUB_STEPS; s++) {
        const ball = state.ball;

        // Gravity
        ball.vy += GRAVITY * subDt;

        // Velocity integration
        ball.x += ball.vx * subDt;
        ball.y += ball.vy * subDt;

        // Friction
        ball.vx *= FRICTION;
        ball.vy *= FRICTION;

        // Cap max speed
        const speed = vec2Len(ball.vx, ball.vy);
        if (speed > 2000) {
          ball.vx = (ball.vx / speed) * 2000;
          ball.vy = (ball.vy / speed) * 2000;
        }

        // Wall collisions
        for (const w of walls) {
          wallCollision(w[0], w[1], w[2], w[3], WALL_RESTITUTION);
        }

        // Slingshot wall collisions
        for (const sw of slingshotWalls) {
          const hit = wallCollision(
            sw.seg[0],
            sw.seg[1],
            sw.seg[2],
            sw.seg[3],
            SLINGSHOT_RESTITUTION,
          );
          if (hit && sw.slingshot.flash <= 0) {
            const cx =
              (sw.slingshot.verts[0].x + sw.slingshot.verts[1].x + sw.slingshot.verts[2].x) / 3;
            const cy =
              (sw.slingshot.verts[0].y + sw.slingshot.verts[1].y + sw.slingshot.verts[2].y) / 3;
            addScore(50, cx, cy - 20);
            sw.slingshot.flash = 0.15;
            sfx.slingshot();
            spawnParticles(cx, cy, "#00ff88", 8);
            triggerShake(2);
          }
        }

        // Bumper collisions
        for (let i = 0; i < bumpers.length; i++) {
          bumperCollision(bumpers[i], i);
        }

        // Flipper collisions
        const angVelL = (state.leftFlipperAngle - prevAngleL) / dt;
        const angVelR = (state.rightFlipperAngle - prevAngleR) / dt;
        flipperCollision(
          FLIPPER_PIVOT_L.x,
          FLIPPER_PIVOT_L.y,
          state.leftFlipperAngle,
          angVelL,
          true,
        );
        flipperCollision(
          FLIPPER_PIVOT_R.x,
          FLIPPER_PIVOT_R.y,
          state.rightFlipperAngle,
          angVelR,
          false,
        );
      }

      // Update ball trail
      state.trail.push({ x: state.ball.x, y: state.ball.y });
      if (state.trail.length > TRAIL_LENGTH) {
        state.trail.shift();
      }

      // Lane checks (once per frame is fine)
      checkLanes();

      // Drain check
      checkDrain();
    }

    // ── Combo timer decay ──
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) {
        state.comboCount = 0;
      }
    }

    // ── Particles update ──
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 200 * dt; // particle gravity
      p.life -= dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }

    // ── Floating texts update ──
    for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
      const ft = state.floatingTexts[i];
      ft.y -= 40 * dt; // float upward
      ft.life -= dt;
      if (ft.life <= 0) state.floatingTexts.splice(i, 1);
    }

    // ── Bumper flash timers ──
    for (let i = 0; i < state.bumperFlash.length; i++) {
      if (state.bumperFlash[i] > 0) state.bumperFlash[i] -= dt;
    }
    for (const sl of slingshots) {
      if (sl.flash > 0) sl.flash -= dt;
    }

    // ── Screen shake decay ──
    if (state.shakeAmount > 0) {
      state.shakeX = (Math.random() - 0.5) * state.shakeAmount * 2;
      state.shakeY = (Math.random() - 0.5) * state.shakeAmount * 2;
      state.shakeAmount *= 0.85;
      if (state.shakeAmount < 0.3) {
        state.shakeAmount = 0;
        state.shakeX = 0;
        state.shakeY = 0;
      }
    }

    // ── Animated score counter ──
    if (state.displayScore < state.score) {
      const diff = state.score - state.displayScore;
      state.displayScore += Math.ceil(diff * 0.15);
      if (state.displayScore > state.score) state.displayScore = state.score;
    }
    scoreEl.textContent = state.displayScore.toLocaleString();
  }

  // ── Rendering ──────────────────────────────────────────
  function draw() {
    ctx.save();

    // Apply screen shake
    ctx.translate(state.shakeX, state.shakeY);

    ctx.clearRect(-10, -10, CANVAS_W + 20, CANVAS_H + 20);

    // ── Table felt background ──
    const feltGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    feltGrad.addColorStop(0, "#0d1a2e");
    feltGrad.addColorStop(0.3, "#0a1525");
    feltGrad.addColorStop(0.7, "#08101e");
    feltGrad.addColorStop(1, "#050c16");
    ctx.fillStyle = feltGrad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Subtle animated star field
    ctx.globalAlpha = 0.15;
    for (const star of state.stars) {
      const twinkle = 0.5 + 0.5 * Math.sin(state.time * star.speed * 3 + star.x);
      ctx.globalAlpha = 0.05 + 0.15 * twinkle;
      ctx.fillStyle = "#aaccff";
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ── Walls (neon rails) ──
    ctx.strokeStyle = "#ff00ff";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#ff00ff";
    ctx.shadowBlur = 12;
    for (const w of walls) {
      ctx.beginPath();
      ctx.moveTo(w[0], w[1]);
      ctx.lineTo(w[2], w[3]);
      ctx.stroke();
    }
    // Second pass: inner glow line
    ctx.strokeStyle = "#ff88ff44";
    ctx.lineWidth = 6;
    ctx.shadowBlur = 0;
    for (const w of walls) {
      ctx.beginPath();
      ctx.moveTo(w[0], w[1]);
      ctx.lineTo(w[2], w[3]);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // ── Drain zone indicator ──
    const drainPulse = 0.3 + 0.15 * Math.sin(state.time * 4);
    ctx.strokeStyle = `rgba(255, 0, 68, ${drainPulse})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(DRAIN_LEFT, DRAIN_Y);
    ctx.lineTo(DRAIN_RIGHT, DRAIN_Y);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Rollover lanes ──
    for (let i = 0; i < lanes.length; i++) {
      const ln = lanes[i];
      const lit = state.lanesLit[i];
      const pulse = lit ? 1 : 0.4 + 0.1 * Math.sin(state.time * 3 + i * 2);

      ctx.fillStyle = lit ? "#00ffff33" : "#00ffff0a";
      ctx.strokeStyle = lit ? `rgba(0, 255, 255, ${pulse})` : `rgba(0, 255, 255, ${pulse * 0.5})`;
      ctx.lineWidth = 2;
      if (lit) {
        ctx.shadowColor = "#00ffff";
        ctx.shadowBlur = 15;
      }

      // Rounded lane shape
      const cornerR = 6;
      ctx.beginPath();
      ctx.moveTo(ln.x + cornerR, ln.y);
      ctx.lineTo(ln.x + ln.w - cornerR, ln.y);
      ctx.quadraticCurveTo(ln.x + ln.w, ln.y, ln.x + ln.w, ln.y + cornerR);
      ctx.lineTo(ln.x + ln.w, ln.y + ln.h - cornerR);
      ctx.quadraticCurveTo(ln.x + ln.w, ln.y + ln.h, ln.x + ln.w - cornerR, ln.y + ln.h);
      ctx.lineTo(ln.x + cornerR, ln.y + ln.h);
      ctx.quadraticCurveTo(ln.x, ln.y + ln.h, ln.x, ln.y + ln.h - cornerR);
      ctx.lineTo(ln.x, ln.y + cornerR);
      ctx.quadraticCurveTo(ln.x, ln.y, ln.x + cornerR, ln.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Lane label
      ctx.fillStyle = lit ? "#00ffff" : "#00ffff55";
      ctx.font = "bold 16px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(lit ? "★" : ln.label, ln.x + ln.w / 2, ln.y + ln.h / 2);
    }

    // ── Slingshots ──
    for (const sl of slingshots) {
      const v = sl.verts;
      const isFlashing = sl.flash > 0;
      ctx.beginPath();
      ctx.moveTo(v[0].x, v[0].y);
      ctx.lineTo(v[1].x, v[1].y);
      ctx.lineTo(v[2].x, v[2].y);
      ctx.closePath();

      ctx.fillStyle = isFlashing ? "#00ff8855" : "#00ff8818";
      ctx.fill();
      ctx.strokeStyle = isFlashing ? "#00ff88" : "#00ff8866";
      ctx.lineWidth = 2;
      if (isFlashing) {
        ctx.shadowColor = "#00ff88";
        ctx.shadowBlur = 20;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Slingshot label
      if (!isFlashing) {
        const cx = (v[0].x + v[1].x + v[2].x) / 3;
        const cy = (v[0].y + v[1].y + v[2].y) / 3;
        ctx.fillStyle = "#00ff8844";
        ctx.font = "bold 9px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("50", cx, cy);
      }
    }

    // ── Bumpers ──
    for (let i = 0; i < bumpers.length; i++) {
      const bmp = bumpers[i];
      const flash = state.bumperFlash[i] > 0;
      const pulse = 1 + 0.05 * Math.sin(state.time * 5 + i * 1.5);

      // Outer glow ring
      if (flash) {
        ctx.shadowColor = bmp.color;
        ctx.shadowBlur = 30;
      }

      const drawR = bmp.r * pulse;

      // Radial gradient fill
      const grad = ctx.createRadialGradient(bmp.x - 4, bmp.y - 4, 2, bmp.x, bmp.y, drawR);
      if (flash) {
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.3, "#ff88ff");
        grad.addColorStop(1, bmp.color);
      } else {
        grad.addColorStop(0, "#443366");
        grad.addColorStop(0.5, "#221144");
        grad.addColorStop(1, "#110822");
      }

      ctx.beginPath();
      ctx.arc(bmp.x, bmp.y, drawR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Animated border ring
      ctx.strokeStyle = flash ? "#ff88ff" : bmp.color + "88";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Outer decoration ring
      ctx.beginPath();
      ctx.arc(bmp.x, bmp.y, drawR + 4, 0, Math.PI * 2);
      ctx.strokeStyle = flash ? bmp.color : bmp.color + "33";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Score label
      ctx.fillStyle = flash ? "#ffffff" : bmp.color + "99";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(bmp.points), bmp.x, bmp.y);
    }

    // ── Flippers ──
    drawFlipper(
      FLIPPER_PIVOT_L.x,
      FLIPPER_PIVOT_L.y,
      state.leftFlipperAngle,
      state.leftFlipperActive,
    );
    drawFlipper(
      FLIPPER_PIVOT_R.x,
      FLIPPER_PIVOT_R.y,
      state.rightFlipperAngle,
      state.rightFlipperActive,
    );

    // ── Launch chute ──
    drawChute();

    // ── Ball trail ──
    if (state.ballInPlay && state.trail.length > 1) {
      for (let i = 0; i < state.trail.length - 1; i++) {
        const t = state.trail[i];
        const alpha = (i / state.trail.length) * 0.3;
        const radius = BALL_RADIUS * (i / state.trail.length) * 0.5;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#8888ff";
        ctx.beginPath();
        ctx.arc(t.x, t.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // ── Ball ──
    if (state.ballInPlay || !state.gameOver) {
      drawBall(state.ball.x, state.ball.y);
    }

    // ── Particles ──
    for (const p of state.particles) {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // ── Floating score texts ──
    for (const ft of state.floatingTexts) {
      const alpha = ft.life / ft.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = ft.color;
      ctx.font = `bold ${ft.size}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = ft.color;
      ctx.shadowBlur = 8;
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // ── Combo indicator ──
    if (state.comboCount > 1 && state.comboTimer > 0) {
      const alpha = Math.min(state.comboTimer / 0.5, 1);
      ctx.globalAlpha = alpha;
      const multiplier = Math.min(1 + state.comboCount * 0.5, 5);
      const comboColor =
        state.comboCount > 6
          ? "#ff0000"
          : state.comboCount > 4
            ? "#ffff00"
            : state.comboCount > 2
              ? "#ff8800"
              : "#00ffff";

      ctx.fillStyle = comboColor;
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.shadowColor = comboColor;
      ctx.shadowBlur = 10;
      ctx.fillText(`COMBO x${multiplier.toFixed(1)}`, TABLE_RIGHT - 10, TABLE_TOP + 10);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function drawFlipper(px, py, angle, isActive) {
    const tipX = px + Math.cos(angle) * FLIPPER_LENGTH;
    const tipY = py + Math.sin(angle) * FLIPPER_LENGTH;

    // Perpendicular for width
    const perpX = -Math.sin(angle);
    const perpY = Math.cos(angle);
    const hw = FLIPPER_WIDTH / 2;
    const tw = FLIPPER_WIDTH / 4; // tapered tip

    ctx.beginPath();
    ctx.moveTo(px + perpX * hw, py + perpY * hw);
    ctx.lineTo(tipX + perpX * tw, tipY + perpY * tw);
    ctx.lineTo(tipX - perpX * tw, tipY - perpY * tw);
    ctx.lineTo(px - perpX * hw, py - perpY * hw);
    ctx.closePath();

    // Metallic gradient — lights up when active
    const grad = ctx.createLinearGradient(px, py - hw, px, py + hw);
    if (isActive) {
      grad.addColorStop(0, "#eeeeff");
      grad.addColorStop(0.4, "#aabbdd");
      grad.addColorStop(0.6, "#ccddff");
      grad.addColorStop(1, "#8899bb");
      ctx.shadowColor = "#4488ff";
      ctx.shadowBlur = 10;
    } else {
      grad.addColorStop(0, "#ccccdd");
      grad.addColorStop(0.4, "#8888aa");
      grad.addColorStop(0.6, "#aaaacc");
      grad.addColorStop(1, "#666688");
    }
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = isActive ? "#ccddff" : "#aaaacc";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Pivot dot
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    const pivotGrad = ctx.createRadialGradient(px - 1, py - 1, 1, px, py, 5);
    pivotGrad.addColorStop(0, "#ffffff");
    pivotGrad.addColorStop(1, "#8888aa");
    ctx.fillStyle = pivotGrad;
    ctx.fill();
    ctx.strokeStyle = "#666688";
    ctx.stroke();
  }

  function drawChute() {
    // Chute background
    const chuteGrad = ctx.createLinearGradient(CHUTE_X, 0, CHUTE_X + CHUTE_WIDTH, 0);
    chuteGrad.addColorStop(0, "#080810");
    chuteGrad.addColorStop(0.5, "#0c0c18");
    chuteGrad.addColorStop(1, "#080810");
    ctx.fillStyle = chuteGrad;
    ctx.fillRect(CHUTE_X, TABLE_TOP + 40, CHUTE_WIDTH, TABLE_BOTTOM - TABLE_TOP - 40);

    // Spring visual
    if (!state.ballInPlay) {
      const compression = state.launching ? state.launchPower / MAX_LAUNCH_POWER : 0;
      const springTop = TABLE_BOTTOM - 50 + compression * 30;
      const springBottom = TABLE_BOTTOM - 10;
      const segments = 8;
      const segH = (springBottom - springTop) / segments;

      // Spring color based on power
      const hue = 40 - compression * 40; // orange to red
      const springColor = `hsl(${hue}, 100%, ${50 + compression * 20}%)`;

      ctx.strokeStyle = springColor;
      ctx.lineWidth = 2;
      ctx.shadowColor = springColor;
      ctx.shadowBlur = compression > 0.5 ? 8 : 4;
      ctx.beginPath();
      for (let i = 0; i <= segments; i++) {
        const sy = springTop + i * segH;
        const sx = CHUTE_X + CHUTE_WIDTH / 2 + (i % 2 === 0 ? -6 : 6);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Power bar
      if (compression > 0) {
        const barGrad = ctx.createLinearGradient(
          0,
          TABLE_BOTTOM - 15 - compression * 40,
          0,
          TABLE_BOTTOM - 15,
        );
        barGrad.addColorStop(0, `hsl(${hue}, 100%, 60%)`);
        barGrad.addColorStop(1, `hsl(${hue - 10}, 100%, 40%)`);
        ctx.fillStyle = barGrad;
        ctx.fillRect(
          CHUTE_X + 2,
          TABLE_BOTTOM - 15 - compression * 40,
          CHUTE_WIDTH - 4,
          compression * 40,
        );

        // "RELEASE" text when charged enough
        if (compression > 0.3) {
          const textPulse = 0.5 + 0.5 * Math.sin(state.time * 10);
          ctx.globalAlpha = textPulse;
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 8px monospace";
          ctx.textAlign = "center";
          ctx.save();
          ctx.translate(CHUTE_X + CHUTE_WIDTH / 2, TABLE_BOTTOM - 65);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText("RELEASE!", 0, 0);
          ctx.restore();
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  function drawBall(x, y) {
    // Ball shadow
    ctx.beginPath();
    ctx.arc(x + 2, y + 2, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fill();

    // Ball body — metallic chrome effect
    const ballGrad = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, BALL_RADIUS);
    ballGrad.addColorStop(0, "#ffffff");
    ballGrad.addColorStop(0.3, "#ddddee");
    ballGrad.addColorStop(0.7, "#9999bb");
    ballGrad.addColorStop(1, "#6666aa");
    ctx.beginPath();
    ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = ballGrad;
    ctx.fill();

    // Shiny highlight
    ctx.beginPath();
    ctx.arc(x - 2, y - 2, BALL_RADIUS * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fill();

    // Neon glow
    ctx.shadowColor = "#6666ff";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(x, y, BALL_RADIUS + 1, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(100,100,255,0.3)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // ── Game loop ──────────────────────────────────────────
  let lastTime = 0;

  function gameLoop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // cap to avoid spiral
    lastTime = timestamp;

    update(dt);
    draw();

    requestAnimationFrame(gameLoop);
  }

  // ── Init ───────────────────────────────────────────────
  initState();
  spawnBallInChute();
  updateHUD();
  requestAnimationFrame((ts) => {
    lastTime = ts;
    gameLoop(ts);
  });
})();
