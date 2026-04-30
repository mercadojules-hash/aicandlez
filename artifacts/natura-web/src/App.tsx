import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { UserProvider, useUser } from "@/contexts/UserContext";
import { WellnessProvider } from "@/contexts/WellnessContext";
import Welcome from "@/pages/onboarding/Welcome";
import Goals from "@/pages/onboarding/Goals";
import Preferences from "@/pages/onboarding/Preferences";
import Disclaimer from "@/pages/onboarding/Disclaimer";
import Home from "@/pages/tabs/Home";
import Chat from "@/pages/tabs/Chat";
import Plans from "@/pages/tabs/Plans";
import Recipes from "@/pages/tabs/Recipes";
import Profile from "@/pages/tabs/Profile";
import Learn from "@/pages/tabs/Learn";
import RemedyDetail from "@/pages/RemedyDetail";
import PlanDetail from "@/pages/PlanDetail";
import PreviewWellnessScreen from "@/pages/PreviewWellnessScreen";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");

function AppRoutes() {
  const { isOnboarded, loading } = useUser();
  if (loading) return <div className="loading-screen"><div className="loading-spinner" /><p>Loading Natura AI...</p></div>;

  return (
    <Routes>
      <Route path={`${base}/`}           element={<Navigate to={`${base}/home`} replace />} />
      <Route path={`${base}/preview`}    element={<PreviewWellnessScreen />} />
      <Route path={`${base}/onboarding`} element={<Welcome />} />
      <Route path={`${base}/onboarding/goals`}        element={<Goals />} />
      <Route path={`${base}/onboarding/preferences`}  element={<Preferences />} />
      <Route path={`${base}/onboarding/disclaimer`}   element={<Disclaimer />} />
      <Route path={`${base}/home`}     element={<Home />} />
      <Route path={`${base}/chat`}     element={<Chat />} />
      <Route path={`${base}/plans`}    element={<Plans />} />
      <Route path={`${base}/recipes`}  element={<Recipes />} />
      <Route path={`${base}/learn`}    element={<Learn />} />
      <Route path={`${base}/profile`}  element={<Profile />} />
      <Route path={`${base}/remedy/:id`} element={<RemedyDetail />} />
      <Route path={`${base}/plan/:id`}   element={<PlanDetail />} />
      <Route path="*" element={<Navigate to={`${base}/home`} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <UserProvider>
        <WellnessProvider>
          <AppRoutes />
        </WellnessProvider>
      </UserProvider>
    </BrowserRouter>
  );
}
