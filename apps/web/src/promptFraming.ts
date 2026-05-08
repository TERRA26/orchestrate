/**
 * Re-export of `@orchestrate/shared/promptFraming` so existing web
 * imports keep resolving. The canonical implementation lives in the
 * shared package now (promoted by ORC-208) so server-side code can
 * use the same neutralizer + wrapper.
 *
 * @see ORC-200
 * @see ORC-208
 */

export {
  neutralizeOrchestratorDirectives,
  wrapUntrustedContent,
  type UntrustedContentKind,
  type WrapUntrustedContentInput,
} from "@orchestrate/shared/promptFraming";
