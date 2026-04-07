import type { CSSProperties, ReactNode } from "react";

interface GradientTextProps {
  children: ReactNode;
  className?: string;
  as?: "span" | "h1" | "h2" | "h3" | "h4" | "p" | "div";
}

const style: CSSProperties = {
  background: "linear-gradient(135deg, #3b82f6, #8b5cf6, #06b6d4)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
};

export function GradientText({ children, className = "", as: Tag = "span" }: GradientTextProps) {
  return (
    <Tag className={className} style={style}>
      {children}
    </Tag>
  );
}
