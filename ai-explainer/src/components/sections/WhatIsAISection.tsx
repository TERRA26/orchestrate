import { motion } from "framer-motion";
import { SectionWrapper } from "../layout/SectionWrapper";
import { GradientText } from "../ui/GradientText";
import { Timeline } from "../interactive/Timeline";
import { images } from "../../data/images";

export function WhatIsAISection() {
  return (
    <SectionWrapper id="what-is-ai">
      <div className="section-header">
        <GradientText as="h2" className="section-title">
          What is Artificial Intelligence?
        </GradientText>
      </div>

      <div className="content-grid two-col">
        <motion.div
          className="content-text"
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p>
            Artificial Intelligence (AI) is the simulation of human intelligence processes by
            computer systems. These processes include <strong>learning</strong> (acquiring
            information and rules for using it), <strong>reasoning</strong> (using rules to reach
            approximate or definite conclusions), and <strong>self-correction</strong>.
          </p>
          <p>
            At its core, AI is about creating systems that can perform tasks that would normally
            require human intelligence. This encompasses everything from recognizing speech and
            images to making decisions, translating languages, and even creating art. Modern AI
            doesn't truly "think" like humans — instead, it uses mathematical models trained on vast
            amounts of data to identify patterns and make predictions.
          </p>
          <p>
            The field has evolved dramatically since its inception in the 1950s. What began as
            academic curiosity has transformed into a technology that touches nearly every aspect of
            modern life, from the recommendations on your phone to breakthroughs in drug discovery
            and climate modeling.
          </p>
        </motion.div>

        <motion.div
          className="content-image-wrapper"
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <img src={images.brain.url} alt={images.brain.alt} className="content-image" />
        </motion.div>
      </div>

      <div className="timeline-section">
        <h3 className="subsection-title">A Brief History of AI</h3>
        <p className="subsection-desc">
          Click on any milestone to learn more about the pivotal moments that shaped artificial
          intelligence.
        </p>
        <Timeline />
      </div>
    </SectionWrapper>
  );
}
