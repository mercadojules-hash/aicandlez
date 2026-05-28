/**
 * useStrictRuntimeMode — Phase 3 Step 2 scaffold (additive, behavior-preserving).
 *
 * Mirrors the PWA hook of the same name so both customer surfaces read
 * the same `VITE_STRICT_RUNTIME_MODE` build-time flag. Default `false`
 * during rollout. See `.local/docs/phase-3-paper-sim-audit.md`.
 */

const RAW = (import.meta.env.VITE_STRICT_RUNTIME_MODE as string | undefined) ?? "";

const STRICT = RAW === "true" || RAW === "1";

export function isStrictRuntimeMode(): boolean {
  return STRICT;
}

export function useStrictRuntimeMode(): boolean {
  return STRICT;
}
