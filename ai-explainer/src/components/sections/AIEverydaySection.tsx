import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SectionWrapper } from "../layout/SectionWrapper";
import { GradientText } from "../ui/GradientText";
import { everydayAIItems } from "../../data/everydayAI";

export function AIEverydaySection() {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <SectionWrapper id="ai-everyday">
      <div className="section-header">
        <GradientText as="h2" className="section-title">
          AI in Everyday Life
        </GradientText>
        <p className="section-subtitle">
          Artificial intelligence is already woven into the fabric of daily life — often in ways you
          might not even notice. Click any card to explore how AI powers these technologies.
        </p>
      </div>

      <div className="everyday-grid">
        {everydayAIItems.map((item, i) => (
          <motion.div
            key={item.title}
            className={`everyday-card ${expanded === i ? "everyday-card-expanded" : ""}`}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.08 }}
            onClick={() => setExpanded(expanded === i ? null : i)}
            layout
          >
            <div className="everyday-card-header">
              <span className="everyday-icon">{item.icon}</span>
              <div>
                <h3 className="everyday-title">{item.title}</h3>
                <p className="everyday-desc">{item.description}</p>
              </div>
            </div>

            <AnimatePresence>
              {expanded === i && (
                <motion.div
                  className="everyday-detail"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {item.imageUrl && (
                    <img src={item.imageUrl} alt={item.title} className="everyday-detail-img" />
                  )}
                  <p>{item.detail}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    </SectionWrapper>
  );
}
