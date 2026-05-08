/// <reference lib="dom" />

import { randomUUID } from "node:crypto";

import {
  type BrowserActInput,
  type BrowserConsoleEntry,
  type BrowserNetworkError,
  type BrowserObservedTarget,
  type BrowserPageMetrics,
} from "@orchestrate/contracts";
import { Clock, Effect, Layer, Schedule, Schema } from "effect";
import type { Browser, BrowserContext, Locator, Page } from "playwright";

import {
  DEFAULT_SESSION_REAPER_INTERVAL_MS,
  evaluateIdleSessions,
} from "./sessionReaper.ts";

import {
  BrowserAutomation,
  BrowserAutomationError,
  BrowserAutomationSessionNotFoundError,
} from "../Services/BrowserAutomation.ts";
import {
  isMissingPlaywrightBrowserExecutableError,
  resolveFallbackChromiumExecutablePath,
} from "../browserExecutable.ts";
import {
  liveCenterForSelector,
  type LiveCenterEvaluator,
} from "../clickCoordinates.ts";
import { settle } from "../waitForSettled.ts";

const DEFAULT_VIEWPORT = { width: 1_440, height: 900 } as const;
const POST_ACTION_DELAY_MS = 350;
const NETWORK_IDLE_TIMEOUT_MS = 1_500;
const DOM_CONTENT_LOADED_TIMEOUT_MS = 8_000;
const READY_HINT_TIMEOUT_MS = 5_000;
const ACTION_TIMEOUT_MS = 15_000;
const MAX_CONSOLE_BUFFER = 50;
const MAX_NETWORK_ERROR_BUFFER = 50;

type PlaywrightModule = typeof import("playwright");

interface BrowserTargetDescriptor {
  target: BrowserObservedTarget;
  selector: string;
}

interface BrowserSessionState {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  closeBrowserOnClose: boolean;
  targetDescriptorsById: Map<string, BrowserTargetDescriptor>;
  consoleBuffer: BrowserConsoleEntry[];
  networkErrorBuffer: BrowserNetworkError[];
  /**
   * Epoch ms updated on every requireSession lookup. The reaper compares
   * this against the idle TTL to evict sessions whose owners forgot to
   * call closeSession (ORC-048).
   */
  lastActivityAt: number;
}

interface EvaluatedTarget extends BrowserObservedTarget {
  selector: string;
}

interface RawBrowserObservation {
  readyState: string;
  title: string;
  textSummary: string;
  targets: EvaluatedTarget[];
  pageMetrics: BrowserPageMetrics;
}

const ACCESSIBLE_ROLE_LOCATORS = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "menuitem",
  "option",
  "radio",
  "switch",
  "tab",
  "textbox",
]);

function toBrowserAutomationError(
  operation: string,
  detail: string,
  cause?: unknown,
): BrowserAutomationError {
  return new BrowserAutomationError({
    operation,
    detail,
    ...(cause !== undefined ? { cause } : {}),
  });
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength);
}

function isTransientNavigationEvaluationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Execution context was destroyed") ||
    message.includes("Cannot find context with specified id") ||
    message.includes("Target closed") ||
    message.includes("Navigation failed because page was closed")
  );
}

function buildLocatorCandidates(page: Page, descriptor: BrowserTargetDescriptor): Locator[] {
  const candidates: Locator[] = [];
  const accessibleName = descriptor.target.label || descriptor.target.text || undefined;

  if (descriptor.target.label) {
    candidates.push(page.getByLabel(descriptor.target.label, { exact: true }).first());
  }
  if (descriptor.target.placeholder) {
    candidates.push(page.getByPlaceholder(descriptor.target.placeholder, { exact: true }).first());
  }
  if (accessibleName && ACCESSIBLE_ROLE_LOCATORS.has(descriptor.target.role)) {
    candidates.push(
      page
        .getByRole(descriptor.target.role as Parameters<Page["getByRole"]>[0], {
          name: accessibleName,
          exact: true,
        })
        .first(),
    );
  }
  if (
    descriptor.target.text &&
    (descriptor.target.role === "button" ||
      descriptor.target.role === "link" ||
      descriptor.target.tagName === "button" ||
      descriptor.target.tagName === "a" ||
      descriptor.target.tagName === "summary")
  ) {
    candidates.push(page.getByText(descriptor.target.text, { exact: true }).first());
  }

  candidates.push(page.locator(descriptor.selector).first());
  return candidates;
}

async function tryLocatorCandidates(
  page: Page,
  descriptor: BrowserTargetDescriptor,
  operation: (locator: Locator) => Promise<void>,
): Promise<void> {
  let lastError: unknown = undefined;
  for (const locator of buildLocatorCandidates(page, descriptor)) {
    try {
      await operation(locator);
      return;
    } catch (cause) {
      lastError = cause;
    }
  }

  throw lastError;
}

const loadPlaywright = Effect.tryPromise({
  try: () => import("playwright") as Promise<PlaywrightModule>,
  catch: (cause) =>
    toBrowserAutomationError(
      "browser.loadPlaywright",
      "Playwright is unavailable. Install the browser automation runtime before using orchestrator browser validation.",
      cause,
    ),
});

async function launchBrowser(playwright: PlaywrightModule): Promise<Browser> {
  const launchOptions = {
    headless: true,
    env: {},
    args: ["--disable-extensions", "--disable-file-system"],
  };

  try {
    return await playwright.chromium.launch(launchOptions);
  } catch (cause) {
    if (!isMissingPlaywrightBrowserExecutableError(cause)) {
      throw cause;
    }

    const fallbackExecutablePath = await resolveFallbackChromiumExecutablePath();
    if (!fallbackExecutablePath) {
      throw cause;
    }

    return playwright.chromium.launch({
      ...launchOptions,
      executablePath: fallbackExecutablePath,
    });
  }
}

async function connectOverCdp(playwright: PlaywrightModule, endpointUrl: string): Promise<Browser> {
  return playwright.chromium.connectOverCDP(endpointUrl);
}

async function pageTargetId(page: Page): Promise<string | null> {
  try {
    const session = await page.context().newCDPSession(page);
    try {
      const result = (await session.send("Target.getTargetInfo")) as {
        targetInfo?: { targetId?: unknown };
      };
      const targetId = result.targetInfo?.targetId;
      return typeof targetId === "string" && targetId.length > 0 ? targetId : null;
    } finally {
      await session.detach().catch(() => undefined);
    }
  } catch {
    return null;
  }
}

async function findAttachedPage(input: {
  readonly browser: Browser;
  readonly cdpTargetId?: string;
}): Promise<Page> {
  const pages = input.browser.contexts().flatMap((context) => context.pages());
  if (!input.cdpTargetId) {
    throw new Error("Desktop CDP endpoint did not include a targetId; refusing URL-based attach.");
  }
  for (const page of pages) {
    if ((await pageTargetId(page)) === input.cdpTargetId) {
      return page;
    }
  }
  throw new Error(`CDP target not found for Electron WebContents targetId ${input.cdpTargetId}.`);
}

function waitForSettled(
  page: Page,
  options?: { readonly readyHint?: string },
): Promise<void> {
  return settle(
    {
      domLoaded: async () => {
        await page.waitForLoadState("domcontentloaded", {
          timeout: DOM_CONTENT_LOADED_TIMEOUT_MS,
        });
      },
      selectorReady: async (selector: string) => {
        await page.waitForSelector(selector, {
          timeout: READY_HINT_TIMEOUT_MS,
          state: "attached",
        });
      },
      networkIdle: async () => {
        await page.waitForLoadState("networkidle", {
          timeout: NETWORK_IDLE_TIMEOUT_MS,
        });
      },
      delay: async (ms: number) => {
        await page.waitForTimeout(ms);
      },
    },
    options?.readyHint
      ? { readyHint: options.readyHint, postActionDelayMs: POST_ACTION_DELAY_MS }
      : { postActionDelayMs: POST_ACTION_DELAY_MS },
  );
}

async function captureScreenshotDataUrl(
  page: Page,
  options?: {
    fullPage?: boolean;
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    maxBytes?: number;
  },
): Promise<string | undefined> {
  try {
    const screenshot = await page.screenshot({
      type: "jpeg",
      quality: options?.fullPage ? 65 : 85,
      animations: "disabled",
      caret: "hide",
      scale: "css",
      fullPage: options?.fullPage ?? false,
      timeout: 8_000,
    });
    const dataUrl = `data:image/jpeg;base64,${screenshot.toString("base64")}`;
    if (!options?.maxWidth || !options.maxHeight) {
      return dataUrl;
    }

    const downscaleOptions: {
      maxWidth: number;
      maxHeight: number;
      quality: number;
      maxBytes?: number;
    } = {
      maxWidth: options.maxWidth,
      maxHeight: options.maxHeight,
      quality: options.quality ?? 0.42,
    };
    if (options.maxBytes !== undefined) {
      downscaleOptions.maxBytes = options.maxBytes;
    }
    const downscaled = await downscaleScreenshotDataUrl(page, dataUrl, downscaleOptions);
    if (downscaled) {
      return downscaled;
    }
    return options.maxBytes ? undefined : dataUrl;
  } catch {
    return undefined;
  }
}

async function downscaleScreenshotDataUrl(
  page: Page,
  dataUrl: string,
  options: { maxWidth: number; maxHeight: number; quality: number; maxBytes?: number },
): Promise<string | undefined> {
  const renderDownscaled = (targetPage: Page) =>
    targetPage.evaluate(
      ({ inputDataUrl, maxWidth, maxHeight, quality }) =>
        new Promise<string>((resolve, reject) => {
          const image = new Image();
          image.addEventListener("load", () => {
            const scale = Math.min(
              maxWidth / image.naturalWidth,
              maxHeight / image.naturalHeight,
              1,
            );
            const width = Math.max(1, Math.round(image.naturalWidth * scale));
            const height = Math.max(1, Math.round(image.naturalHeight * scale));
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d");
            if (!context) {
              reject(new Error("Canvas context unavailable."));
              return;
            }
            context.drawImage(image, 0, 0, width, height);
            resolve(canvas.toDataURL("image/jpeg", quality));
          });
          image.addEventListener("error", () =>
            reject(new Error("Could not decode screenshot preview.")),
          );
          image.src = inputDataUrl;
        }),
      {
        inputDataUrl: dataUrl,
        maxWidth: options.maxWidth,
        maxHeight: options.maxHeight,
        quality: options.quality,
      },
    );

  try {
    let candidate: string | undefined;
    try {
      candidate = await renderDownscaled(page);
    } catch {
      const utilityPage = await page.context().newPage();
      try {
        candidate = await renderDownscaled(utilityPage);
      } finally {
        await utilityPage.close().catch(() => undefined);
      }
    }
    if (!candidate) {
      return undefined;
    }
    if (options.maxBytes && Buffer.byteLength(candidate, "utf8") > options.maxBytes) {
      return undefined;
    }
    return candidate;
  } catch {
    return undefined;
  }
}

async function capturePreviewScreenshotDataUrl(page: Page): Promise<string | undefined> {
  const screenshot = await captureScreenshotDataUrl(page);
  if (!screenshot) {
    return undefined;
  }

  for (const candidate of [
    { maxWidth: 1_120, maxHeight: 780, quality: 0.78, maxBytes: 175_000 },
    { maxWidth: 960, maxHeight: 680, quality: 0.72, maxBytes: 155_000 },
    { maxWidth: 800, maxHeight: 560, quality: 0.68, maxBytes: 130_000 },
  ]) {
    const downscaled = await downscaleScreenshotDataUrl(page, screenshot, candidate);
    if (downscaled) {
      return downscaled;
    }
  }

  return downscaleScreenshotDataUrl(page, screenshot, {
    maxWidth: 720,
    maxHeight: 500,
    quality: 0.58,
  });
}

async function captureObservation(input: { page: Page; session?: BrowserSessionState }): Promise<{
  observation: {
    sessionId: string;
    url: string;
    title: string;
    readyState: string;
    textSummary: string;
    screenshotDataUrl?: string;
    previewScreenshotDataUrl?: string;
    fullPageScreenshotDataUrl?: string;
    targets: BrowserObservedTarget[];
    consoleErrors?: BrowserConsoleEntry[];
    networkErrors?: BrowserNetworkError[];
    pageMetrics?: BrowserPageMetrics;
    observedAt: string;
  };
  targetDescriptorsById: Map<string, BrowserTargetDescriptor>;
}> {
  let raw: RawBrowserObservation | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      raw = await input.page.evaluate(() => {
        const MAX_TARGETS = 64;
        const MAX_TEXT_SUMMARY_LENGTH = 4_000;

        // eslint-disable-next-line unicorn/consistent-function-scoping
        const cleanText = (value: string | null | undefined, maxLength: number): string => {
          const normalized = (value ?? "").replace(/\s+/g, " ").trim();
          return normalized.length <= maxLength ? normalized : normalized.slice(0, maxLength);
        };

        // eslint-disable-next-line unicorn/consistent-function-scoping
        const escapeCssSegment = (value: string): string => {
          if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
            return CSS.escape(value);
          }
          return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
        };

        const toCssPath = (element: Element): string => {
          const htmlElement = element as HTMLElement;
          if (htmlElement.id) {
            return `#${escapeCssSegment(htmlElement.id)}`;
          }

          const segments: string[] = [];
          let current: Element | null = element;
          while (current && current !== document.body) {
            const parent: Element | null = current.parentElement;
            const tagName = current.tagName.toLowerCase();
            let segment = tagName;
            if (parent) {
              const siblings = Array.from(parent.children).filter(
                (candidate: Element) => candidate.tagName === current?.tagName,
              );
              if (siblings.length > 1) {
                segment += `:nth-of-type(${siblings.indexOf(current) + 1})`;
              }
            }
            segments.unshift(segment);
            current = parent;
          }

          return `body > ${segments.join(" > ")}`;
        };

        // eslint-disable-next-line unicorn/consistent-function-scoping
        const isVisible = (element: HTMLElement): boolean => {
          const htmlElement = element;
          const style = window.getComputedStyle(htmlElement);
          const rect = htmlElement.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.opacity !== "0" &&
            rect.width > 0 &&
            rect.height > 0
          );
        };

        const labelFor = (
          element: HTMLElement & {
            labels?: NodeListOf<HTMLLabelElement>;
            placeholder?: string;
            value?: string;
          },
        ): string => {
          const htmlElement = element;
          const ariaLabel = htmlElement.getAttribute("aria-label");
          if (ariaLabel) {
            return cleanText(ariaLabel, 512);
          }
          if (htmlElement.labels && htmlElement.labels.length > 0) {
            const labels = Array.from(htmlElement.labels)
              .map((label) => cleanText(label.textContent, 512))
              .filter((value) => value.length > 0);
            if (labels.length > 0) {
              return labels.join(" ");
            }
          }
          const ariaLabelledBy = htmlElement.getAttribute("aria-labelledby");
          if (ariaLabelledBy) {
            const labels = ariaLabelledBy
              .split(/\s+/)
              .map((id) => document.getElementById(id))
              .filter((label): label is HTMLElement => label instanceof HTMLElement)
              .map((label) => cleanText(label.textContent, 512))
              .filter((value) => value.length > 0);
            if (labels.length > 0) {
              return labels.join(" ");
            }
          }
          return "";
        };

        const elements = Array.from(
          document.querySelectorAll<HTMLElement>(
            'button, a, input, textarea, select, summary, [role="button"], [role="link"], [role="textbox"], [contenteditable="true"]',
          ),
        );

        const seenSelectors = new Set<string>();
        const targets: Array<EvaluatedTarget> = [];

        for (const element of elements) {
          if (!isVisible(element)) {
            continue;
          }
          const selector = toCssPath(element);
          if (selector.length === 0 || seenSelectors.has(selector)) {
            continue;
          }
          seenSelectors.add(selector);

          const htmlElement = element as HTMLElement & {
            disabled?: boolean;
            placeholder?: string;
          };
          const rect = htmlElement.getBoundingClientRect();
          const label = labelFor(element);
          const text = cleanText(htmlElement.innerText || htmlElement.textContent, 512);
          const placeholder = cleanText(htmlElement.placeholder, 512);
          const role = cleanText(element.getAttribute("role") || element.tagName.toLowerCase(), 64);
          const tagName = cleanText(element.tagName.toLowerCase(), 64);
          const disabled =
            htmlElement.disabled === true || htmlElement.getAttribute("aria-disabled") === "true";

          targets.push({
            id: `target-${targets.length + 1}`,
            selector,
            role,
            tagName,
            ...(label.length > 0 ? { label } : {}),
            ...(text.length > 0 ? { text } : {}),
            ...(placeholder.length > 0 ? { placeholder } : {}),
            disabled,
            x: Math.max(0, Math.round(rect.x)),
            y: Math.max(0, Math.round(rect.y)),
            width: Math.max(0, Math.round(rect.width)),
            height: Math.max(0, Math.round(rect.height)),
          });

          if (targets.length >= MAX_TARGETS) {
            break;
          }
        }

        const interactiveSelector =
          'button, a, input, textarea, select, summary, [role="button"], [role="link"], [role="textbox"], [contenteditable="true"]';
        const totalInteractiveElements = document.querySelectorAll(interactiveSelector).length;
        const totalImages = document.querySelectorAll("img, picture, video, canvas, svg").length;
        const totalLinks = document.querySelectorAll("a[href]").length;
        const totalInputs = document.querySelectorAll("input, textarea, select").length;
        const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"))
          .slice(0, 20)
          .map((heading) => cleanText(heading.textContent, 256))
          .filter((text) => text.length > 0);

        return {
          readyState: document.readyState,
          title: cleanText(document.title, 512),
          textSummary: cleanText(document.body?.innerText, MAX_TEXT_SUMMARY_LENGTH),
          targets,
          pageMetrics: {
            totalInteractiveElements,
            totalImages,
            totalLinks,
            totalInputs,
            headings,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            scrollHeight: document.documentElement.scrollHeight,
            scrollTop: Math.round(window.scrollY),
          },
        };
      });
      break;
    } catch (error) {
      if (attempt >= 2 || !isTransientNavigationEvaluationError(error)) {
        throw error;
      }
      await waitForSettled(input.page);
    }
  }

  if (!raw) {
    throw new Error("Could not inspect browser page.");
  }

  const [screenshotDataUrl, previewScreenshotDataUrl, fullPageScreenshotDataUrl, ariaSnapshot] =
    await Promise.all([
      captureScreenshotDataUrl(input.page, {
        maxWidth: 1600,
        maxHeight: 1200,
        quality: 0.86,
        maxBytes: 1_400_000,
      }),
      capturePreviewScreenshotDataUrl(input.page),
      undefined,
      input.page
        .locator("body")
        .ariaSnapshot({ timeout: 5_000 })
        .then((snapshot) => truncateText(snapshot, 16_000))
        .catch(() => undefined),
    ]);

  const consoleErrors =
    input.session && input.session.consoleBuffer.length > 0
      ? [...input.session.consoleBuffer]
      : undefined;
  const networkErrors =
    input.session && input.session.networkErrorBuffer.length > 0
      ? [...input.session.networkErrorBuffer]
      : undefined;

  if (input.session) {
    input.session.consoleBuffer.length = 0;
    input.session.networkErrorBuffer.length = 0;
  }

  const targetDescriptorsById = new Map<string, BrowserTargetDescriptor>();
  for (const target of raw.targets as EvaluatedTarget[]) {
    targetDescriptorsById.set(target.id, {
      target,
      selector: target.selector,
    });
  }

  return {
    observation: {
      sessionId: "",
      url: truncateText(input.page.url(), 2_048),
      title: truncateText(raw.title, 512),
      readyState: truncateText(raw.readyState, 32),
      textSummary: truncateText(raw.textSummary, 4_000),
      ...(screenshotDataUrl ? { screenshotDataUrl } : {}),
      ...(previewScreenshotDataUrl ? { previewScreenshotDataUrl } : {}),
      ...(fullPageScreenshotDataUrl ? { fullPageScreenshotDataUrl } : {}),
      targets: (raw.targets as EvaluatedTarget[]).map(
        ({ selector: _selector, ...target }) => target,
      ),
      ...(consoleErrors ? { consoleErrors } : {}),
      ...(networkErrors ? { networkErrors } : {}),
      pageMetrics: raw.pageMetrics as BrowserPageMetrics,
      ...(ariaSnapshot ? { ariaSnapshot } : {}),
      observedAt: new Date().toISOString(),
    },
    targetDescriptorsById,
  };
}

const makeBrowserAutomation = () =>
  Effect.gen(function* () {
    const sessions = new Map<string, BrowserSessionState>();

    const closeSessionState = (session: BrowserSessionState) =>
      Effect.tryPromise({
        try: async () => {
          if (session.closeBrowserOnClose) {
            await session.context.close().catch(() => undefined);
            await session.browser.close().catch(() => undefined);
          }
        },
        catch: (cause) =>
          toBrowserAutomationError(
            "browser.closeSession",
            "Failed to close the browser automation session.",
            cause,
          ),
      });

    yield* Effect.addFinalizer(() =>
      Effect.forEach([...sessions.values()], closeSessionState, {
        discard: true,
      }).pipe(Effect.ignore),
    );

    // ORC-048: periodic reaper. Sessions whose owners forgot to call
    // closeSession would otherwise leak Playwright contexts (~50MB each)
    // until the server process exits. The reaper sweeps every
    // SESSION_REAPER_INTERVAL_MS and closes anything idle past the TTL.
    const reapIdleSessionsOnce = Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const entries = [...sessions.entries()].map(([id, session]) => ({
        id,
        lastActivityAt: session.lastActivityAt,
      }));
      const decision = evaluateIdleSessions({ entries, now });
      if (decision.warnExceeded) {
        yield* Effect.logWarning("active browser session count exceeds threshold", {
          event: "browserAutomation.session-warn-threshold",
          activeCount: decision.activeCount,
          threshold: decision.warnThreshold,
        });
      }
      for (const id of decision.toEvict) {
        const session = sessions.get(id);
        if (!session) continue;
        sessions.delete(id);
        yield* Effect.logWarning("reaping idle browser session", {
          event: "browserAutomation.session-reaped",
          sessionId: id,
          idleMs: now - session.lastActivityAt,
          idleTtlMs: decision.idleTtlMs,
        });
        yield* closeSessionState(session).pipe(Effect.ignore);
      }
    });

    yield* reapIdleSessionsOnce.pipe(
      Effect.repeat(Schedule.spaced(DEFAULT_SESSION_REAPER_INTERVAL_MS)),
      Effect.catchCause((cause) =>
        Effect.logWarning("browser session reaper crashed", {
          event: "browserAutomation.reaper-crashed",
          cause: String(cause),
        }),
      ),
      Effect.forkScoped,
    );

    const requireSession = (sessionId: string) =>
      Effect.gen(function* () {
        const session = sessions.get(sessionId);
        if (!session) {
          return yield* Effect.fail(
            new BrowserAutomationSessionNotFoundError({
              sessionId,
            }),
          );
        }
        session.lastActivityAt = yield* Clock.currentTimeMillis;
        return session;
      });

    const openSession = (input: {
      url: string;
      viewportWidth?: number;
      viewportHeight?: number;
      cdpEndpointUrl?: string;
      cdpTargetId?: string;
    }) =>
      Effect.gen(function* () {
        const playwright = yield* loadPlaywright;
        const browser = yield* Effect.tryPromise({
          try: () =>
            input.cdpEndpointUrl
              ? connectOverCdp(playwright, input.cdpEndpointUrl)
              : launchBrowser(playwright),
          catch: (cause) =>
            toBrowserAutomationError(
              "browser.openSession",
              input.cdpEndpointUrl
                ? "Failed to attach to the running Electron browser through CDP."
                : "Failed to launch the browser automation runtime. Install Playwright browsers or make an existing Chromium cache available for fallback launch.",
              cause,
            ),
        });
        const context = input.cdpEndpointUrl
          ? yield* Effect.sync(() => {
              const attachedContext = browser.contexts()[0];
              if (!attachedContext) {
                throw toBrowserAutomationError(
                  "browser.openSession",
                  "CDP attach returned no browser contexts for the running Electron app.",
                );
              }
              return attachedContext;
            })
          : yield* Effect.tryPromise({
              try: () =>
                browser.newContext({
                  ignoreHTTPSErrors: true,
                  viewport: {
                    width: input.viewportWidth ?? DEFAULT_VIEWPORT.width,
                    height: input.viewportHeight ?? DEFAULT_VIEWPORT.height,
                  },
                }),
              catch: (cause) =>
                toBrowserAutomationError(
                  "browser.openSession",
                  "Failed to create a browser context.",
                  cause,
                ),
            });
        const page = yield* Effect.tryPromise({
          try: () =>
            input.cdpEndpointUrl
              ? findAttachedPage({
                  browser,
                  ...(input.cdpTargetId ? { cdpTargetId: input.cdpTargetId } : {}),
                })
              : context.newPage(),
          catch: (cause) =>
            toBrowserAutomationError(
              "browser.openSession",
              input.cdpEndpointUrl
                ? "Failed to resolve the Electron WebContents CDP target."
                : "Failed to create a browser page.",
              cause,
            ),
        });
        const sessionId = randomUUID();
        const consoleBuffer: BrowserConsoleEntry[] = [];
        const networkErrorBuffer: BrowserNetworkError[] = [];
        let openNavigationError: string | undefined;
        let openNavigationStatus: number | undefined;
        let openNavigationStatusText: string | undefined;

        yield* Effect.tryPromise({
          try: async () => {
            try {
              if (!input.cdpEndpointUrl) {
                const response = await page.goto(input.url, {
                  waitUntil: "domcontentloaded",
                });
                if (response) {
                  const status = response.status();
                  if (Number.isFinite(status) && status >= 100 && status <= 599) {
                    openNavigationStatus = status;
                    const statusText = response.statusText();
                    if (typeof statusText === "string" && statusText.length > 0) {
                      openNavigationStatusText = truncateText(statusText, 128);
                    }
                  }
                }
              }
            } catch (navError) {
              openNavigationError = truncateText(
                navError instanceof Error ? navError.message : String(navError),
                512,
              );
            }
            await waitForSettled(page);
          },
          catch: (cause) =>
            toBrowserAutomationError(
              "browser.openSession",
              `Failed to open ${input.url} in the browser automation session.`,
              cause,
            ),
        }).pipe(
          Effect.tapError(() =>
            closeSessionState({
              browser,
              context,
              page,
              closeBrowserOnClose: !input.cdpEndpointUrl,
              targetDescriptorsById: new Map(),
              consoleBuffer: [],
              networkErrorBuffer: [],
              lastActivityAt: 0,
            }).pipe(Effect.ignore),
          ),
        );

        page.on("console", (msg) => {
          const type = msg.type();
          if (type !== "error" && type !== "warning") return;
          if (consoleBuffer.length >= MAX_CONSOLE_BUFFER) return;
          consoleBuffer.push({
            level: type === "error" ? "error" : "warning",
            text: truncateText(msg.text(), 512),
          });
        });
        page.on("pageerror", (error) => {
          if (consoleBuffer.length >= MAX_CONSOLE_BUFFER) return;
          consoleBuffer.push({
            level: "error",
            text: truncateText(String(error), 512),
          });
        });
        page.on("requestfailed", (request) => {
          if (networkErrorBuffer.length >= MAX_NETWORK_ERROR_BUFFER) return;
          const failure = request.failure();
          networkErrorBuffer.push({
            url: truncateText(request.url(), 2_048),
            method: truncateText(request.method(), 16),
            failure: truncateText(failure?.errorText ?? "Unknown failure", 256),
          });
        });

        const openedAt = yield* Clock.currentTimeMillis;
        const sessionState: BrowserSessionState = {
          browser,
          context,
          page,
          closeBrowserOnClose: !input.cdpEndpointUrl,
          targetDescriptorsById: new Map(),
          consoleBuffer,
          networkErrorBuffer,
          lastActivityAt: openedAt,
        };
        const { observation, targetDescriptorsById } = yield* Effect.tryPromise({
          try: async () => captureObservation({ page, session: sessionState }),
          catch: (cause) =>
            toBrowserAutomationError(
              "browser.openSession",
              "Failed to inspect the loaded browser page.",
              cause,
            ),
        });
        sessionState.targetDescriptorsById = targetDescriptorsById;
        sessions.set(sessionId, sessionState);
        return {
          sessionId,
          observation: {
            ...observation,
            sessionId,
            ...(openNavigationError ? { navigationError: openNavigationError } : {}),
            ...(typeof openNavigationStatus === "number"
              ? { navigationStatus: openNavigationStatus }
              : {}),
            ...(typeof openNavigationStatusText === "string"
              ? { navigationStatusText: openNavigationStatusText }
              : {}),
          },
        };
      });

    const act = (input: BrowserActInput) =>
      Effect.gen(function* () {
        const session = yield* requireSession(input.sessionId);

        const lookupTarget = (targetId: string): BrowserTargetDescriptor => {
          const descriptor = session.targetDescriptorsById.get(targetId);
          if (!descriptor) {
            throw new BrowserAutomationError({
              operation: "browser.act",
              detail: `The target '${targetId}' is not available in the current browser observation.`,
            });
          }
          return descriptor;
        };

        let navigationError: string | undefined;
        let evaluateResult: string | undefined;

        yield* Effect.tryPromise({
          try: async () => {
            const actionPromise = (async () => {
              switch (input.action.kind) {
                case "navigate": {
                  try {
                    await session.page.goto(input.action.url, { waitUntil: "domcontentloaded" });
                  } catch (navError) {
                    navigationError = truncateText(
                      navError instanceof Error ? navError.message : String(navError),
                      512,
                    );
                  }
                  break;
                }
                case "click": {
                  const descriptor = lookupTarget(input.action.targetId);
                  await tryLocatorCandidates(session.page, descriptor, (locator) =>
                    locator.click({ timeout: ACTION_TIMEOUT_MS }),
                  );
                  break;
                }
                case "clickAt": {
                  try {
                    await session.page.mouse.click(input.action.x, input.action.y);
                  } catch {
                    // Low-level user-style clicks can race with navigation. Still return
                    // the next observation so the preview does not get stuck on a
                    // transient protocol error.
                  }
                  break;
                }
                case "clickTargetOrAt": {
                  const descriptor = lookupTarget(input.action.targetId);
                  try {
                    await tryLocatorCandidates(session.page, descriptor, (locator) =>
                      locator.click({ timeout: ACTION_TIMEOUT_MS }),
                    );
                  } catch {
                    const evaluator: LiveCenterEvaluator = {
                      evaluate: (snippet, selector) =>
                        session.page.evaluate(snippet, selector),
                    };
                    const liveCenter = await liveCenterForSelector(
                      evaluator,
                      descriptor.selector,
                    );
                    const fallback = liveCenter ?? {
                      x: input.action.x,
                      y: input.action.y,
                    };
                    try {
                      await session.page.mouse.click(fallback.x, fallback.y);
                    } catch {
                      // The preview should keep returning fresh observations even if
                      // an individual user click races with navigation or stale DOM.
                    }
                  }
                  break;
                }
                case "type": {
                  const textAction = input.action;
                  const descriptor = lookupTarget(input.action.targetId);
                  await tryLocatorCandidates(session.page, descriptor, async (locator) => {
                    if (textAction.clearFirst) {
                      await locator.fill(textAction.text, { timeout: ACTION_TIMEOUT_MS });
                      return;
                    }
                    await locator.click({ timeout: ACTION_TIMEOUT_MS });
                    await locator.pressSequentially(textAction.text);
                  });
                  break;
                }
                case "typeFocused": {
                  await session.page.keyboard.type(input.action.text);
                  break;
                }
                case "press": {
                  try {
                    await session.page.keyboard.press(input.action.key);
                  } catch {
                    // Key presses can throw while the page is navigating. Treat that
                    // as a best-effort input and inspect the resulting page state.
                  }
                  break;
                }
                case "scroll": {
                  const delta =
                    input.action.direction === "down" ? input.action.amount : -input.action.amount;
                  await session.page.mouse.wheel(0, delta);
                  break;
                }
                case "wait": {
                  await session.page.waitForTimeout(input.action.ms);
                  break;
                }
                case "resize": {
                  await session.page.setViewportSize({
                    width: input.action.width,
                    height: input.action.height,
                  });
                  break;
                }
                case "waitFor": {
                  const waitTimeout = input.action.timeout ?? 5_000;
                  if (input.action.text) {
                    await session.page
                      .getByText(input.action.text, { exact: false })
                      .first()
                      .waitFor({ state: "visible", timeout: waitTimeout });
                  } else if (input.action.textGone) {
                    await session.page
                      .getByText(input.action.textGone, { exact: false })
                      .first()
                      .waitFor({ state: "hidden", timeout: waitTimeout });
                  }
                  break;
                }
                case "evaluate": {
                  try {
                    const raw = await session.page.evaluate(input.action.expression);
                    evaluateResult = truncateText(
                      typeof raw === "string" ? raw : JSON.stringify(raw),
                      8_000,
                    );
                  } catch (evalError) {
                    evaluateResult = `Error: ${evalError instanceof Error ? evalError.message : String(evalError)}`;
                  }
                  break;
                }
              }
            })();

            await Promise.race([
              actionPromise,
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error(`Browser action '${input.action.kind}' timed out`)),
                  ACTION_TIMEOUT_MS,
                ),
              ),
            ]);

            await waitForSettled(session.page);
          },
          catch: (cause) =>
            Schema.is(BrowserAutomationError)(cause)
              ? cause
              : toBrowserAutomationError(
                  "browser.act",
                  `Failed to execute browser action '${input.action.kind}'.`,
                  cause,
                ),
        });

        const { observation, targetDescriptorsById } = yield* Effect.tryPromise({
          try: async () => captureObservation({ page: session.page, session }),
          catch: (cause) =>
            toBrowserAutomationError(
              "browser.act",
              "Failed to inspect the page after executing a browser action.",
              cause,
            ),
        });
        session.targetDescriptorsById = targetDescriptorsById;
        return {
          observation: {
            ...observation,
            sessionId: input.sessionId,
            ...(navigationError ? { navigationError } : {}),
            ...(evaluateResult ? { evaluateResult } : {}),
          },
        };
      });

    const closeSession = (input: { sessionId: string }) =>
      Effect.gen(function* () {
        const session = yield* requireSession(input.sessionId);
        sessions.delete(input.sessionId);
        yield* closeSessionState(session);
      });

    return {
      openSession,
      act,
      closeSession,
    };
  });

export const BrowserAutomationLive = Layer.effect(BrowserAutomation, makeBrowserAutomation());
