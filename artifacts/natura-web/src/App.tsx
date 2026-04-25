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
import RemedyDetail from "@/pages/RemedyDetail";
import PlanDetail from "@/pages/PlanDetail";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");

function AppRoutes() {
  const { isOnboarded, loading } = useUser();
  if (loading) return <div className="loading-screen"><div className="loading-spinner" /><p>Loading Natura AI...</p></div>;

  return (
    <Routes>
      <Route path={`${base}/`} element={<Navigate to={isOnboarded ? `${base}/home` : `${base}/onboarding`} replace />} />
      <Route path={`${base}/onboarding`} element={<Welcome />} />
      <Route path={`${base}/onboarding/goals`} element={<Goals />} />
      <Route path={`${base}/onboarding/preferences`} element={<Preferences />} />
      <Route path={`${base}/onboarding/disclaimer`} element={<Disclaimer />} />
      <Route path={`${base}/home`} element={isOnboarded ? <Home /> : <Navigate to={`${base}/onboarding`} replace />} />
      <Route path={`${base}/chat`} element={isOnboarded ? <Chat /> : <Navigate to={`${base}/onboarding`} replace />} />
      <Route path={`${base}/plans`} element={isOnboarded ? <Plans /> : <Navigate to={`${base}/onboarding`} replace />} />
      <Route path={`${base}/recipes`} element={isOnboarded ? <Recipes /> : <Navigate to={`${base}/onboarding`} replace />} />
      <Route path={`${base}/profile`} element={isOnboarded ? <Profile /> : <Navigate to={`${base}/onboarding`} replace />} />
      <Route path={`${base}/remedy/:id`} element={isOnboarded ? <RemedyDetail /> : <Navigate to={`${base}/onboarding`} replace />} />
      <Route path={`${base}/plan/:id`} element={isOnboarded ? <PlanDetail /> : <Navigate to={`${base}/onboarding`} replace />} />
      <Route path="*" element={<Navigate to={`${base}/`} replace />} />
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
