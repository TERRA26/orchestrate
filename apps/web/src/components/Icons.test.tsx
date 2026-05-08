import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CursorIcon,
  GitHubIcon,
  VisualStudioCode,
} from "./Icons";

describe("Icons accessibility (ORC-072)", () => {
  it("GitHubIcon defaults to aria-hidden='true' for decorative use", () => {
    const markup = renderToStaticMarkup(<GitHubIcon />);
    expect(markup).toMatch(/aria-hidden="true"/);
    // focusable=false also keeps the SVG out of the keyboard tab order on
    // older IE/Edge (still required by some accessibility audits).
    expect(markup).toMatch(/focusable="false"/);
  });

  it("CursorIcon defaults to aria-hidden='true'", () => {
    const markup = renderToStaticMarkup(<CursorIcon />);
    expect(markup).toMatch(/aria-hidden="true"/);
  });

  it("VisualStudioCode defaults to aria-hidden='true'", () => {
    const markup = renderToStaticMarkup(<VisualStudioCode />);
    expect(markup).toMatch(/aria-hidden="true"/);
  });

  it("does not set aria-hidden when caller supplies aria-label (labeled image)", () => {
    const markup = renderToStaticMarkup(<GitHubIcon aria-label="GitHub repository" />);
    // When the icon is given an accessible name, screen readers should
    // announce it. aria-hidden=true would suppress the label, which is wrong.
    expect(markup).not.toMatch(/aria-hidden="true"/);
    expect(markup).toMatch(/aria-label="GitHub repository"/);
  });

  it("does not set aria-hidden when caller supplies aria-labelledby", () => {
    const markup = renderToStaticMarkup(<GitHubIcon aria-labelledby="github-title" />);
    expect(markup).not.toMatch(/aria-hidden="true"/);
    expect(markup).toMatch(/aria-labelledby="github-title"/);
  });

  it("does not set aria-hidden when caller supplies role='img'", () => {
    const markup = renderToStaticMarkup(<GitHubIcon role="img" />);
    expect(markup).not.toMatch(/aria-hidden="true"/);
    expect(markup).toMatch(/role="img"/);
  });

  it("respects an explicit aria-hidden override from the caller", () => {
    // If a caller deliberately wants aria-hidden=false, the helper should
    // not clobber that with the default. Caller spread wins.
    const markup = renderToStaticMarkup(<GitHubIcon aria-hidden={false} />);
    expect(markup).toMatch(/aria-hidden="false"/);
  });

  it("preserves caller className and other props", () => {
    const markup = renderToStaticMarkup(<GitHubIcon className="size-4" />);
    expect(markup).toMatch(/class="size-4"/);
    expect(markup).toMatch(/aria-hidden="true"/);
  });
});
