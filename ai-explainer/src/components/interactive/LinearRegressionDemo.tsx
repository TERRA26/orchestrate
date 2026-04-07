import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { computeRegression, type Point } from "../../utils/linearRegression";

const INITIAL_POINTS: Point[] = [
  { x: 50, y: 280 },
  { x: 100, y: 250 },
  { x: 150, y: 220 },
  { x: 200, y: 200 },
  { x: 250, y: 170 },
  { x: 300, y: 160 },
  { x: 350, y: 120 },
  { x: 400, y: 100 },
  { x: 450, y: 80 },
];

const SVG_W = 520;
const SVG_H = 360;
const PLOT_MARGIN = { top: 20, right: 20, bottom: 40, left: 50 };
const PLOT_W = SVG_W - PLOT_MARGIN.left - PLOT_MARGIN.right;
const PLOT_H = SVG_H - PLOT_MARGIN.top - PLOT_MARGIN.bottom;

export function LinearRegressionDemo() {
  const [points, setPoints] = useState<Point[]>(INITIAL_POINTS);
  const [dragging, setDragging] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const toSVGCoords = useCallback((clientX: number, clientY: number): Point | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const svgPt = pt.matrixTransform(ctm.inverse());
    // Clamp to plot area
    const x = Math.max(PLOT_MARGIN.left, Math.min(SVG_W - PLOT_MARGIN.right, svgPt.x));
    const y = Math.max(PLOT_MARGIN.top, Math.min(SVG_H - PLOT_MARGIN.bottom, svgPt.y));
    return { x, y };
  }, []);

  const handlePointerDown = (index: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging(index);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragging === null) return;
    const coords = toSVGCoords(e.clientX, e.clientY);
    if (!coords) return;
    setPoints((prev) => prev.map((p, i) => (i === dragging ? coords : p)));
  };

  const handlePointerUp = () => {
    setDragging(null);
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (dragging !== null) return;
    const coords = toSVGCoords(e.clientX, e.clientY);
    if (!coords) return;
    // Check within plot area
    if (
      coords.x >= PLOT_MARGIN.left &&
      coords.x <= SVG_W - PLOT_MARGIN.right &&
      coords.y >= PLOT_MARGIN.top &&
      coords.y <= SVG_H - PLOT_MARGIN.bottom
    ) {
      setPoints((prev) => [...prev, coords]);
    }
  };

  const regression = computeRegression(points);

  // Compute line endpoints across the full plot width
  let lineY1 = 0;
  let lineY2 = 0;
  if (regression) {
    lineY1 = regression.slope * PLOT_MARGIN.left + regression.intercept;
    lineY2 = regression.slope * (SVG_W - PLOT_MARGIN.right) + regression.intercept;
  }

  const randomize = () => {
    const newPoints: Point[] = [];
    for (let i = 0; i < 10; i++) {
      newPoints.push({
        x: PLOT_MARGIN.left + Math.random() * PLOT_W,
        y: PLOT_MARGIN.top + Math.random() * PLOT_H,
      });
    }
    setPoints(newPoints);
  };

  const reset = () => setPoints(INITIAL_POINTS);

  // Convert SVG coords to data space for display
  const toDataX = (svgX: number) => (((svgX - PLOT_MARGIN.left) / PLOT_W) * 10).toFixed(1);
  const toDataY = (svgY: number) => ((1 - (svgY - PLOT_MARGIN.top) / PLOT_H) * 10).toFixed(1);

  return (
    <div className="lr-demo">
      <div className="lr-controls">
        <button className="lr-btn" onClick={randomize}>
          🎲 Randomize
        </button>
        <button className="lr-btn" onClick={reset}>
          ↩️ Reset
        </button>
        <span className="lr-hint">
          Click anywhere on the chart to add points. Drag points to move them.
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="lr-svg"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={handleSvgClick}
        style={{ touchAction: "none" }}
      >
        {/* Grid */}
        {Array.from({ length: 11 }, (_, i) => {
          const x = PLOT_MARGIN.left + (i / 10) * PLOT_W;
          const y = PLOT_MARGIN.top + (i / 10) * PLOT_H;
          return (
            <g key={`grid-${i}`}>
              <line
                x1={x}
                y1={PLOT_MARGIN.top}
                x2={x}
                y2={SVG_H - PLOT_MARGIN.bottom}
                stroke="rgba(100,120,180,0.1)"
                strokeWidth={1}
              />
              <line
                x1={PLOT_MARGIN.left}
                y1={y}
                x2={SVG_W - PLOT_MARGIN.right}
                y2={y}
                stroke="rgba(100,120,180,0.1)"
                strokeWidth={1}
              />
            </g>
          );
        })}

        {/* Axes */}
        <line
          x1={PLOT_MARGIN.left}
          y1={SVG_H - PLOT_MARGIN.bottom}
          x2={SVG_W - PLOT_MARGIN.right}
          y2={SVG_H - PLOT_MARGIN.bottom}
          stroke="rgba(180,190,220,0.4)"
          strokeWidth={1.5}
        />
        <line
          x1={PLOT_MARGIN.left}
          y1={PLOT_MARGIN.top}
          x2={PLOT_MARGIN.left}
          y2={SVG_H - PLOT_MARGIN.bottom}
          stroke="rgba(180,190,220,0.4)"
          strokeWidth={1.5}
        />

        {/* Axis labels */}
        {[0, 2, 4, 6, 8, 10].map((val) => {
          const x = PLOT_MARGIN.left + (val / 10) * PLOT_W;
          const y = SVG_H - PLOT_MARGIN.bottom + (val / 10) * PLOT_H;
          return (
            <g key={`tick-${val}`}>
              <text
                x={x}
                y={SVG_H - PLOT_MARGIN.bottom + 18}
                textAnchor="middle"
                fill="rgba(180,190,220,0.5)"
                fontSize="10"
              >
                {val}
              </text>
              <text
                x={PLOT_MARGIN.left - 12}
                y={PLOT_MARGIN.top + ((10 - val) / 10) * PLOT_H + 4}
                textAnchor="middle"
                fill="rgba(180,190,220,0.5)"
                fontSize="10"
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* Regression line */}
        {regression && (
          <motion.line
            x1={PLOT_MARGIN.left}
            y1={lineY1}
            x2={SVG_W - PLOT_MARGIN.right}
            y2={lineY2}
            stroke="url(#lr-gradient)"
            strokeWidth={2.5}
            strokeLinecap="round"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          />
        )}

        {/* Gradient def */}
        <defs>
          <linearGradient id="lr-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
          <radialGradient id="point-glow">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Data points */}
        {points.map((p, i) => (
          <g key={`point-${i}`}>
            <circle cx={p.x} cy={p.y} r={16} fill="url(#point-glow)" />
            <motion.circle
              cx={p.x}
              cy={p.y}
              r={6}
              fill="#8b5cf6"
              stroke="#c4b5fd"
              strokeWidth={2}
              style={{ cursor: "grab" }}
              whileHover={{ scale: 1.4 }}
              onPointerDown={handlePointerDown(i)}
            />
          </g>
        ))}
      </svg>

      {/* Stats */}
      {regression && (
        <motion.div
          className="lr-stats"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          key={`${regression.slope.toFixed(2)}-${regression.intercept.toFixed(2)}`}
        >
          <div className="lr-stat">
            <span className="lr-stat-label">Equation:</span>
            <span className="lr-stat-value">
              y = {((-regression.slope * 10) / PLOT_W).toFixed(2)}x +{" "}
              {((1 - (regression.intercept - PLOT_MARGIN.top) / PLOT_H) * 10).toFixed(2)}
            </span>
          </div>
          <div className="lr-stat">
            <span className="lr-stat-label">R-squared:</span>
            <span className="lr-stat-value">{regression.rSquared.toFixed(4)}</span>
          </div>
          <div className="lr-stat">
            <span className="lr-stat-label">Points:</span>
            <span className="lr-stat-value">{points.length}</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}
