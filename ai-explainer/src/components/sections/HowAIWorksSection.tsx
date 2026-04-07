import { motion } from "framer-motion";
import { SectionWrapper } from "../layout/SectionWrapper";
import { GradientText } from "../ui/GradientText";
import { NeuralNetworkSVG } from "../interactive/NeuralNetworkSVG";

export function HowAIWorksSection() {
  return (
    <SectionWrapper id="how-ai-works">
      <div className="section-header">
        <GradientText as="h2" className="section-title">
          How Does AI Work?
        </GradientText>
      </div>

      <div className="content-text centered">
        <p>
          At the heart of modern AI lies the <strong>neural network</strong> — a computing system
          inspired by the biological neural networks in the human brain. Neural networks consist of
          layers of interconnected nodes (neurons) that process information in a way that loosely
          mimics how our brains learn and make decisions.
        </p>
        <p>
          Data flows through the network from input to output, being transformed at each layer.
          During training, the network adjusts the <strong>weights</strong> of connections between
          neurons to minimize errors in its predictions. This process, called{" "}
          <strong>backpropagation</strong>, is repeated millions of times until the network learns
          to recognize patterns in the data with high accuracy.
        </p>
      </div>

      {/* Input → Processing → Output diagram */}
      <motion.div
        className="flow-diagram"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
      >
        <div className="flow-step">
          <div className="flow-icon">📥</div>
          <div className="flow-label">Input Data</div>
          <div className="flow-desc">Images, text, numbers, audio</div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step flow-step-highlight">
          <div className="flow-icon">🧠</div>
          <div className="flow-label">Neural Network</div>
          <div className="flow-desc">Pattern recognition & learning</div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="flow-icon">📤</div>
          <div className="flow-label">Output</div>
          <div className="flow-desc">Predictions, decisions, generation</div>
        </div>
      </motion.div>

      <div className="nn-section">
        <h3 className="subsection-title">Interactive Neural Network</h3>
        <NeuralNetworkSVG />
      </div>
    </SectionWrapper>
  );
}
