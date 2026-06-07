import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import {
  ClerkProvider,
  SignIn,
  SignUp,
  Show,
  ClerkLoading,
  ClerkLoaded,
} from "@clerk/react";
import { dark } from "@clerk/themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Businesses from "@/pages/Businesses";
import Projects from "@/pages/Projects";
import Agents from "@/pages/Agents";
import AgentActivity from "@/pages/AgentActivity";
import Workflows from "@/pages/Workflows";
import Collaboration from "@/pages/Collaboration";
import RoutingRules from "@/pages/RoutingRules";
import EscalationChains from "@/pages/EscalationChains";
import CommandConsole from "@/pages/CommandConsole";
import Operations from "@/pages/Operations";
import Tasks from "@/pages/Tasks";
import Decisions from "@/pages/Decisions";
import Escalations from "@/pages/Escalations";
import Approvals from "@/pages/Approvals";
import Timeline from "@/pages/Timeline";
import Audit from "@/pages/Audit";
import Settings from "@/pages/Settings";
import MemoryDashboard from "@/pages/MemoryDashboard";
import Memories from "@/pages/Memories";
import Knowledge from "@/pages/Knowledge";
import Categories from "@/pages/Categories";
import Relationships from "@/pages/Relationships";
import Search from "@/pages/Search";
import Navigation from "@/pages/Navigation";
import IntelligenceDashboard from "@/pages/IntelligenceDashboard";
import Findings from "@/pages/Findings";
import Recommendations from "@/pages/Recommendations";
import Insights from "@/pages/Insights";
import Briefings from "@/pages/Briefings";
import Cognition from "@/pages/Cognition";
import Governance from "@/pages/Governance";
import Policies from "@/pages/Policies";
import Budgets from "@/pages/Budgets";
import AgentTrust from "@/pages/AgentTrust";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const basePath = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

function FullPageLoader() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  );
}

function MissingKeyError() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-background font-mono">
      <div className="text-[11px] tracking-[0.2em] text-muted-foreground">JARVIS</div>
      <div className="text-sm font-bold text-amber-500">CONFIGURATION REQUIRED</div>
      <div className="max-w-md rounded border border-border bg-card px-4 py-3 text-center text-[11px] leading-relaxed text-muted-foreground">
        <code>VITE_CLERK_PUBLISHABLE_KEY</code> is not set. Add it to the
        environment and restart the dev server.
      </div>
    </div>
  );
}

const clerkAppearance = {
  theme: dark,
  cssLayerName: "clerk",
  variables: {
    colorPrimary: "#6366f1",
    borderRadius: "0.5rem",
  },
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
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
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        fallbackRedirectUrl={`${basePath}/`}
      />
    </div>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ClerkLoading>
        <FullPageLoader />
      </ClerkLoading>
      <ClerkLoaded>
        <Show when="signed-in">
          <Layout>{children}</Layout>
        </Show>
        <Show when="signed-out">
          <Redirect to="/sign-in" />
        </Show>
      </ClerkLoaded>
    </>
  );
}

function HomeRoute() {
  return (
    <>
      <ClerkLoading>
        <FullPageLoader />
      </ClerkLoading>
      <ClerkLoaded>
        <Show when="signed-in">
          <Layout>
            <Dashboard />
          </Layout>
        </Show>
        <Show when="signed-out">
          <Redirect to="/sign-in" />
        </Show>
      </ClerkLoaded>
    </>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/sign-in" component={SignInPage} />
      <Route path="/sign-in/*" component={SignInPage} />
      <Route path="/sign-up" component={SignUpPage} />
      <Route path="/sign-up/*" component={SignUpPage} />
      <Route path="/" component={HomeRoute} />
      <Route path="/businesses">
        <Protected>
          <Businesses />
        </Protected>
      </Route>
      <Route path="/projects">
        <Protected>
          <Projects />
        </Protected>
      </Route>
      <Route path="/agents">
        <Protected>
          <Agents />
        </Protected>
      </Route>
      <Route path="/agent-activity">
        <Protected>
          <AgentActivity />
        </Protected>
      </Route>
      <Route path="/collaboration">
        <Protected>
          <Collaboration />
        </Protected>
      </Route>
      <Route path="/workflows">
        <Protected>
          <Workflows />
        </Protected>
      </Route>
      <Route path="/routing-rules">
        <Protected>
          <RoutingRules />
        </Protected>
      </Route>
      <Route path="/escalation-chains">
        <Protected>
          <EscalationChains />
        </Protected>
      </Route>
      <Route path="/commands">
        <Protected>
          <CommandConsole />
        </Protected>
      </Route>
      <Route path="/operations">
        <Protected>
          <Operations />
        </Protected>
      </Route>
      <Route path="/tasks">
        <Protected>
          <Tasks />
        </Protected>
      </Route>
      <Route path="/decisions">
        <Protected>
          <Decisions />
        </Protected>
      </Route>
      <Route path="/escalations">
        <Protected>
          <Escalations />
        </Protected>
      </Route>
      <Route path="/approvals">
        <Protected>
          <Approvals />
        </Protected>
      </Route>
      <Route path="/intelligence">
        <Protected>
          <IntelligenceDashboard />
        </Protected>
      </Route>
      <Route path="/findings">
        <Protected>
          <Findings />
        </Protected>
      </Route>
      <Route path="/recommendations">
        <Protected>
          <Recommendations />
        </Protected>
      </Route>
      <Route path="/insights">
        <Protected>
          <Insights />
        </Protected>
      </Route>
      <Route path="/briefings">
        <Protected>
          <Briefings />
        </Protected>
      </Route>
      <Route path="/cognition">
        <Protected>
          <Cognition />
        </Protected>
      </Route>
      <Route path="/governance">
        <Protected>
          <Governance />
        </Protected>
      </Route>
      <Route path="/policies">
        <Protected>
          <Policies />
        </Protected>
      </Route>
      <Route path="/budgets">
        <Protected>
          <Budgets />
        </Protected>
      </Route>
      <Route path="/agent-trust">
        <Protected>
          <AgentTrust />
        </Protected>
      </Route>
      <Route path="/memory">
        <Protected>
          <MemoryDashboard />
        </Protected>
      </Route>
      <Route path="/memories">
        <Protected>
          <Memories />
        </Protected>
      </Route>
      <Route path="/knowledge">
        <Protected>
          <Knowledge />
        </Protected>
      </Route>
      <Route path="/categories">
        <Protected>
          <Categories />
        </Protected>
      </Route>
      <Route path="/relationships">
        <Protected>
          <Relationships />
        </Protected>
      </Route>
      <Route path="/search">
        <Protected>
          <Search />
        </Protected>
      </Route>
      <Route path="/navigation">
        <Protected>
          <Navigation />
        </Protected>
      </Route>
      <Route path="/timeline">
        <Protected>
          <Timeline />
        </Protected>
      </Route>
      <Route path="/audit">
        <Protected>
          <Audit />
        </Protected>
      </Route>
      <Route path="/settings">
        <Protected>
          <Settings />
        </Protected>
      </Route>
      <Route>
        <Redirect to="/" />
      </Route>
    </Switch>
  );
}

export default function App() {
  if (!clerkPubKey) return <MissingKeyError />;
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={basePath}>
            <AppRoutes />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
