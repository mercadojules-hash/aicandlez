import { useEffect, useRef } from "react";
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

// ── Env ────────────────────────────────────────────────────────────────────────
const clerkPubKey   = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
// Only use the proxy URL with live keys (pk_live_*). Test keys (pk_test_*)
// talk directly to Clerk's shared FAPI — no proxy needed or wanted.
const clerkProxyUrl = clerkPubKey?.startsWith("pk_live_")
  ? (import.meta.env.VITE_CLERK_PROXY_URL as string | undefined)
  : undefined;
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

function FullPageLoader() {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", background: "#000000", gap: 20 }}>
      <div style={{ fontSize: 9, fontFamily: SANS, fontWeight: 600,
        color: "rgba(136,146,164,0.35)", letterSpacing: "0.3em" }}>AICANDLEZ</div>
      <div style={{ width: 22, height: 22,
        border: "1.5px solid rgba(255,255,255,0.07)",
        borderTopColor: "rgba(0,229,255,0.70)",
        borderRadius: "50%",
        animation: "ac-spin 0.7s linear infinite" }} />
      <style>{`@keyframes ac-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
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

// ── Cache invalidation ─────────────────────────────────────────────────────────
function CacheInvalidator() {
  const { addListener } = useClerk();
  const qc              = useQueryClient();
  const prev            = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsub = addListener(({ user }) => {
      const uid = user?.id ?? null;
      if (prev.current !== undefined && prev.current !== uid) qc.clear();
      prev.current = uid;
    });
    return unsub;
  }, [addListener, qc]);

  return null;
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
      {/* /portal is the canonical signed-in landing for regular users.
          Cross-app links from dashboard.aicandlez.com and landing CTAs
          target this path. Renders the Home (radar) surface. */}
      <Route path="/portal"  component={() => <Protected><Home /></Protected>} />
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
function SwRegistrar() {
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
function ClerkWithProviders() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey!}
      proxyUrl={clerkProxyUrl}
      appearance={{
        cssLayerName: "clerk",
        options: {
          logoPlacement: "inside" as const,
          logoLinkUrl:   basePath || "/",
          logoImageUrl:  `${window.location.origin}${basePath}/aicandlez-logo.png`,
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
      }}
      localization={{
        signIn: {
          start: {
            title:    "Welcome to AICandlez",
            subtitle: "Sign in to your institutional AI trading account",
          },
        },
        signUp: {
          start: {
            title:    "Join AICandlez",
            subtitle: "Institutional-grade AI crypto trading",
          },
        },
      }}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      afterSignOutUrl={`${basePath}/sign-in`}
      routerPush={(to)    => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <CacheInvalidator />
        <Shell />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────
export default function App() {
  if (!clerkPubKey) return <MissingKeyError />;
  return (
    <WouterRouter base={basePath}>
      <ClerkWithProviders />
    </WouterRouter>
  );
}
