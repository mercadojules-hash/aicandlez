# AICandlez Mobile — Expo iOS WebView Shell

Native iOS wrapper around the production AICandlez PWA. Distributed via
TestFlight and the App Store. **Identical UX to the web app**, with native
splash, safe-area handling, Clerk cookie session, offline fallback, and
gesture navigation.

| Setting              | Value                          |
| -------------------- | ------------------------------ |
| App name             | `AICandlez`                    |
| Bundle Identifier    | `com.julesmercado.aicandelz`   |
| Expo SDK             | `~54.0.27`                     |
| Target               | iOS 15.1+ (Expo SDK 54 default)|
| Production URL       | `https://app.aicandelz.com`    |
| Distribution         | TestFlight → App Store         |

---

## First-time setup (one-off, on your Mac)

```bash
# From repo root
cd artifacts/aicandelz-mobile

# 1. Install deps (uses workspace pnpm)
pnpm install --filter @workspace/aicandelz-mobile

# 2. Install EAS CLI globally (or use npx)
npm i -g eas-cli

# 3. Log in to your Expo account
eas login

# 4. Link this project to your Expo account
eas init

#    → This will populate `extra.eas.projectId` in app.json.
#    → Replace the placeholder string in app.json automatically.

# 5. Configure iOS credentials (Apple Developer Team + ASC API Key)
eas credentials -p ios
```

When EAS asks for the bundle identifier, confirm **`com.julesmercado.aicandelz`**
(exact spelling as registered in App Store Connect).

---

## Build for TestFlight

```bash
# Production iOS build (cloud, ~15-25 min)
eas build --platform ios --profile production

# When it finishes, submit to TestFlight in one command:
eas submit --platform ios --latest
```

Before `eas submit` works you must fill in two placeholders in `eas.json`:

```json
"submit": {
  "production": {
    "ios": {
      "bundleIdentifier": "com.julesmercado.aicandelz",
      "ascAppId":     "REPLACE_WITH_APP_STORE_CONNECT_APP_ID",
      "appleTeamId":  "REPLACE_WITH_APPLE_TEAM_ID"
    }
  }
}
```

- **`ascAppId`** — the numeric ID from App Store Connect → App Information.
- **`appleTeamId`** — 10-character team ID from
  developer.apple.com/account → Membership.

---

## What the shell provides

The `App.tsx` shell wraps a single `react-native-webview` pointed at
`https://app.aicandelz.com` and adds these native niceties:

| Feature                | How                                                                  |
| ---------------------- | -------------------------------------------------------------------- |
| Splash screen          | `expo-splash-screen` + animated brand overlay until first paint      |
| Dark neon-green theme  | `#000` background, `#66FF66` accents — matches PWA tokens exactly    |
| Loading state          | Brand overlay fades out after WebView `onLoadEnd`                    |
| Offline handling       | `@react-native-community/netinfo` → branded "No connection" screen   |
| Hard-error recovery    | Branded error screen with **TRY AGAIN** reload button                |
| Safe areas             | `react-native-safe-area-context` — top, left, right, bottom blocks   |
| iPhone responsive      | WebView fills safe area; PWA already mobile-first responsive         |
| Status bar             | `expo-status-bar` light style on black background                    |
| Clerk auth persistence | `sharedCookiesEnabled` + `thirdPartyCookiesEnabled` + `domStorageEnabled` |
| Back/forward gestures  | `allowsBackForwardNavigationGestures` (iOS edge swipe)               |
| Pull to refresh        | `pullToRefreshEnabled`                                               |
| External links         | Opened in `SFSafariViewController` via `expo-web-browser`            |
| Custom schemes         | `mailto:` / `tel:` / `sms:` routed to system handlers                |
| Foreground refresh     | App resume → injects `window` focus event, PWA refetches signals     |

---

## Updating the app

1. Bump `version` in `app.json`.
2. `buildNumber` is auto-incremented by EAS (`autoIncrement: true` on
   the production profile).
3. `eas build -p ios --profile production && eas submit -p ios --latest`.

No code change is needed when the PWA updates — the WebView always serves
the latest production deployment.

---

## App Store assets checklist

For the TestFlight → App Store Connect submission, you still need to
prepare these in **App Store Connect** (outside this repo):

- [ ] Screenshots (6.7" iPhone, 6.5" iPhone, 5.5" iPhone — at minimum 6.7")
- [ ] App preview video (optional, 15-30s)
- [ ] App description, keywords, support URL, marketing URL
- [ ] Privacy policy URL — required
- [ ] Age rating questionnaire
- [ ] Encryption export compliance — answered **No** in
      `app.json → ios.config.usesNonExemptEncryption: false` ✓ already set
- [ ] App Review Information (demo account credentials — give Apple a test
      Clerk account that can sign into the PWA without phone verification)
- [ ] App icon (1024×1024) — App Store Connect requires this separately
      from `assets/icon.png`. Generate from `assets/icon.png` if needed.

---

## Troubleshooting

**`eas build` fails with "Invalid bundle identifier"**
→ Confirm `app.json → ios.bundleIdentifier` matches what you registered in
   App Store Connect — currently `com.julesmercado.aicandelz`.

**Clerk session doesn't persist between app launches**
→ Verify cookies are scoped to `.aicandelz.com` (or whatever domain Clerk
   is configured for in production). Check `sharedCookiesEnabled={true}`.

**App rejected by Apple as "just a website"**
→ The shell already adds enough native UX (splash, offline handling, safe
   areas, gestures, in-app browser for external links) to clear the
   Guideline 4.2 bar. If rejected anyway, add 1-2 additional native
   features behind the WebView (e.g. push notifications via
   `expo-notifications`, biometric unlock via `expo-local-authentication`).

**Splash flashes white before brand overlay**
→ The native splash background is set to `#000` in `app.json` — make sure
   you ran `eas build` after the latest `app.json` change, not a cached
   build.

---

## Local dev

You generally **do not need** to run this locally — the WebView shell is
trivial and the entire UX lives in the PWA (`artifacts/aicandlez-app`).

If you do want to preview it on a simulator:

```bash
cd artifacts/aicandelz-mobile
pnpm install
pnpm start            # Expo dev server
# Then press 'i' for iOS Simulator (Xcode required)
```
