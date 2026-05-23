interface AvatarProps {
  src: string;
  alt: string;
  size?: number;
  hasStory?: boolean;
  storyViewed?: boolean;
  onClick?: () => void;
}

export default function Avatar({
  src,
  alt,
  size = 40,
  hasStory = false,
  storyViewed = false,
  onClick,
}: AvatarProps) {
  const ringClass = hasStory
    ? storyViewed
      ? "p-[2px] bg-gray-300 rounded-full"
      : "p-[2px] story-ring rounded-full"
    : "";

  return (
    <div
      className={`inline-flex flex-shrink-0 ${ringClass} ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
      style={{ width: hasStory ? size + 6 : size, height: hasStory ? size + 6 : size }}
    >
      <img
        src={src}
        alt={alt}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    </div>
  );
}
