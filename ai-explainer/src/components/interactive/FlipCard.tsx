import { useState } from "react";
import { motion } from "framer-motion";
import type { AIType } from "../../data/aiTypes";

interface FlipCardProps {
  data: AIType;
  index: number;
}

export function FlipCard({ data, index }: FlipCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <motion.div
      className="flip-card-wrapper"
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.15 }}
    >
      <div
        className={`flip-card ${isFlipped ? "flipped" : ""}`}
        onClick={() => setIsFlipped(!isFlipped)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsFlipped(!isFlipped);
          }
        }}
        aria-label={`${data.title} card. ${isFlipped ? "Click to see front" : "Click to see details"}`}
      >
        {/* Front */}
        <div className="flip-card-face flip-card-front" style={{ borderColor: data.color }}>
          <div className="flip-card-icon">{data.icon}</div>
          <h3 className="flip-card-title">{data.title}</h3>
          <p className="flip-card-subtitle">{data.subtitle}</p>
          <div className="flip-card-hint">Click to learn more</div>
        </div>

        {/* Back */}
        <div className="flip-card-face flip-card-back" style={{ borderColor: data.color }}>
          <h3 className="flip-card-title" style={{ color: data.color }}>
            {data.title}
          </h3>
          <p className="flip-card-description">{data.description}</p>
          <div className="flip-card-examples">
            <strong>Examples:</strong>
            <ul>
              {data.examples.map((ex) => (
                <li key={ex}>{ex}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
