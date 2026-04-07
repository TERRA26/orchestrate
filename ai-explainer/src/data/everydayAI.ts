export interface EverydayAIItem {
  title: string;
  description: string;
  detail: string;
  icon: string;
  imageUrl?: string;
}

export const everydayAIItems: EverydayAIItem[] = [
  {
    title: "Voice Assistants",
    description:
      "Siri, Alexa, and Google Assistant use NLP to understand and respond to your voice.",
    detail:
      "Voice assistants combine automatic speech recognition (ASR), natural language understanding (NLU), and text-to-speech (TTS) to create conversational experiences. They process millions of requests daily, learning from interactions to improve accuracy. Modern assistants can control smart home devices, set reminders, answer questions, and even carry on contextual conversations.",
    icon: "🎙️",
  },
  {
    title: "Recommendation Engines",
    description: "Netflix, Spotify, and YouTube predict what you'll enjoy next.",
    detail:
      "Recommendation systems use collaborative filtering (finding users with similar tastes), content-based filtering (analyzing item features), and deep learning models to predict preferences. Netflix estimates its recommendation system saves $1 billion annually by reducing churn. These systems analyze viewing history, ratings, time of day, and even how long you hover over a thumbnail.",
    icon: "🎬",
  },
  {
    title: "Self-Driving Cars",
    description: "Autonomous vehicles use computer vision, LIDAR, and AI to navigate roads.",
    detail:
      "Self-driving systems fuse data from cameras, LIDAR, radar, and ultrasonic sensors to build a real-time 3D model of the environment. Deep neural networks identify pedestrians, vehicles, traffic signs, and lane markings. Planning algorithms then chart safe paths while predicting what other road users will do next. Companies like Waymo have logged over 20 million autonomous miles.",
    icon: "🚗",
    imageUrl: "https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=600&h=400&fit=crop",
  },
  {
    title: "Medical Diagnosis",
    description: "AI analyzes medical images and patient data to assist doctors.",
    detail:
      "AI systems can now detect certain cancers from medical scans with accuracy matching or exceeding human radiologists. Deep learning models trained on millions of medical images identify patterns invisible to the human eye. AI also accelerates drug discovery by simulating molecular interactions, reducing development timelines from years to months.",
    icon: "🏥",
    imageUrl: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=600&h=400&fit=crop",
  },
  {
    title: "Fraud Detection",
    description: "Banks use AI to spot suspicious transactions in real-time.",
    detail:
      "Financial AI systems analyze millions of transactions per second, using pattern recognition to flag anomalies that might indicate fraud. These models learn from historical data and adapt to new fraud techniques. Machine learning has reduced false positive rates by up to 50% while catching more genuine fraud, saving the banking industry billions annually.",
    icon: "🛡️",
  },
  {
    title: "Smart Home Devices",
    description: "Thermostats, lights, and security systems that learn your preferences.",
    detail:
      "Smart home AI learns your daily routines — when you wake up, leave for work, and go to bed — to automatically adjust temperature, lighting, and security settings. The Nest thermostat, for example, uses reinforcement learning to optimize energy usage, typically saving 10-15% on heating and cooling bills while maintaining comfort.",
    icon: "🏠",
  },
  {
    title: "Language Translation",
    description: "Real-time translation across 100+ languages powered by neural networks.",
    detail:
      "Modern neural machine translation uses the Transformer architecture to translate between languages with remarkable fluency. Unlike earlier phrase-based systems, neural models understand context, idioms, and even tone. Google Translate processes over 100 billion words daily, and recent models can translate speech in real-time, breaking down language barriers globally.",
    icon: "🌍",
  },
  {
    title: "Creative AI",
    description: "AI generates art, music, code, and written content.",
    detail:
      "Generative AI models like DALL-E, Midjourney, and Stable Diffusion create images from text descriptions. Large language models write essays, code, and poetry. AI music composers generate original compositions in any style. These tools are transforming creative industries, not replacing artists but augmenting human creativity with powerful new capabilities.",
    icon: "🎨",
  },
];
