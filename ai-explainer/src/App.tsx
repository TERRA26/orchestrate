import { Navbar } from "./components/layout/Navbar";
import { HeroSection } from "./components/sections/HeroSection";
import { WhatIsAISection } from "./components/sections/WhatIsAISection";
import { HowAIWorksSection } from "./components/sections/HowAIWorksSection";
import { TypesOfAISection } from "./components/sections/TypesOfAISection";
import { AIEverydaySection } from "./components/sections/AIEverydaySection";
import { MLExplainedSection } from "./components/sections/MLExplainedSection";
import { BenefitsRisksSection } from "./components/sections/BenefitsRisksSection";
import { FutureOfAISection } from "./components/sections/FutureOfAISection";
import { FooterSection } from "./components/sections/FooterSection";
import { useActiveSection } from "./hooks/useActiveSection";

export default function App() {
  const activeSection = useActiveSection();

  return (
    <div className="app">
      <Navbar activeSection={activeSection} />
      <main>
        <HeroSection />
        <WhatIsAISection />
        <HowAIWorksSection />
        <TypesOfAISection />
        <AIEverydaySection />
        <MLExplainedSection />
        <BenefitsRisksSection />
        <FutureOfAISection />
      </main>
      <FooterSection />
    </div>
  );
}
