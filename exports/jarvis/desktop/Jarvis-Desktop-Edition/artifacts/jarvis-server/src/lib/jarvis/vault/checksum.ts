/**
 * Deterministic integrity primitives for the Jarvis Vault.
 *
 * A vault package's integrity rests on content-addressable checksums: every
 * table payload and the whole package get a SHA-256 over a CANONICAL JSON
 * serialization (recursively key-sorted) so the same logical data always hashes
 * identically regardless of column/row ordering quirks. This is what lets the
 * validation framework prove a package was not corrupted or tampered with in
 * transit / at rest (disaster-recovery corruption detection).
 *
 * Pure + dependency-free (Node `crypto` only). Never throws on well-formed JSON
 * values; callers pass already-JSON-safe data (Dates are pre-serialized to ISO
 * strings by the export engine).
 */
import { createHash } from "crypto";

/**
 * Canonical JSON: recursively sort object keys so serialization is stable.
 * Arrays preserve order (row/element order is semantically meaningful and is
 * itself part of what we checksum).
 */
export function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = canonicalize(obj[key]);
  }
  return out;
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/** SHA-256 over the canonical JSON of any value. */
export function checksumValue(value: unknown): string {
  return sha256Hex(canonicalStringify(value));
}
