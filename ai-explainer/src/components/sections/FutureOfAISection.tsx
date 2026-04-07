import { motion } from "framer-motion";
import { SectionWrapper } from "../layout/SectionWrapper";
import { GradientText } from "../ui/GradientText";
import { images } from "../../data/images";

const predictions = [
  {
    year: "2025-2027",
    title: "AI-Augmented Work",
    description:
      "AI copilots will become standard in most knowledge work — coding, writing, design, research, and analysis. The productivity gap between AI-augmented and non-augmented workers will grow significantly.",
    icon: "💻",
  },
  {
    year: "2027-2030",
    title: "Multimodal AI Agents",
    description:
      "AI systems that can see, hear, read, and interact with software and the physical world will handle complex multi-step tasks autonomously — from booking travel to managing projects.",
    icon: "🤖",
  },
  {
    year: "2028-2032",
    title: "Scientific Discovery",
    description:
      "AI will accelerate breakthroughs in protein folding, materials science, drug discovery, and climate modeling. Expect AI-designed drugs in clinical trials and new materials for energy storage.",
    icon: "🔬",
  },
  {
    year: "2030-2035",
    title: "Embodied AI & Robotics",
    description:
      "General-purpose robots powered by AI will begin to handle household tasks, warehouse logistics, and elderly care. The convergence of AI and robotics will transform physical labor.",
    icon: "🦾",
  },
  {
    year: "2035+",
    title: "The AGI Question",
    description:
      "Whether or not Artificial General Intelligence arrives on this timeline, the pursuit will drive advances in reasoning, planning, and creativity that reshape every industry and institution.",
    icon: "🌟",
  },
];

export function FutureOfAISection() {
  return (
    <SectionWrapper id="future-of-ai">
      <div className="section-header">
        <GradientText as="h2" className="section-title">
          The Future of AI
        </GradientText>
      </div>

      <div className="future-hero">
        <motion.div
          className="future-image-wrapper"
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <img src={images.robot.url} alt={images.robot.alt} className="future-image" />
          <div className="future-image-overlay" />
        </motion.div>

        <motion.div
          className="future-intro"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <p>
            We stand at an inflection point in human history. The next decade of AI development will
            likely bring changes as profound as the internet revolution — perhaps more so. From
            AI-augmented creativity to autonomous scientific discovery, the possibilities are vast
            and the pace of progress continues to accelerate.
          </p>
          <p>
            The key challenge isn't just building more powerful AI — it's ensuring that these
            systems are developed safely, deployed equitably, and aligned with human values. The
            choices we make now will shape the trajectory of this technology for generations.
          </p>
        </motion.div>
      </div>

      <div className="future-predictions">
        {predictions.map((pred, i) => (
          <motion.div
            key={pred.title}
            className="prediction-card"
            initial={{ opacity: 0, x: i % 2 === 0 ? -30 : 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
          >
            <div className="prediction-year">{pred.year}</div>
            <div className="prediction-content">
              <span className="prediction-icon">{pred.icon}</span>
              <h3 className="prediction-title">{pred.title}</h3>
              <p className="prediction-desc">{pred.description}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </SectionWrapper>
  );
}
