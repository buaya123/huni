import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "@/src/firebase/google";
import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider } from "@/src/context/auth";
import { WSProvider } from "@/src/context/ws";
import { colors } from "@/src/theme/tokens";
import { KeyboardProvider } from "react-native-keyboard-controller";
LogBox.ignoreAllLogs(true);

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaProvider>
        <AuthProvider>
          <WSProvider>
            <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />
 
          </WSProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
