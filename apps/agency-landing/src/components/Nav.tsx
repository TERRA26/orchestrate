import { useState, useEffect } from 'react';

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 px-8 py-5 flex items-center justify-between transition-all duration-300 ${
        scrolled
          ? 'backdrop-blur-md bg-black/60 border-b border-white/10'
          : 'bg-transparent'
      }`}
    >
      <span className="text-white font-extrabold text-xl tracking-tight">
        AXIOM<span className="text-accent">.</span>
      </span>
      <div className="flex gap-8">
        {(['Work', 'Services', 'Contact'] as const).map((link) => (
          <a
            key={link}
            href={`#${link.toLowerCase()}`}
            className="text-sm text-white/70 hover:text-accent transition-colors duration-200"
          >
            {link}
          </a>
        ))}
      </div>
    </nav>
  );
}
