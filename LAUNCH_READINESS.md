# AICandlez — Launch Readiness Report

_Status as of 2026-05-17. Scope: the consumer mobile/web app under
`artifacts/apex-trader-app` (the surface that ships to TestFlight / Play
internal) and the marketing site `artifacts/landing`. The
`trading-dashboard`, `natura-*`, and `mockup-sandbox` artifacts are
**not** intended for store submission and are out of scope for this
sweep._

---

## Pass 1 — Production Hygiene (DONE in this session)

| Item | Status | Notes |
|---|---|---|
| Strip dev `console.log` / `console.debug` / `console.info` from app source | ✅ Done | Removed 8 breadcrumbs in `AssetDetail.tsx`, `AlpacaAutoTrader.tsx`, `Profile.tsx`, `AIAutoTradeContext.tsx`. Kept `console.warn` for genuine failure paths (e.g. order rejection). |
| Hero portfolio = broker equity (precise) | ✅ Done | `fmtPrecise()` removed `.toFixed(1)` rounding — top hero and `BrokerStatusCard` now show byte-identical values. |
| Compliance phrasing — remove "risk-free" | ✅ Done | 4 occurrences across `apex-trader-app` + `landing` rewritten to "paper-trading only / no real money involved". Important for App Store / Play financial-app review (regulated keyword). |
| Typecheck (apex-trader-app) | ✅ Pass | `tsc --noEmit` clean. |
| Typecheck (landing) | ✅ Pass | `tsc --noEmit` clean. |
| Typecheck (api-server, trading-dashboard) | ✅ Pass | Verified earlier this session. |
| Typecheck (natura-*) | ❌ Pre-existing failures | Unrelated to launch (Natura is not a submission target). Documented as not-a-blocker. |

---

## Remaining Work — Itemized by Priority

### 1. Production Build Readiness

| Item | Status | Action |
|---|---|---|
| No `console.log` in shipped JS | ✅ Done in Pass 1 | — |
| Unused imports / dead components | ⚠ Not audited | Recommend `eslint --rule "no-unused-vars: error"` pass + dependency-cruiser graph; defer to a dedicated task. |
| Runtime overlay / dev panels in prod | ⚠ Unverified | Need to confirm there's no `<DevTools/>` / Tanstack devtools mounted in prod build. Add a `import.meta.env.PROD` guard if so. |
| Hydration warnings | ⚠ Unverified | SPA (Vite) — no SSR, so no classic hydration. But verify no `useLayoutEffect` warnings in production console. |
| Mobile nav state correctness | ⚠ Unverified | Manual QA needed on iOS Safari + Android Chrome (back-swipe, deep-link refresh). |

### 2. Mobile Performance

| Item | Status | Action |
|---|---|---|
| Re-render audit | ❌ Not done | Recommend wrapping `Home.tsx`, `AssetDetail.tsx` hero cards in `React.memo` and profiling with React DevTools. |
| Animation overhead | ⚠ Risk | Multiple `animation: num-pop`, glow shadows, and the cinematic execution banner stack. On low-end Android, consider gating with `prefers-reduced-motion`. |
| Chart rendering | ⚠ Risk | `AssetDetail.tsx` chart re-runs n=110 candle math on every render. Memoize candle/EMA computation with `useMemo` keyed by symbol+timeframe. |
| Memory leaks (long sessions) | ⚠ Unverified | All `setInterval` / `addEventListener` / WS subscriptions should have cleanup in `useEffect` return. Spot-checked OK in `BrokerConnectionContext`; full audit pending. |
| WebSocket cleanup | ⚠ Unverified | `wsServer.ts` is server-side; client WS hook needs review for `onunmount` close + reconnect-loop guards. |

### 3. App Store / Google Play Compliance

| Item | Status | Action |
|---|---|---|
| "risk-free" removed | ✅ Done | — |
| "Paper trading" labeling | ✅ Mostly | Hero now shows "Alpaca · Paper" badge; `Profile`, `Live`, `HelpModal` consistent. |
| Financial disclaimers | ⚠ Partial | Need an explicit "Not financial advice. Past performance does not guarantee future results." footer on Subscribe + Live pages. |
| Risk disclosures | ⚠ Missing | App Store Section 1.4.1 + Play Finance policy require a visible disclosure before any trade action. Recommend a one-time "I understand" modal on first BUY/SELL tap. |
| Implied promises | ✅ Clean | No "guaranteed profit / wealth / autonomous wealth" copy detected in scan. |
| Age gating | ❌ Missing | Most jurisdictions require 18+ confirmation for trading apps. |
| Privacy policy + ToS links | ⚠ Verify | Must be live URLs (not 404s) before store submission. |

### 4. UI Consistency

| Item | Status | Action |
|---|---|---|
| Spacing scale | ⚠ Not audited | Mixed inline px values; design tokens not enforced. |
| Typography scaling | ✅ Hero now scales (52→44→38) at $100K/$1M | Apply same pattern to other large-number widgets. |
| Bottom-nav safe area | ⚠ Verify | Confirm `env(safe-area-inset-bottom)` on iOS notch devices. |
| Overflow handling | ⚠ Verify | Long symbol names / large equity numbers — sweep all `whiteSpace: nowrap` cards. |
| Loading / empty states | ⚠ Partial | Some screens show skeletons, others show nothing. Standardize. |
| Animation timing | ⚠ Mixed | 0.3s / 0.6s / 1.2s durations vary. Define `--anim-fast/med/slow` tokens. |
| Status bar appearance | ⚠ Verify | Set `apple-mobile-web-app-status-bar-style: black-translucent` in `index.html`. |

### 5. TestFlight / Play Internal Prep

| Item | Status | Action |
|---|---|---|
| Believable demo telemetry | ✅ Live | Alpaca paper equity displays in real time. |
| Screenshot generation | ❌ Pending | Need 6.7" iPhone + 6.1" iPhone + iPad Pro screenshots at 1290×2796, 1179×2556, 2048×2732. |
| App preview video | ❌ Pending | 15–30s portrait MP4, no narration. |
| Demo recording for investors | ❌ Pending | Separate from store assets — 60–90s ideally. |
| Reviewer demo account | ⚠ Recommended | Pre-seed a Clerk user (e.g. `apple.reviewer@aicandlez.com`) with prepopulated paper trades so reviewers see populated state. |

### 6. Build & Deployment

| Item | Status | Action |
|---|---|---|
| EAS production config | ❌ Not yet | `apex-trader-app` is a Vite SPA, not Expo. For App Store, you need either (a) wrap in Capacitor/Tauri, (b) build a thin Expo shell with WebView, or (c) submit as a TWA on Play. **This is a major architectural decision and the biggest open blocker.** |
| Env separation (dev/staging/prod) | ⚠ Partial | `.env.production.example` exists but no automated promotion. |
| Production API URLs | ✅ Documented | `api.aicandlez.com` in `DEPLOYMENT.md`. |
| Secret handling | ✅ Solid | Vault uses AES-256-GCM + per-user PBKDF2; never logged. |
| Release configs | ⚠ See above | Depends on store-shell decision. |
| App icons / splash | ❌ Pending | Need 1024×1024 marketing icon + adaptive Android icon + 2732×2732 splash. |
| Production bundle cleanup | ✅ Pass 1 done | Console logs stripped. |

### 7. Risk Summary

**Apple App Store risks (highest first):**
1. **Native shell architecture not decided** — Vite SPA can't be submitted directly to App Store. Largest open blocker.
2. **Financial app review** (Sec 1.4.1) — needs explicit risk disclosure modal + 18+ gate + privacy/ToS links live.
3. **In-app purchase confusion** — if subscription is sold via Stripe Checkout on web, ensure the mobile app's checkout flow either routes through StoreKit (preferred for App Store) or explicitly skips the subscribe screens inside the iOS app. App Store **will reject** apps that link to external paid subscriptions.
4. **Paper-trading clarity** — "Alpaca · Paper" badge helps; reviewer-facing demo doc should reinforce.

**Google Play risks (highest first):**
1. **Finance category policies** — need visible risk disclosure + 18+ confirmation.
2. **External payment policy** — same StoreKit/Play Billing concern as iOS (Play allows external links with disclosure but requires user choice screen).
3. **Background activity / data policy** — declare WebSocket persistent connections in Data Safety.
4. **TWA vs native** — if using Trusted Web Activity, must pass Digital Asset Links verification on `app.aicandlez.com`.

---

## Recommended Next-Deployment Sequence

1. **Decide native shell** (Capacitor vs Expo WebView vs TWA). Without this, nothing else proceeds to stores. **Recommendation: Capacitor** — it keeps the React/Vite codebase and adds genuine native projects.
2. **Build the Risk Disclosure modal + 18+ gate** (one screen, ~2hr work). Required by both stores.
3. **Live the Privacy Policy + Terms** at `aicandlez.com/privacy` and `aicandlez.com/terms`. Required URLs in App Store Connect + Play Console.
4. **In-app payment routing decision** — gate `/subscribe` behind `Capacitor.getPlatform() === 'web'` for v1 to avoid both store rejections, then add native IAP in v1.1.
5. **Production build pass**:
   - Run Lighthouse + bundle-analyzer on `dist/`.
   - Verify no source maps shipped (`build.sourcemap: false`).
   - Verify no `import.meta.env.DEV` paths in shipped JS.
6. **Generate App Store + Play assets** (icon, splash, screenshots, preview video).
7. **Submit to TestFlight internal** → 1 week of internal QA.
8. **TestFlight external (beta)** → 50–100 testers, 1–2 weeks.
9. **Apple + Play production submission**, expect 1–7 days review.

---

## TestFlight Checklist

- [ ] Capacitor (or chosen shell) added and `cap sync` clean
- [ ] iOS bundle ID registered: `com.aicandlez.app`
- [ ] App Store Connect record created
- [ ] App Privacy questionnaire complete
- [ ] Demo reviewer account credentials provided
- [ ] Privacy policy URL live + reachable
- [ ] Terms of service URL live + reachable
- [ ] 1024×1024 marketing icon uploaded
- [ ] 6.7" + 6.1" iPhone screenshots uploaded
- [ ] App preview video (optional, 15–30s)
- [ ] Risk disclosure modal in first-launch flow
- [ ] 18+ age gate
- [ ] "What to test" notes for reviewers explaining paper-trading nature
- [ ] No `/subscribe` route reachable on iOS build (or routed through StoreKit)

## Production Build Checklist

- [ ] `pnpm run typecheck` clean across all submission-targeted artifacts
- [ ] No `console.log` in shipped JS (Pass 1 ✅)
- [ ] Vite `build.sourcemap: false` (verify in `vite.config.ts`)
- [ ] Vite `build.minify: 'esbuild'` (default)
- [ ] No dev-only React tools mounted in prod
- [ ] All env vars present in production env: `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_VAPID_PUBLIC_KEY`, broker URL base
- [ ] CORS locked to production domains (already done per replit.md)
- [ ] Service worker `sw.js` cache-versioned (bump on each release)
- [ ] CSP headers configured at edge / Render
- [ ] Bundle <2 MB gzipped (run `vite-bundle-visualizer`)
- [ ] Lighthouse mobile score ≥85 on Performance, ≥95 on Accessibility
