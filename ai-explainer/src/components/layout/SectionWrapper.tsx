import type { ReactNode } from "react";
import { motion } from "framer-motion";

interface SectionWrapperProps {
  id: string;
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function SectionWrapper({ id, children, className = "", noPadding }: SectionWrapperProps) {
  return (
    <motion.section
      id={id}
      className={`section ${className}`}
      style={noPadding ? { padding: 0 } : undefined}
      initial={{ opacity: 0, y: 60 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
    >
      {children}
    </motion.section>
  );
}
