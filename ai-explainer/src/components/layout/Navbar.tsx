import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { sections } from "../../data/sections";

interface NavbarProps {
  activeSection: string;
}

export function Navbar({ activeSection }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      setMobileOpen(false);
    }
  };

  return (
    <motion.nav
      className={`navbar ${scrolled ? "navbar-scrolled" : ""}`}
      initial={{ y: -80 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="navbar-inner">
        <div className="navbar-brand" onClick={() => scrollTo("hero")}>
          <span className="navbar-logo">AI</span>
          <span className="navbar-title">Explorer</span>
        </div>

        <button
          className="mobile-menu-btn"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <span className={`hamburger ${mobileOpen ? "open" : ""}`} />
        </button>

        <div className={`navbar-links ${mobileOpen ? "mobile-open" : ""}`}>
          {sections.map((section) => (
            <button
              key={section.id}
              className={`nav-link ${activeSection === section.id ? "active" : ""}`}
              onClick={() => scrollTo(section.id)}
            >
              {section.label}
              {activeSection === section.id && (
                <motion.div className="nav-indicator" layoutId="nav-indicator" />
              )}
            </button>
          ))}
        </div>
      </div>
    </motion.nav>
  );
}
