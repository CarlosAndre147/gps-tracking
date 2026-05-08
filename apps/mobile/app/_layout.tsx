import "react-native-reanimated";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useResumeTracking } from "@/hooks/useResumeTracking";
import { useTracking } from "@/hooks/useTracking";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/store/auth.store";

void SplashScreen.preventAutoHideAsync();

function TrackingResumeBridge() {
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const accessToken = useAuthStore((s) => s.accessToken);
  const { startTracking } = useTracking();
  useResumeTracking(bootstrapped && !!accessToken, startTracking);
  return null;
}

export default function RootLayout() {
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const [layoutReady, setLayoutReady] = useState(false);

  useEffect(() => {
    void useAuthStore.getState().bootstrap();
  }, []);

  useEffect(() => {
    if (!bootstrapped) return;
    void import("../tasks/locationTask");
  }, [bootstrapped]);

  useEffect(() => {
    if (!bootstrapped || !layoutReady) return;
    void SplashScreen.hideAsync();
  }, [bootstrapped, layoutReady]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={() => setLayoutReady(true)}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <BottomSheetModalProvider>
            {bootstrapped ? <TrackingResumeBridge /> : null}
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(user)" />
              <Stack.Screen name="(admin)" />
            </Stack>
          </BottomSheetModalProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
