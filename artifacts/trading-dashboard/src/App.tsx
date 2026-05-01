import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout, MODULE_LIST } from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import MarketData from "@/pages/MarketData";
import Indicators from "@/pages/Indicators";
import AIReasoning from "@/pages/AIReasoning";
import RiskManagement from "@/pages/RiskManagement";
import ComingSoon from "@/pages/ComingSoon";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: false },
  },
});

const PENDING_PATHS = MODULE_LIST.filter((m) => m.status === "pending").map((m) => m.path);

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Layout><Dashboard /></Layout>
      </Route>
      <Route path="/market">
        <Layout><MarketData /></Layout>
      </Route>
      <Route path="/indicators">
        <Layout><Indicators /></Layout>
      </Route>
      <Route path="/ai">
        <Layout><AIReasoning /></Layout>
      </Route>
      <Route path="/risk">
        <Layout><RiskManagement /></Layout>
      </Route>
      {PENDING_PATHS.map((path) => (
        <Route key={path} path={path}>
          <Layout><ComingSoon path={path} /></Layout>
        </Route>
      ))}
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
