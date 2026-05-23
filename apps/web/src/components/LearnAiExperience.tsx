import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Sparkles } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "~/components/ui/collapsible";
import { Toggle, ToggleGroup } from "~/components/ui/toggle-group";
import { cn } from "~/lib/utils";

type NonEmptyArray<T> = [T, ...T[]];

const HERO_IMAGE = "/media/ai-hero-grid.svg";
const OUTLOOK_IMAGE = "/media/ai-outlook-grid.svg";

type HeroHighlight = {
  label: string;
  value: string;
  detail: string;
};

type HistoryEra = {
  id: string;
  range: string;
  title: string;
  summary: string;
  milestone: string;
};

type Concept = {
  id: string;
  label: string;
  headline: string;
  description: string;
  bullets: string[];
};

type BenefitRisk = {
  id: string;
  category: "benefit" | "risk";
  title: string;
  summary: string;
  guidance: string;
};

type FutureScenario = {
  id: string;
  label: string;
  summary: string;
  signal: string;
  plan: string;
  metric: string;
};

const heroHighlights: NonEmptyArray<HeroHighlight> = [
  {
    label: "Research papers / month",
    value: "12k+",
    detail: "AI literature doubles roughly every 3.5 years.",
  },
  {
    label: "New model releases",
    value: "45",
    detail: "Open weights + APIs launch weekly across providers.",
  },
  {
    label: "Eval suites tracked",
    value: "180",
    detail: "Regression dashboards keep prompts honest.",
  },
];

const historyEras: NonEmptyArray<HistoryEra> = [
  {
    id: "logic",
    range: "1950s – 1970s",
    title: "Symbolic roots",
    summary: "Early researchers encoded logic, search trees, and expert rules by hand.",
    milestone: "Dartmouth workshop coins the term AI and inspires Lisp machines.",
  },
  {
    id: "knowledge",
    range: "1980s",
    title: "Expert systems",
    summary: "Business rules + inference engines automate diagnostics and planning.",
    milestone: "XCON and MYCIN prove knowledge bases can beat human specialists.",
  },
  {
    id: "statistical",
    range: "1990s – 2000s",
    title: "Statistical learning",
    summary: "Support vector machines and ensembles learn patterns from labeled data.",
    milestone: "ImageNet sparks deep learning after GPU training scales up.",
  },
  {
    id: "deep",
    range: "2012 – 2019",
    title: "Deep neural era",
    summary: "Transformers, attention, and reinforcement learning unlock perception and games.",
    milestone: "AlphaGo and translation breakthroughs show emergent strategy.",
  },
  {
    id: "generative",
    range: "2020 – today",
    title: "Generative + agents",
    summary: "Foundation models act through tools, memory, and policies.",
    milestone: "Multi-agent orchestration pairs LLMs with code execution + evaluators.",
  },
];

const conceptSections: NonEmptyArray<Concept> = [
  {
    id: "symbolic",
    label: "Symbolic AI",
    headline: "If-then logic keeps systems auditable.",
    description:
      "Great for compliance-heavy flows because reasoning steps are explicit and verifiable.",
    bullets: [
      "Rule engines, constraint solvers, search",
      "Requires domain experts to curate knowledge",
      "Pairs well with modern LLMs for policy enforcement",
    ],
  },
  {
    id: "ml",
    label: "Machine learning",
    headline: "Statistical models learn from examples.",
    description: "Data-driven patterns manage perception, ranking, and forecasting tasks.",
    bullets: [
      "Supervised + unsupervised training loops",
      "Eval suites catch drift and fairness regressions",
      "Feature stores feed both batch and streaming uses",
    ],
  },
  {
    id: "generative",
    label: "Generative agents",
    headline: "LLMs plan, critique, and call tools in feedback loops.",
    description:
      "Prompting plus retrieval lets one policy synthesize answers across scattered systems.",
    bullets: [
      "Memory layers mix vector recall with business context",
      "Tool calls enforce determinism for critical actions",
      "Guardrails escalate to humans when confidence drops",
    ],
  },
];

const benefitRiskItems: NonEmptyArray<BenefitRisk> = [
  {
    id: "benefit-speed",
    category: "benefit",
    title: "Throughput multiplier",
    summary: "Agents draft repetitive work so humans stay in reviewer mode.",
    guidance: "Automate logging and diff reviews so experts can approve batches in minutes.",
  },
  {
    id: "benefit-coverage",
    category: "benefit",
    title: "Coverage + observability",
    summary: "AI watches every environment, not just sampled tickets.",
    guidance: "Stream metrics into timelines so on-call teams replay any action quickly.",
  },
  {
    id: "risk-drift",
    category: "risk",
    title: "Model drift",
    summary: "Distribution shifts quietly erode accuracy.",
    guidance: "Automate challenger evals and freeze deploys if win-rate dips below policy.",
  },
  {
    id: "risk-privacy",
    category: "risk",
    title: "Data privacy",
    summary: "Training data may contain secrets or regulated records.",
    guidance: "Mask PII before retrieval and log all accesses with least-privilege tokens.",
  },
];

const futureScenarios: NonEmptyArray<FutureScenario> = [
  {
    id: "copilot",
    label: "Copilot everywhere",
    summary: "Every workflow exposes an assistant that edits, simulates, and explains.",
    signal: "85% of enterprise apps embed AI suggestions inline.",
    plan: "Invest in UX instrumentation + fine-tuned tone controls.",
    metric: "NPS lift per workflow",
  },
  {
    id: "autonomy",
    label: "Autonomous ops",
    summary: "Systems self-heal with humans supervising exception queues.",
    signal: "Ops centers review only 10% of incidents manually.",
    plan: "Codify escalation playbooks + runbook-grounded tool calls.",
    metric: "Mean time to restore",
  },
  {
    id: "science",
    label: "AI-first science",
    summary: "Models generate hypotheses, design experiments, and interpret lab outputs.",
    signal: "Benchmarks reward discovery speed, not just accuracy.",
    plan: "Blend symbolic reasoning with generative search for explainability.",
    metric: "Validated discoveries / quarter",
  },
];

const DEFAULT_HISTORY_INDEX = historyEras.length - 1;
const DEFAULT_CONCEPT_ID = conceptSections[2]?.id ?? conceptSections[0].id;
const DEFAULT_SCENARIO_ID = futureScenarios[0].id;

export function LearnAiExperience({
  embedded = false,
  onOpenWorkspace,
}: {
  embedded?: boolean;
  onOpenWorkspace?: (() => void) | undefined;
}) {
  const [historyIndex, setHistoryIndex] = useState(DEFAULT_HISTORY_INDEX);
  const [conceptId, setConceptId] = useState<string>(DEFAULT_CONCEPT_ID);
  const [openDetail, setOpenDetail] = useState<string | null>(benefitRiskItems[0].id);
  const [scenarioId, setScenarioId] = useState<string>(DEFAULT_SCENARIO_ID);

  const activeEra = useMemo(() => historyEras[historyIndex] ?? historyEras[0], [historyIndex]);
  const activeConcept = useMemo(
    () => conceptSections.find((concept) => concept.id === conceptId) ?? conceptSections[0],
    [conceptId],
  );
  const activeScenario = useMemo(
    () => futureScenarios.find((scenario) => scenario.id === scenarioId) ?? futureScenarios[0],
    [scenarioId],
  );

  return (
    <div
      className={cn(
        "flex min-h-0 w-full flex-col bg-gradient-to-b from-background via-background/95 to-background text-foreground",
        embedded ? "h-full" : "h-dvh",
      )}
    >
      <main
        className={cn(
          "mx-auto flex w-full max-w-6xl flex-col gap-10 overflow-y-auto",
          embedded ? "h-full px-4 py-6 sm:px-6 lg:px-8" : "h-full px-4 py-10 sm:px-8 lg:px-12",
        )}
      >
        <HeroSection onOpenWorkspace={onOpenWorkspace} />
        <HistorySection
          activeEra={activeEra}
          historyIndex={historyIndex}
          onHistoryChange={setHistoryIndex}
        />
        <ConceptSection
          conceptId={conceptId}
          activeConcept={activeConcept}
          onConceptChange={setConceptId}
        />
        <BenefitsRisksSection openDetail={openDetail} onDetailChange={setOpenDetail} />
        <FutureSection
          scenarioId={scenarioId}
          activeScenario={activeScenario}
          onScenarioChange={setScenarioId}
        />
      </main>
    </div>
  );
}

function HeroSection({ onOpenWorkspace }: { onOpenWorkspace?: (() => void) | undefined }) {
  return (
    <section className="relative isolate overflow-hidden rounded-[2.25rem] border border-border/60 bg-gradient-to-br from-background via-primary/5 to-background p-8 shadow-xl">
      <div className="relative grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
        <div className="space-y-6">
          <Badge size="sm" variant="info" className="bg-info/15 text-[11px] tracking-[0.35em]">
            LEARN AI
          </Badge>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Systems thinking
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              Understand artificial intelligence across eras, guardrails, and outcomes.
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              AI is not one model. It is a stack: data collection, reasoning engines, evaluators,
              and accountable humans. Use this page as your orientation map before launching the
              next agent or research sprint.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {onOpenWorkspace ? (
              <Button size="sm" onClick={onOpenWorkspace}>
                Explore workspace
                <ArrowRight className="size-4" />
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open("https://developers.openai.com/codex/sdk", "_blank")}
            >
              Read SDK docs
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {heroHighlights.map((item) => (
              <Card
                key={item.label}
                className="rounded-2xl border border-border/70 bg-background/90 p-4"
              >
                <p className="text-2xl font-semibold">{item.value}</p>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-2 text-[13px] text-muted-foreground">{item.detail}</p>
              </Card>
            ))}
          </div>
        </div>
        <div className="relative">
          <div className="absolute -inset-4 rounded-[2.5rem] bg-primary/25 blur-3xl" aria-hidden />
          <div className="relative overflow-hidden rounded-[1.75rem] border border-border/50 bg-card shadow-lg">
            <img
              src={HERO_IMAGE}
              alt="Abstract visualization representing AI signal maps"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-6 text-white">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="size-4" /> Live cognition grid
              </p>
              <p className="text-3xl font-semibold tracking-tight">Observation → Insight</p>
              <p className="text-sm text-white/80">
                Telemetry, retrieval, and planning loops converge so AI reasons with context.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HistorySection({
  activeEra,
  historyIndex,
  onHistoryChange,
}: {
  activeEra: HistoryEra;
  historyIndex: number;
  onHistoryChange: (value: number) => void;
}) {
  return (
    <section className="rounded-[2rem] border border-border/70 bg-card/95 p-6">
      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          History
        </p>
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Five eras of AI</h2>
            <p className="text-sm text-muted-foreground">
              Drag the scrubber to jump between milestones and see how priorities evolved.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-4 py-1 text-sm font-medium">
            <Clock3 className="size-4" /> {activeEra.range}
          </div>
        </div>
      </div>
      <div className="mt-6 space-y-5">
        <input
          type="range"
          min={0}
          max={historyEras.length - 1}
          value={historyIndex}
          onChange={(event) => onHistoryChange(Number(event.currentTarget.value))}
          className="h-1 w-full cursor-pointer accent-primary"
          aria-label="AI history era"
        />
        <div className="rounded-2xl border border-border/70 bg-background/60 p-5">
          <p className="text-base font-semibold">{activeEra.title}</p>
          <p className="mt-2 text-sm text-muted-foreground">{activeEra.summary}</p>
          <p className="mt-4 text-[13px] font-medium text-primary">{activeEra.milestone}</p>
        </div>
        <ol className="grid gap-3 md:grid-cols-5">
          {historyEras.map((era, index) => (
            <li key={era.id}>
              <button
                type="button"
                className={cn(
                  "w-full rounded-2xl border px-4 py-3 text-left transition",
                  index === historyIndex
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/70 hover:border-border text-muted-foreground",
                )}
                aria-pressed={index === historyIndex}
                onClick={() => onHistoryChange(index)}
              >
                <p className="text-[12px] uppercase tracking-[0.2em]">{era.range}</p>
                <p className="mt-2 text-sm font-semibold">{era.title}</p>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function ConceptSection({
  conceptId,
  activeConcept,
  onConceptChange,
}: {
  conceptId: string;
  activeConcept: Concept;
  onConceptChange: (value: string) => void;
}) {
  return (
    <section className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          Key concepts
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Compare major approaches</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Use the toggle group to flip between symbolic rules, statistical learning, and generative
          agents. Each layer works best when paired with the others.
        </p>
        <ToggleGroup
          className="mt-5"
          variant="outline"
          orientation="vertical"
          size="sm"
          value={[conceptId]}
          onValueChange={(value) => {
            const next = value[0];
            if (next) onConceptChange(next);
          }}
        >
          {conceptSections.map((concept) => (
            <Toggle key={concept.id} value={concept.id} className="justify-start">
              {concept.label}
            </Toggle>
          ))}
        </ToggleGroup>
      </Card>
      <Card className="flex flex-col gap-4 rounded-[2rem] border border-border/70 bg-card/95 p-6">
        <div>
          <p className="text-sm font-semibold text-primary">{activeConcept.headline}</p>
          <p className="mt-2 text-lg text-muted-foreground">{activeConcept.description}</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {activeConcept.bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 text-primary" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

function BenefitsRisksSection({
  openDetail,
  onDetailChange,
}: {
  openDetail: string | null;
  onDetailChange: (value: string | null) => void;
}) {
  return (
    <section className="rounded-[2rem] border border-border/70 bg-card/95 p-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          Benefits + risks
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">Design for leverage and safety</h2>
        <p className="text-sm text-muted-foreground">
          Expand each tile to see implementation guidance. Benefits and risks sit side by side so
          teams plan mitigation in the same sprint.
        </p>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {benefitRiskItems.map((item) => (
          <Collapsible
            key={item.id}
            open={openDetail === item.id}
            onOpenChange={(open) => onDetailChange(open ? item.id : null)}
            className={cn(
              "rounded-2xl border border-border/70 bg-background/75 p-4",
              item.category === "benefit" ? "data-open:border-success" : "data-open:border-warning",
            )}
          >
            <CollapsibleTrigger className="flex w-full items-center gap-3 text-left">
              {item.category === "benefit" ? (
                <CheckCircle2 className="size-5 text-success" />
              ) : (
                <AlertTriangle className="size-5 text-warning" />
              )}
              <div className="flex-1">
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.summary}</p>
              </div>
            </CollapsibleTrigger>
            <CollapsiblePanel className="data-open:mt-3">
              <p className="text-sm text-muted-foreground">{item.guidance}</p>
            </CollapsiblePanel>
          </Collapsible>
        ))}
      </div>
    </section>
  );
}

function FutureSection({
  scenarioId,
  activeScenario,
  onScenarioChange,
}: {
  scenarioId: string;
  activeScenario: FutureScenario;
  onScenarioChange: (value: string) => void;
}) {
  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="rounded-[2rem] border border-border/70 bg-card/95 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          Future outlook
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Pick a scenario to plan for</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Toggle scenarios to see how metrics and investment focus shift. This acts like a
          lightweight war-gaming exercise for leadership reviews.
        </p>
        <ToggleGroup
          className="mt-5 flex-wrap gap-2"
          size="sm"
          variant="outline"
          value={[scenarioId]}
          onValueChange={(value) => {
            const next = value[0];
            if (next) onScenarioChange(next);
          }}
        >
          {futureScenarios.map((scenario) => (
            <Toggle key={scenario.id} value={scenario.id}>
              {scenario.label}
            </Toggle>
          ))}
        </ToggleGroup>
        <div className="mt-6 space-y-3 rounded-2xl border border-border/70 bg-background/70 p-5">
          <p className="text-base font-semibold">{activeScenario.summary}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Leading signal
              </p>
              <p className="mt-1 text-sm font-medium">{activeScenario.signal}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Focus plan</p>
              <p className="mt-1 text-sm font-medium">{activeScenario.plan}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                North-star metric
              </p>
              <p className="mt-1 text-sm font-medium">{activeScenario.metric}</p>
            </div>
          </div>
        </div>
      </Card>
      <Card className="overflow-hidden border border-border/70">
        <div className="relative">
          <img
            src={OUTLOOK_IMAGE}
            alt="Layered chart visualizing AI future scenarios"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent p-5 text-white">
            <p className="text-sm font-semibold">Scenario mapper</p>
            <p className="text-xs text-white/80">
              Compare autonomy, safety, and creativity targets before locking next-quarter OKRs.
            </p>
          </div>
        </div>
      </Card>
    </section>
  );
}
