import { SectionWrapper } from "../layout/SectionWrapper";
import { GradientText } from "../ui/GradientText";
import { LinearRegressionDemo } from "../interactive/LinearRegressionDemo";
import { images } from "../../data/images";
import { motion } from "framer-motion";

export function MLExplainedSection() {
  return (
    <SectionWrapper id="ml-explained">
      <div className="section-header">
        <GradientText as="h2" className="section-title">
          Machine Learning — Try It Yourself
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
            <strong>Machine Learning</strong> is a subset of AI where systems learn from data
            instead of being explicitly programmed. Rather than writing rules for every possible
            scenario, ML algorithms discover patterns in data and improve their performance over
            time.
          </p>
          <p>
            One of the simplest forms of ML is <strong>linear regression</strong> — finding the
            straight line that best fits a set of data points. The algorithm minimizes the distance
            between each point and the line, creating a model that can predict new values.
          </p>
          <p>
            Try the interactive demo below: drag points to see how the best-fit line adjusts in
            real-time. Click on the chart to add new points, or use the buttons to randomize the
            data. Watch how the <strong>R-squared</strong> value changes — it tells you how well the
            line explains the data (1.0 = perfect fit, 0 = no correlation).
          </p>
        </motion.div>

        <motion.div
          className="content-image-wrapper"
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <img src={images.data.url} alt={images.data.alt} className="content-image" />
        </motion.div>
      </div>

      <LinearRegressionDemo />
    </SectionWrapper>
  );
}
