export interface UnsplashImage {
  url: string;
  alt: string;
  photographer: string;
}

export const images = {
  hero: {
    url: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1600&h=900&fit=crop",
    alt: "Abstract AI visualization with neural patterns",
    photographer: "Google DeepMind",
  },
  technology: {
    url: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800&h=600&fit=crop",
    alt: "Technology circuit board closeup",
    photographer: "Adi Goldstein",
  },
  healthcare: {
    url: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=600&h=400&fit=crop",
    alt: "AI in healthcare and medical diagnosis",
    photographer: "National Cancer Institute",
  },
  robot: {
    url: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1200&h=800&fit=crop",
    alt: "Humanoid robot representing the future of AI",
    photographer: "Alex Knight",
  },
  data: {
    url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=600&fit=crop",
    alt: "Data analytics dashboard visualization",
    photographer: "Luke Chesser",
  },
  brain: {
    url: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&h=600&fit=crop",
    alt: "Artificial intelligence digital brain concept",
    photographer: "Steve Johnson",
  },
} as const;
