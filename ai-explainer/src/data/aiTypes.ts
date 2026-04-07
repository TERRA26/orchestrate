export interface AIType {
  title: string;
  subtitle: string;
  description: string;
  examples: string[];
  icon: string;
  color: string;
}

export const aiTypes: AIType[] = [
  {
    title: "Narrow AI",
    subtitle: "Also called Weak AI",
    description:
      "Narrow AI is designed and trained for a specific task. It operates within a limited, predefined range and cannot generalize beyond its training domain. Despite the name 'weak,' these systems can be incredibly powerful at their particular function — often surpassing human performance in their specialized area.",
    examples: [
      "Siri, Alexa, and Google Assistant",
      "Netflix and Spotify recommendations",
      "Spam email filters",
      "Self-driving car systems",
      "Medical image analysis tools",
    ],
    icon: "🎯",
    color: "#3b82f6",
  },
  {
    title: "General AI",
    subtitle: "Also called Strong AI or AGI",
    description:
      "Artificial General Intelligence (AGI) refers to a hypothetical machine that possesses the ability to understand, learn, and apply intelligence across any intellectual task that a human can perform. AGI would be able to transfer knowledge between domains, reason abstractly, and handle novel situations without specific training.",
    examples: [
      "Does not yet exist",
      "Would match human-level reasoning",
      "Could learn any intellectual task",
      "Would understand context and nuance",
      "Active area of research worldwide",
    ],
    icon: "🌐",
    color: "#8b5cf6",
  },
  {
    title: "Super AI",
    subtitle: "Also called Artificial Superintelligence",
    description:
      "Superintelligent AI is a theoretical concept where machine intelligence would surpass human cognitive abilities in virtually every domain — from scientific creativity and social skills to general wisdom. This remains firmly in the realm of speculation and philosophy, but it drives important discussions about AI safety and alignment.",
    examples: [
      "Purely theoretical concept",
      "Would exceed all human capabilities",
      "Central to AI safety research",
      "Subject of philosophical debate",
      "Drives alignment research today",
    ],
    icon: "✨",
    color: "#06b6d4",
  },
];
