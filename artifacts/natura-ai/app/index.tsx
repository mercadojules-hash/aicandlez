import { Redirect } from "expo-router";
import { useUser } from "@/contexts/UserContext";

export default function Index() {
  const { loading, isOnboarded } = useUser();
  if (loading) return null;
  // TEST MODE: force welcome screen (remove next line to restore normal behaviour)
  // if (!isOnboarded) return <Redirect href="/onboarding" />;
  return <Redirect href="/onboarding" />;
  // PRODUCTION (restore when done testing):
  // if (!isOnboarded) return <Redirect href="/onboarding" />;
  // return <Redirect href="/(tabs)" />;
}
