import { Redirect } from "expo-router";
import { useAuth } from "@/src/context/auth";
import LaunchScreen from "./LaunchScreen";

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
  return null;
}

if (!user) {
  return <Redirect href="/welcome" />;
}

return <Redirect href="/(tabs)/home" />;
}