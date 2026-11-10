import { adaptiveColors, spacing, Button, FilterChip, FormField, Sheet, WardrobeIcon } from "@/components/ui";
import { vibesFor } from "@/services/vibes";
import { useCloset } from "@/state/closet-context";
import {
  CATEGORY_VALUES,
  COLOR_VALUES,
  FIT_VALUES,
  FORMALITY_OPTIONS,
  PATTERN_VALUES,
  SLEEVE_VALUES,
  TEXTURE_VALUES,
  WARMTH_OPTIONS,
  deriveRole,
  subcategoriesFor,
  swatchColor,
} from "@/services/item-options";
import { effectiveAlternateRoles, guessAlternateRoles } from "@/services/item-roles";
import type { AiAttribute, ClothingCategory, Item, ItemRole, WarmthBand } from "@/types/domain";
import { categoryLabels, roleLabels, warmthLabels } from "@/types/taxonomy";
import * as Haptics from "expo-haptics";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

const titleCase = (value: string) => value.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

/** Roles a top-half piece can play. A piece may do several (a shirt: base top and layer). */
const TOP_GROUP_ROLES: readonly ItemRole[] = ["base_top", "mid_layer", "outer_layer"];
const inTopGroup = (role: ItemRole) => TOP_GROUP_ROLES.includes(role);

/** Whether the roles picker applies: tops and outerwear, but not one-pieces like dresses. */
function rolesApply(category: ClothingCategory, subcategory: string): boolean {
  return (category === "top" || category === "outerwear") && deriveRole(category, subcategory || undefined) !== "one_piece";
}

function defaultRoles(category: ClothingCategory, subcategory: string, name: string): ItemRole[] {
  const role = deriveRole(category, subcategory || undefined);
  return [role, ...guessAlternateRoles({ role, subcategory: subcategory || undefined, name })].filter(inTopGroup);
}

type Draft = {
  roles: ItemRole[];
  name: string;
  category: ClothingCategory;
  subcategory: string;
  primaryColor: string;
  secondaryColor: string;
  fit: string;
  sleeveLength: string;
  pattern: string;
  texture: string;
  warmth: WarmthBand | "";
  formality: string;
  styleTags: string[];
  brand: string;
  price: string;
};

function toDraft(item: Item): Draft {
  return {
    roles: [item.role, ...effectiveAlternateRoles(item)].filter(inTopGroup),
    name: item.name,
    category: item.category,
    subcategory: item.subcategory ?? "",
    primaryColor: item.primaryColor,
    secondaryColor: item.secondaryColors[0] ?? "",
    fit: item.fit ?? "",
    sleeveLength: item.sleeveLength ?? "",
    pattern: item.pattern ?? "",
    texture: item.visibleTexture ?? "",
    warmth: item.warmthBand ?? "",
    formality: item.formality ?? "",
    styleTags: item.styleTags,
    brand: item.brand ?? "",
    price: item.priceMinor == null ? "" : String(item.priceMinor / 100),
  };
}

/** Mark every field the user changed as a confirmed user edit, so later AI passes never overwrite it. */
function withUserEdits(item: Item, next: Record<string, string>): AiAttribute[] | undefined {
  const before: Record<string, string> = {
    category: item.category,
    subcategory: item.subcategory ?? "",
    primary_color: item.primaryColor,
    secondary_color: item.secondaryColors.join(", "),
    fit: item.fit ?? "",
    sleeve_length: item.sleeveLength ?? "",
    pattern: item.pattern ?? "",
    texture: item.visibleTexture ?? "",
    formality: item.formality ?? "",
    warmth: item.warmthBand ?? "",
  };
  const now = new Date().toISOString();
  let attributes = [...(item.aiAttributes ?? [])];
  for (const [field, value] of Object.entries(next)) {
    if (value === before[field]) continue;
    const edited: AiAttribute = { field, value, source: "user", schemaVersion: 1, reviewStatus: "confirmed", updatedAt: now };
    attributes = [...attributes.filter((attribute) => attribute.field !== field), edited];
  }
  return attributes.length > 0 ? attributes : undefined;
}

/** Offer the current value too, even if it isn't in the standard list (older or hand-entered pieces). */
const withCurrent = (options: readonly string[], current: string): string[] => (current && !options.includes(current) ? [current, ...options] : [...options]);

export function ItemEditorSheet({ item, visible, onDismiss, onSave }: { item: Item; visible: boolean; onDismiss: () => void; onSave: (item: Item) => void }) {
  const aesthetics = vibesFor(useCloset().profile.presentation);
  const [draft, setDraft] = useState<Draft>(() => toDraft(item));

  // Start from the piece's current values each time the editor opens.
  useEffect(() => {
    if (visible) setDraft(toDraft(item));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((prev) => ({ ...prev, [key]: value }));
  const types = subcategoriesFor(draft.category);
  const showSleeve = draft.category === "top" || draft.category === "outerwear";

  const save = () => {
    const subcategory = draft.subcategory || undefined;
    const typeChanged = draft.category !== item.category || subcategory !== item.subcategory;
    const name = draft.name.trim() || item.name;
    const parsedPrice = Number.parseFloat(draft.price.replace(/[^0-9.]/g, ""));
    const applies = rolesApply(draft.category, draft.subcategory);
    const derived = deriveRole(draft.category, subcategory);
    let role: ItemRole = typeChanged ? derived : item.role;
    let alternateRoles = typeChanged ? guessAlternateRoles({ role: derived, subcategory, name }) : item.alternateRoles;
    if (applies) {
      // The user's picks win: the stored role is the type's own role when picked, else the first pick.
      const picked = TOP_GROUP_ROLES.filter((candidate) => draft.roles.includes(candidate));
      if (picked.length > 0) {
        role = picked.includes(derived) ? derived : picked[0];
        alternateRoles = picked.filter((candidate) => candidate !== role);
      }
    }
    const secondary = draft.secondaryColor && draft.secondaryColor !== draft.primaryColor ? [draft.secondaryColor] : [];

    const next: Item = {
      ...item,
      name,
      category: draft.category,
      subcategory,
      role,
      alternateRoles,
      primaryColor: draft.primaryColor,
      secondaryColors: secondary,
      fit: draft.fit || undefined,
      sleeveLength: showSleeve ? draft.sleeveLength || undefined : undefined,
      pattern: draft.pattern || undefined,
      visibleTexture: draft.texture || undefined,
      warmthBand: draft.warmth || undefined,
      formality: draft.formality || undefined,
      styleTags: draft.styleTags,
      brand: draft.brand.trim() || undefined,
      priceMinor: Number.isFinite(parsedPrice) ? Math.round(parsedPrice * 100) : null,
      revision: item.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    next.aiAttributes = withUserEdits(item, {
      category: next.category,
      subcategory: next.subcategory ?? "",
      primary_color: next.primaryColor,
      secondary_color: next.secondaryColors.join(", "),
      fit: next.fit ?? "",
      sleeve_length: next.sleeveLength ?? "",
      pattern: next.pattern ?? "",
      texture: next.visibleTexture ?? "",
      formality: next.formality ?? "",
      warmth: next.warmthBand ?? "",
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave(next);
    onDismiss();
  };

  return (
    <Sheet
      visible={visible}
      onDismiss={onDismiss}
      title="Edit piece"
      subtitle="Change anything Alta detected."
      footer={
        <Button accessibilityLabel="Save changes" onPress={save}>Save changes</Button>
      }
    >
      <FormField label="Name" value={draft.name} onChangeText={(value) => set("name", value)} returnKeyType="done" />

      <Group title="Category">
        {CATEGORY_VALUES.map((category) => (
          <FilterChip
            key={category}
            label={categoryLabels[category]}
            selected={draft.category === category}
            onPress={() => {
              if (category === draft.category) return;
              setDraft((prev) => {
                const subcategory = subcategoriesFor(category).includes(prev.subcategory) ? prev.subcategory : "";
                return { ...prev, category, subcategory, roles: defaultRoles(category, subcategory, prev.name) };
              });
            }}
          />
        ))}
      </Group>

      <Group title="Type">
        {types.map((type) => (
          <FilterChip
            key={type}
            label={titleCase(type)}
            selected={draft.subcategory === type}
            onPress={() => {
              const subcategory = draft.subcategory === type ? "" : type;
              setDraft((prev) => ({ ...prev, subcategory, roles: defaultRoles(prev.category, subcategory, prev.name) }));
            }}
          />
        ))}
      </Group>

      {rolesApply(draft.category, draft.subcategory) ? (
        <View style={{ gap: spacing.sm }}>
          <Group title="Works as (pick all that apply)">
            {TOP_GROUP_ROLES.map((role) => {
              const selected = draft.roles.includes(role);
              return (
                <FilterChip
                  key={role}
                  label={roleLabels[role]}
                  selected={selected}
                  onPress={() => {
                    // Always keep at least one role.
                    if (selected && draft.roles.length === 1) return;
                    set("roles", selected ? draft.roles.filter((entry) => entry !== role) : [...draft.roles, role]);
                  }}
                />
              );
            })}
          </Group>
          <Text style={{ fontSize: 12, color: adaptiveColors.tertiaryLabel }}>
            e.g. a button-up shirt is a base top and can also be worn open as a layer. Alta uses every role you pick when styling.
          </Text>
        </View>
      ) : null}

      <Group title="Color">
        {COLOR_VALUES.map((color) => <Swatch key={color} color={color} selected={draft.primaryColor === color} onPress={() => set("primaryColor", color)} />)}
        {!(COLOR_VALUES as readonly string[]).includes(draft.primaryColor) ? <Swatch color={draft.primaryColor} selected onPress={() => undefined} /> : null}
      </Group>

      <Group title="Second color (optional)">
        {COLOR_VALUES.map((color) => <Swatch key={color} color={color} selected={draft.secondaryColor === color} onPress={() => set("secondaryColor", draft.secondaryColor === color ? "" : color)} />)}
      </Group>

      <Choices title="Fit" options={withCurrent(FIT_VALUES, draft.fit)} value={draft.fit} onChange={(value) => set("fit", value)} />
      {showSleeve ? <Choices title="Sleeve" options={withCurrent(SLEEVE_VALUES, draft.sleeveLength)} value={draft.sleeveLength} onChange={(value) => set("sleeveLength", value)} /> : null}
      <Choices title="Pattern" options={withCurrent(PATTERN_VALUES, draft.pattern)} value={draft.pattern} onChange={(value) => set("pattern", value)} />
      <Choices title="Texture" options={withCurrent(TEXTURE_VALUES, draft.texture)} value={draft.texture} onChange={(value) => set("texture", value)} />
      <Choices title="Warmth" options={WARMTH_OPTIONS} labels={warmthLabels} value={draft.warmth} onChange={(value) => set("warmth", value as WarmthBand | "")} />
      <Choices title="Formality" options={withCurrent(FORMALITY_OPTIONS, draft.formality)} value={draft.formality} onChange={(value) => set("formality", value)} />

      <Group title="Vibes">
        {aesthetics.map((aesthetic) => {
          const selected = draft.styleTags.includes(aesthetic.id);
          return (
            <FilterChip
              key={aesthetic.id}
              label={aesthetic.label}
              selected={selected}
              onPress={() => set("styleTags", selected ? draft.styleTags.filter((tag) => tag !== aesthetic.id) : [...draft.styleTags, aesthetic.id])}
            />
          );
        })}
      </Group>

      <FormField label="Brand" value={draft.brand} onChangeText={(value) => set("brand", value)} placeholder="Optional" returnKeyType="done" />
      <FormField label="Price (USD)" value={draft.price} onChangeText={(value) => set("price", value)} placeholder="Optional" keyboardType="decimal-pad" />
    </Sheet>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: adaptiveColors.secondaryLabel }}>{title}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>{children}</View>
    </View>
  );
}

/** Single-choice chips; tapping the selected one clears it. */
function Choices({ title, options, value, onChange, labels }: { title: string; options: readonly string[]; value: string; onChange: (value: string) => void; labels?: Record<string, string> }) {
  return (
    <Group title={title}>
      {options.map((option) => (
        <FilterChip key={option} label={labels?.[option] ?? titleCase(option)} selected={value === option} onPress={() => onChange(value === option ? "" : option)} />
      ))}
    </Group>
  );
}

function Swatch({ color, selected, onPress }: { color: string; selected: boolean; onPress: () => void }) {
  const light = ["white", "ivory", "cream", "beige", "yellow", "pink", "tan"].includes(color);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${color} color`}
      accessibilityState={{ selected }}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: swatchColor(color), borderWidth: selected ? 3 : 1, borderColor: selected ? adaptiveColors.label : "rgba(0,0,0,0.12)" }}
    >
      {selected ? <WardrobeIcon name="checkmark" color={light ? adaptiveColors.label : "#FFFFFF"} weight="bold" size={16} /> : null}
    </Pressable>
  );
}
