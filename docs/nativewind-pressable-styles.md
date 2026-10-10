# NativeWind drops function-form `Pressable` styles

`style` on a `Pressable` (or `View`, `Text`, `ScrollView`, `Image`, …) **must be
a plain object or array on native.** Passing a callback — the
`style={({ pressed }) => ({ … })}` form that React Native officially supports —
silently deletes every style. The element still renders its children, so the
symptom is text with no button around it.

Confirmed fixed on the user's device on 2026-09-28. Root cause was in
NativeWind's native interop, not in this app's styling or color tokens.

## Symptom

The element occupies no styled box. Labels appear as loose text with no
background, border, padding, height, or radius, while `Text` children look
perfectly normal. It reads as "the CSS isn't applying."

This is **native only**. On web the same code renders correctly, which is why
inspecting the browser is misleading.

## Root cause

NativeWind registers every core component, including `Pressable`:

```js
// react-native-css-interop/dist/runtime/components.js:7
cssInterop(react_native_1.Pressable, { className: "style" });
```

Your `style` prop is then treated as an inline style declaration, collected by
`collectInlineRules` (`native/native-interop.js:653`) via `getOpaqueStyles`
(`native/styles.js:50`), and **object-spread** into the interop's own props:

```js
// react-native-css-interop/dist/runtime/native/native-interop.js:563-566
else {
    assignToTarget(props, { ...declaration }, state.config, {
        objectMergeStyle: "assign",
    });
}
```

Those props are merged last, so they overwrite yours:

```js
// react-native-css-interop/dist/runtime/native/render-component.js:76
props = { ...props, ...possiblyAnimatedProps };
```

- `style={{ … }}` → `{ ...obj }` copies the styles → works.
- `style={(state) => ({ … })}` → `{ ...fn }` is `{}`, because functions have no
  enumerable own properties → the real `Pressable` gets `style={{}}`.

The web runtime is unaffected because it only inspects `className`:

```js
// react-native-css-interop/dist/runtime/web/api.js:29
if (typeof source === "string" && source) {
```

so a function `style` is passed straight through untouched.

## The fix

Hold press state in React and use an object `style`:

```tsx
function FilterChip({ label, count, selected, onPress }: {
  label: string; count?: number; selected: boolean; onPress: () => void;
}) {
  const { colors } = useWardrobeTheme();
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
      style={{
        minHeight: 44,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        backgroundColor: selected ? colors.label : colors.surface,
        borderWidth: 1,
        borderColor: selected ? colors.label : colors.border,
        transform: [{ scale: pressed ? motion.pressScale : 1 }],
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}
```

`onPressOut` should also clear `pressed`, otherwise a chip stays scaled down
after a drag that leaves the touch target.

The same `pressedId`-style pattern already used for outfit cards in
`app/(tabs)/outfits.tsx` is the established convention here.

## Auditing for it

```bash
grep -rn "style={({" --include=*.tsx app components
```

Every hit is suspect. Arrays returned from the callback
(`style={({ pressed }) => [base, pressed && { opacity: 0.6 }]}`) fail the same
way, because the callback itself is never invoked.

If you need genuinely dynamic styles, build them in the render body and pass an
object or array instead:

```tsx
style={[base, pressed && { opacity: 0.6 }]}
```

## Status

The codebase is now free of the callback form. Verify with:

```sh
grep -rn "style={(\|contentContainerStyle={(" --include=*.tsx app components
```

An empty result means no occurrences remain.

Fixed so far:

- `FilterChip`, `ToolbarButton`, and `Button` in `components/ui.tsx`
- `app/scan.tsx` — `PermissionPlaceholder` (both actions) and `TrayCard`
- `app/builder.tsx` — rewritten to use `useState` press state throughout

New code must use the `useState` plus object/array pattern above. Note that
`expo/types/react-native-web.d.ts` widens `PressableStateCallbackType` to
require `hovered`, so a wrapper that forwards a function `style` must supply
both `pressed` and `hovered`.

## Verify on device

`tsc --noEmit` and Metro bundling both pass with the broken form, and neither
catches this. Type and build checks cannot verify it. Load the app on a real
device or simulator and confirm the elements have a styled box.

For web-only inspection, remember the browser renders the broken form
correctly, so a healthy web screenshot is not evidence that native is fine.
