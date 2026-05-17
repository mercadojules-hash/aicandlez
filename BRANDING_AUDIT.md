# Production Branding Audit — AICandlez

_Date: 2026-05-17. Scope: all branded surfaces across the monorepo._

## Result

**156 branded references found. 135 sanitized this round (87%). 21 remain,
all of them within ONE structural identifier — the `apex-trader-app`
artifact directory + its `/apex-trader-app/` URL path prefix — which
requires a directory rename to remove. See "Structural items requiring
sign-off" below.**

Zero references to "Trade Sentinel" or "TradeSentinel" were found
anywhere in the codebase.

---

## ✅ Sanitized this round

### 1. User-facing UI text (apex-trader-app)

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

This file is what becomes the iOS / Android app bundle. Critical for
TestFlight / Play submission.

| Field | Was | Now |
|---|---|---|
| `expo.name` | "Apex AI Trader" | "AICandlez" |
| `expo.scheme` (deep-link URI scheme) | `apex-trader` | `aicandlez` |
| `ios.NSPhotoLibraryUsageDescription` | "Allow Apex Trader to access…" | "Allow AICandlez to access…" |
| `ios.NSCameraUsageDescription` | "Allow Apex Trader to access…" | "Allow AICandlez to access…" |
| `web.shortName` | "Apex" | "AICandlez" |

Splash + tab screens:
- `app/_layout.tsx` — `ApexSplash` component renamed to `BrandSplash`, splash text "APEX" → "AC"
- `app/(tabs)/profile.tsx` — username "Apex Trader" → "AICandlez", email → `user@aicandlez.com`
- `app/(tabs)/index.tsx` — logo "APEX TRADER" → "AC LZ"
- `app/(tabs)/terminal.tsx` — "APEX ENGINE RUNNING" → "AICANDLEZ ENGINE RUNNING"
- `constants/theme.ts` — header comment

### 3. Internal CSS animation names (non-user-visible but in shipped JS bundle)

Renamed `@keyframes apex-spin` → `@keyframes ac-spin` everywhere it
appears so the keyword "apex" no longer appears in shipped bundles:
- `apex-trader-app/src/App.tsx`
- `apex-trader-app/src/index.css`
- `apex-trader-app/src/components/TradingAccountOnboardingModal.tsx`
- `trading-dashboard/src/App.tsx`

### 4. LocalStorage keys (persist on user devices)

Renamed all `apex_*` keys to `ac_*`. **Note:** existing test users will
lose their cached state once after this update (re-login / re-set
preferences). Acceptable pre-launch.

| Old key | New key | File |
|---|---|---|
| `apex_ai_autotrade` | `ac_ai_autotrade` | `AIAutoTradeContext.tsx` |
| `apex_broker_status`, `apex_broker_account` | `ac_broker_status`, `ac_broker_account` | `BrokerConnectionContext.tsx` |
| `apex_user_profile` | `ac_user_profile` | `UserProfileContext.tsx` |
| `apex_sound_v1` | `ac_sound_v1` | `AlertsProvider.tsx` |
| `apex_seen_signals_v1` | `ac_seen_signals_v1` | `AlertsProvider.tsx` |
| `apex_settings_cache_v1` | `ac_settings_cache_v1` | `SettingsDrawer.tsx` |

### 5. Server identifiers (non-user-visible but in logs / Alpaca API)

| File | Was | Now |
|---|---|---|
| `api-server/.../AlpacaAdapter.ts` | clientId prefix `apex-{ts}-{seq}` (sent to Alpaca) | `ac-{ts}-{seq}` |
| `trading-dashboard/src/main.tsx` | `console.error("[Apex] Bootstrap…")` | `[AICandlez] Bootstrap…` |
| `scripts/seed-products.ts` | "🔧 Apex Trader — Seeding…" | "🔧 AICandlez — Seeding…" |

### 6. Trading dashboard (operator console — internal but cleaned)

- `pages/Dashboard.tsx` — header chip "ApexTrader · Hybrid AI Trading System" → "AICandlez · …"
- `pages/Admin.tsx` — 12 demo user emails `*@apex.io` → `*@aicandlez.com`

### 7. On-disk build artifacts

- Renamed `artifacts/api-server/dist/apex-trader-production.zip` → `aicandlez-production.zip` so the existing `/api/internal/download/production` route (already pointing at the new name) actually serves the file.

### 8. Documentation files (internal, but kept clean for any leaked screenshots / reviewer doc shares)

- `README.md`, `SETUP.md` — "Apex Trader" → "AICandlez", local DB name `apex_trader` → `aicandlez`
- `replit.md`, `DEPLOYMENT.md`, `PRODUCTION_AUTH_CHECKLIST.md`, `PRODUCTION_SAFETY.md`, `LAUNCH_READINESS.md` — "Apex Trader" → "AICandlez" (note: many docs still reference `apex-trader-app` as the **directory name** — see structural section)
- `lib/db/drizzle.config.ts` — local-dev DB fallback `apex_trader` → `aicandlez`
- ZIP download path `/api/apex-trader-v2.zip` → `/api/aicandlez-v2.zip` in docs

---

## ⚠ Structural items requiring sign-off

There are **21 remaining references** in the codebase, all reflecting the
same one structural identifier:

> **The artifact directory is named `artifacts/apex-trader-app/`, its
> npm package name is `@workspace/apex-trader-app`, and its URL path
> prefix served by the shared proxy is `/apex-trader-app/`.**

This identifier appears in:
- `render.yaml` (build command + static publish path)
- `artifacts/landing/src/components/landing/{Hero,Navbar,Pricing,CTA,Footer,MobileShowcase}.tsx` — 8 hrefs of the form `href="/apex-trader-app/"`
- `artifacts/apex-trader-app/public/manifest.json` — `start_url` and `scope`
- `artifacts/apex-trader-app/src/pages/{Subscribe,Account,Billing}.tsx` — Stripe `successUrl` / `cancelUrl` / `returnUrl`
- `artifacts/api-server/src/services/notifications/NotificationDispatcher.ts` — push notification click target URLs
- `artifacts/api-server/src/lib/tradingLoop.ts` — push URL
- `PRODUCTION_AUTH_CHECKLIST.md`, `DEPLOYMENT.md`, `replit.md`, `PRODUCTION_SAFETY.md`, `LAUNCH_READINESS.md` — doc references to the path

**Visibility:** End users **will** see `/apex-trader-app/` in their
browser address bar when they open the app, and Stripe checkout return
URLs route through this prefix. App Store reviewers technically see it
if they inspect the PWA URL.

### Why I didn't auto-execute the rename

Renaming the artifact requires changing, in order:
1. Directory: `artifacts/apex-trader-app/` → `artifacts/aicandlez-app/`
2. `package.json` name: `@workspace/apex-trader-app` → `@workspace/aicandlez-app`
3. `.replit-artifact/artifact.toml` slug + previewPath
4. Workflows configured by the Replit platform (auto-managed when artifact.toml changes)
5. `render.yaml` build commands + static paths
6. `pnpm-workspace.yaml` if it pins the path
7. All `/apex-trader-app/` URL references (manifest, push URLs, Stripe URLs, landing hrefs) — ~15 occurrences
8. CORS origin allowlists in api-server
9. Service worker scope (sw.js)
10. Probably 5–10 other places I'll find once breaking starts

This is invasive enough that it warrants a dedicated commit you can
roll back atomically. **Please confirm whether to proceed**, and I'll
do it in one focused pass with rigorous testing afterwards. Suggested
new name: `aicandlez-app` (matches existing `aicandlez.com` domain).

---

## ⚠ External CDN URLs (out of scope)

12 image URLs in `natura-web/src/lib/data.ts`, `natura-web/src/lib/background.ts`,
and `natura-ai/data/wellness.ts` point to `https://apexdigital.design/…` —
this is an external image-hosting CDN. The word "apex" is in the CDN
**domain name**, not in app-visible text. Options:

1. **Leave as-is** — these are wellness app images, not trading app; users won't see the URL.
2. **Migrate images** — re-host the 12 images to AICandlez own CDN / object storage (~30 min work, but breaks images until migration completes).

I'd recommend option (2) before public launch, but it's **not** an
App Store blocker. Natura-* artifacts are out of the AICandlez
submission scope anyway.

---

## ✅ Negative findings (good news)

- **"Trade Sentinel" / "TradeSentinel"**: 0 references anywhere.
- **Old bundle IDs**: only `com.naturaai.app` (correct, intentional — natura's own bundle).
- **Implied profit promises** ("guaranteed", "wealth"): 0 in user-facing copy (verified in Pass 1 of launch hardening).
- **Hosted Clerk display name**: configured in Clerk dashboard, not codebase — verify in dashboard before submission.

---

## ✅ Typecheck status after this audit

| Artifact | Status |
|---|---|
| `apex-trader-app` | ✅ Pass |
| `trading-dashboard` | ✅ Pass |
| `api-server` | ✅ Pass |
| `landing` | ✅ Pass |
| `natura-ai`, `natura-web` | ⚠ Pre-existing failures, unrelated to branding edits |

---

## Recommended next actions

1. **Confirm** whether to proceed with the `apex-trader-app` →
   `aicandlez-app` directory + URL prefix rename. After your sign-off
   I'll do it as a single atomic commit.
2. **Migrate** the 12 `apexdigital.design`-hosted images if you want
   that domain off the wire entirely. Otherwise leave for later.
3. **Verify** the Clerk dashboard application display name reads
   "AICandlez" (this is configured outside the codebase).
4. **Verify** the Stripe product names / dashboard branding — check
   the connected Stripe account display.
