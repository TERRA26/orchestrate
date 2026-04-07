import { useEffect, useState } from "react";
import { sections } from "../data/sections";

export function useActiveSection(): string {
  const [activeSection, setActiveSection] = useState(sections[0].id);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    const visibleSections = new Map<string, number>();

    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (!element) continue;

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              visibleSections.set(section.id, entry.intersectionRatio);
            } else {
              visibleSections.delete(section.id);
            }
          }

          // Find the section with the highest visibility
          let maxRatio = 0;
          let maxSection = activeSection;
          visibleSections.forEach((ratio, id) => {
            if (ratio > maxRatio) {
              maxRatio = ratio;
              maxSection = id;
            }
          });

          if (maxRatio > 0) {
            setActiveSection(maxSection);
          }
        },
        {
          threshold: [0, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0],
          rootMargin: "-80px 0px -20% 0px",
        },
      );

      observer.observe(element);
      observers.push(observer);
    }

    return () => {
      observers.forEach((obs) => obs.disconnect());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return activeSection;
}
