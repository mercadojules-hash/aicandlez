import { useEffect, useRef } from "react";
import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import {
  ClerkProvider,
  SignIn,
  SignUp,
  Show,
  ClerkLoading,
  ClerkLoaded,
  useClerk,
} from "@clerk/react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "@/components/BottomNav";
import Home       from "@/pages/Home";
import Signals    from "@/pages/Signals";
import Portfolio  from "@/pages/Portfolio";
import Live       from "@/pages/Live";
import Account    from "@/pages/Account";
import Subscribe  from "@/pages/Subscribe";
import Consent    from "@/pages/Consent";
import Exchanges  from "@/pages/Exchanges";

// ── Env ────────────────────────────────────────────────────────────────────────
const clerkPubKey  = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL     as string | undefined;
const basePath     = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

function stripBase(path: string) {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

// ── React Query ────────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 15_000 } },
});

// ── Loading spinner ────────────────────────────────────────────────────────────
function FullPageLoader() {
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex",
      alignItems: "center", justifyContent: "center", background: "#030810" }}>
      <div style={{ width: 24, height: 24, border: "2px solid #0d2035",
        borderTopColor: "#00aaff", borderRadius: "50%",
        animation: "apex-spin 0.7s linear infinite" }} />
      <style>{`@keyframes apex-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function MissingKeyError() {
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", background: "#030810", gap: 12,
      fontFamily: "monospace" }}>
      <div style={{ fontSize: 9, color: "#2a4060", letterSpacing: "0.2em" }}>APEX TRADER</div>
      <div style={{ fontSize: 13, color: "#ff4466", fontWeight: "bold" }}>CONFIGURATION REQUIRED</div>
      <div style={{ fontSize: 10, color: "#3a6080", padding: "10px 16px",
        background: "#050d18", border: "1px solid #0d2035", borderRadius: 6, lineHeight: 1.6 }}>
        VITE_CLERK_PUBLISHABLE_KEY is not set.
      </div>
    </div>
  );
}

// ── Auth pages ─────────────────────────────────────────────────────────────────
function SignInPage() {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center",
      minHeight: "100dvh", padding: "24px 16px", background: "#030810" }}>
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        fallbackRedirectUrl={`${basePath}/`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center",
      minHeight: "100dvh", padding: "24px 16px", background: "#030810" }}>
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        fallbackRedirectUrl={`${basePath}/`}
      />
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

// ── Cache invalidation on user switch ─────────────────────────────────────────
function CacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsub = addListener(({ user }) => {
      const uid = user?.id ?? null;
      if (prevRef.current !== undefined && prevRef.current !== uid) qc.clear();
      prevRef.current = uid;
    });
    return unsub;
  }, [addListener, qc]);

  return null;
}

// ── Bottom nav — only when signed in ──────────────────────────────────────────
function MobileNav() {
  return (
    <>
      <ClerkLoaded>
        <Show when="signed-in"><BottomNav /></Show>
      </ClerkLoaded>
    </>
  );
}

// ── Main shell ─────────────────────────────────────────────────────────────────
function Shell() {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh",
      background: "#030810", maxWidth: 480, margin: "0 auto", position: "relative" }}>
      <div style={{ flex: 1, overflowY: "auto",
        paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <Switch>
          <Route path="/"           component={() => <Protected><Home /></Protected>} />
          <Route path="/signals"    component={() => <Protected><Signals /></Protected>} />
          <Route path="/portfolio"  component={() => <Protected><Portfolio /></Protected>} />
          <Route path="/live"       component={() => <Protected><Live /></Protected>} />
          <Route path="/account"    component={() => <Protected><Account /></Protected>} />
          <Route path="/subscribe"  component={() => <Protected><Subscribe /></Protected>} />
          <Route path="/consent"    component={() => <Protected><Consent /></Protected>} />
          <Route path="/exchanges"  component={() => <Protected><Exchanges /></Protected>} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route component={() => (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", height: "60vh", fontFamily: "monospace",
              fontSize: 11, color: "#2a4060" }}>
              PAGE NOT FOUND
            </div>
          )} />
        </Switch>
      </div>
      <MobileNav />
    </div>
  );
}

// ── Clerk-wrapped providers ────────────────────────────────────────────────────
function ClerkWithProviders() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey!}
      proxyUrl={clerkProxyUrl}
      appearance={{
        variables: {
          colorBackground:       "#050d18",
          colorInputBackground:  "#030810",
          colorInputText:        "#e8f4ff",
          colorText:             "#e8f4ff",
          colorTextSecondary:    "#3a6080",
          colorPrimary:          "#00aaff",
          colorDanger:           "#ff4466",
          colorSuccess:          "#00ff8a",
          borderRadius:          "8px",
          fontFamily:            "monospace",
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
