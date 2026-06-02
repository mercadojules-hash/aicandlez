import { logger } from "./logger.js";

// ── Operator engine ownership ────────────────────────────────────────────────
//
// The OPERATOR live engine (Kraken execution + operator balance polling) drives
// ONE shared environment API key (KRAKEN_API_KEY / KRAKEN_API_SECRET). Kraken
// requires the nonce on every private request for a key to be STRICTLY greater
// than the previous one it has seen for that key. If more than one process runs
// the operator engine against the same key, their independent nonce streams
// interleave and Kraken rejects the lagging requests with `EAPI:Invalid nonce`
// (observed on both Balance and AddOrder).
//
// `startTradingLoop()` runs in EVERY api-server process (prod Render + the
// Replit dev workspace, plus any additional Render instance). To make the
// operator engine collision-free we enforce that exactly ONE process owns it.
//
// Ownership rule (in priority order):
//   1. Explicit override `OPERATOR_ENGINE_OWNER`:
//        "true"  → this process OWNS the operator engine.
//        "false" → this process does NOT own it.
//      Lets a multi-instance deployment pin ownership to a single instance.
//   2. Default: owner iff the process is the production runtime
//      (`NODE_ENV === "production"`) AND it is NOT the Replit dev workspace
//      (`REPL_ID` unset). Render prod sets NODE_ENV=production and has no
//      REPL_ID → owner. The Replit dev workspace sets NODE_ENV=development and
//      always has REPL_ID → never owner. The REPL_ID guard is belt-and-braces
//      so the dev workspace can never run the prod operator engine even if its
//      NODE_ENV were changed.
//
// NOTE (multi-instance): if Render is ever scaled to >1 instance of the api
// service, all instances share the same NODE_ENV and would each resolve as
// owner. In that case pin ownership explicitly (set OPERATOR_ENGINE_OWNER=false
// on all but one instance) or keep the api service at a single instance. A
// future hardening is DB advisory-lock leader election; not implemented here.

export class OperatorEngineNotOwnerError extends Error {
  readonly errorCode = "operator_engine_not_owner";
  constructor(op: string) {
    super(`Operator Kraken engine is not owned by this process (op=${op})`);
    this.name = "OperatorEngineNotOwnerError";
  }
}

export function isOperatorEngineOwner(): boolean {
  const override = process.env["OPERATOR_ENGINE_OWNER"];
  if (override === "true")  return true;
  if (override === "false") return false;
  const isProd          = process.env["NODE_ENV"] === "production";
  const isReplitWorkspace = !!process.env["REPL_ID"];
  return isProd && !isReplitWorkspace;
}

export function operatorEngineOwnerReason(): string {
  const override = process.env["OPERATOR_ENGINE_OWNER"];
  if (override === "true")  return "OPERATOR_ENGINE_OWNER=true (explicit override)";
  if (override === "false") return "OPERATOR_ENGINE_OWNER=false (explicit override)";
  if (process.env["REPL_ID"]) return "Replit dev workspace (REPL_ID set) — non-owner";
  return process.env["NODE_ENV"] === "production"
    ? "NODE_ENV=production, no REPL_ID — owner"
    : "NODE_ENV!=production — non-owner";
}

let _bootLogged = false;
export function logOperatorEngineOwnerBootStatus(): void {
  if (_bootLogged) return;
  _bootLogged = true;
  const owner = isOperatorEngineOwner();
  logger.info({
    tag:     "OPERATOR_ENGINE_OWNER",
    owner,
    reason:  operatorEngineOwnerReason(),
    nodeEnv: process.env["NODE_ENV"] ?? null,
    replit:  !!process.env["REPL_ID"],
  }, `[OPERATOR_ENGINE_OWNER] this process ${owner ? "OWNS" : "does NOT own"} the operator Kraken engine`);
}

// Hard backstop: throw on any operator env-key Kraken operation attempted by a
// non-owner process. Callers either propagate or convert to a clean status.
export function assertOperatorEngineOwner(op: string): void {
  if (!isOperatorEngineOwner()) throw new OperatorEngineNotOwnerError(op);
}
