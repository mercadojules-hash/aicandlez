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
import Trade     from "@/pages/Trade";
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
// Empty in dev (Clerk loads from CNAME or CDN directly), auto-set in prod.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL as string | undefined;
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
        animation: "apex-spin 0.7s linear infinite" }} />
      <style>{`@keyframes apex-spin { to { transform: rotate(360deg); } }`}</style>
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
      <Route path="/trade"   component={() => <Protected><Trade /></Protected>} />
      <Route path="/markets"  component={() => <Protected><Markets  /></Protected>} />
      <Route path="/equities" component={() => <Protected><Equities /></Protected>} />
      <Route path="/asset"    component={() => <Protected><AssetDetail /></Protected>} />
      <Route path="/profile"  component={() => <Protected><Profile  /></Protected>} />
      <Route path="/subscribe"   component={() => <Protected><Subscribe /></Protected>} />
      <Route path="/consent"     component={() => <Protected><Consent /></Protected>} />
      <Route path="/exchanges"   component={() => <Redirect to="/profile" />} />
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
      <Route path="/signals"   component={() => <Redirect to="/markets" />} />
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
        logoImageUrl: `${window.location.origin}${basePath}/aicandlez-logo.png`,
        variables: {
          colorBackground:      "#0d151e",
          colorInputBackground: "#060e18",
          colorInputText:       "#e8f4ff",
          colorText:            "#e8f4ff",
          colorTextSecondary:   "#3a4060",
          colorPrimary:         "#00e5ff",
          colorDanger:          "#ff3355",
          colorSuccess:         "#00ff88",
          borderRadius:         "10px",
          fontFamily:           "Inter, -apple-system, sans-serif",
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
