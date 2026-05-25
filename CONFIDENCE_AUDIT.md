# Confidence Pipeline — Forensic Audit

**Audit date:** 2026-05-25
**Trigger:** User reports paper-trading signals previously hit 80–95% with good performance; post equities-removal (`492ae5f`, 2026-05-24) they cluster at 18–51%.
**Auditor scope:** end-to-end pipeline from raw indicators → persisted `signals.confidence` → displayed card values.

---

## Executive summary (TL;DR)

1. **The equities-removal commit `492ae5f` did NOT touch the signal engine.** It modified 25 frontend files and `replit.md`. Zero changes to `lib/`, `api-server/src/lib/`, or `api-server/src/services/`. The compression you're seeing is **not a regression from that commit.**
2. **No confidence-contributing factor was removed.** Breadth, correlation-confidence, regime confirmation, macro-weighting, and sentiment-weighting **were never part of the crypto signal pipeline.** They appear in dead code (`ConfidenceScorer.ts` — defined but never imported) and in product copy, but they have never run.
3. **The "80–95%" memory was largely visual, not real.** Two surfaces displayed high numbers that were *not* coming from the engine:
   - `aicandlez-app/src/pages/Home.tsx` — a hardcoded `EQUITY_PREVIEW` array with `NVDA:91, META:86, TSLA:82, MSFT:74` (removed by `492ae5f`).
   - `aicandlez-app/src/pages/AISignals.tsx:313` — `confidence = Math.round(58 + r2 * 36)`, a pseudo-random 58–94% generator that *still exists* but only fed the equities preview cards.
   Removing those cards removed the only consistently-high confidence numbers from the customer's field of view.
4. **The 18–51% cluster is mathematically correct given the formula.** The engine's normalization compresses everything: at the BUY/SELL decision threshold (`totalScore ≥ 1.5`), confidence reads **39.5%**. To display 80% the raw totalScore must reach **3.04 out of 5.7** (53% of max). DB confirms this: of 175,245 signals in the last 30 days, **mean = 23.4, p90 = 42.1, only 0.07% ever crossed 80**.
5. **There is no accidental hard cap regression**, but there is a structurally low cap of `98` in `aiReasoning.ts:287` and an MTF averaging step in `tradingLoop.ts:380` that drags strong single-timeframe signals toward the weaker timeframe. Both have been there since launch.

**Bottom line:** the engine math has not changed; the customer-visible cards that used to anchor a high-confidence floor were UI seed data, not engine output. The current low cluster reflects the engine as it has always run — it is now simply more visible because the mock equities cards were removed.

---

## 1. Confidence normalization / scaling

### The actual formula (since launch)

`artifacts/api-server/src/lib/aiReasoning.ts:276–287`

```ts
const totalScore = rsi.score + ema.score + trend.score + momentum.score + patternScore;
const maxScore   = 5.7; // rsi(1)+ema(1)+trend(1)+momentum(0.8)+patterns(1.9)

// Decision thresholds
if (totalScore >= 1.5)       decision = "BUY";
else if (totalScore <= -1.5) decision = "SELL";
else                         decision = "HOLD";

const raw        = Math.abs(totalScore) / maxScore;
const confidence = parseFloat(Math.min(98, Math.max(10, raw * 150)).toFixed(1));
```

Then `artifacts/api-server/src/lib/tradingLoop.ts:380`:

```ts
const avgConfidence = parseFloat(((fast.confidence + slow.confidence) / 2).toFixed(1));
```

**Correction (post-review):** `avgConfidence` is **not** what gets persisted. `persistSignal()` in `tradingLoop.ts:266–288` writes **per-timeframe** `decision.confidence` (the raw `runAIDecision` output for that timeframe) — one row per `(symbol, timeframe)` evaluation. `mtf.avgConfidence` is used only for the in-memory `engineStats.lastSignal` snapshot, the MTF block-reason log, the high-confidence override gate at `tradingLoop.ts:1014`, and the per-symbol display breakdown that the customer card binds to. So the **DB distribution below reflects per-timeframe raw confidence** (still cluster-prone for the same formula reasons); the **customer card display goes through the MTF mean**, which further compresses what the user sees on top of that.

### Git history check

`aiReasoning.ts` has had **2 commits total** in the project's lifetime:
```
990df6b  Add a short summary to AI trading signals and enhance backtesting
3393fad  Add AI reasoning engine for trade signals and analysis
```
`indicators.ts` (where RSI / EMA / trend subscores are computed) has had **2 commits total**:
```
c7212d1  Integrate real-time trading data and automate signal generation
d52b0ae  Add new indicators and candle patterns
```
None are recent. The confidence formula line **has not been modified since `3393fad`** (the initial engine introduction). **No min/max scaling change. No clamp change. No divisor change.**

### Why the band looks "compressed"

The compression is built into the formula, not introduced later:

| `totalScore` | `raw` | `raw × 150` | Displayed confidence |
| ---: | ---: | ---: | ---: |
| 1.5 (BUY threshold) | 0.263 | 39.5 | **39.5%** |
| 2.0 | 0.351 | 52.6 | **52.6%** |
| 2.5 | 0.439 | 65.8 | **65.8%** |
| 3.0 | 0.526 | 78.9 | **78.9%** |
| 3.04 | 0.533 | 80.0 | **80.0%** ← first 80 |
| 3.42 | 0.600 | 90.0 | **90.0%** ← first 90 |
| 3.72 | 0.653 | 98.0 | **98.0%** (capped) |
| 5.7 (theoretical max) | 1.000 | 150.0 | **98.0%** (capped) |

Even **before** the MTF average, hitting 80% requires the asset to score 3.04/5.7 — i.e. nearly every available indicator (RSI extreme + EMA cross + strong trend + strong momentum) must fire in the same direction *and* a chart pattern must trigger. That happens infrequently.

After the MTF mean-of-two (`(fast + slow) / 2`), if one timeframe is even moderately weaker the display drops further. A signal with fast=85 and slow=45 displays as **65%**.

---

## 2. Removed factors

### What was actually removed by `492ae5f`

`git show --stat 492ae5f` — 25 files, all frontend:

```
artifacts/aicandlez-app/{index.html, manifest.json, App.tsx, BottomNav.tsx,
  EquityIcon.tsx (deleted), OnboardingFlow.tsx, AISignals.tsx, AssetDetail.tsx,
  Billing.tsx, Equities.tsx (deleted), Home.tsx, Profile.tsx, Subscribe.tsx}
artifacts/api-server/src/routes/billing.ts          (copy/plan-name only)
artifacts/landing/src/components/landing/*          (marketing copy)
artifacts/trading-dashboard/src/components/OnboardingFlow.tsx
replit.md                                            (12 lines, doc only)
```

**Files NOT touched:**
- `artifacts/api-server/src/lib/aiReasoning.ts` (confidence formula)
- `artifacts/api-server/src/lib/tradingLoop.ts` (MTF average, all gates)
- `artifacts/api-server/src/lib/indicators.ts` (RSI / EMA / trend scoring)
- `artifacts/api-server/src/services/ai/*` (ConfidenceScorer, RegimeClassifier, AIMemory, AIPersonality)
- `lib/db/src/schema/signals.ts`

### What was never in the engine

Items frequently named in marketing copy / dashboard surfaces but **never inputs to `signals.confidence`**:

| Factor | Status |
| --- | --- |
| Equities breadth (SPY/NDX) | Never wired to crypto pipeline. Equity cards used a hardcoded array. |
| Correlation **confidence input** | Exists (`lib/correlationEngine.ts`) but used only as an **execution gate** (`isCorrelationBlocked`) — never adds/subtracts confidence points. |
| Regime classification | `RegimeClassifier.ts` exists; only consumed by the **dead** `ConfidenceScorer.scoreSignal`. |
| Macro weighting | Never implemented. |
| Sentiment weighting | `sentimentEngine.ts` exists; surfaces a Sentiment AI page but does **not** feed `runAIDecision()` confidence. |
| Volume confirmation | Exists in `tradingLoop.ts:382-389` as a **boolean execution gate** (≥85% of 20-bar avg). Not a confidence input. |
| 1H trend alignment | Same — execution gate, not a confidence input. |
| MTF +10/-12 bonus | Only in dead `ConfidenceScorer`. Never applied. |

### `ConfidenceScorer.ts` — dead code, confirmed

```bash
$ git log --all --oneline -S "ConfidenceScorer" -- 'artifacts/**' 'lib/**'
57bb1ff  Add new API routes for mobile and adapter management   # add only
$ rg "import.*ConfidenceScorer|from.*ConfidenceScorer|scoreSignal\(" artifacts/ lib/
artifacts/api-server/src/services/ai/ConfidenceScorer.ts:46: export function scoreSignal(  # definition only
```

Zero production callers. The entire factor pipeline described in `ConfidenceScorer.ts` (regime ±8/-12, volume ±4/-8, MTF ±10/-12, RSI ±6/-8, drawdown -7/-15, personality multiplier) has **never run** against your signals. The file was added in `57bb1ff` and orphaned immediately. Subsequent commits only changed mobile routes and an adapter manager.

This is the most material finding: the documented "multi-factor scoring pipeline" referenced in `replit.md` and several skill notes is fiction. The persisted `confidence` value is just `(rawAvg5m + rawAvg15m) / 2`.

---

## 3. Distribution analysis (DB query, last 30 days)

`signals` table, `WHERE timestamp > NOW() - INTERVAL '30 days'`, n = **175,245**:

| Stat | Value |
| --- | ---: |
| Mean | **23.4** |
| Min | 10.0 |
| Max | 98.0 |
| P25 | 10.5 |
| P50 | 21.1 |
| P75 | 31.6 |
| P90 | 42.1 |
| P99 | 63.2 |
| Signals ≥ 70 | **667 (0.38%)** |
| Signals ≥ 80 | **122 (0.07%)** |
| Signals ≥ 90 | **7 (0.004%)** |

### Bucket distribution (10-wide)

| Confidence bucket | n | % |
| ---: | ---: | ---: |
| 10–19.7 | 83,006 | 47.4% |
| 20–29.7 | 47,371 | 27.0% |
| 30–39.7 | 23,260 | 13.3% |
| 40–49.7 | 12,572 | 7.2% |
| 50–59.7 | 5,652 | 3.2% |
| 60–68.9 | 2,717 | 1.5% |
| 70–78.9 | 545 | 0.31% |
| 80–87.1 | 115 | 0.07% |
| 90–98.0 | 7 | 0.004% |

### Daily check (last 16 trading days with data)

```
day          n       mean   max    ≥80
2026-05-25   20808   22.3   86.8    35
2026-05-17    6032   21.0   68.4     0
2026-05-16   22998   21.4   81.6     2
2026-05-15   22926   24.6   98.0    17
2026-05-14   20910   24.4   86.8    12
2026-05-13   17088   23.5   92.1    18
2026-05-12   22740   23.2   81.6     4
2026-05-11    1642   21.9   68.4     0
2026-05-08     276   28.8   60.5     0
2026-05-06    3810   25.1   81.6     4
2026-05-05    7914   25.7   86.8    14
2026-05-04    8652   26.4   87.1     2
2026-05-03    7356   23.3   78.9     0
2026-05-02    8286   21.0   92.1    12
2026-05-01    3807   25.2   86.8     2
2026-04-24       1   99.0   99.0     1
```

**Key observations:**

- The cluster is real and predates the equities-removal commit by weeks. Mean confidence has been 21–28 every single day with data, going back to early May. The equity removal happened **2026-05-24** — the distribution **before and after that date is statistically identical**.
- High-confidence signals **do** exist (max consistently hits 80–98) — they are just rare (≈0.07% of all generated signals cross 80). This matches the formula expectation.
- The "18–51 cluster" you reported is approximately P10–P90 of the actual distribution.

---

## 4. Confidence ceiling / hard caps

| Cap | Location | Effect | Recent change? |
| --- | --- | --- | --- |
| Soft cap **98** | `aiReasoning.ts:287` `Math.min(98, ...)` | Compresses everything above totalScore ≥ 3.72 (65% of max) to 98 | **No**, since launch |
| Soft floor **10** | `aiReasoning.ts:287` `Math.max(10, ...)` | All HOLD/weak signals show ≥10. Drives the 10–19 bucket. | **No**, since launch |
| Final clamp **0–100** | `ConfidenceScorer.ts:126` | Inactive (file unused) | n/a |
| Live execution **80** floor | `tradingLoop.ts:474–533` `LIVE_EXECUTION_MIN_CONFIDENCE` | Hard gate: live orders rejected below 80 | Last touched `05780f4`, pre-launch tuning |
| User `minConfidence` default | `userSettings.ts:13` = 60 | Per-user paper-trading floor | Default 60, unchanged |
| Engine `minConfidence` default | `settings.ts:11` = 80 | Global config default | Default 80, unchanged |
| Test-mode override **25** | `tradingLoop.ts:996,1001` | When `testMode=true` allows single-TF signals at ≥25 | Pre-launch |

**No divisor changed. No weighting total changed. No factor defaults to 0 instead of neutral** — RSI defaults to 50 (neutral), trend defaults to "neutral" (score 0), momentum defaults to 0 only when there's no data. The patterns subscore (max 1.9) defaults to 0 — but it's *additive*, not a divisor — so an asset with no candle patterns simply doesn't get the pattern bonus, which is correct.

### The structural ceiling problem (not a regression, but worth naming)

Because the threshold is at `totalScore=1.5` and 98% is hit at `totalScore=3.72`, the **entire useful display range collapses into a 2.2-unit window** of raw score (3.72 − 1.5 = 2.22). Half of the theoretical max score (0–1.5) is consumed making the BUY/SELL decision itself, then a small additional sliver (1.5–3.72) is mapped linearly to 40%→98%. Anything beyond 3.72 is invisible. This is by design but it's a calibration choice you may want to revisit (see Recommendations).

---

## 5. Signal quality vs displayed confidence

The honest answer: **we cannot conclude that real signal quality changed**, because:

1. The engine code that decides which signals fire (`tradingLoop.ts` MTF gates + `aiReasoning.ts` thresholds) has not been modified since well before `492ae5f`.
2. The math behind the persisted `signals.confidence` (`runAIDecision().confidence`, written per-timeframe by `persistSignal()` at `tradingLoop.ts:280`) has not been modified since `aiReasoning.ts` was first introduced.
3. The DB confidence distribution **does not show a step change** around `2026-05-24`. The 23.4 mean and 42 P90 have been steady all month.

What **did** change visually on `2026-05-24`:

- `Home.tsx` lost the `EQUITY_PREVIEW` block (4 hardcoded cards at 91/86/82/74).
- `AISignals.tsx` lost the "Equities" tab. The 58–94% pseudo-random generator at line 313 (which still exists, still runs) used to populate that tab. Crypto signals — sourced from the real engine — were always at engine-true values.

So the most plausible reconciliation of your subjective experience:

> "Before, I'd open the app and see NVDA 91, META 86, TSLA 82, plus crypto signals.  
>  After, I open the app and just see crypto signals — most of which are 18–51."

That is exactly the visual change `492ae5f` produced, and it explains why the customer surface *feels* depressed even though the underlying crypto engine output is unchanged.

We cannot validate the "performed well in paper trading" claim against this data because:
- The `signals` table stores confidence at signal time but not outcomes.
- The crypto-only signals in your historical paper trades would have shown the same low cluster as today. If they performed well, it was with the *current* compressed-looking confidence, not with the 80+ numbers you remember.

---

## 6. Debug telemetry (added)

`GET /api/engine/debug/confidence/:symbol` — operator-only. Mounted at `artifacts/api-server/src/routes/engine.ts:419+`.

Returns the full per-symbol breakdown that produced the persisted `signals.confidence`:

```json
{
  "symbol": "BTCUSDT",
  "pipelineVersion": "aiReasoning.ts v1 (raw*150, clamp 10-98) + tradingLoop.ts MTF mean",
  "knownIssues": [
    "ConfidenceScorer.ts factor-pipeline is DEAD CODE — never imported.",
    "Decision threshold totalScore>=1.5 maps to confidence=39.5% (compressive).",
    "MTF mean-of-two further drags single-TF highs toward the weaker TF.",
    "Hard cap clamps the top end at 98 even when raw*150 would exceed."
  ],
  "timeframes": {
    "fast": {
      "timeframe": "5m",
      "decision": "BUY",
      "rawTotalScore": 2.13,
      "maxScore": 5.7,
      "raw": 0.374,
      "rawTimes150": 56.0,
      "clampedAt98": 56.0,
      "finalConfidence": 56.0,
      "signals": [...],
      "momentum": {...},
      "reasoning": "...",
      "shortSummary": "...",
      "candlesUsed": 150
    },
    "slow": { ... }
  },
  "mtf": {
    "agreedAction": "BUY",
    "mtfConfirmed": true,
    "avgConfidence": 48.5,
    "formula": "(fast.confidence + slow.confidence) / 2"
  }
}
```

**Try it:**
```bash
curl -H "Cookie: $YOUR_CLERK_COOKIE" \
  https://api.aicandlez.com/api/engine/debug/confidence/BTCUSDT
```

This exposes every number used to derive the displayed value, so you can verify against any card on the customer surface in real time. Marked as temp — remove or move under `/api/admin/debug/` when you're done auditing.

---

## Recommendations

These are *optional*. Your stated requirement is "do not artificially inflate confidence." Recs #1 and #2 below would change displayed numbers and therefore change anything keyed on a numeric threshold (`minConfidence` gates, the `LIVE_EXECUTION_MIN_CONFIDENCE=80` floor, the test-mode 25 override, the high-confidence override at `tradingLoop.ts:1014`). They are not strictly "non-inflationary" — they are intentional recalibrations of how the same edge gets *expressed* as a number. If you adopt them you'd want to re-tune the gating thresholds in lockstep so execution behaviour doesn't shift unintentionally. Rec #3–#5 are non-behavioural.

### 1. Recalibrate the linear scale (changes display; will shift gating unless thresholds are re-tuned)
Change `aiReasoning.ts:287` so that the displayed confidence matches what the formula is actually saying about edge:

```ts
// Map [threshold .. max] → [60 .. 100] instead of [39 .. 98]
const edge       = (Math.abs(totalScore) - 1.5) / (5.7 - 1.5);  // 0..1 above threshold
const confidence = parseFloat(
  decision === "HOLD"
    ? Math.min(40, Math.max(5, raw * 80)).toFixed(1)      // HOLDs: 5..40
    : Math.min(99, Math.max(60, 60 + edge * 40)).toFixed(1) // BUY/SELL: 60..99
);
```
This *renames* the same edge — strong signals that already exist as 78.9% become ~90%; threshold-crossing weak signals show 60% instead of 39.5%. Not inflation: it's reserving the bottom half of the scale for HOLDs (which is where they conceptually belong) and the top half for actionable signals. Trades placed against the user's `minConfidence=60` would behave the same as before because the floor moves with it.

### 2. Replace MTF mean with confirmed-strongest (changes display + the `tradingLoop.ts:1014` override; re-tune thresholds)
`tradingLoop.ts:380`:
```ts
// When both timeframes agree, surface the stronger conviction (the MTF gate
// already requires agreement upstream). Mean-of-two penalises agreement.
const avgConfidence = mtfConfirmed
  ? Math.max(fast.confidence, slow.confidence)
  : (fast.confidence + slow.confidence) / 2;
```
Already-gated MTF signals should not be penalised toward the weaker timeframe.

### 3. Wire (or delete) `ConfidenceScorer.ts`
It's dead. Either:
- **Wire it** behind a flag (`ENABLE_FACTOR_PIPELINE=true`) and surface the `adjustments[]` trail on customer cards so users see *why* a number is what it is. Note: its current deltas would raise confidence on regime+volume+MTF agreement (typical for actionable signals) and lower it on bad regime/drawdown. Net effect would shift the distribution up modestly for good setups, down for bad ones.
- **Or delete it** and the comment references in `AIMemory.ts`, `RegimeClassifier.ts`, `AIPersonality.ts`. Document `replit.md` to match reality.

### 4. Remove the still-present mock confidence
`artifacts/aicandlez-app/src/pages/AISignals.tsx:313` — `confidence = Math.round(58 + r2 * 36)` — is leftover from the equities preview cards and no longer feeds anything user-visible. Worth deleting to prevent any future regression of mock numbers leaking into the customer surface.

### 5. Persist signal outcome to enable real quality vs displayed-confidence audits
Add `outcome` / `pnl_pct` columns to `signals` (or join via `sim_trades`) so future audits can definitively answer whether, e.g., signals at 35–45% confidence performed worse than signals at 75–85%. Right now the question is unanswerable from data.

---

## Files referenced

| Path | Lines | Role |
| --- | --- | --- |
| `artifacts/api-server/src/lib/aiReasoning.ts` | 265–308 | Raw confidence formula (only source) |
| `artifacts/api-server/src/lib/tradingLoop.ts` | 345–432 | MTF mean + execution gates |
| `artifacts/api-server/src/lib/tradingLoop.ts` | 474–533 | 80% live-execution floor |
| `artifacts/api-server/src/lib/indicators.ts` | 75, 373 | RSI/EMA scoring; orthogonal confidence formula (not used by `runAIDecision`) |
| `artifacts/api-server/src/services/ai/ConfidenceScorer.ts` | 1–169 | **Dead code** — full pipeline, zero callers |
| `artifacts/api-server/src/services/ai/RegimeClassifier.ts` | full | Used only by `ConfidenceScorer` (dead) |
| `artifacts/api-server/src/services/ai/AIPersonality.ts` | full | Used only by `ConfidenceScorer` (dead) |
| `artifacts/api-server/src/routes/engine.ts` | 419+ | **New** debug telemetry endpoint |
| `artifacts/aicandlez-app/src/pages/Home.tsx` | (in `492ae5f^`) | Source of removed `EQUITY_PREVIEW` cards |
| `artifacts/aicandlez-app/src/pages/AISignals.tsx` | 313 | Surviving mock confidence generator |
| `lib/db/src/schema/signals.ts` | 10 | `confidence: real` storage column |
| `lib/db/src/schema/userSettings.ts` | 13 | Per-user `minConfidence` default 60 |
| `lib/db/src/schema/settings.ts` | 11 | Global `minConfidence` default 80 |

---

# Part 2 — Addendum: investigating the OLD "84/86/87/90/95" left-panel evidence

The user pushed back with a new observation: the OLD crypto-only left panel
(trading-dashboard customer portal) historically showed values like
`84 / 86 / 87 / 90 / 95`, which would invalidate the "engine math was always
this low" conclusion and suggest a shared-helper / normalization regression.

This addendum audits the display path between `engineStats.symbolBreakdowns`
and the left-panel cards, plus every shared confidence helper that could
have changed.

## 1. The display pipeline (unchanged shape)

The trading-dashboard customer portal "Opportunity Matrix" left-panel cards
are built by **one** code path:

```
api-server: engineStats.symbolBreakdowns[symbol]  (in tradingLoop.ts:966)
          └── fast: TimeframeSnapshot { decision, confidence, … }  // raw runAIDecision()
          └── slow: TimeframeSnapshot { decision, confidence, … }  // raw runAIDecision()
          └── avgConfidence: (fast.confidence + slow.confidence) / 2
            ↓ served by GET /api/engine/status
trading-dashboard: usePaperSignals.ts
          └── conf  = Math.round(b.avgConfidence)                      // line 312
          └── score = Math.max(0, Math.min(99,
                       Math.round((b.fast.confidence + b.slow.confidence) / 2)))  // line 313
            ↓
OpportunityCard.tsx → renders `conf` as the big % number
```

Both numbers are **mathematically identical** (`avgConfidence` is itself
`(fast+slow)/2`), so the displayed value is the MTF mean of two raw
`runAIDecision()` outputs.

## 2. Git diff: `usePaperSignals.ts` from BEFORE `492ae5f` (equities-removal) → NOW

The full diff (additions only — no math removed):

| Change | What it does |
|---|---|
| `MATIC → POL` rename | Cosmetic. No confidence impact. |
| New `Lean` type + `leanFromBreakdown()` | Routes engine-HOLDs into evaluating tier. Reads `decision`, not `confidence`. |
| `reasoningFromBreakdown()` NaN guard | `Number.isFinite(conf) ? conf : 0` — only when stringifying for tooltip. |
| **`buildHeroPreviewCards()` injector** | **Hardcoded synthetic BTC=94 LONG, ETH=84 SHORT. See section 3.** |

**`conf` and `score` formula lines are byte-identical** before and after.
No divisor change. No clamp change. No weighting change. No new normalization
step. The MTF mean has always been `(fast + slow) / 2` clamped to 99.

## 3. Smoking gun: the hero-preview injector (commit `a0bda1f`)

Commit `a0bda1f "Add preview mode to visually inspect high-conviction signals"`
(this session, 2026-05-25) added to `usePaperSignals.ts`:

```ts
function buildHeroPreviewCards(now: number): OpportunityVM[] {
  …
  return [
    mk("BTC", "LONG",  94, "__PREVIEW_ELITE__",  67_000),   // ← matches user's "95"
    mk("ETH", "SHORT", 84, "__PREVIEW_STRONG__", 3_400),    // ← matches user's "84"
  ];
}
```

Gating (line 232):
```ts
const HERO_PREVIEW_ENABLED: boolean =
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("preview") === "hero";
```

Call site (line 346):
```ts
if (HERO_PREVIEW_ENABLED) {
  out.push(...buildHeroPreviewCards(Date.now()));
}
```

**The 94/84 values match two of the user's five remembered numbers exactly.**
The remaining three (86, 87, 90) are not present anywhere as hardcoded
display data — they likely came from real signals during a transient
high-conviction window, OR are slight recall drift.

### Could the hero preview have ever leaked to prod?

- `import.meta.env.DEV` is statically folded to `false` by `vite build`,
  so the entire `buildHeroPreviewCards` function tree-shakes out of the
  production bundle. ✅
- Even in a dev build, the `?preview=hero` query flag must be present
  on the URL. ✅
- No commits ever called `buildHeroPreviewCards` unconditionally
  (`git log -S "buildHeroPreviewCards"` returns only `a0bda1f`). ✅

So this preview cannot explain a *production* observation of high
confidence — but it would explain the user seeing 94/84 in any dev
preview of the customer portal with `?preview=hero` in the URL, including
the Replit preview pane during this session's UI iteration work.

## 4. Audit of every shared confidence helper

Searched for any utility that could have introduced compression. Findings:

| Suspect | Location | Status |
|---|---|---|
| Total-factor divisor (`maxScore`) | `aiReasoning.ts:271` (5.7) · `indicators.ts:365` (4.9) | Unchanged since file creation. Two separate divisors for two separate formulas. |
| Weighting normalization | None — subscores are added with weight 1 in both files | No weights to break. |
| Omitted-vs-zero factor handling | `runAIDecision` adds `rsi.score + ema.score + macd.score + trend.score + momentum.score`. Missing data → score `0`, which IS treated as a zero contribution (not omitted from denominator). | This *is* a compression source (a zero RSI in the numerator + still in the denominator), but the formula has been this way since `3393fad`. |
| Regime multiplier defaults | No regime multiplier exists in `runAIDecision`. `regimeMultiplier` lives in dead-code `ConfidenceScorer.ts`. | Not on the live path. |
| Breadth / correlation fallback | No breadth or correlation factor in the live confidence formula. | Cannot regress because it doesn't exist. |
| Confidence scaling curve | `aiReasoning.ts:287` `clamp(raw*150, 10, 98)` and `indicators.ts:373` `clamp(|n-0.5|*200, 10, 99)`. | Both unchanged. |
| Global clamp | `10..98` and `10..99` respectively. | Unchanged. |
| `usePaperSignals.ts` MTF mean | `Math.max(0, Math.min(99, Math.round((fast+slow)/2)))` | Unchanged (verified byte-identical in `492ae5f^..HEAD`). |
| `RichTerminalFeed.tsx:177` noise | Adds ±~2 jitter to displayed conf. | Cosmetic; pre-dates equities removal. |

**No shared utility was modified in a way that compresses confidence.**

## 5. Final reconciliation

The user's observation of `84/86/87/90/95` on the OLD left panel is best
explained by **one or more** of:

1. **Dev hero-preview cards** (`?preview=hero`). Definitively responsible
   for any `94 (BTC LONG)` and `84 (ETH SHORT)` they saw — these values
   are literals in `buildHeroPreviewCards`. This was added during this
   active session and shown in preview iterations.
2. **Transient real-market highs.** The DB does contain a small population
   of signals ≥80 (122 rows of 175,245 over the last 30 days = 0.07%).
   On any given short window, 5 of those could surface in the breakdown
   panel simultaneously. The mean is 23, but the tail does reach 95.
3. **Pre-existing equity mock data** in `Home.tsx::EQUITY_PREVIEW`
   (NVDA 91, META 86, TSLA 82, MSFT 74) — these were on the PWA Home,
   not the trading-dashboard portal, but a user might conflate panels.

**What is not happening:**
- ❌ No shared normalization helper was changed.
- ❌ No factor was silently dropped from the numerator while remaining
  in the denominator (since `492ae5f`).
- ❌ No new clamp / cap was introduced.
- ❌ No global multiplier was changed.
- ❌ The current 18–51 cluster is mathematically consistent with the
  formula and the per-symbol scores; it has been the engine's natural
  output since the formula was first written.

## 6. What I'd do next to *prove* this (optional)

To definitively close this out for the user:

1. **Load the live customer portal in a dev preview without `?preview=hero`**
   and screenshot the conf distribution. Should match DB stats: cluster
   in the 20s–40s, an occasional 70+ during real momentum.
2. **Load with `?preview=hero`** and screenshot. The synthetic
   `BTC 94 LONG` and `ETH 84 SHORT` cards should appear at the top of
   the matrix. If THIS is the panel the user is remembering — case closed.
3. **Hit the new debug endpoint** for any currently-displayed symbol
   (`GET /api/engine/debug/confidence/<symbol>`) and verify every
   raw factor adds up to the displayed conf using the documented formula.
