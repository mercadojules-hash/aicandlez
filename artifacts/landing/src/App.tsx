import { Switch, Route, Router as WouterRouter } from "wouter";
import { LandingPage } from "@/pages/LandingPage";

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route>
        <LandingPage />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Router />
    </WouterRouter>
  );
}

export default App;
