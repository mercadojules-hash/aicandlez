---
name: ARM enforcement model (live trading)
description: How the per-session ARM (armedForLive) interlock actually works server vs client, and which live-order paths re-check it. Read before touching ARM / live-order gates.
---

# ARM enforcement model

ARM (`armedForLive`) is a per-session **client** interlock: source of truth is an
in-memory module store (`trading-dashboard useArmedForLive.ts` `getArmedForLive()`).
Server gates that "enforce" ARM do so by trusting a client-supplied
`armedForLive: boolean` in the request body:

- Manual customer live order: `api-server routes/userLiveOrder.ts` — non-operator +
  `!armedForLive` → 412 `runtime_not_armed` / `needsArm:true`. Operators bypass.
- AI auto-trade **activation**: `api-server routes/aiTrading.ts` — `wouldBeLive &&
  !armedForLive` → 412 `runtime_not_armed`. Checked once, at toggle time.

**Why this matters / constraints:**
- ARM is a **confirmation interlock** (protects the account owner from accidental
  live fires), NOT a forgery-proof security boundary. An authenticated user can
  POST `armedForLive:true` directly and pass the gate. That is acceptable because
  real money is independently gated by **server-authoritative** controls that ARM
  does not replace: env kill switch (`CUSTOMER_LIVE_EXECUTION_ENABLED` /
  `customer_live_execution_disabled`), `liveReady` from the runtime aggregator
  (computed from exchange health), and confidence/volume/risk/concurrency gates.
- **AI auto-execution per-tick path** (`tradingLoop` →
  `lib/liveUserExecution.ts placeLiveAutoOrderForUser`) does **NOT** re-check ARM.
  ARM for AI is enforced only at activation. Persisted `autoMode` keeps executing
  live after a page refresh without re-arming. This is the one "live while UI
  shows disarmed" path.

**How to apply:** If a task asks for "no live order can fire while disarmed" as a
hard boundary, the current model does not deliver it. True server-authoritative ARM
= a session-bound arm flag/nonce (session table or cache) set only by an explicit
arm endpoint, TTL'd, invalidated on refresh/rotation/logout, validated in
`userLiveOrder.ts` instead of trusting the body, plus a per-tick ARM check in
`placeLiveAutoOrderForUser`. That is a distinct, larger task — confirm product
intent (especially whether the server-side AI loop should require per-session ARM
at all) before building.
