import { ThreadId } from "@orchestrate/contracts";

/**
 * Sentinel ThreadId used by the settings panel.
 *
 * The settings panel reuses TraitsPicker, which is typed for a real
 * thread context. But the settings flow has no thread, only a global
 * provider/model preference. Constructing a properly branded ThreadId
 * here keeps the prop type honest while clearly marking the value as
 * the well-known "settings" sentinel rather than a thread that ever
 * existed.
 *
 * Use this constant instead of `"settings" as unknown as ThreadId`,
 * which silently bypassed the brand validation.
 *
 * @see ORC-260
 */
export const SETTINGS_THREAD_ID: ThreadId = ThreadId.makeUnsafe("settings");
