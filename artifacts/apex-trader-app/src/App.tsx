import { useEffect, useRef } from "react";
import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import {
  ClerkProvider, SignIn, SignUp, Show, ClerkLoading, ClerkLoaded, useClerk,
} from "@clerk/react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "@/components/BottomNav";
import Home      from "@/pages/Home";
import Trade     from "@/pages/Trade";
import Markets   from "@/pages/Markets";
import Profile   from "@/pages/Profile";
import Subscribe from "@/pages/Subscribe";
import Consent   from "@/pages/Consent";
import Exchanges from "@/pages/Exchanges";

// ── Env ────────────────────────────────────────────────────────────────────────
const clerkPubKey   = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL       as string | undefined;
const basePath      = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

function stripBase(p: string) {
  return basePath && p.startsWith(basePath) ? p.slice(basePath.length) || "/" : p;
}

// ── React Query ────────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 15_000 } },
});

// ── Loading / Error states ─────────────────────────────────────────────────────
function FullPageLoader() {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", background: "#080810", gap: 20 }}>
      <div style={{ fontSize: 9, fontFamily: "monospace", color: "#2a3050",
        letterSpacing: "0.3em" }}>APEX TRADER</div>
      <div style={{ width: 24, height: 24, border: "2px solid #1a1d2e",
        borderTopColor: "#00e5ff", borderRadius: "50%",
        animation: "apex-spin 0.7s linear infinite" }} />
      <style>{`@keyframes apex-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function MissingKeyError() {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", background: "#080810",
      gap: 12, fontFamily: "monospace" }}>
      <div style={{ fontSize: 9, color: "#2a3050", letterSpacing: "0.2em" }}>APEX TRADER</div>
      <div style={{ fontSize: 13, color: "#ff3355", fontWeight: "bold" }}>CONFIGURATION REQUIRED</div>
      <div style={{ fontSize: 10, color: "#3a4060", padding: "10px 16px",
        background: "#0d0e1a", border: "1px solid #1c1f32", borderRadius: 6, lineHeight: 1.6 }}>
        VITE_CLERK_PUBLISHABLE_KEY is not set.
      </div>
    </div>
  );
}

// ── Auth pages ─────────────────────────────────────────────────────────────────
function AuthPage({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center",
      minHeight: "100%", padding: "24px 16px", background: "#080810" }}>
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

// ── Nav (only when signed in, not on auth pages) ───────────────────────────────
function Nav() {
  const [loc] = useLocation();
  if (loc.startsWith("/sign-")) return null;
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
      {/* Primary tabs */}
      <Route path="/"        component={() => <Protected><Home /></Protected>} />
      <Route path="/trade"   component={() => <Protected><Trade /></Protected>} />
      <Route path="/markets" component={() => <Protected><Markets /></Protected>} />
      <Route path="/profile" component={() => <Protected><Profile /></Protected>} />
      {/* Sub-pages */}
      <Route path="/subscribe"  component={() => <Protected><Subscribe /></Protected>} />
      <Route path="/consent"    component={() => <Protected><Consent /></Protected>} />
      <Route path="/exchanges"  component={() => <Protected><Exchanges /></Protected>} />
      {/* Auth */}
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
      {/* Legacy redirects */}
      <Route path="/signals"   component={() => <Redirect to="/markets" />} />
      <Route path="/portfolio" component={() => <Redirect to="/trade"   />} />
      <Route path="/live"      component={() => <Redirect to="/trade"   />} />
      <Route path="/account"   component={() => <Redirect to="/profile" />} />
      {/* 404 */}
      <Route component={() => <Redirect to="/" />} />
    </Switch>
  );
}

// ── Mobile shell (480px, full height) ─────────────────────────────────────────
function Shell() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh",
      maxWidth: 480, margin: "0 auto", background: "#080810", overflow: "hidden" }}>
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden",
        paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <Pages />
      </div>
      <Nav />
    </div>
  );
}

// ── Clerk provider ────────────────────────────────────────────────────────────
function ClerkWithProviders() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey!}
      proxyUrl={clerkProxyUrl}
      appearance={{
        variables: {
          colorBackground:      "#0d0e1a",
          colorInputBackground: "#080810",
          colorInputText:       "#e8f4ff",
          colorText:            "#e8f4ff",
          colorTextSecondary:   "#3a4060",
          colorPrimary:         "#00e5ff",
          colorDanger:          "#ff3355",
          colorSuccess:         "#00ff88",
          borderRadius:         "10px",
          fontFamily:           "monospace",
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
