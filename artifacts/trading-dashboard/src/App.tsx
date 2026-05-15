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
import { dark } from "@clerk/themes";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout, MODULE_LIST } from "@/components/Layout";
import { AlertsProvider } from "@/components/AlertsProvider";
import { SettingsDrawer } from "@/components/SettingsDrawer";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import MarketData from "@/pages/MarketData";
import Indicators from "@/pages/Indicators";
import AIReasoning from "@/pages/AIReasoning";
import RiskManagement from "@/pages/RiskManagement";
import Simulation from "@/pages/Simulation";
import Backtest from "@/pages/Backtest";
import StrategyOptimizer from "@/pages/StrategyOptimizer";
import AssetScanner from "@/pages/AssetScanner";
import Portfolio from "@/pages/Portfolio";
import Correlation from "@/pages/Correlation";
import Journal from "@/pages/Journal";
import Validation from "@/pages/Validation";
import Sentiment from "@/pages/Sentiment";
import Exchange from "@/pages/Exchange";
import ComingSoon from "@/pages/ComingSoon";
import SystemVerification from "@/pages/SystemVerification";
import SignalDebug from "@/pages/SignalDebug";
import MultiChart from "@/pages/MultiChart";
import CommandCenter from "@/pages/CommandCenter";
import Settings from "@/pages/Settings";
import Billing from "@/pages/Billing";
import Admin from "@/pages/Admin";
import Account from "@/pages/Account";
import Leaderboard from "@/pages/Leaderboard";
import AlertsPage from "@/pages/Alerts";
import { ConsentGate } from "@/components/ConsentGate";

// ── Env ───────────────────────────────────────────────────────────────────────

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL as string | undefined;
const basePath = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

// ── Loading spinner ────────────────────────────────────────────────────────────
// Shown while Clerk is initialising — prevents the blank-body symptom that
// occurs when ClerkLoading renders and both SignedIn + SignedOut return null.

function FullPageLoader() {
  return (
    <div style={{
      position: "fixed", inset: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "#000508",
    }}>
      <div style={{
        width: 28, height: 28,
        border: "2px solid #0D2035",
        borderTopColor: "#00aaff",
        borderRadius: "50%",
        animation: "apex-spin 0.7s linear infinite",
      }} />
      {/* Inline keyframes — no external CSS dependency */}
      <style>{`@keyframes apex-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Missing key gate ──────────────────────────────────────────────────────────
// If VITE_CLERK_PUBLISHABLE_KEY is absent, ClerkProvider throws immediately and
// React silently unmounts the tree.  Surface a clear error instead.

function MissingKeyError() {
  return (
    <div style={{
      position: "fixed", inset: 0,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "#000508", gap: 12,
      fontFamily: "ui-monospace, SFMono-Regular, monospace",
    }}>
      <div style={{ fontSize: 11, color: "#4a6a80", letterSpacing: "0.2em" }}>APEX TRADER</div>
      <div style={{ fontSize: 13, color: "#ff8844", fontWeight: "bold" }}>CONFIGURATION REQUIRED</div>
      <div style={{
        fontSize: 11, color: "#7a9eb8", maxWidth: 420, textAlign: "center", lineHeight: 1.6,
        background: "#040A14", border: "1px solid #0D2035", borderRadius: 4, padding: "12px 16px",
      }}>
        <code>VITE_CLERK_PUBLISHABLE_KEY</code> is not set.
        <br />Add it to your environment variables and restart the dev server.
      </div>
    </div>
  );
}

// ── Clerk appearance ──────────────────────────────────────────────────────────

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  theme: dark,
  cssLayerName: "clerk",
  options: {
    logoPlacement:  "inside" as const,
    logoLinkUrl:    basePath || "/",
    logoImageUrl:   `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary:          "#00aaff",
    colorForeground:       "#EAF2FF",
    colorMutedForeground:  "#4a6a80",
    colorDanger:           "#ff4455",
    colorBackground:       "#050D1A",
    colorInput:            "#0A1625",
    colorInputForeground:  "#EAF2FF",
    colorNeutral:          "#0D2035",
    fontFamily:            "monospace, ui-monospace, SFMono-Regular",
    borderRadius:          "0.4rem",
  },
  elements: {
    rootBox:                       "w-full flex justify-center",
    cardBox:                       "bg-[#050D1A] border border-[#0D2035] rounded-lg w-[440px] max-w-full overflow-hidden shadow-[0_0_40px_#00aaff08]",
    card:                          "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer:                        "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle:                   "text-[#EAF2FF] font-mono tracking-wide",
    headerSubtitle:                "text-[#4a6a80] font-mono text-xs",
    socialButtonsBlockButtonText:  "text-[#7a9eb8] font-mono text-xs",
    formFieldLabel:                "text-[#7a9eb8] font-mono text-xs",
    footerActionLink:              "text-[#00aaff] font-mono text-xs hover:text-[#33bbff]",
    footerActionText:              "text-[#4a6a80] font-mono text-xs",
    dividerText:                   "text-[#3a5a70] font-mono text-xs",
    identityPreviewEditButton:     "text-[#00aaff] font-mono text-xs",
    formFieldSuccessText:          "text-[#00ff8a] font-mono text-xs",
    alertText:                     "text-[#EAF2FF] font-mono text-xs",
    logoBox:                       "flex justify-center py-3",
    logoImage:                     "h-8",
    socialButtonsBlockButton:      "border-[#0D2035] bg-[#040A14] hover:bg-[#0A1625]",
    formButtonPrimary:             "bg-[#00aaff] hover:bg-[#0088cc] text-white font-mono text-xs font-bold tracking-wide",
    formFieldInput:                "bg-[#0A1625] border-[#0D2035] text-[#EAF2FF] font-mono text-xs",
    footerAction:                  "bg-[#040A14] border-t border-[#0D2035]",
    dividerLine:                   "bg-[#0D2035]",
    alert:                         "bg-[#040A14] border border-[#0D2035]",
    otpCodeFieldInput:             "bg-[#0A1625] border-[#0D2035] text-[#EAF2FF] font-mono",
    formFieldRow:                  "gap-3",
    main:                          "bg-[#050D1A]",
  },
};

// ── React Query ───────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: false },
  },
});

const PENDING_PATHS = MODULE_LIST.filter((m) => m.status === "pending").map((m) => m.path);

// ── Auth pages ────────────────────────────────────────────────────────────────

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4" style={{ background: "#060810" }}>
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        fallbackRedirectUrl={`${basePath}/command`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4" style={{ background: "#060810" }}>
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        fallbackRedirectUrl={`${basePath}/command`}
      />
    </div>
  );
}

// ── Route guards ──────────────────────────────────────────────────────────────
// ClerkLoading renders a spinner — eliminates the blank-body gap that occurs
// while Clerk's session state is undetermined (neither signed-in nor signed-out).
// ClerkLoaded then renders the correct branch based on resolved auth state.

function HomeRoute() {
  return (
    <>
      <ClerkLoading><FullPageLoader /></ClerkLoading>
      <ClerkLoaded>
        <Show when="signed-in"><Redirect to="/command" /></Show>
        <Show when="signed-out"><Landing /></Show>
      </ClerkLoaded>
    </>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ClerkLoading><FullPageLoader /></ClerkLoading>
      <ClerkLoaded>
        <Show when="signed-in">
          <ConsentGate>
            <Layout>{children}</Layout>
          </ConsentGate>
        </Show>
        <Show when="signed-out"><Redirect to="/sign-in" /></Show>
      </ClerkLoaded>
    </>
  );
}

// ── Cache invalidation on user switch ────────────────────────────────────────

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

// ── Router ────────────────────────────────────────────────────────────────────

function Router() {
  return (
    <Switch>
      <Route path="/"             component={HomeRoute} />
      <Route path="/sign-in/*?"   component={SignInPage} />
      <Route path="/sign-up/*?"   component={SignUpPage} />
      <Route path="/market">
        <Protected><MarketData /></Protected>
      </Route>
      <Route path="/indicators">
        <Protected><Indicators /></Protected>
      </Route>
      <Route path="/ai">
        <Protected><AIReasoning /></Protected>
      </Route>
      <Route path="/risk">
        <Protected><RiskManagement /></Protected>
      </Route>
      <Route path="/simulation">
        <Protected><Simulation /></Protected>
      </Route>
      <Route path="/backtest">
        <Protected><Backtest /></Protected>
      </Route>
      <Route path="/optimizer">
        <Protected><StrategyOptimizer /></Protected>
      </Route>
      <Route path="/scanner">
        <Protected><AssetScanner /></Protected>
      </Route>
      <Route path="/portfolio">
        <Protected><Portfolio /></Protected>
      </Route>
      <Route path="/correlation">
        <Protected><Correlation /></Protected>
      </Route>
      <Route path="/journal">
        <Protected><Journal /></Protected>
      </Route>
      <Route path="/validation">
        <Protected><Validation /></Protected>
      </Route>
      <Route path="/sentiment">
        <Protected><Sentiment /></Protected>
      </Route>
      <Route path="/exchange">
        <Protected><Exchange /></Protected>
      </Route>
      <Route path="/syscheck">
        <Protected><SystemVerification /></Protected>
      </Route>
      <Route path="/debug">
        <Protected><SignalDebug /></Protected>
      </Route>
      <Route path="/charts">
        <Protected><MultiChart /></Protected>
      </Route>
      <Route path="/command">
        <Protected><CommandCenter /></Protected>
      </Route>
      <Route path="/dashboard">
        <Protected><Dashboard /></Protected>
      </Route>
      <Route path="/settings">
        <Protected><Settings /></Protected>
      </Route>
      <Route path="/billing">
        <Protected><Billing /></Protected>
      </Route>
      <Route path="/admin">
        <Protected><Admin /></Protected>
      </Route>
      <Route path="/account">
        <Protected><Account /></Protected>
      </Route>
      <Route path="/leaderboard">
        <Protected><Leaderboard /></Protected>
      </Route>
      <Route path="/alerts">
        <Protected><AlertsPage /></Protected>
      </Route>
      {PENDING_PATHS.map((path) => (
        <Route key={path} path={path}>
          <Protected><ComingSoon path={path} /></Protected>
        </Route>
      ))}
    </Switch>
  );
}

// ── Clerk + providers ─────────────────────────────────────────────────────────

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey!}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      afterSignOutUrl={basePath || "/"}
      localization={{
        signIn: {
          start: {
            title:    "Welcome back",
            subtitle: "Sign in to access Apex Trader",
          },
        },
        signUp: {
          start: {
            title:    "Create account",
            subtitle: "Institutional-grade crypto trading platform",
          },
        },
      }}
      routerPush={(to)    => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <AlertsProvider>
            <Router />
            <SettingsDrawer />
            <Toaster />
          </AlertsProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function App() {
  // Hard gate: if the publishable key is missing, surface an actionable error
  // instead of letting ClerkProvider throw and silently unmount the tree.
  if (!clerkPubKey) return <MissingKeyError />;

  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}
