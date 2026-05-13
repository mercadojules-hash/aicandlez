import { useEffect, useRef } from "react";
import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
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

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

// In dev this is empty; in production it is set automatically
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL as string | undefined;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Clerk passes full paths — strip the base so wouter's setLocation doesn't double-prefix it
function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  theme: dark,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#00aaff",
    colorForeground: "#EAF2FF",
    colorMutedForeground: "#4a6a80",
    colorDanger: "#ff4455",
    colorBackground: "#050D1A",
    colorInput: "#0A1625",
    colorInputForeground: "#EAF2FF",
    colorNeutral: "#0D2035",
    fontFamily: "monospace, ui-monospace, SFMono-Regular",
    borderRadius: "0.4rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#050D1A] border border-[#0D2035] rounded-lg w-[440px] max-w-full overflow-hidden shadow-[0_0_40px_#00aaff08]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#EAF2FF] font-mono tracking-wide",
    headerSubtitle: "text-[#4a6a80] font-mono text-xs",
    socialButtonsBlockButtonText: "text-[#7a9eb8] font-mono text-xs",
    formFieldLabel: "text-[#7a9eb8] font-mono text-xs",
    footerActionLink: "text-[#00aaff] font-mono text-xs hover:text-[#33bbff]",
    footerActionText: "text-[#4a6a80] font-mono text-xs",
    dividerText: "text-[#3a5a70] font-mono text-xs",
    identityPreviewEditButton: "text-[#00aaff] font-mono text-xs",
    formFieldSuccessText: "text-[#00ff8a] font-mono text-xs",
    alertText: "text-[#EAF2FF] font-mono text-xs",
    logoBox: "flex justify-center py-3",
    logoImage: "h-8",
    socialButtonsBlockButton: "border-[#0D2035] bg-[#040A14] hover:bg-[#0A1625]",
    formButtonPrimary: "bg-[#00aaff] hover:bg-[#0088cc] text-white font-mono text-xs font-bold tracking-wide",
    formFieldInput: "bg-[#0A1625] border-[#0D2035] text-[#EAF2FF] font-mono text-xs",
    footerAction: "bg-[#040A14] border-t border-[#0D2035]",
    dividerLine: "bg-[#0D2035]",
    alert: "bg-[#040A14] border border-[#0D2035]",
    otpCodeFieldInput: "bg-[#0A1625] border-[#0D2035] text-[#EAF2FF] font-mono",
    formFieldRow: "gap-3",
    main: "bg-[#050D1A]",
  },
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: false },
  },
});

const PENDING_PATHS = MODULE_LIST.filter((m) => m.status === "pending").map((m) => m.path);

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

// Home route: signed-in → go to Command Center, signed-out → show landing
function HomeRoute() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/command" />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

// Wraps any dashboard page — redirect to sign-in if not authenticated
function Protected({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in">
        <Layout>{children}</Layout>
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

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

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRoute} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
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
      {PENDING_PATHS.map((path) => (
        <Route key={path} path={path}>
          <Protected><ComingSoon path={path} /></Protected>
        </Route>
      ))}
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      afterSignOutUrl={basePath || "/"}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to access Apex Trader",
          },
        },
        signUp: {
          start: {
            title: "Create account",
            subtitle: "Institutional-grade crypto trading platform",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
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

export default function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}
