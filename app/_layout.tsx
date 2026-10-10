import "@/global.css";

import { ClosetProvider, useCloset } from "@/state/closet-context";
import { adaptiveColors, radius, GlassButton, WardrobeIcon } from "@/components/ui";
import { WardrobeThemeProvider, useWardrobeTheme } from "@/theme/wardrobe-theme";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { router, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import { useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { FadeInDown, FadeOut, ReduceMotion } from "react-native-reanimated";

const closeModal = () => {
  if (router.canDismiss()) {
    router.dismiss();
    return;
  }
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace("/");
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <WardrobeThemeProvider>
        <ClosetProvider>
          <RootNavigator />
        </ClosetProvider>
      </WardrobeThemeProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { dark, colors } = useWardrobeTheme();
  return (
    <>
        <StatusBar style={dark ? "light" : "dark"} />
        <Stack
          screenOptions={{
            headerTransparent: true,
            headerTintColor: colors.label,
            headerTitleStyle: { fontWeight: "700" },
            headerBackground: () => <NativeHeaderGlass />,
            contentStyle: { backgroundColor: colors.canvas },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="scan"
            options={{
              title: "Scan",
              presentation: "fullScreenModal",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="chat"
            options={{
              title: "Alta",
              presentation: "modal",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="builder"
            options={{
              title: "Outfit Builder",
              presentation: "modal",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="calendar"
            options={{
              title: "Outfit Calendar",
              presentation: "modal",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="saved-looks"
            options={{
              title: "Saved Looks",
              presentation: "modal",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="look/[id]"
            options={{
              title: "Look Details",
              presentation: "modal",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="confirm-item"
            options={{
              title: "Confirm Item",
              presentation: "modal",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="analytics"
            options={{
              title: "Wardrobe Analytics",
              presentation: "modal",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="packing"
            options={{
              title: "Packing List",
              presentation: "modal",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="style-quiz"
            options={{
              title: "Style Quiz",
              presentation: "modal",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="item/[id]"
            options={{
              title: "Item",
              presentation: "card",
              headerTransparent: false,
              headerShadowVisible: false,
              headerStyle: { backgroundColor: colors.canvas },
              headerBackground: () => <View style={{ flex: 1, backgroundColor: colors.canvas }} />,
              headerBackButtonDisplayMode: "minimal",
            }}
          />
        </Stack>
        <AddedPiecesToast />
    </>
  );
}

function AddedPiecesToast() {
  const { addedMessage, setAddedMessage } = useCloset();
  const { colors } = useWardrobeTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const visible = Boolean(addedMessage) && pathname !== "/scan";

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setAddedMessage(null), 2400);
    return () => clearTimeout(timer);
  }, [visible, addedMessage, setAddedMessage]);

  return (
    <View pointerEvents="none" collapsable={false} style={{ position: "absolute", left: 20, right: 20, bottom: insets.bottom + 80, alignItems: "center" }}>
      {visible ? <Animated.View
        entering={FadeInDown.duration(220).reduceMotion(ReduceMotion.System)}
        exiting={FadeOut.duration(160).reduceMotion(ReduceMotion.System)}
        accessibilityLiveRegion="polite"
        style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: radius.pill, backgroundColor: colors.label, boxShadow: "0 4px 16px rgba(0,0,0,0.16)" }}
      >
        <WardrobeIcon name="checkmark.circle.fill" color="#4CD964" size={20} />
        <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "700", color: colors.onAccent }}>{addedMessage}</Text>
      </Animated.View> : null}
    </View>
  );
}

function NativeGlassCloseButton() {
  return <GlassButton icon="xmark" label="Close" onPress={closeModal} />;
}

function NativeHeaderGlass() {
  const { dark, colors } = useWardrobeTheme();
  if (isLiquidGlassAvailable()) {
    return <GlassView glassEffectStyle={{ style: "clear", animate: true }} colorScheme={dark ? "dark" : "light"} tintColor={colors.glass} style={{ flex: 1 }} />;
  }
  return <BlurView intensity={56} tint={dark ? "dark" : "light"} style={{ flex: 1, backgroundColor: colors.glass }} />;
}
