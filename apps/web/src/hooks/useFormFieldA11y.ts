import { useId } from "react";

/**
 * Build aria attributes for a form field plus its error/description text.
 * Returns prop bundles for the input and the error message element so
 * screen readers announce the field as invalid AND read the reason.
 *
 * Usage:
 *   const { inputProps, errorProps } = useFormFieldA11y({ id: "custom-model", error });
 *   return (
 *     <>
 *       <Input {...inputProps} ... />
 *       {error ? <p {...errorProps}>{error}</p> : null}
 *     </>
 *   );
 *
 * @see ORC-074
 * @module hooks/useFormFieldA11y
 */

export interface UseFormFieldA11yInput {
  /**
   * Optional explicit id for the input. When supplied, the error element
   * id is derived as `${id}-error`. When omitted a stable React useId is
   * used; pass an explicit id whenever you have semantic meaning (e.g.
   * "custom-model-codex").
   */
  readonly id?: string;
  /** The current error message, or null/undefined when the field is valid. */
  readonly error?: string | null | undefined;
}

export interface UseFormFieldA11yResult {
  /** Spread onto the <Input> / <input> / <textarea>. */
  readonly inputProps: {
    readonly id: string;
    readonly "aria-invalid": boolean;
    readonly "aria-describedby"?: string;
  };
  /** Spread onto the error <p>/<span>. Sets role=alert for AT priority. */
  readonly errorProps: {
    readonly id: string;
    readonly role: "alert";
    /**
     * Polite live region behavior; combined with role=alert this means
     * AT will announce the message when it appears without interrupting
     * the user's current speech.
     */
    readonly "aria-live": "polite";
  };
  /** Convenience boolean for callers that want a single source of truth. */
  readonly hasError: boolean;
}

export const useFormFieldA11y = (input: UseFormFieldA11yInput): UseFormFieldA11yResult => {
  const fallbackId = useId();
  const id = input.id ?? fallbackId;
  const errorId = `${id}-error`;
  const hasError = Boolean(input.error);
  return {
    inputProps: {
      id,
      "aria-invalid": hasError,
      ...(hasError ? { "aria-describedby": errorId } : {}),
    },
    errorProps: {
      id: errorId,
      role: "alert",
      "aria-live": "polite",
    },
    hasError,
  };
};
