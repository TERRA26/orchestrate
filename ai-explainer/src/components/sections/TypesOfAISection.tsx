import { SectionWrapper } from "../layout/SectionWrapper";
import { GradientText } from "../ui/GradientText";
import { FlipCard } from "../interactive/FlipCard";
import { aiTypes } from "../../data/aiTypes";

export function TypesOfAISection() {
  return (
    <SectionWrapper id="types-of-ai">
      <div className="section-header">
        <GradientText as="h2" className="section-title">
          Types of Artificial Intelligence
        </GradientText>
        <p className="section-subtitle">
          AI can be classified into three broad categories based on capability. Click each card to
          learn more about what distinguishes these types and where they stand today.
        </p>
      </div>

      <div className="flip-cards-grid">
        {aiTypes.map((type, i) => (
          <FlipCard key={type.title} data={type} index={i} />
        ))}
      </div>
    </SectionWrapper>
  );
}
