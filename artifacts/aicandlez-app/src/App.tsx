import { Component, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import {
  ClerkProvider, SignIn, SignUp, Show, ClerkLoading, ClerkLoaded, useClerk,
} from "@clerk/react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "@/components/BottomNav";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { SubscriptionModal }    from "@/components/SubscriptionModal";
import { BrokerConnectionProvider }        from "@/contexts/BrokerConnectionContext";
import { AIAutoTradeProvider }             from "@/contexts/AIAutoTradeContext";
import { UserProfileProvider }             from "@/contexts/UserProfileContext";
import { TradingAccountOnboardingModal }   from "@/components/TradingAccountOnboardingModal";
import { AlpacaAutoTrader }               from "@/components/AlpacaAutoTrader";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import Home      from "@/pages/Home";
import AISignals from "@/pages/AISignals";
import Markets   from "@/pages/Markets";
import Profile   from "@/pages/Profile";
import Subscribe from "@/pages/Subscribe";
import Consent   from "@/pages/Consent";
import Billing   from "@/pages/Billing";
import LegalPage from "@/pages/LegalPage";
import Equities    from "@/pages/Equities";
import AssetDetail from "@/pages/AssetDetail";
import PortalDesktop from "@/pages/PortalDesktop";
import { useIsMobile } from "@/hooks/use-mobile";

// ── Env ────────────────────────────────────────────────────────────────────────
const clerkPubKey   = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
// Clerk FAPI proxy disabled — proxy/satellite domains require a paid Clerk plan.
// Talk directly to Clerk's shared frontend API for both dev and prod.
const clerkProxyUrl: string | undefined = undefined;
const basePath      = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

function stripBase(p: string) {
  return basePath && p.startsWith(basePath) ? p.slice(basePath.length) || "/" : p;
}

// ── React Query ────────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 15_000 } },
});

// ── Loading / Error states ─────────────────────────────────────────────────────
const SANS = "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif";

function FullPageLoader({ label = "Loading" }: { label?: string } = {}) {
  // Visible-stuck diagnostic. If the spinner is up for >6s we surface a
  // concrete escape hatch instead of leaving the user staring at a blank
  // page indefinitely. Covers: Clerk FAPI hanging, JS chunk fetch stalls,
  // service-worker serving deleted chunks, and any other invisible network
  // freeze that previously presented as "blank/gray screen, console clean".
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setStuck(true), 6000);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", background: "#000000", gap: 20,
      padding: 24, textAlign: "center" }}>
      <div style={{ fontSize: 9, fontFamily: SANS, fontWeight: 600,
        color: "rgba(136,146,164,0.45)", letterSpacing: "0.3em" }}>AICANDLEZ</div>
      <div style={{ width: 22, height: 22,
        border: "1.5px solid rgba(255,255,255,0.07)",
        borderTopColor: "rgba(102,255,102,0.85)",
        borderRadius: "50%",
        animation: "ac-spin 0.7s linear infinite" }} />
      <div style={{ fontSize: 10, fontFamily: SANS,
        color: "rgba(102,255,102,0.55)", letterSpacing: "0.1em" }}>{label}</div>
      {stuck && (
        <div style={{ marginTop: 16, maxWidth: 320, fontFamily: SANS,
          color: "rgba(232,245,236,0.80)", fontSize: 12, lineHeight: 1.55,
          background: "#0A1410", border: "1px solid #0F1F18",
          borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ color: "#66FF66", fontSize: 10, fontWeight: 700,
            letterSpacing: "0.15em", marginBottom: 8 }}>STILL LOADING</div>
          Stuck on this screen? Try a hard refresh, clear your browser cache,
          or sign in again.
          <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "center" }}>
            <button onClick={() => { try { caches.keys().then(k => k.forEach(c => caches.delete(c))); } catch {} ; location.reload(); }}
              style={{ background: "#66FF66", color: "#000", border: "none",
                borderRadius: 6, padding: "8px 14px", fontSize: 11, fontWeight: 700,
                fontFamily: SANS, cursor: "pointer", letterSpacing: "0.05em" }}>
              Reload
            </button>
            <button onClick={() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} ; location.reload(); }}
              style={{ background: "transparent", color: "#EAFFEA",
                border: "1px solid #1a3a25", borderRadius: 6, padding: "8px 14px",
                fontSize: 11, fontFamily: SANS, cursor: "pointer", letterSpacing: "0.05em" }}>
              Reset & reload
            </button>
          </div>
        </div>
      )}
      <style>{`@keyframes ac-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Crash boundary — last line of defense against blank-screen states ────────
// React's default behavior when a component throws and there is no nearest
// ErrorBoundary is to unmount the entire tree. Combined with a #root that has
// `background: #000` from index.html, that produces the exact symptom users
// have been reporting: blank/dark screen, clean console (because we now also
// surface the error via componentDidCatch). With this boundary in place the
// page can never go fully blank — we always render a visible recovery card.
interface CrashState { error: Error | null }
class CrashBoundary extends Component<{ children: ReactNode }, CrashState> {
  state: CrashState = { error: null };
  static getDerivedStateFromError(error: Error): CrashState { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[CrashBoundary] uncaught render error", error, info.componentStack);
  }
  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{ position: "absolute", inset: 0, display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "center",
        background: "#000000", padding: 24, textAlign: "center", fontFamily: SANS }}>
        <div style={{ fontSize: 9, fontWeight: 600,
          color: "rgba(136,146,164,0.45)", letterSpacing: "0.3em", marginBottom: 14 }}>
          AICANDLEZ
        </div>
        <div style={{ fontSize: 14, color: "#ff4060", fontWeight: 600, marginBottom: 8 }}>
          Something went wrong
        </div>
        <div style={{ fontSize: 11, color: "rgba(232,245,236,0.65)", maxWidth: 340,
          lineHeight: 1.55, marginBottom: 16 }}>
          The app hit an unexpected error while loading. Your data is safe.
          Try reloading — if it keeps happening, clear cache and sign in again.
        </div>
        <pre style={{ fontSize: 9, color: "rgba(255,64,96,0.65)",
          background: "#0A1410", border: "1px solid #0F1F18", borderRadius: 8,
          padding: "10px 12px", maxWidth: 360, maxHeight: 120, overflow: "auto",
          whiteSpace: "pre-wrap", marginBottom: 16 }}>
          {error.message || String(error)}
        </pre>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { try { caches.keys().then(k => k.forEach(c => caches.delete(c))); } catch {} ; location.reload(); }}
            style={{ background: "#66FF66", color: "#000", border: "none",
              borderRadius: 6, padding: "8px 14px", fontSize: 11, fontWeight: 700,
              cursor: "pointer", letterSpacing: "0.05em" }}>
            Reload
          </button>
          <button onClick={() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} ; location.reload(); }}
            style={{ background: "transparent", color: "#EAFFEA",
              border: "1px solid #1a3a25", borderRadius: 6, padding: "8px 14px",
              fontSize: 11, cursor: "pointer", letterSpacing: "0.05em" }}>
            Reset & reload
          </button>
        </div>
      </div>
    );
  }
}

function MissingKeyError() {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", background: "#000000",
      gap: 12, fontFamily: SANS }}>
      <div style={{ fontSize: 9, fontWeight: 600,
        color: "rgba(136,146,164,0.35)", letterSpacing: "0.2em" }}>AICANDLEZ</div>
      <div style={{ fontSize: 13, color: "rgba(255,51,85,0.85)", fontWeight: 600 }}>
        Configuration Required
      </div>
      <div style={{ fontSize: 10, color: "rgba(136,146,164,0.60)", padding: "10px 16px",
        background: "#0d151e", border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 8, lineHeight: 1.6 }}>
        VITE_CLERK_PUBLISHABLE_KEY is not set.
      </div>
    </div>
  );
}

// ── Auth page wrapper ──────────────────────────────────────────────────────────
function AuthPage({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center",
      minHeight: "100%", padding: "24px 16px", background: "#000000" }}>
      {children}
    </div>
  );
}

// ── Route guard ────────────────────────────────────────────────────────────────
function Protected({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ClerkLoading><FullPageLoader /></ClerkLoading>
      <ClerkLoaded>
        <Show when="signed-in">{children}</Show>
        <Show when="signed-out"><Redirect to="/sign-in" /></Show>
      </ClerkLoaded>
    </>
  );
}

// ── /portal responsive switch ─────────────────────────────────────────────────
// Desktop (≥768px) → institutional terminal (PortalDesktop). Mobile (<768px)
// → radar Home (the PWA mobile shell). The multi-panel desktop layout does
// not fit narrow viewports, so we degrade gracefully instead of letting it
// overflow horizontally.
function PortalResponsive() {
  const isMobile = useIsMobile();
  return isMobile ? <Home /> : <PortalDesktop />;
}

// ── Cache invalidation ─────────────────────────────────────────────────────────
// IMPORTANT: `addListener` from useClerk() is NOT a stable reference across
// renders, and `qc` is. If we put `addListener` in the deps array the effect
// tears down + re-subscribes on every render. Some Clerk versions fire the
// listener synchronously on subscribe with the current session, which then
// calls `qc.clear()` → query invalidation → re-render → unstable addListener
// → re-subscribe → loop. Symptom in prod: visible tab flicker, blank/gray
// screen, no console errors. Fix: pin the listener to a ref and use a
// no-deps mount-only effect.
function CacheInvalidator() {
  const clerk = useClerk();
  const qc    = useQueryClient();
  const prev  = useRef<string | null | undefined>(undefined);
  const qcRef = useRef(qc);
  qcRef.current = qc;
  const clerkRef = useRef(clerk);
  clerkRef.current = clerk;

  useEffect(() => {
    const unsub = clerkRef.current.addListener(({ user }) => {
      const uid = user?.id ?? null;
      if (prev.current !== undefined && prev.current !== uid) {
        console.log("[CacheInvalidator] user changed", { from: prev.current, to: uid });
        qcRef.current.clear();
      }
      prev.current = uid;
    });
    return unsub;
  }, []);

  return null;
}

// ── Render-loop guard — diagnostic only ──────────────────────────────────────
// If something re-mounts the React tree at a runaway rate (e.g. SW activation
// thrash, infinite redirect, or the addListener loop that previously existed)
// we surface a visible diagnostic banner instead of just spinning forever.
function RenderLoopGuard() {
  const renderCount = useRef(0);
  const firstRender = useRef(Date.now());
  const [tripped, setTripped] = useState(false);

  renderCount.current += 1;
  if (renderCount.current > 200 && !tripped) {
    const elapsed = Date.now() - firstRender.current;
    if (elapsed < 5000) {
      console.error("[RenderLoopGuard] runaway re-render detected", {
        count: renderCount.current, elapsedMs: elapsed,
      });
      setTripped(true);
    } else {
      renderCount.current = 0;
      firstRender.current = Date.now();
    }
  }

  if (!tripped) return null;
  return (
    <div style={{ position: "fixed", top: 12, left: 12, right: 12, zIndex: 9999,
      background: "#3a0a14", border: "1px solid #ff4060", borderRadius: 8,
      padding: "10px 14px", fontFamily: SANS, fontSize: 11, color: "#ffb0b8",
      lineHeight: 1.5 }}>
      <b style={{ color: "#ff4060" }}>RENDER LOOP DETECTED</b> — the app is
      re-rendering &gt;200 times in &lt;5s. Check console for
      <code style={{ background: "#000", padding: "1px 4px", borderRadius: 3, margin: "0 4px" }}>
        [RenderLoopGuard]
      </code>
      and report it.
    </div>
  );
}

// ── Sub-pages — no bottom nav ──────────────────────────────────────────────────
const SUB_PAGES = ["/sign-", "/exchanges", "/billing", "/legal", "/subscribe", "/consent"];

function Nav() {
  const [loc] = useLocation();
  if (SUB_PAGES.some(p => loc.startsWith(p))) return null;
  return (
    <ClerkLoaded>
      <Show when="signed-in"><BottomNav /></Show>
    </ClerkLoaded>
  );
}

// ── Page router ────────────────────────────────────────────────────────────────
function Pages() {
  return (
    <Switch>
      <Route path="/"        component={() => <Protected><Home /></Protected>} />
      {/* /portal is the customer-facing DESKTOP trading dashboard. Cross-app
          links from dashboard.aicandlez.com and landing CTAs target this
          path. Desktop viewports get the institutional terminal; mobile
          viewports fall back to the radar Home (PWA shell) since the
          desktop multi-panel layout does not fit narrow screens. */}
      <Route path="/portal"  component={() => <Protected><PortalResponsive /></Protected>} />
      <Route path="/trade"   component={() => <Protected><AISignals /></Protected>} />
      <Route path="/signals" component={() => <Protected><AISignals /></Protected>} />
      {/* Crypto + Equities both deep-link into the AISignals feed with the
          tab pre-selected. /markets is kept as an alias for backwards-compat. */}
      <Route path="/crypto"   component={() => <Protected><AISignals /></Protected>} />
      <Route path="/equities" component={() => <Protected><AISignals /></Protected>} />
      <Route path="/markets"  component={() => <Redirect to="/crypto" />} />
      <Route path="/asset/:type/:sym">
        {(params) => (
          <Protected>
            <AssetDetail key={`${params.type}:${params.sym}`} routeSym={params.sym} routeType={params.type} />
          </Protected>
        )}
      </Route>
      <Route path="/asset" component={() => <Protected><AssetDetail key="default" /></Protected>} />
      <Route path="/profile"  component={() => <Protected><Profile  /></Protected>} />
      <Route path="/subscribe"   component={() => <Protected><Subscribe /></Protected>} />
      {/* /upgrade and /pricing are common deep-link targets from push notifications,
          email CTAs, browser bookmarks, and the operator dashboard's cross-app
          links. Aliasing them to <Subscribe /> avoids the catch-all redirect to
          "/", which has caused black-screen reports when Home crashes during the
          transition. */}
      <Route path="/upgrade"     component={() => <Protected><Subscribe /></Protected>} />
      <Route path="/pricing"     component={() => <Protected><Subscribe /></Protected>} />
      <Route path="/consent"     component={() => <Protected><Consent /></Protected>} />
      <Route path="/exchanges"   component={() => <Redirect to="/settings/exchanges" />} />
      {/* Canonical exchange-onboarding deep link. Renders Profile, which
          auto-opens the broker-connection wizard on mount. Used by cross-app
          links from the operator dashboard and by upgrade-flow CTAs. */}
      <Route path="/settings/exchanges" component={() => <Protected><Profile /></Protected>} />
      <Route path="/settings"           component={() => <Redirect to="/profile" />} />
      <Route path="/billing"     component={() => <Protected><Billing /></Protected>} />
      <Route path="/legal/:type" component={() => <Protected><LegalPage /></Protected>} />
      <Route path="/sign-in/*?" component={() => (
        <AuthPage>
          <SignIn routing="path" path={`${basePath}/sign-in`}
            signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={`${basePath}/`} />
        </AuthPage>
      )} />
      <Route path="/sign-up/*?" component={() => (
        <AuthPage>
          <SignUp routing="path" path={`${basePath}/sign-up`}
            signInUrl={`${basePath}/sign-in`} fallbackRedirectUrl={`${basePath}/`} />
        </AuthPage>
      )} />
      <Route path="/portfolio" component={() => <Redirect to="/trade"   />} />
      <Route path="/live"      component={() => <Redirect to="/trade"   />} />
      <Route path="/account"   component={() => <Redirect to="/profile" />} />
      <Route component={() => <Redirect to="/" />} />
    </Switch>
  );
}

// ── Service worker + push registration (renders nothing) ──────────────────────
// Diagnostic escape hatch: append `?nosw=1` to the URL to skip SW registration
// entirely. Use this when triaging a suspected SW-caching or activation-race
// issue without needing a redeploy.
const SW_DISABLED = (() => {
  try {
    if (new URLSearchParams(window.location.search).get("nosw") === "1") return true;
    if (window.localStorage.getItem("aicandlez_disable_sw") === "1") return true;
  } catch { /* no-op */ }
  return false;
})();

function SwRegistrar() {
  if (SW_DISABLED) {
    // Best-effort kill the previously installed SW if user opted out via ?nosw=1.
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => { void r.unregister(); });
        if (regs.length) console.warn("[SwRegistrar] unregistered", regs.length, "SW(s) via ?nosw=1");
      }).catch(() => {});
    }
    return null;
  }
  usePushNotifications();
  return null;
}

// ── Mobile shell ───────────────────────────────────────────────────────────────
function Shell() {
  return (
    <UserProfileProvider>
    <AIAutoTradeProvider>
    <BrokerConnectionProvider>
      <SubscriptionProvider>
        <div style={{ display: "flex", flexDirection: "column", height: "100dvh",
          maxWidth: 480, margin: "0 auto", background: "#000000", overflow: "hidden" }}>
          <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden",
            paddingTop: "env(safe-area-inset-top, 0px)" }}>
            <Pages />
          </div>
          <Nav />
        </div>
        <SubscriptionModal />
        <TradingAccountOnboardingModal />
        <AlpacaAutoTrader />
        <SwRegistrar />
      </SubscriptionProvider>
    </BrokerConnectionProvider>
    </AIAutoTradeProvider>
    </UserProfileProvider>
  );
}

// ── Clerk provider ─────────────────────────────────────────────────────────────
// CRITICAL: `appearance`, `localization`, and the router callbacks MUST be
// stable references across renders. `ClerkProvider` from @clerk/react treats
// changes to these props as configuration updates and re-initializes the
// Clerk SDK — which fires the auth listener synchronously, which can trigger
// navigation, which re-renders this component, which creates fresh prop refs,
// which... loops forever. Symptom: tab flicker, both routes broken, no
// console errors, [AICandlez] React mounted logs only once (App root is
// stable but everything under ClerkProvider remounts continuously).
// Fix: hoist all static config to module scope, useCallback the router fns.
const CLERK_APPEARANCE = {
  cssLayerName: "clerk" as const,
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl:   basePath || "/",
    logoImageUrl:  (typeof window !== "undefined")
      ? `${window.location.origin}${basePath}/aicandlez-logo.png`
      : `${basePath}/aicandlez-logo.png`,
  },
  variables: {
          colorPrimary:          "#66FF66",
          colorForeground:       "#EAFFEA",
          colorMutedForeground:  "#4a8a60",
          colorDanger:           "#ff4060",
          colorSuccess:          "#66FF66",
          colorBackground:       "#050A07",
          colorInput:            "#0A1410",
          colorInputForeground:  "#EAFFEA",
          colorNeutral:          "#0F1F18",
          fontFamily:            "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
          borderRadius:          "0.6rem",
        },
  elements: {
    rootBox:                       "w-full flex justify-center",
    cardBox:                       "bg-[#050A07] border border-[#0F1F18] rounded-2xl w-[420px] max-w-full overflow-hidden shadow-[0_0_60px_rgba(102,255,102,0.08)]",
    card:                          "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer:                        "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle:                   "text-[#EAFFEA] font-semibold tracking-tight",
    headerSubtitle:                "text-[#7ab895] text-xs",
    socialButtonsBlockButtonText:  "text-[#EAFFEA] text-xs font-medium",
    formFieldLabel:                "text-[#7ab895] text-xs font-medium",
    footerActionLink:              "text-[#66FF66] text-xs hover:text-[#7CFF00] font-semibold",
    footerActionText:              "text-[#4a8a60] text-xs",
    dividerText:                   "text-[#3a6a50] text-xs",
    identityPreviewEditButton:     "text-[#66FF66] text-xs",
    formFieldSuccessText:          "text-[#66FF66] text-xs",
    alertText:                     "text-[#EAFFEA] text-xs",
    logoBox:                       "flex justify-center py-3",
    logoImage:                     "h-8",
    socialButtonsBlockButton:      "border-[#0F1F18] bg-[#0A1410] hover:bg-[#0F1F18] hover:border-[#1a3a25]",
    formButtonPrimary:             "bg-[#66FF66] hover:bg-[#7CFF00] text-black text-xs font-bold tracking-wide shadow-[0_0_24px_rgba(102,255,102,0.35)]",
    formFieldInput:                "bg-[#0A1410] border-[#0F1F18] text-[#EAFFEA] text-xs focus:border-[#66FF66]",
    footerAction:                  "bg-[#0A1410] border-t border-[#0F1F18]",
    dividerLine:                   "bg-[#0F1F18]",
    alert:                         "bg-[#0A1410] border border-[#0F1F18]",
    otpCodeFieldInput:             "bg-[#0A1410] border-[#0F1F18] text-[#EAFFEA]",
    formFieldRow:                  "gap-3",
    main:                          "bg-[#050A07]",
  },
} as const;

const CLERK_LOCALIZATION = {
  signIn: { start: {
    title:    "Welcome to AICandlez",
    subtitle: "Sign in to your institutional AI trading account",
  } },
  signUp: { start: {
    title:    "Join AICandlez",
    subtitle: "Institutional-grade AI crypto trading",
  } },
} as const;

const SIGN_IN_URL  = `${basePath}/sign-in`;
const SIGN_UP_URL  = `${basePath}/sign-up`;
const AFTER_SIGNOUT_URL = `${basePath}/sign-in`;

function ClerkWithProviders() {
  const [, setLocation] = useLocation();

  // Stable router callbacks — without useCallback these get a fresh identity
  // on every render and trigger a Clerk SDK re-init loop. See block comment
  // above for the full diagnosis.
  const routerPush    = useCallback((to: string) => setLocation(stripBase(to)),                       [setLocation]);
  const routerReplace = useCallback((to: string) => setLocation(stripBase(to), { replace: true }),    [setLocation]);

  // Trip-counter — if Clerk re-instantiates this provider more than 10 times
  // in 5s we know an unstable-prop loop is still happening somewhere.
  const renderRef    = useRef(0);
  const renderStart  = useRef(Date.now());
  renderRef.current += 1;
  if (renderRef.current % 10 === 0) {
    const elapsed = Date.now() - renderStart.current;
    console.warn("[ClerkWithProviders] render", renderRef.current, "in", elapsed, "ms");
    if (renderRef.current > 30 && elapsed < 5000) {
      console.error("[ClerkWithProviders] re-render storm — ClerkProvider unstable prop suspected");
    }
  }

  return (
    <ClerkProvider
      publishableKey={clerkPubKey!}
      proxyUrl={clerkProxyUrl}
      appearance={CLERK_APPEARANCE}
      localization={CLERK_LOCALIZATION}
      signInUrl={SIGN_IN_URL}
      signUpUrl={SIGN_UP_URL}
      afterSignOutUrl={AFTER_SIGNOUT_URL}
      routerPush={routerPush}
      routerReplace={routerReplace}
    >
      <QueryClientProvider client={queryClient}>
        <CacheInvalidator />
        <RouteTracer />
        <Shell />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

// ── Route transition tracer ──────────────────────────────────────────────────
// Logs every URL change once. If you see this fire 100s of times in seconds,
// you have a redirect loop (e.g. <Redirect> ping-pong between two routes).
function RouteTracer() {
  const [loc] = useLocation();
  const prev  = useRef<string | null>(null);
  const count = useRef(0);
  const start = useRef(Date.now());
  useEffect(() => {
    if (prev.current === loc) return;
    count.current += 1;
    const elapsed = Date.now() - start.current;
    console.log("[RouteTracer]", prev.current, "→", loc, `(transition #${count.current}, +${elapsed}ms)`);
    prev.current = loc;
    if (count.current > 20 && elapsed < 5000) {
      console.error("[RouteTracer] redirect-loop suspected", { transitions: count.current, elapsedMs: elapsed });
    }
  }, [loc]);
  return null;
}

// Silence "useMemo unused" warning on environments where it isn't tree-shaken.
void useMemo;

// ── Root ───────────────────────────────────────────────────────────────────────
export default function App() {
  // Lightweight diagnostic — confirms the React tree mounted at all. If a user
  // reports "blank screen" and this line never appears in console, the bundle
  // didn't execute (chunk 404, SW serving deleted asset, CSP block, etc.).
  useEffect(() => {
    console.log("[AICandlez] React mounted", {
      origin:       window.location.origin,
      path:         window.location.pathname,
      apiBaseUrl:   import.meta.env["VITE_API_BASE_URL"] ?? "(unset — using same-origin)",
      clerkPubKey:  clerkPubKey ? `${clerkPubKey.slice(0, 12)}…` : "(missing)",
    });
  }, []);

  if (!clerkPubKey) return <MissingKeyError />;
  return (
    <CrashBoundary>
      <RenderLoopGuard />
      <WouterRouter base={basePath}>
        <ClerkWithProviders />
      </WouterRouter>
    </CrashBoundary>
  );
}
