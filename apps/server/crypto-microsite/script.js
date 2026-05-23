const flowSteps = Array.from(document.querySelectorAll(".flow-step"));
const flowPulse = document.querySelector(".flow-pulse");
const replayButton = document.querySelector("#replay-flow");
const revealTargets = Array.from(document.querySelectorAll(".card, .section-heading"));

const movePulse = (index) => {
  if (!flowPulse || flowSteps.length === 0) return;
  const targetStep = flowSteps[index];
  const yOffset = targetStep.offsetTop + targetStep.offsetHeight / 2 - 26;
  flowPulse.style.transform = `translateY(${yOffset}px)`;
};

const activateStep = (index) => {
  flowSteps.forEach((step, stepIndex) => {
    step.classList.toggle("is-active", stepIndex === index);
  });
  movePulse(index);
};

const playFlow = () => {
  flowSteps.forEach((step) => step.classList.remove("is-active"));

  flowSteps.forEach((_, index) => {
    window.setTimeout(
      () => {
        activateStep(index);
      },
      280 * (index + 1),
    );
  });
};

replayButton?.addEventListener("click", playFlow);

if (flowSteps.length > 0) {
  activateStep(0);
  window.setTimeout(playFlow, 420);
}

revealTargets.forEach((target) => {
  target.setAttribute("data-reveal", "");
});

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    });
  },
  {
    threshold: 0.18,
  },
);

revealTargets.forEach((target) => revealObserver.observe(target));
