/**
 * useStrictRuntimeMode — Phase 3 Step 2 scaffold (additive, behavior-preserving).
 *
 * Reads `VITE_STRICT_RUNTIME_MODE` (build-time env). When `true`:
 *   - LIVE-only surfaces refuse to render PAPER affordances
 *   - Reconnect forces snapshot fetch before optimistic UI updates
 *   - "paper sim" labels are stripped at runtime when mode is LIVE
 *
 * Default: `false` during rollout (Phase 3 Step 5 flips it after a
 * 7-day soak). With the flag off, this hook returns `false` and no
 * existing UI changes — Step 2 only ships the helper so call sites
 * can be migrated in Step 2b without further env plumbing.
 *
 * See `.local/docs/phase-3-paper-sim-audit.md` for the drift sites
 * that will read this hook in Step 2b.
 */

const RAW = (import.meta.env.VITE_STRICT_RUNTIME_MODE as string | undefined) ?? "";

/** Module-level constant — env is fixed at build time. */
const STRICT = RAW === "true" || RAW === "1";

export function isStrictRuntimeMode(): boolean {
  return STRICT;
}

/** React hook form — identical value, exists so call sites read as hooks. */
export function useStrictRuntimeMode(): boolean {
  return STRICT;
}
