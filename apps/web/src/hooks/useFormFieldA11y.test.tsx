// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { useFormFieldA11y } from "./useFormFieldA11y";

afterEach(() => {
  cleanup();
});

function Harness({ id, error }: { id?: string; error?: string | null }) {
  const { inputProps, errorProps, hasError } = useFormFieldA11y({
    ...(id !== undefined ? { id } : {}),
    ...(error !== undefined ? { error } : {}),
  });
  return (
    <div>
      <input data-testid="input" {...inputProps} />
      {hasError ? (
        <p data-testid="error" {...errorProps}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

describe("useFormFieldA11y (ORC-074)", () => {
  it("sets aria-invalid='false' and no aria-describedby when there is no error", () => {
    render(<Harness id="custom-model" error={null} />);
    const input = screen.getByTestId("input");
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(input.hasAttribute("aria-describedby")).toBe(false);
    expect(screen.queryByTestId("error")).toBeNull();
  });

  it("sets aria-invalid='true' and links aria-describedby when there is an error", () => {
    render(<Harness id="custom-model" error="Model name already exists." />);
    const input = screen.getByTestId("input");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("custom-model-error");
  });

  it("renders the error element with the matching id, role=alert, and aria-live=polite", () => {
    render(<Harness id="custom-model" error="Bad input." />);
    const error = screen.getByTestId("error");
    expect(error.getAttribute("id")).toBe("custom-model-error");
    expect(error.getAttribute("role")).toBe("alert");
    expect(error.getAttribute("aria-live")).toBe("polite");
  });

  it("derives a stable id when none is supplied (uses React useId)", () => {
    render(<Harness error="Required." />);
    const input = screen.getByTestId("input");
    const errorId = input.getAttribute("aria-describedby");
    expect(errorId).toBeTruthy();
    expect(errorId).toMatch(/-error$/);
    const error = screen.getByTestId("error");
    expect(error.getAttribute("id")).toBe(errorId);
  });

  it("treats an empty string as a valid (non-error) state", () => {
    render(<Harness id="x" error="" />);
    const input = screen.getByTestId("input");
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(input.hasAttribute("aria-describedby")).toBe(false);
  });

  it("hasError is true only when a non-empty string is supplied", () => {
    function Probe({ error }: { error?: string | null }) {
      const { hasError } = useFormFieldA11y(error !== undefined ? { error } : {});
      return <span data-testid="probe">{String(hasError)}</span>;
    }
    const { rerender } = render(<Probe error={null} />);
    expect(screen.getByTestId("probe").textContent).toBe("false");
    rerender(<Probe error="" />);
    expect(screen.getByTestId("probe").textContent).toBe("false");
    rerender(<Probe error="boom" />);
    expect(screen.getByTestId("probe").textContent).toBe("true");
  });
});
