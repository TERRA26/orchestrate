import { motion } from "framer-motion";
import { GradientText } from "../ui/GradientText";
import { AnimatedCounter } from "../ui/AnimatedCounter";
import { images } from "../../data/images";

export function HeroSection() {
  const scrollDown = () => {
    document.getElementById("what-is-ai")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section id="hero" className="hero-section">
      <div className="hero-bg">
        <img src={images.hero.url} alt={images.hero.alt} className="hero-bg-img" />
        <div className="hero-overlay" />
      </div>

      <motion.div
        className="hero-content"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: "easeOut" }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <GradientText as="h1" className="hero-title">
            Understanding Artificial Intelligence
          </GradientText>
        </motion.div>

        <motion.p
          className="hero-subtitle"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
        >
          An interactive journey through the science, history, and future of the technology
          reshaping our world
        </motion.p>

        <motion.div
          className="hero-counters"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
        >
          <AnimatedCounter target={300} suffix="M+" label="ChatGPT Users" />
          <AnimatedCounter target={180} suffix="B" prefix="$" label="AI Market Size" />
          <AnimatedCounter target={97} suffix="%" label="Fortune 500 Using AI" />
        </motion.div>

        <motion.button
          className="hero-cta"
          onClick={scrollDown}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          Explore AI
          <span className="cta-arrow">↓</span>
        </motion.button>
      </motion.div>
    </section>
  );
}
