import { useState, useMemo } from "react";
import { motion } from "framer-motion";

interface NodeInfo {
  layer: number;
  index: number;
  cx: number;
  cy: number;
  label: string;
  description: string;
}

interface Connection {
  from: NodeInfo;
  to: NodeInfo;
}

const layerConfig = [
  {
    name: "Input Layer",
    nodes: 4,
    descriptions: [
      "Receives raw data (e.g., pixel values, text tokens). Each input neuron represents one feature of the input data.",
      "Normalizes incoming data to a standard range. This helps the network learn more efficiently.",
      "Encodes categorical features into numerical values the network can process.",
      "Passes preprocessed signals forward to the first hidden layer with initial weights.",
    ],
  },
  {
    name: "Hidden Layer 1",
    nodes: 6,
    descriptions: [
      "Detects low-level patterns like edges or simple word combinations.",
      "Combines multiple input signals using learned weights and a bias term.",
      "Applies an activation function (like ReLU) to introduce non-linearity.",
      "Learns feature representations that are useful for the task.",
      "Neurons here fire when specific input patterns are detected.",
      "Passes transformed signals to the next layer for higher-level processing.",
    ],
  },
  {
    name: "Hidden Layer 2",
    nodes: 6,
    descriptions: [
      "Combines lower-level features into more abstract representations.",
      "Recognizes complex patterns like shapes, phrases, or relationships.",
      "Learns hierarchical features — building on what earlier layers detected.",
      "Applies dropout during training to prevent over-reliance on any single neuron.",
      "Weights are adjusted during backpropagation to minimize prediction error.",
      "Produces rich feature maps that capture the essence of the input data.",
    ],
  },
  {
    name: "Output Layer",
    nodes: 3,
    descriptions: [
      "Produces the final prediction or classification result for category A.",
      "Outputs the probability score for category B. Softmax ensures all outputs sum to 1.",
      "Represents category C. The highest-scoring output neuron determines the prediction.",
    ],
  },
];

const SVG_WIDTH = 700;
const SVG_HEIGHT = 400;
const PADDING_X = 80;
const PADDING_Y = 40;

export function NeuralNetworkSVG() {
  const [hoveredNode, setHoveredNode] = useState<NodeInfo | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeInfo | null>(null);

  const { nodes, connections } = useMemo(() => {
    const allNodes: NodeInfo[] = [];
    const allConnections: Connection[] = [];
    const layerCount = layerConfig.length;
    const layerSpacing = (SVG_WIDTH - 2 * PADDING_X) / (layerCount - 1);

    const prevLayerNodes: NodeInfo[][] = [];

    for (let l = 0; l < layerCount; l++) {
      const layer = layerConfig[l];
      const cx = PADDING_X + l * layerSpacing;
      const nodeSpacing = (SVG_HEIGHT - 2 * PADDING_Y) / (layer.nodes + 1);
      const layerNodes: NodeInfo[] = [];

      for (let n = 0; n < layer.nodes; n++) {
        const cy = PADDING_Y + (n + 1) * nodeSpacing;
        const node: NodeInfo = {
          layer: l,
          index: n,
          cx,
          cy,
          label: `${layer.name} — Neuron ${n + 1}`,
          description: layer.descriptions[n],
        };
        allNodes.push(node);
        layerNodes.push(node);
      }

      // Connect to previous layer
      if (l > 0) {
        for (const fromNode of prevLayerNodes[l - 1]) {
          for (const toNode of layerNodes) {
            allConnections.push({ from: fromNode, to: toNode });
          }
        }
      }

      prevLayerNodes.push(layerNodes);
    }

    return { nodes: allNodes, connections: allConnections };
  }, []);

  const isNodeHighlighted = (node: NodeInfo) => {
    if (!hoveredNode) return false;
    return node === hoveredNode;
  };

  const isConnectionHighlighted = (conn: Connection) => {
    if (!hoveredNode) return false;
    return conn.from === hoveredNode || conn.to === hoveredNode;
  };

  const activeNode = selectedNode ?? hoveredNode;

  return (
    <div className="neural-network-container">
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="neural-network-svg"
        role="img"
        aria-label="Interactive neural network diagram"
      >
        <defs>
          <linearGradient id="nn-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Connections */}
        {connections.map((conn, i) => (
          <motion.line
            key={`conn-${i}`}
            x1={conn.from.cx}
            y1={conn.from.cy}
            x2={conn.to.cx}
            y2={conn.to.cy}
            stroke={isConnectionHighlighted(conn) ? "url(#nn-gradient)" : "rgba(100,120,180,0.15)"}
            strokeWidth={isConnectionHighlighted(conn) ? 2 : 0.8}
            initial={{ pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.5, delay: 0.02 * i, ease: "easeOut" }}
          />
        ))}

        {/* Layer labels */}
        {layerConfig.map((layer, l) => {
          const cx = PADDING_X + l * ((SVG_WIDTH - 2 * PADDING_X) / (layerConfig.length - 1));
          return (
            <text
              key={`label-${l}`}
              x={cx}
              y={SVG_HEIGHT - 8}
              textAnchor="middle"
              fill="rgba(180,190,220,0.7)"
              fontSize="11"
              fontFamily="Inter, sans-serif"
            >
              {layer.name}
            </text>
          );
        })}

        {/* Nodes */}
        {nodes.map((node, i) => (
          <motion.circle
            key={`node-${i}`}
            cx={node.cx}
            cy={node.cy}
            r={isNodeHighlighted(node) ? 14 : 10}
            fill={
              isNodeHighlighted(node)
                ? "url(#nn-gradient)"
                : selectedNode === node
                  ? "#8b5cf6"
                  : "#1e293b"
            }
            stroke="url(#nn-gradient)"
            strokeWidth={selectedNode === node ? 3 : 2}
            filter={isNodeHighlighted(node) ? "url(#glow)" : undefined}
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHoveredNode(node)}
            onMouseLeave={() => setHoveredNode(null)}
            onClick={() => setSelectedNode(selectedNode === node ? null : node)}
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.05 * i }}
          />
        ))}
      </svg>

      {/* Tooltip */}
      {activeNode && (
        <motion.div
          className="nn-tooltip"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
        >
          <div className="nn-tooltip-title">{activeNode.label}</div>
          <p className="nn-tooltip-desc">{activeNode.description}</p>
        </motion.div>
      )}

      <p className="nn-hint">
        Click or hover over neurons to explore how each layer processes information
      </p>
    </div>
  );
}
