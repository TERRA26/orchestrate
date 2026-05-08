/**
 * ORC-239: per-IP auth-attempt rate limiter.
 *
 * The WebSocket auth gate previously rejected bad tokens with a bare
 * 401 and no record. An attacker could run unlimited token guesses
 * from a single source IP. This helper tracks failed attempts per IP
 * and blocks the source after a configurable threshold with
 * exponential backoff.
 *
 * Usage:
 *   const limiter = makeAuthAttemptLimiter();
 *   if (limiter.isBlocked(ip)) reject(429, "Too many attempts");
 *   if (badToken) limiter.recordFailure(ip);
 *   else limiter.recordSuccess(ip);
 *
 * The limiter is in-memory only (no persistence) so a server restart
 * resets counters. That tradeoff is acceptable because a successful
 * exploit would have to run more than the threshold before any
 * restart, and the operator is expected to investigate restart logs.
 *
 * @see ORC-239
 */

export interface AuthAttemptLimiterOptions {
  /** Max failures before the IP enters the first backoff window. Default 5. */
  readonly threshold?: number;
  /** Base block window in milliseconds. Default 30_000 (30s). */
  readonly baseBlockMs?: number;
  /** Maximum block window. Default 30 minutes. */
  readonly maxBlockMs?: number;
  /** Inject a clock for tests. Defaults to `Date.now`. */
  readonly now?: () => number;
}

export interface AuthAttemptOutcome {
  readonly blocked: boolean;
  readonly failureCount: number;
  readonly retryAfterMs?: number;
}

interface IpState {
  failures: number;
  blockedUntilMs: number | null;
}

export interface AuthAttemptLimiter {
  readonly isBlocked: (ip: string) => AuthAttemptOutcome;
  readonly recordFailure: (ip: string) => AuthAttemptOutcome;
  readonly recordSuccess: (ip: string) => void;
  readonly currentState: (ip: string) => AuthAttemptOutcome;
}

export function makeAuthAttemptLimiter(
  options: AuthAttemptLimiterOptions = {},
): AuthAttemptLimiter {
  const threshold = options.threshold ?? 5;
  const baseBlockMs = options.baseBlockMs ?? 30_000;
  const maxBlockMs = options.maxBlockMs ?? 30 * 60 * 1000;
  const now = options.now ?? Date.now;

  const states = new Map<string, IpState>();

  function snapshot(ip: string): AuthAttemptOutcome {
    const state = states.get(ip);
    if (!state) {
      return { blocked: false, failureCount: 0 };
    }
    if (state.blockedUntilMs !== null) {
      const remaining = state.blockedUntilMs - now();
      if (remaining > 0) {
        return {
          blocked: true,
          failureCount: state.failures,
          retryAfterMs: remaining,
        };
      }
      // Block window elapsed; clear it but keep the failure count
      // (continued bad attempts after recovery should escalate
      // faster, not start over).
      state.blockedUntilMs = null;
    }
    return { blocked: false, failureCount: state.failures };
  }

  function isBlocked(ip: string): AuthAttemptOutcome {
    return snapshot(ip);
  }

  function recordFailure(ip: string): AuthAttemptOutcome {
    let state = states.get(ip);
    if (!state) {
      state = { failures: 0, blockedUntilMs: null };
      states.set(ip, state);
    }
    state.failures += 1;
    if (state.failures >= threshold) {
      // Exponential backoff: 30s, 60s, 120s, 240s, ... clamped at
      // maxBlockMs. The exponent is (failures - threshold) clamped so
      // a flood of attempts past the cap stays at the cap, not 2^N.
      const exponent = Math.min(state.failures - threshold, 16);
      const blockMs = Math.min(maxBlockMs, baseBlockMs * Math.pow(2, exponent));
      state.blockedUntilMs = now() + blockMs;
    }
    return snapshot(ip);
  }

  function recordSuccess(ip: string): void {
    states.delete(ip);
  }

  return { isBlocked, recordFailure, recordSuccess, currentState: snapshot };
}
