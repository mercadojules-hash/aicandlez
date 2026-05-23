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
import { OnboardingFlow } from "@/components/OnboardingFlow";
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
import DesktopTerminal from "@/pages/DesktopTerminal";
import InstitutionalTerminal from "@/pages/InstitutionalTerminal";
import Portal from "@/pages/Portal";
import { useUserRole } from "@/hooks/useUserRole";

// ── Env ───────────────────────────────────────────────────────────────────────

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
// [CLERK-DIAG] temporary boot diagnostic — remove after Kraken live-order test
// Prints prefix + length only, NEVER the full key, so it's safe in browser console.
if (typeof window !== "undefined") {
  // eslint-disable-next-line no-console
  console.log(
    "[CLERK-DIAG] VITE_CLERK_PUBLISHABLE_KEY prefix=%s len=%d",
    clerkPubKey ? clerkPubKey.slice(0, 8) : "<undefined>",
    clerkPubKey?.length ?? 0,
  );
}
// Clerk FAPI proxy disabled — proxy/satellite domains require a paid Clerk plan.
// Talk directly to Clerk's shared frontend API for both dev and prod.
const clerkProxyUrl: string | undefined = undefined;
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
        border: "2px solid #0F1F18",
        borderTopColor: "#66FF66",
        borderRadius: "50%",
        animation: "ac-spin 0.7s linear infinite",
      }} />
      {/* Inline keyframes — no external CSS dependency */}
      <style>{`@keyframes ac-spin { to { transform: rotate(360deg); } }`}</style>
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
      <div style={{ fontSize: 11, color: "#4a6a80", letterSpacing: "0.2em" }}>AICANDLEZ</div>
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
    logoImageUrl:   `${window.location.origin}${basePath}/aicandlez-logo.png`,
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
    fontFamily:            "monospace, ui-monospace, SFMono-Regular",
    borderRadius:          "0.4rem",
  },
  elements: {
    rootBox:                       "w-full flex justify-center",
    cardBox:                       "bg-[#050A07] border border-[#0F1F18] rounded-lg w-[440px] max-w-full overflow-hidden shadow-[0_0_40px_rgba(102,255,102,0.08)]",
    card:                          "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer:                        "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle:                   "text-[#EAFFEA] font-mono tracking-wide",
    headerSubtitle:                "text-[#4a8a60] font-mono text-xs",
    socialButtonsBlockButtonText:  "text-[#7ab895] font-mono text-xs",
    formFieldLabel:                "text-[#7ab895] font-mono text-xs",
    footerActionLink:              "text-[#66FF66] font-mono text-xs hover:text-[#7CFF00]",
    footerActionText:              "text-[#4a8a60] font-mono text-xs",
    dividerText:                   "text-[#3a6a50] font-mono text-xs",
    identityPreviewEditButton:     "text-[#66FF66] font-mono text-xs",
    formFieldSuccessText:          "text-[#66FF66] font-mono text-xs",
    alertText:                     "text-[#EAFFEA] font-mono text-xs",
    logoBox:                       "flex justify-center py-3",
    logoImage:                     "h-8",
    socialButtonsBlockButton:      "border-[#0F1F18] bg-[#0A1410] hover:bg-[#0F1F18]",
    formButtonPrimary:             "bg-[#66FF66] hover:bg-[#7CFF00] text-black font-mono text-xs font-bold tracking-wide shadow-[0_0_24px_rgba(102,255,102,0.35)]",
    formFieldInput:                "bg-[#0A1410] border-[#0F1F18] text-[#EAFFEA] font-mono text-xs focus:border-[#66FF66]",
    footerAction:                  "bg-[#0A1410] border-t border-[#0F1F18]",
    dividerLine:                   "bg-[#0F1F18]",
    alert:                         "bg-[#0A1410] border border-[#0F1F18]",
    otpCodeFieldInput:             "bg-[#0A1410] border-[#0F1F18] text-[#EAFFEA] font-mono",
    formFieldRow:                  "gap-3",
    main:                          "bg-[#050A07]",
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
        // Land at root so HomeRoute → SignedInHomeRouter dispatches based on
        // role (admin → /command, customer → /portal). Sending everyone to
        // /command first caused a visible flash of admin chrome before
        // AdminOnly bounced non-admins to /portal. Task #162 Phase C.
        fallbackRedirectUrl={`${basePath}/`}
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
        // Root → HomeRoute role-dispatch. Same rationale as SignIn above.
        // Task #162 Phase C.
        fallbackRedirectUrl={`${basePath}/`}
      />
    </div>
  );
}

// ── Route guards ──────────────────────────────────────────────────────────────
// ClerkLoading renders a spinner — eliminates the blank-body gap that occurs
// while Clerk's session state is undetermined (neither signed-in nor signed-out).
// ClerkLoaded then renders the correct branch based on resolved auth state.

// ── Cross-app redirect helper ────────────────────────────────────────────────
// Architecture (Option A):
//   • dashboard.aicandlez.com → operator/admin console (this app)
//   • app.aicandlez.com       → user portal PWA (aicandlez-app)
// Non-admins signing in to the operator console are bounced to the user PWA
// where the portal experience (and exchange onboarding) actually lives.
function CrossAppRedirect({ to }: { to: string }) {
  useEffect(() => { window.location.replace(to); }, [to]);
  return <FullPageLoader />;
}

// Task #162 Phase C: per-host default landing.
//   trade.aicandlez.com       → VITE_DEFAULT_LANDING=/portal (customer)
//   admintrade.aicandlez.com  → VITE_DEFAULT_LANDING=/command (operator)
// Customers reaching the admintrade host get cross-host bounced to the
// customer-side portal — they must never see operator chrome.
const DEFAULT_LANDING = (() => {
  const raw = (import.meta.env["VITE_DEFAULT_LANDING"] as string | undefined)?.trim();
  if (raw && raw.startsWith("/")) return raw;
  return "/portal";
})();

const CUSTOMER_PORTAL_URL = (() => {
  const raw = (import.meta.env["VITE_CUSTOMER_PORTAL_URL"] as string | undefined)?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  return "https://trade.aicandlez.com/portal";
})();

const IS_ADMIN_HOST = DEFAULT_LANDING === "/command";

function SignedInHomeRouter() {
  const { isAdmin, loading } = useUserRole();
  if (loading) return <FullPageLoader />;
  // On the customer host (trade.*) admins also land on the default —
  // they can navigate to /command from chrome. On the admin host
  // (admintrade.*) non-admins must NOT remain — bounce cross-host to
  // the canonical customer portal.
  if (!isAdmin && IS_ADMIN_HOST) return <CrossAppRedirect to={CUSTOMER_PORTAL_URL} />;
  if (isAdmin && IS_ADMIN_HOST) return <Redirect to="/command" />;
  // Customer host: dispatch by role.
  if (!isAdmin) return <Redirect to={DEFAULT_LANDING} />;
  return <Redirect to="/command" />;
}

function HomeRoute() {
  return (
    <>
      <ClerkLoading><FullPageLoader /></ClerkLoading>
      <ClerkLoaded>
        <Show when="signed-in"><SignedInHomeRouter /></Show>
        <Show when="signed-out"><Landing /></Show>
      </ClerkLoaded>
    </>
  );
}

// Protected — true signed-in guard (no role check). Used for customer-facing
// routes on this host such as /portal (the customer institutional desktop
// workstation). Wraps children in <Layout> so chrome (header/sidebar)
// renders consistently. Do NOT compose AdminOnly here — that would make
// /portal admin-only and trap non-admin customers in a redirect loop
// (AdminOnly → /portal → Protected → AdminOnly → …).
function Protected({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ClerkLoading><FullPageLoader /></ClerkLoading>
      <ClerkLoaded>
        <Show when="signed-in"><Layout>{children}</Layout></Show>
        <Show when="signed-out"><Redirect to="/sign-in" /></Show>
      </ClerkLoaded>
    </>
  );
}

// AdminOnly — gates operator-grade pages (Command Center, Exchange, syscheck,
// debug, desktop, institutional, admin). Non-admin signed-in users are bounced
// to the LOCAL customer institutional workstation at /portal (rendered by
// Portal.tsx on this same host — no cross-app hop, no mobile shell).
function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useUserRole();
  if (loading) return <FullPageLoader />;
  if (!isAdmin) {
    // Task #162 Phase C: on the admin host, send non-admins cross-host to
    // the customer portal (they must never see operator chrome, even briefly).
    // On the customer host, a local /portal redirect is sufficient.
    if (IS_ADMIN_HOST) return <CrossAppRedirect to={CUSTOMER_PORTAL_URL} />;
    return <Redirect to="/portal" />;
  }
  return <Layout>{children}</Layout>;
}

function ProtectedAdmin({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ClerkLoading><FullPageLoader /></ClerkLoading>
      <ClerkLoaded>
        <Show when="signed-in"><AdminOnly>{children}</AdminOnly></Show>
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
        <ProtectedAdmin><Exchange /></ProtectedAdmin>
      </Route>
      <Route path="/syscheck">
        <ProtectedAdmin><SystemVerification /></ProtectedAdmin>
      </Route>
      <Route path="/debug">
        <ProtectedAdmin><SignalDebug /></ProtectedAdmin>
      </Route>
      <Route path="/charts">
        <Protected><MultiChart /></Protected>
      </Route>
      <Route path="/command">
        <ProtectedAdmin><CommandCenter /></ProtectedAdmin>
      </Route>
      <Route path="/portal">
        {/* Customer desktop institutional workstation. Signed-in (any role,
            including admin previewing) renders Portal.tsx — the real
            multi-panel trading terminal. NOT admin-only and NOT a redirect. */}
        <Protected><Portal /></Protected>
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
        <ProtectedAdmin><Admin /></ProtectedAdmin>
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
      <Route path="/desktop">
        <ProtectedAdmin><DesktopTerminal /></ProtectedAdmin>
      </Route>
      <Route path="/institutional">
        <ProtectedAdmin><InstitutionalTerminal /></ProtectedAdmin>
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
            subtitle: "Sign in to access AICandlez",
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
            <OnboardingFlow />
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
