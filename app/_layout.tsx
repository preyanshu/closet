import "@/global.css";

import { ClosetProvider } from "@/state/closet-context";
import { GlassLayer } from "@/components/ui";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import { Pressable } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

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
      <ClosetProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerTransparent: true,
            headerTintColor: "#000000",
            headerTitleStyle: { fontWeight: "700" },
            headerBackground: () => <NativeHeaderGlass />,
            contentStyle: { backgroundColor: "#FFFDF3" },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="scan"
            options={{
              title: "Scan",
              presentation: "modal",
              headerLeft: () => <NativeGlassCloseButton />,
            }}
          />
          <Stack.Screen
            name="chat"
            options={{
              title: "Alta",
              presentation: "modal",
              headerLeft: () => <NativeGlassCloseButton />,
            }}
          />
          <Stack.Screen
            name="builder"
            options={{
              title: "Outfit Builder",
              presentation: "modal",
              headerLeft: () => <NativeGlassCloseButton />,
            }}
          />
          <Stack.Screen
            name="calendar"
            options={{
              title: "Outfit Calendar",
              presentation: "modal",
              headerLeft: () => <NativeGlassCloseButton />,
            }}
          />
          <Stack.Screen
            name="saved-looks"
            options={{
              title: "Saved Looks",
              presentation: "modal",
              headerLeft: () => <NativeGlassCloseButton />,
            }}
          />
          <Stack.Screen
            name="look/[id]"
            options={{
              title: "Look Details",
              presentation: "modal",
              headerLeft: () => <NativeGlassCloseButton />,
            }}
          />
          <Stack.Screen
            name="confirm-item"
            options={{
              title: "Confirm Item",
              presentation: "modal",
              headerLeft: () => <NativeGlassCloseButton />,
            }}
          />
          <Stack.Screen
            name="analytics"
            options={{
              title: "Wardrobe Analytics",
              presentation: "modal",
              headerLeft: () => <NativeGlassCloseButton />,
            }}
          />
          <Stack.Screen
            name="packing"
            options={{
              title: "Packing List",
              presentation: "modal",
              headerLeft: () => <NativeGlassCloseButton />,
            }}
          />
          <Stack.Screen
            name="style-quiz"
            options={{
              title: "Style Quiz",
              presentation: "modal",
              headerLeft: () => <NativeGlassCloseButton />,
            }}
          />
          <Stack.Screen
            name="item/[id]"
            options={{
              title: "Item",
              presentation: "card",
              headerBackButtonDisplayMode: "minimal",
            }}
          />
        </Stack>
      </ClosetProvider>
    </GestureHandlerRootView>
  );
}

function NativeGlassCloseButton() {
  return (
    <Pressable
      accessibilityLabel="Close"
      onPress={closeModal}
      className="h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-black/[0.04]"
    >
      <GlassLayer />
      <SymbolView name="xmark" tintColor="#000000" style={{ width: 22, height: 22 }} />
    </Pressable>
  );
}

function NativeHeaderGlass() {
  if (isLiquidGlassAvailable()) {
    return <GlassView glassEffectStyle={{ style: "clear", animate: true }} colorScheme="light" tintColor="#FFFFFF" style={{ flex: 1 }} />;
  }
  return <BlurView intensity={56} tint="light" style={{ flex: 1, backgroundColor: "rgba(255,253,243,0.62)" }} />;
}
