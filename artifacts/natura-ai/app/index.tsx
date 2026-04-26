import { Redirect } from "expo-router";
import { useUser } from "@/contexts/UserContext";

export default function Index() {
  const { loading, isOnboarded } = useUser();
  if (loading) return null;
  if (!isOnboarded) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}
