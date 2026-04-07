import { GradientText } from "../ui/GradientText";

export function FooterSection() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <GradientText as="h3" className="footer-logo-text">
            AI Explorer
          </GradientText>
          <p className="footer-tagline">
            An interactive guide to understanding artificial intelligence
          </p>
        </div>

        <div className="footer-links">
          <div className="footer-col">
            <h4>Learn More</h4>
            <a
              href="https://en.wikipedia.org/wiki/Artificial_intelligence"
              target="_blank"
              rel="noopener noreferrer"
            >
              AI on Wikipedia
            </a>
            <a
              href="https://developers.google.com/machine-learning/crash-course"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google ML Crash Course
            </a>
            <a href="https://www.deeplearning.ai/" target="_blank" rel="noopener noreferrer">
              DeepLearning.AI
            </a>
          </div>
          <div className="footer-col">
            <h4>Research</h4>
            <a href="https://arxiv.org/list/cs.AI/recent" target="_blank" rel="noopener noreferrer">
              arXiv AI Papers
            </a>
            <a href="https://openai.com/research" target="_blank" rel="noopener noreferrer">
              OpenAI Research
            </a>
            <a href="https://www.anthropic.com/research" target="_blank" rel="noopener noreferrer">
              Anthropic Research
            </a>
          </div>
          <div className="footer-col">
            <h4>Image Credits</h4>
            <p className="footer-credits">
              Photos from{" "}
              <a href="https://unsplash.com" target="_blank" rel="noopener noreferrer">
                Unsplash
              </a>
              <br />
              by Google DeepMind, Adi Goldstein, Alex Knight, Luke Chesser, Steve Johnson
            </p>
          </div>
        </div>

        <div className="footer-bottom">
          <p>
            Built with React, TypeScript & Framer Motion · <GradientText>AI Explorer</GradientText>{" "}
            © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </footer>
  );
}
