import { darkColors, lightColors } from "@/theme/colors";
import { useColorScheme as useNativeWindColorScheme } from "nativewind";
import React, { createContext, type PropsWithChildren, useCallback, useEffect, useMemo } from "react";

export type AppearancePreference = "system" | "light" | "dark";

export type WardrobeTheme = {
  dark: boolean;
  colors: typeof lightColors | typeof darkColors;
  appearance: AppearancePreference;
  setAppearance: (appearance: AppearancePreference) => void;
};

const ThemeContext = createContext<WardrobeTheme>({
  dark: false,
  colors: lightColors,
  appearance: "system",
  setAppearance: () => {},
});

export function WardrobeThemeProvider({ children }: PropsWithChildren) {
  const { setColorScheme } = useNativeWindColorScheme();
  useEffect(() => { setColorScheme("light"); }, [setColorScheme]);
  const setAppearance = useCallback((_next: AppearancePreference) => {
    setColorScheme("light");
  }, [setColorScheme]);
  const value = useMemo<WardrobeTheme>(
    () => ({
      dark: false,
      colors: lightColors,
      appearance: "light",
      setAppearance,
    }),
    [setAppearance],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useWardrobeTheme() {
  return React.use(ThemeContext);
}
