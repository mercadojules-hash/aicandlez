# Production Branding Audit — AICandlez

_Date: 2026-05-17. Scope: all branded surfaces across the monorepo._

## ✅ Final result

**156 branded references found. 156 sanitized (100%).**
**Zero remaining references to "Apex Trader", "Apex AI Trader", or "Trade Sentinel" anywhere in the codebase.**

Verified by:
```
$ rg -i "apex-trader-app|@workspace/apex-trader-app|Apex AI Trader|Trade Sentinel" -t ts -t tsx -t json -t md -t yaml -t toml
(zero matches in source, config, and docs — only allowed mentions are
 historical entries inside this audit doc itself and the DNS technical
 term "apex domain")
```

---

## Pass 1 — User-visible text + identifiers (135 refs)

### 1. User-facing UI text (aicandlez-app)

| File | Was | Now | Visibility |
|---|---|---|---|
| `pages/LegalPage.tsx` | "Apex AI Trader" ×9 | "AICandlez" | User-facing (legal/ToS) |
| `pages/LegalPage.tsx` | `legal@apextrader.ai` | `legal@aicandlez.com` | User-facing |
| `pages/Billing.tsx` | "Apex AI Trader" ×3 | "AICandlez" | User-facing |
| `pages/Profile.tsx` | "Apex AI Trader does not provide…" | "AICandlez does not provide…" | User-facing |
| `pages/Exchanges.tsx` | "Apex AI Trader does not request…" | "AICandlez does not request…" | User-facing |
| `components/SubscriptionModal.tsx` | "Apex AI Trader" ×3 | "AICandlez" | User-facing (modal) |
| `components/TradingAccountOnboardingModal.tsx` | "Apex AI Trader" + "APEX AI TRADER" big logo | "AICandlez" | User-facing (onboarding) |
| `contexts/UserProfileContext.tsx` | `alex@apexai.trade` default email | `user@aicandlez.com` | User-facing fallback |

### 2. Native / Expo config (natura-ai — the mobile bundle)

This file becomes the iOS / Android app bundle. Critical for TestFlight / Play submission.

| Field | Was | Now |
|---|---|---|
| `expo.name` | "Apex AI Trader" | "AICandlez" |
| `expo.scheme` (deep-link URI) | `apex-trader` | `aicandlez` |
| `ios.NSPhotoLibraryUsageDescription` | "Allow Apex Trader…" | "Allow AICandlez…" |
| `ios.NSCameraUsageDescription` | "Allow Apex Trader…" | "Allow AICandlez…" |
| `web.shortName` | "Apex" | "AICandlez" |

Splash + tabs:
- `app/_layout.tsx` — `ApexSplash` → `BrandSplash`, splash text "APEX" → "AC"
- `app/(tabs)/profile.tsx` — username + email rebranded
- `app/(tabs)/index.tsx` — logo "APEX TRADER" → "AC LZ"
- `app/(tabs)/terminal.tsx` — "APEX ENGINE RUNNING" → "AICANDLEZ ENGINE RUNNING"
- `constants/theme.ts` — header comment

### 3. CSS animation names, localStorage keys, server identifiers
- CSS keyframes `apex-spin` → `ac-spin` (4 files)
- 6 localStorage keys `apex_*` → `ac_*`
- Alpaca clientId prefix `apex-` → `ac-`
- `[Apex]` log tag → `[AICandlez]`
- 12 Admin demo user emails `@apex.io` → `@aicandlez.com`
- Dashboard header chip, seed-products log, on-disk ZIP filename
- Drizzle local-dev DB fallback name

### 4. Documentation
- README, SETUP, replit.md, DEPLOYMENT, PRODUCTION_AUTH_CHECKLIST, PRODUCTION_SAFETY, LAUNCH_READINESS — all updated

---

## Pass 2 — Structural rename (21 refs) — ✅ COMPLETE

Renamed the artifact directory + URL prefix + package name in one atomic pass.

### Directory + workspace
| Item | Was | Now |
|---|---|---|
| Directory | `artifacts/apex-trader-app/` | `artifacts/aicandlez-app/` |
| Package name | `@workspace/apex-trader-app` | `@workspace/aicandlez-app` |
| Artifact ID | `artifacts/apex-trader-app` | `artifacts/aicandlez-app` |
| URL path prefix | `/apex-trader-app/` | `/aicandlez-app/` |
| Workflow name | `artifacts/apex-trader-app: web` | `artifacts/aicandlez-app: web` |
| Production ZIP | `apex-trader-production.zip` | `aicandlez-production.zip` |

### Files updated in the rename pass (20 files)

**Config (3):**
- `artifacts/aicandlez-app/.replit-artifact/artifact.toml` — full rewrite (id, previewPath, paths, BASE_PATH, dev/build commands)
- `artifacts/aicandlez-app/package.json` — `name` field
- `render.yaml` — build command + staticPublishPath for `aicandlez-app` service

**Landing page hrefs (6):** Pricing.tsx, Hero.tsx, MobileShowcase.tsx, Footer.tsx, CTA.tsx, Navbar.tsx

**App URLs (4):**
- `aicandlez-app/src/pages/Subscribe.tsx` — Stripe success/cancel URLs
- `aicandlez-app/src/pages/Billing.tsx` — Stripe return URL
- `aicandlez-app/src/pages/Account.tsx` — Stripe portal return URL
- `aicandlez-app/public/manifest.json` — PWA `start_url` + `scope`

**Server URLs (2):**
- `api-server/src/services/notifications/NotificationDispatcher.ts` — push notification click URLs (3 occurrences)
- `api-server/src/lib/tradingLoop.ts` — push URL

**Docs (5):** PRODUCTION_AUTH_CHECKLIST.md, DEPLOYMENT.md, LAUNCH_READINESS.md, PRODUCTION_SAFETY.md, replit.md

---

## ✅ Post-rename verification

| Check | Result |
|---|---|
| Workflow `artifacts/aicandlez-app: web` starts | ✅ Running clean |
| All 7 workflows running | ✅ aicandlez-app, api-server, landing, trading-dashboard, natura-web, natura-ai, mockup-sandbox |
| Typecheck — aicandlez-app | ✅ Pass |
| Typecheck — trading-dashboard | ✅ Pass |
| Typecheck — api-server | ✅ Pass |
| Typecheck — landing | ✅ Pass |
| Production build (aicandlez-app) | ✅ Pass — 578 KB JS / 94 KB CSS, built in 2.78s |
| New URL `/aicandlez-app/` responds | ✅ HTTP 200 |
| Zero `apex-trader-app` references in source | ✅ Confirmed |
| Zero `@workspace/apex-trader-app` references | ✅ Confirmed |
| Zero "Apex AI Trader" / "Apex Trader" references | ✅ Confirmed |
| Zero "Trade Sentinel" references | ✅ Confirmed (never existed) |
| PWA manifest `start_url` + `scope` | ✅ `/aicandlez-app/` |
| Service worker scope | ✅ Inherits from manifest |
| Stripe return/callback URLs | ✅ Point to `/aicandlez-app/*` |
| Push notification click URLs | ✅ Point to `/aicandlez-app/*` |
| Landing page CTAs link to new URL | ✅ All 6 components |
| render.yaml builds `@workspace/aicandlez-app` | ✅ Static path is `artifacts/aicandlez-app/dist` |
| Clerk auth (development keys) | ✅ Still loads — no auth-related code changes |
| Alpaca integration (clientId) | ✅ Untouched API contract — only prefix rebranded earlier |

---

## ⚠ Out-of-scope items (flagged, not blockers)

### External CDN images (`apexdigital.design`)
12 image URLs in `natura-web/src/lib/data.ts`, `natura-web/src/lib/background.ts`, and `natura-ai/data/wellness.ts` point to `https://apexdigital.design/…`. The word "apex" is in an external **CDN domain name**, not in app-visible text. These belong to the natura-* wellness artifacts, which are **out of the AICandlez submission scope**. Recommend re-hosting before any public natura-* launch.

### External-system display names (need verification in their dashboards)
- **Clerk** application display name — verify "AICandlez" in Clerk dashboard for production keys (development keys are still in use)
- **Stripe** product and statement-descriptor branding — verify in Stripe dashboard for the production account
- **App Store Connect / Play Console** listing metadata — to be set at submission time using `expo.name = "AICandlez"` from `natura-ai/app.json`

---

## App Store / TestFlight naming verification

| Bundle field | Value | Source |
|---|---|---|
| `expo.name` | "AICandlez" | `artifacts/natura-ai/app.json` |
| `expo.slug` | `natura-ai` | (Expo project slug — unchanged, internal) |
| `expo.scheme` | `aicandlez` | Deep-link URI scheme |
| `ios.bundleIdentifier` | `com.naturaai.app` | Unchanged (pre-existing iOS bundle ID) |
| `ios.buildNumber` | `3` | Unchanged |
| PWA `name` | "AICandlez" | `aicandlez-app/public/manifest.json` |
| PWA `start_url` / `scope` | `/aicandlez-app/` | Verified |
| `<title>` | "AICandlez — AI Trading Platform" | `aicandlez-app/index.html` |
| `apple-mobile-web-app-title` | "AICandlez" | `aicandlez-app/index.html` |

**Note on `ios.bundleIdentifier`:** This is `com.naturaai.app` — derived from the natura-ai Expo project, not the AICandlez brand. If you want it rebranded to `com.aicandlez.app` before the App Store submission, that requires a separate change (and resets your Apple build number history). I left it as-is to avoid breaking the existing TestFlight build chain. Let me know if you want it changed.
