import { motion } from "framer-motion";
import { SectionWrapper } from "../layout/SectionWrapper";
import { GradientText } from "../ui/GradientText";

const benefits = [
  {
    icon: "⚡",
    title: "Increased Efficiency",
    desc: "AI automates repetitive tasks, freeing humans to focus on creative and strategic work. Manufacturing, logistics, and customer service have seen productivity gains of 20-40%.",
  },
  {
    icon: "🏥",
    title: "Healthcare Breakthroughs",
    desc: "AI accelerates drug discovery, enables early disease detection, and personalizes treatment plans. AI-powered diagnostics can detect certain cancers with 95%+ accuracy.",
  },
  {
    icon: "🌍",
    title: "Climate Solutions",
    desc: "AI optimizes energy grids, improves weather forecasting, and helps track deforestation. Machine learning models are finding new materials for solar cells and batteries.",
  },
  {
    icon: "📚",
    title: "Personalized Education",
    desc: "Adaptive learning platforms tailor content to each student's pace and style, making quality education more accessible to billions worldwide.",
  },
  {
    icon: "♿",
    title: "Accessibility",
    desc: "AI powers real-time captioning, screen readers, sign language translation, and voice interfaces that open the digital world to people with disabilities.",
  },
];

const risks = [
  {
    icon: "🔒",
    title: "Privacy Concerns",
    desc: "AI systems require vast amounts of data, raising questions about surveillance, data collection, consent, and the potential for misuse of personal information.",
  },
  {
    icon: "⚖️",
    title: "Bias & Fairness",
    desc: "AI models can perpetuate and amplify existing biases in training data, leading to discriminatory outcomes in hiring, lending, criminal justice, and healthcare.",
  },
  {
    icon: "💼",
    title: "Job Displacement",
    desc: "Automation may eliminate certain job categories faster than new ones are created, requiring massive reskilling efforts and new social safety nets.",
  },
  {
    icon: "🎭",
    title: "Deepfakes & Misinformation",
    desc: "Generative AI can create convincing fake images, audio, and video, threatening trust in media, elections, and public discourse.",
  },
  {
    icon: "🤖",
    title: "Autonomy & Control",
    desc: "As AI systems become more capable, ensuring they remain aligned with human values and under human control becomes increasingly critical.",
  },
];

const itemVariants = {
  hidden: { opacity: 0, x: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: i * 0.1 },
  }),
};

export function BenefitsRisksSection() {
  return (
    <SectionWrapper id="benefits-risks">
      <div className="section-header">
        <GradientText as="h2" className="section-title">
          Benefits & Risks of AI
        </GradientText>
        <p className="section-subtitle">
          Like any powerful technology, artificial intelligence presents both tremendous
          opportunities and significant challenges. Understanding both sides is essential for
          responsible development and deployment.
        </p>
      </div>

      <div className="benefits-risks-grid">
        <div className="br-column">
          <h3 className="br-column-title br-benefits-title">✅ Benefits</h3>
          {benefits.map((item, i) => (
            <motion.div
              key={item.title}
              className="br-card br-benefit"
              variants={itemVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i}
            >
              <span className="br-icon">{item.icon}</span>
              <div>
                <h4 className="br-item-title">{item.title}</h4>
                <p className="br-item-desc">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="br-column">
          <h3 className="br-column-title br-risks-title">⚠️ Risks</h3>
          {risks.map((item, i) => (
            <motion.div
              key={item.title}
              className="br-card br-risk"
              variants={itemVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={i}
            >
              <span className="br-icon">{item.icon}</span>
              <div>
                <h4 className="br-item-title">{item.title}</h4>
                <p className="br-item-desc">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </SectionWrapper>
  );
}
