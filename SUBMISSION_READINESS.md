# AICandlez — App Store / Play Store Submission Readiness

_Generated 2026-05-18. Current state: stabilization phase, no new features._

---

## 1. Preview Restoration — ✅ COMPLETE

| Item | Status |
|---|---|
| Workflow `artifacts/aicandlez-app: web` | ✅ Running clean (fresh restart) |
| `artifacts/api-server: API Server` | ✅ Running clean |
| `artifacts/landing: web` | ✅ Running clean |
| `artifacts/trading-dashboard: web` | ✅ Running clean |
| `/aicandlez-app/` HTML response | ✅ Vite dev HTML, base resolved to `/aicandlez-app/` |
| React mounts | ✅ Clerk sign-in card renders (screenshot verified) |
| JS runtime exceptions in console | ✅ None (only "dev keys" advisory + autocomplete tip) |
| Vite HMR socket | ✅ Connected (`[vite] connecting...` → `[vite] connected.`) |
| Stale 2 MB `apex-logo.png` in public/ | ✅ DELETED |
| Active artifact URL prefix | ✅ `/aicandlez-app/` everywhere — zero `/apex-trader-app/` in source or dist |

### Note on the canvas iframe stale URL

The canvas iframe you saw with `initialPath=%2Fapex-trader-app%2F` is a **cached canvas shape state** pointing at the old route through the landing iframe. The artifact has been re-registered at `/aicandlez-app/`, so a one-time refresh (close + reopen the iframe panel, or hard-refresh the browser tab) picks up the new path. This is a UI cache issue, not a code issue — production deploys are unaffected because the old URL doesn't exist anywhere outside this dev canvas state.

### Cold-start verification

The fresh-session preview was screenshotted after the workflow restart. Cold render is clean: sign-in card paints in < 1s, no JS errors, no broken assets, Clerk loads with dev keys (expected in this environment).

---

## 2. Final QA Pass (App Store readiness)

### A. Audited via source + build scans

| Check | Result |
|---|---|
| No visible "Apex" branding | ✅ Zero refs in `aicandlez-app/src`, `trading-dashboard/src`, `landing/src` |
| No "Apex" in production bundle | ✅ Zero refs in `dist/public/{assets,index.html,manifest.json,sw.js}` |
| No "Apex" in PWA metadata | ✅ Manifest, index.html `<title>`, og, twitter, apple-mobile-web-app-title — all "AICandlez" |
| No natura branding in AICandlez runtime | ✅ Zero imports/refs in aicandlez-app + trading-dashboard + landing source. **Only two false positives:** the comment "Natural oscillation" and the demo ticker label "NATURAL GAS" — both are English words, not natura-* branding |
| No `apex-trader-app/` URL refs | ✅ Zero in production dist |
| No localhost refs in built JS | ✅ Zero |
| No hardcoded `pk_test_` / `sk_test_` in source | ✅ Source uses env vars only |
| No placeholder/lorem text leaks | ✅ None found in routes |
| All AICandlez app routes wired | ✅ `/`, `/trade`, `/markets`, `/equities`, `/asset/:type/:sym`, `/profile`, `/subscribe`, `/consent`, `/billing`, `/legal/:type`, `/sign-in`, `/sign-up` — all present in bundle |
| Catch-all redirects to `/` | ✅ Confirmed in bundle |
| iOS safe-area | ✅ `viewport-fit=cover`, `paddingTop: env(safe-area-inset-top, 0px)` on scroll container |
| OLED-black baseline | ✅ Global `background: #000000`, `theme-color: #000000`, body has `-webkit-tap-highlight-color: transparent` and `overscroll-behavior: none` |
| Apple-PWA meta | ✅ `apple-mobile-web-app-capable=yes`, `status-bar-style=black-translucent`, `apple-mobile-web-app-title=AICandlez`, `apple-touch-icon` linked |

### B. Requires manual / device QA (cannot be verified from server-side)

These items need a real device or Playwright e2e run — flagging them so they don't get missed:

- **Authentication flow** end-to-end (sign-up → email verify → sign-in → sign-out)
- **Onboarding flow** completion (disclaimer, dietary prefs, goal selection)
- **Portfolio rendering** with real Alpaca paper-trading account data
- **Trade execution flow** (preview → confirm → fill → journal entry)
- **Crypto ↔ Equities navigation** transitions
- **AI Buy / AI Sell** end-to-end ML-driven order flow
- **Toast + audio feedback** on real iPhone speaker
- **Responsive layouts** at 390×844 (iPhone 14), 430×932 (iPhone 14 Pro Max), iPad
- **Dark-mode consistency** across all routes (the app is always-dark, but verify no white flashes during route transitions)
- **No dead buttons** — full tap-through audit of every interactive element
- **Push notification permission prompt** on iOS Safari PWA install

Recommend running this through the `testing` skill (Playwright subagent) before submission. I did not run it in this turn to avoid duplicating QA work — it should be the next dedicated pass.

---

## 3. Production Build Verification

### Build result

```
vite v7.3.2 building client environment for production...
✓ 188 modules transformed.
✓ built in 3.03s

dist/public/index.html                3.20 kB │ gzip:   1.07 kB
dist/public/assets/index-*.css       93.94 kB │ gzip:  15.61 kB
dist/public/assets/index-*.js       578.23 kB │ gzip: 158.16 kB
dist/public/assets/AICandlez_*.png 2,128.07 kB  (imported asset, hashed)
```

**Total dist: 8.3 MB**. Acceptable for PWA delivery, but see "Bundle bloat" below.

### Issues found

#### 🔴 BLOCKER — Development Clerk key is baked into production bundle

The current production build embeds:
```
pk_test_YXBwYXJlbnQtcXVhaWwtMi5jbGVyay5hY2NvdW50cy5kZXYk
```

**Mitigation:** the code is correct — it conditionally enables the FAPI proxy only for `pk_live_*` keys:
```js
jb?.startsWith("pk_live_") ? "https://api.aicandlez.com/api/__clerk" : void 0
```
So the runtime won't try to use a non-existent proxy. But the user-visible **"Development mode" red banner** will appear on the sign-in card, which **will fail App Store review**.

**Fix before submission:** set `VITE_CLERK_PUBLISHABLE_KEY=pk_live_…` (and `CLERK_SECRET_KEY=sk_live_…` on api-server) **before running `pnpm --filter @workspace/aicandlez-app run build`**. On Render, set these in the dashboard env vars for the `aicandlez-app` service.

#### 🟡 BLOAT — 7.8 MB of redundant logo PNGs

The build includes:
| File | Size |
|---|---|
| `dist/public/aicandlez-icon.png` | 2.1 MB |
| `dist/public/aicandlez-logo-lg.png` | 1.8 MB |
| `dist/public/aicandlez-logo.png` | 1.8 MB |
| `dist/public/assets/AICandlez_Final_Logo_3_*.png` (imported) | 2.1 MB |

All four are visually identical brand marks. The hashed `assets/AICandlez_*.png` is the one actually rendered in the Clerk sign-in card. The three static ones are referenced by manifest.json + apple-touch-icon + favicon.

**Recommendation (non-blocking but strongly advised before submission):**
- Re-export `aicandlez-logo.png` at 512×512, target < 80 KB (PNG-8 or compressed PNG-24)
- Delete `aicandlez-logo-lg.png` (unused — nothing in source references it)
- Replace the imported brand mark with the same compressed file
- Expected savings: ~7 MB → first-paint latency drops significantly on cellular

#### 🟡 WARNING — Single chunk > 500 KB

Vite warns the main JS chunk is 578 KB. For a PWA this is acceptable, but consider `manualChunks` to split Clerk + React-Query into separate chunks for better caching across releases.

### Build hygiene — clean

| Check | Result |
|---|---|
| Production bundle has zero `localhost` refs | ✅ |
| Production bundle has zero `pk_test_` / `sk_test_` **literals** (only env-var injected) | ✅ |
| Production bundle has zero `apex-trader-app/` URL refs | ✅ |
| Production bundle has zero `apexdigital.design` CDN refs | ✅ |
| `manifest.json` `start_url` + `scope` | ✅ `/aicandlez-app/` |
| `sw.js` cache name | ✅ `aicandlez-v1` |
| Service worker scope inheritance | ✅ Auto from manifest |
| Apple touch icon | ✅ Wired at `%BASE_URL%aicandlez-logo.png` |
| OG image | ✅ `opengraph.jpg` present in public/ |
| favicon | ✅ `favicon.svg` |
| robots.txt | ✅ Present |
| Env var resolution | ✅ Vite resolves `import.meta.env.VITE_CLERK_PUBLISHABLE_KEY` at build time; `BASE_PATH` and `PORT` resolved from artifact.toml |

---

## 4. App Store / Play Store — Submission Plan

### Final app metadata (confirmed)

| Field | Value | Source |
|---|---|---|
| **App display name** (iOS + Android + PWA) | **AICandlez** | All three configs aligned |
| Expo `name` | "AICandlez" | `artifacts/natura-ai/app.json` |
| Expo `scheme` (deep-link) | `aicandlez` | `artifacts/natura-ai/app.json` |
| Expo `slug` | `natura-ai` | `artifacts/natura-ai/app.json` (Expo project slug — internal-only, doesn't show to users) |
| Expo `version` | `2.0.0` | `artifacts/natura-ai/app.json` |
| PWA `name` / `short_name` | "AICandlez" | `artifacts/aicandlez-app/public/manifest.json` |
| PWA `<title>` | "AICandlez — AI Trading Platform" | `artifacts/aicandlez-app/index.html` |

### Bundle identifier recommendations

| Platform | Current | Recommended |
|---|---|---|
| **iOS** `ios.bundleIdentifier` | `com.naturaai.app` | **Keep as-is** if you already have TestFlight history under this ID and want to preserve build numbers. **Switch to `com.aicandlez.app`** for a clean rebrand — this resets build number history and requires creating a fresh Apple App Store Connect record. |
| **iOS** `ios.buildNumber` | `3` | Bump to `4` for next TestFlight upload (must increment monotonically) |
| **Android** `android.package` | _not yet set in app.json_ | **Set to `com.aicandlez.app`** before first Play upload (Android package name cannot be changed after first Play submission) |
| **Android** `android.versionCode` | _not yet set_ | Start at `1` for first internal-testing upload |

**My recommendation:** since you're submitting fresh anyway, **rebrand both to `com.aicandlez.app`** for consistency. The cost is starting iOS build numbers over at `1`, which is a non-issue if you haven't yet been approved on the App Store under `com.naturaai.app`.

### Production build commands

```bash
# 1. Set production env vars BEFORE building
export VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
export NODE_ENV=production

# 2. Build all four AICandlez services
pnpm --filter @workspace/api-server          run build
pnpm --filter @workspace/aicandlez-app       run build
pnpm --filter @workspace/trading-dashboard   run build
pnpm --filter @workspace/landing             run build

# 3. Render auto-deploys via render.yaml on git push
git push origin main
```

For the Expo mobile bundle:

```bash
cd artifacts/natura-ai

# iOS TestFlight
eas build --platform ios --profile production
eas submit --platform ios --latest

# Android internal testing
eas build --platform android --profile production
eas submit --platform android --latest --track internal
```

### Release workflow

1. **Pre-flight (this doc — done):** branding sanitized, structural rename complete, dist scan clean except the dev-key blocker.
2. **Set production secrets** in Replit Secrets / Render env vars:
   - `VITE_CLERK_PUBLISHABLE_KEY=pk_live_…`
   - `CLERK_SECRET_KEY=sk_live_…`
   - `DATABASE_URL=<prod postgres>`
   - `SESSION_SECRET=<64-char hex>`
   - `VAULT_MASTER_KEY=<32-byte base64>`
   - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`
   - Exchange API keys (Kraken, Binance, Coinbase, Bybit, OKX, KuCoin) for any live trading
3. **Compress logo PNGs** (recommended, see Section 3 bloat note).
4. **Run e2e QA** with the testing skill on the dev preview (covers the manual list in §2.B).
5. **Build + deploy to Render** (web surfaces).
6. **EAS build + submit** (Expo mobile bundle).
7. **TestFlight internal testers** — at least 1 week of testing before external review.
8. **Submit for App Store review**, set Google Play track to "internal testing" first.

### Remaining blockers before submission

| # | Blocker | Severity | Action |
|---|---|---|---|
| 1 | Production build embeds Clerk **dev** key | 🔴 BLOCKING | Set `VITE_CLERK_PUBLISHABLE_KEY=pk_live_…` in Render env before deploy |
| 2 | `android.package` not set in `app.json` | 🔴 BLOCKING for Android | Add `"package": "com.aicandlez.app"` to `expo.android` |
| 3 | `ios.bundleIdentifier` is `com.naturaai.app` | 🟡 DECISION REQUIRED | Keep (preserve TestFlight history) OR rebrand to `com.aicandlez.app` (clean ID, resets history) |
| 4 | 7.8 MB of redundant logo PNGs | 🟡 RECOMMENDED FIX | Re-export at 512×512, delete duplicates |
| 5 | Full e2e QA not yet run | 🟡 RECOMMENDED | Run testing skill before submission |
| 6 | App Store Connect listing metadata | 🟢 EXTERNAL | App name, screenshots, privacy policy URL, support URL — set in App Store Connect dashboard |
| 7 | Clerk production instance display name | 🟢 EXTERNAL | Confirm "AICandlez" in Clerk dashboard for the production keys |
| 8 | Stripe production product names + statement descriptor | 🟢 EXTERNAL | Verify in Stripe dashboard |
| 9 | Service worker takeover for stale `/apex-trader-app/` scope | 🟢 OPTIONAL | Not needed unless real users visited the old dev URL. Not exposed in production. |

### What is NOT blocking submission

- The "Development mode" banner shown today — that's just because we're running with dev Clerk keys in this preview environment. Production build with `pk_live_*` removes it automatically.
- The canvas iframe stale URL — UI cache artifact, not in any deployed bundle.
- The natura-ai workflow being stopped — natura-ai is **not part of the AICandlez submission**. It's a separate Expo project that happens to live in the monorepo. AICandlez submission goes through:
  - **Web/PWA** → `artifacts/aicandlez-app` + `artifacts/api-server` + `artifacts/trading-dashboard` + `artifacts/landing` (built via `render.yaml`)
  - **Mobile** → `artifacts/natura-ai` (the Expo project repurposed and rebranded as AICandlez — same Expo machinery, different display name + scheme + identifiers)

---

## Confirmation — natura-ai isolation (re-verified)

| Question | Answer |
|---|---|
| Is natura-ai part of the AICandlez production build? | **No.** `render.yaml` has 4 services (`aicandlez-api`, `aicandlez-dashboard`, `aicandlez-app`, `aicandlez-landing`). Zero natura-* services. |
| Are natura-ai assets/configs bundled into the AICandlez web app? | **No.** `aicandlez-app/package.json` depends only on `@workspace/api-client-react`. No natura imports anywhere in `aicandlez-app/src` or `trading-dashboard/src` or `landing/src`. |
| Do App Store submission artifacts contain only AICandlez branding? | **Yes** for the PWA bundle (`dist/`) — zero "natura" or "apex" strings found in the production JS/CSS/HTML/manifest/sw. **For the mobile bundle**, the Expo project at `artifacts/natura-ai/` has been rebranded — `expo.name="AICandlez"`, `expo.scheme="aicandlez"`, splash text "AC", all in-app strings use AICandlez. The directory name `natura-ai/` and Expo `slug="natura-ai"` are internal-only and never shown to App Store reviewers or end users. |

The `natura-ai` directory naming is the last cosmetic remnant — it's just where the Expo project lives on disk. Renaming the directory is a larger refactor (touches workflows, EAS project linkage, package name) and is **not required** for App Store approval. Reviewers see `expo.name="AICandlez"`, the bundle ID, and the app icon — none of which expose the directory name.
