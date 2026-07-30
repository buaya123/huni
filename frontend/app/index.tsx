import { Redirect } from "expo-router";
import { useAuth } from "@/src/context/auth";

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (!user) {
    return <Redirect href="/welcome" />;
  }

  if (!user.accepted_terms) {
    return <Redirect href="/legal" />;
  }

  return <Redirect href="/(tabs)/home" />;
}