export interface TimelineEntry {
  year: number;
  title: string;
  description: string;
  icon: string;
}

export const timelineData: TimelineEntry[] = [
  {
    year: 1950,
    title: "The Turing Test",
    description:
      'Alan Turing publishes "Computing Machinery and Intelligence," proposing the famous test for machine intelligence and asking the profound question: "Can machines think?" This paper laid the philosophical groundwork for the entire field of artificial intelligence.',
    icon: "🧪",
  },
  {
    year: 1956,
    title: "AI Is Born",
    description:
      'The Dartmouth Conference, organized by John McCarthy, Marvin Minsky, and others, coins the term "Artificial Intelligence." This summer workshop is widely considered the founding event of AI as a formal academic discipline.',
    icon: "🎓",
  },
  {
    year: 1958,
    title: "The Perceptron",
    description:
      "Frank Rosenblatt develops the Perceptron, the first artificial neural network capable of learning. Though limited in capability, it demonstrated that machines could be trained to recognize patterns, inspiring decades of neural network research.",
    icon: "🔮",
  },
  {
    year: 1980,
    title: "Expert Systems Era",
    description:
      "Expert systems like MYCIN and XCON bring AI into commercial use. These rule-based systems encoded human expertise into decision-making software, proving AI's practical value in medicine, manufacturing, and finance.",
    icon: "💼",
  },
  {
    year: 1997,
    title: "Deep Blue Defeats Kasparov",
    description:
      "IBM's Deep Blue defeats world chess champion Garry Kasparov, marking the first time a machine beat a reigning world champion in a classical chess match. This milestone captured global attention and reshaped public perception of AI capabilities.",
    icon: "♟️",
  },
  {
    year: 2012,
    title: "Deep Learning Revolution",
    description:
      "AlexNet wins the ImageNet competition by a huge margin using deep convolutional neural networks. This breakthrough, powered by GPU computing and large datasets, triggers the modern deep learning revolution that transforms computer vision, NLP, and beyond.",
    icon: "🧠",
  },
  {
    year: 2017,
    title: "Transformers & Attention",
    description:
      'Google researchers publish "Attention Is All You Need," introducing the Transformer architecture. This innovation becomes the foundation for GPT, BERT, and virtually all modern large language models, revolutionizing natural language processing.',
    icon: "⚡",
  },
  {
    year: 2023,
    title: "The Age of LLMs",
    description:
      "Large language models like GPT-4 and Claude demonstrate remarkable reasoning, coding, and creative capabilities. AI assistants reach hundreds of millions of users, fundamentally changing how people interact with technology and information.",
    icon: "🚀",
  },
];
