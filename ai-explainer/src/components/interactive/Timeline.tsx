import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { timelineData } from "../../data/timeline";

export function Timeline() {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="timeline-container">
      <div className="timeline-track">
        {timelineData.map((entry, i) => (
          <motion.div
            key={entry.year}
            className={`timeline-item ${selected === i ? "timeline-item-active" : ""}`}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
          >
            <button
              className="timeline-dot-btn"
              onClick={() => setSelected(selected === i ? null : i)}
              aria-expanded={selected === i}
              aria-label={`${entry.year}: ${entry.title}`}
            >
              <div className="timeline-dot">
                <span className="timeline-icon">{entry.icon}</span>
              </div>
              <div className="timeline-year">{entry.year}</div>
              <div className="timeline-title">{entry.title}</div>
            </button>

            <AnimatePresence>
              {selected === i && (
                <motion.div
                  className="timeline-detail"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <p>{entry.description}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>

      {/* Horizontal connector line */}
      <div className="timeline-line" />
    </div>
  );
}
