import { adaptiveColors, radius, Card, ModalHeader, Screen } from "@/components/ui";
import { categoryLabels, type ClothingCategory } from "@/data/mock";
import { priceToNumber } from "@/types/domain";
import { useCloset } from "@/state/closet-context";
import { SymbolView } from "expo-symbols";
import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

const categoryColors: Record<ClothingCategory, string> = {
  top: "#0E0D0B",
  bottom: "#8E8E93",
  outerwear: "#C08A4E",
  shoes: "#6B4A2F",
  accessory: "#3B6EA8",
};

const currency = (n: number, cents = false) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents ? 2 : 0 }).format(n);

export default function AnalyticsScreen() {
  const { items } = useCloset();

  const totalValue = items.reduce((sum, i) => sum + (priceToNumber(i) ?? 0), 0);
  const totalWears = items.reduce((sum, i) => sum + i.wearCount, 0);
  const avgCPW = totalWears > 0 ? totalValue / totalWears : 0;

  const unworn = items.filter((i) => i.wearCount === 0);
  const unwornValue = unworn.reduce((sum, i) => sum + (priceToNumber(i) ?? 0), 0);
  const unknownPriceCount = items.filter((i) => priceToNumber(i) == null).length;

  const categoryStats = (Object.keys(categoryLabels) as ClothingCategory[]).map((category) => {
    const group = items.filter((i) => i.category === category);
    return { category, count: group.length, value: group.reduce((s, i) => s + (priceToNumber(i) ?? 0), 0) };
  });
  const donutSegments = categoryStats.filter((s) => s.value > 0).map((s) => ({ value: s.value, color: categoryColors[s.category] }));
  const dominant = categoryStats.reduce((a, b) => (b.value > a.value ? b : a), categoryStats[0]);
  const dominantPercent = totalValue > 0 ? Math.round((dominant.value / totalValue) * 100) : 0;

  return (
    <Screen contentContainerStyle={{ gap: 24, paddingTop: 20 }}>
      <ModalHeader title="Wardrobe analytics" subtitle="See the value and wear of your closet." />

      <View style={{ borderRadius: 28, borderCurve: "continuous", overflow: "hidden", backgroundColor: "#0E0D0B", padding: 26, gap: 18, boxShadow: "0 24px 48px rgba(0, 0, 0, 0.2)" }}>
        <View style={{ gap: 5 }}>
          <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 2.2, color: "rgba(255,253,243,0.45)", textTransform: "uppercase" }}>Total wardrobe value</Text>
          <Text style={{ fontSize: 42, fontWeight: "800", color: adaptiveColors.onAccent, letterSpacing: -1.6, fontVariant: ["tabular-nums"] }}>{currency(totalValue)}</Text>
          <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(255,253,243,0.55)" }}>{items.length} pieces · avg {currency(avgCPW, true)} per wear</Text>
          {unknownPriceCount > 0 ? <Text style={{ fontSize: 12, fontWeight: "600", color: "#FFB340" }}>{unknownPriceCount} {unknownPriceCount === 1 ? "piece has" : "pieces have"} no price recorded</Text> : null}
        </View>

        <View style={{ flexDirection: "row", gap: 16, borderTopWidth: 1, borderTopColor: "rgba(255,253,243,0.12)", paddingTop: 16 }}>
          {[
            { label: "Wears", value: `${totalWears}`, accent: false },
            { label: "Never worn", value: `${unworn.length}`, accent: true },
            { label: "Idle value", value: currency(unwornValue), accent: false },
          ].map((stat) => (
            <View key={stat.label} style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 16, fontWeight: "800", color: stat.accent ? "#FFB340" : adaptiveColors.onAccent, letterSpacing: -0.3, fontVariant: ["tabular-nums"] }}>{stat.value}</Text>
              <Text style={{ fontSize: 9, fontWeight: "700", color: "rgba(255,253,243,0.4)", textTransform: "uppercase", letterSpacing: 0.8 }}>{stat.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <Card className="gap-5">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <SymbolView name="chart.pie" tintColor="rgba(0,0,0,0.35)" style={{ width: 15, height: 15 }} />
          <Text style={{ fontSize: 15, fontWeight: "800", color: adaptiveColors.label, letterSpacing: -0.3 }}>Value by category</Text>
        </View>
        <View style={{ alignItems: "center", gap: 18 }}>
          <View style={{ position: "relative", width: 168, height: 168 }}>
            <Donut size={168} segments={donutSegments} />
            <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", gap: 2 }}>
              <Text style={{ fontSize: 26, fontWeight: "800", color: adaptiveColors.label, letterSpacing: -1, fontVariant: ["tabular-nums"] }}>{dominantPercent}%</Text>
              <Text style={{ fontSize: 11, fontWeight: "700", color: adaptiveColors.secondaryLabel, textTransform: "capitalize" }}>{categoryLabels[dominant.category]}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
            {categoryStats.filter((s) => s.value > 0).map((stat) => (
              <View key={stat.category} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={{ width: 8, height: 8, borderRadius: radius.pill, backgroundColor: categoryColors[stat.category] }} />
                <Text style={{ fontSize: 12, fontWeight: "600", color: adaptiveColors.secondaryLabel, textTransform: "capitalize" }}>{categoryLabels[stat.category]}</Text>
                <Text style={{ fontSize: 12, fontWeight: "800", color: adaptiveColors.label, fontVariant: ["tabular-nums"] }}>{Math.round((stat.value / totalValue) * 100)}%</Text>
              </View>
            ))}
          </View>
        </View>
      </Card>

      {unworn.length > 0 && (
        <View style={{ borderRadius: 24, borderCurve: "continuous", backgroundColor: "#FFF4E0", padding: 20, gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <SymbolView name="exclamationmark.triangle.fill" tintColor="#FF9500" style={{ width: 18, height: 18 }} />
            <Text style={{ fontSize: 15, fontWeight: "800", color: adaptiveColors.label }}>{unworn.length} {unworn.length === 1 ? "piece" : "pieces"} never worn</Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: "600", color: adaptiveColors.secondaryLabel, lineHeight: 19 }}>{currency(unwornValue)} sitting idle. Style them next, or sell, swap, or donate.</Text>
        </View>
      )}
    </Screen>
  );
}

function Donut({ size, segments }: { size: number; segments: Array<{ value: number; color: string }> }) {
  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  let offset = 0;

  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(0,0,0,0.05)" strokeWidth={strokeWidth} fill="none" />
      {segments.filter((s) => s.value > 0).map((segment, index) => {
        const dash = (segment.value / total) * circumference;
        const element = (
          <Circle
            key={index}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={segment.color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
        offset += dash;
        return element;
      })}
    </Svg>
  );
}
