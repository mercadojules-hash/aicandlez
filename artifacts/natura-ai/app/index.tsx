import { Redirect } from "expo-router";
import { useUser } from "@/contexts/UserContext";
import { useEffect } from "react";

export default function Index() {
  const { loading, isOnboarded, completeOnboarding } = useUser();
  if (loading) return null;
  // Skip onboarding entirely — mark as onboarded on first visit
  if (!isOnboarded) {
    completeOnboarding({ name: "", goals: [], allergies: [] });
  }
  return <Redirect href="/(tabs)" />;
}
