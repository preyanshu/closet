# Interactive glass buttons

The project's working reference is `CircularGlassButton` in
`components/ui.tsx`. Its native glass touch response was confirmed by the
user on their iPhone on 2026-09-23.

## Reuse the component

```tsx
import { CircularGlassButton } from "@/components/ui";

<CircularGlassButton
  icon="plus"
  label="Scan clothes"
  onPress={() => router.push("/scan")}
/>
```

It supports `size`, `tintColor`, `selected`, and `badge`. The default diameter
is 44 points. Favorites can use `heart.fill` and the theme's destructive color
when selected.

## Structure that preserves the native touch response

```tsx
<GlassView
  isInteractive
  glassEffectStyle="regular"
  colorScheme="light"
  style={{ width: 44, height: 44, borderRadius: 22 }}
>
  <Pressable
    accessibilityRole="button"
    accessibilityLabel="Scan clothes"
    onPress={onPress}
    style={{ width: 44, height: 44, borderRadius: 22 }}
  >
    <View pointerEvents="none" style={iconContainerStyle}>
      {/* Icon */}
    </View>
  </Pressable>
</GlassView>
```

- The interactive `GlassView` wraps the `Pressable`.
- Do **not** put `pointerEvents="none"` on the interactive `GlassView`.
  Decorative icons and badges can ignore touches.
- Let native glass handle its touch response. Avoid applying manual opacity
  or scale changes to the native-glass path.
- Use a transparent button surface so it does not cover the glass material.
- Use plain style objects with explicit press state where needed. NativeWind's
  native interop drops callback-based `Pressable` styles entirely, leaving
  unstyled text. See [nativewind-pressable-styles.md](./nativewind-pressable-styles.md).
- Keep accessibility labels, adequate touch targets, and propagation handling
  for favorite buttons nested inside tappable item cards.

## What failed here

The earlier hierarchy was `Pressable > GlassView(pointerEvents="none")` with
manual press dimming/scaling. The buttons looked static despite requesting
`isInteractive`. Moving the press target inside the touch-enabled glass view
and removing the competing manual feedback restored the effect on the user's
iPhone.

The native iOS navigation back button is system-owned; it cannot simply be
extracted from the header. This component is the app's reusable equivalent,
using Expo's native glass API.

## Availability and fallback

Use `isLiquidGlassAvailable()` to choose the native path. The existing
component provides a blur/surface fallback with opacity feedback when native
glass is unavailable. A static-looking button alone does **not** prove that
the fallback was selected: first inspect touch routing and the view hierarchy.
System accessibility settings may also reduce the visible effect.

`GlassLayer` and the older `GlassButton` are separate implementations. They
now use the same confirmed interactive hierarchy. Prefer
`CircularGlassButton` for circular actions, `GlassPillButton` for compact
text actions such as “Review all,” and `GlassButton` for existing icon/value
controls.

## Verify on device

Press and hold, then release a circular button on an iPhone supporting native
glass. Check the material's response, action delivery, and favorite-button
behavior inside cards. TypeScript and bundling checks cannot verify the native
visual interaction.
