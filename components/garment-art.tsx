import { ItemImage } from "@/components/ui";
import type { ClothingCategory, ClothingItem } from "@/data/mock";
import { useId } from "react";
import { View } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";

const fabricColors: Record<string, string> = {
  white: "#F6F5EE", ivory: "#EAE4D5", cream: "#E8DFC9", black: "#303331",
  charcoal: "#545653", blue: "#7593AC", camel: "#BC9064", brown: "#805C41", gray: "#A4A6A1",
};

/** Category-correct illustrations for the demo wardrobe; uploaded garments use their actual photo. */
export function GarmentArt({ item, category, empty = false }: { item?: ClothingItem; category: ClothingCategory; empty?: boolean }) {
  const id = useId().replace(/:/g, "");
  if (item && !item.imageUrl.startsWith("@/assets/item-")) {
    return <ItemImage imageUrl={item.imageUrl} label={item.name} contentFit="contain" style={{ width: "100%", height: "100%", aspectRatio: undefined, borderWidth: 0, backgroundColor: "transparent", borderRadius: 0 }} />;
  }
  const color = fabricColors[item?.color ?? "cream"] ?? "#B8B3A4";
  const name = item?.name.toLowerCase() ?? "";
  const tank = name.includes("tank");
  const skirt = name.includes("skirt");
  const dress = name.includes("dress");
  const pearl = name.includes("pearl");
  const belt = name.includes("belt");
  const ink = "#1F2925";
  const fill = empty ? "none" : `url(#${id})`;
  return <View pointerEvents="none" style={{ width: "100%", height: "100%", opacity: empty ? 0.22 : 1 }}>
    <Svg width="100%" height="100%" viewBox="0 0 160 180">
      <Defs><LinearGradient id={id} x1="0" y1="0" x2="1" y2="0.8"><Stop offset="0" stopColor={color} /><Stop offset="0.5" stopColor={color} /><Stop offset="1" stopColor={ink} stopOpacity={0.48} /></LinearGradient></Defs>
      <G fill={fill} stroke={ink} strokeOpacity={empty ? 0.6 : 0.22} strokeWidth={1.2} strokeLinejoin="round">
        {category === "top" && (tank ? <>
          <Path d="M49 15H62Q61 48 80 48Q99 48 98 15H111L116 70 124 162Q80 171 36 162L44 70Z" />
          <Path d="M52 18 49 71 42 158M107 18 111 71 118 158M63 19Q61 52 80 52Q99 52 97 19" fill="none" />
          {Array.from({ length: 10 }, (_, i) => <Path key={i} d={`M${49 + i * 7} 70V157`} strokeOpacity={0.1} />)}
        </> : <>
          <Path d="M54 17 30 29 7 87 30 97 46 62 42 159Q80 169 118 159L114 62 130 97 153 87 130 29 106 17 80 26Z" />
          <Path d="M54 17 66 42 80 27 94 42 106 17M80 29V161M44 147Q80 155 116 147M15 77 34 86M125 86 145 77" fill="none" />
          {[53, 74, 95, 116, 137].map((y) => <Circle key={y} cx={83} cy={y} r={1.5} fill={ink} stroke="none" opacity={0.5} />)}
          <Path d="M94 54H110V73Q102 81 94 73Z" fill="none" />
        </>)}
        {category === "bottom" && (skirt || dress ? <>
          <Path d={dress ? "M60 7H69L72 32H88L91 7H100L105 62 136 167Q80 178 24 167L55 62Z" : "M48 12H112L140 163Q80 177 20 163Z"} />
          <Path d="M49 22H111M57 37 43 160M72 37 66 169M88 37 94 169M102 37 118 160" fill="none" strokeOpacity={0.15} />
        </> : <>
          <Path d="M43 8Q80 13 117 8L125 170 87 174 80 68 73 174 35 170Z" />
          <Path d="M44 20Q80 24 116 20M80 22V61M47 24Q48 48 39 51M112 24Q112 48 121 51M57 52 53 162M103 52 107 162M36 161 73 166M87 166 124 161" fill="none" />
          <Path d="M54 11V25M106 11V25" strokeWidth={3} fill="none" /><Circle cx={85} cy={17} r={2} fill={ink} stroke="none" />
        </>)}
        {category === "outerwear" && <>
          <Path d="M53 13 28 25 7 112 27 120 43 63 35 169H125L117 63 133 120 153 112 132 25 107 13 80 29Z" />
          <Path d="M53 13 49 48 65 55 80 91 95 55 111 48 107 13M80 30V168M46 120 66 116M95 116 115 120" fill="none" />
          <Path d="M54 15 80 30 68 68 57 46 63 40ZM106 15 80 30 92 68 103 46 97 40Z" fill={color} />
          {[100, 124, 148].map((y) => <Circle key={y} cx={86} cy={y} r={2.6} fill={ink} stroke="none" opacity={0.7} />)}
        </>}
        {category === "shoes" && <G transform="translate(0 -23)">
          <Path d="M23 73Q36 87 49 69L62 105 116 122Q138 126 141 143L139 153H20Q12 148 16 131Z" />
          <Path d="M19 142H140L139 153H20Q13 149 19 142Z" fill={empty ? "none" : "#E2DECF"} />
          <Path d="M58 106 42 114M68 111 52 121M78 115 62 127M22 79 19 124M95 121Q84 138 88 142" fill="none" strokeWidth={2} />
          <Path d="M55 49Q65 59 77 47L88 80 136 97Q150 102 151 116H124L103 106 71 97 56 76Z" />
          <Path d="M88 79 75 86M96 84 85 92M104 88 95 97" fill="none" strokeWidth={2} />
        </G>}
        {category === "accessory" && (pearl ? <>
          <Circle cx={53} cy={84} r={23} fill={empty ? "none" : "#F2EAD8"} /><Circle cx={107} cy={102} r={23} fill={empty ? "none" : "#E5DBC6"} />
          <Ellipse cx={47} cy={76} rx={8} ry={6} fill="white" stroke="none" opacity={0.7} /><Ellipse cx={101} cy={94} rx={8} ry={6} fill="white" stroke="none" opacity={0.7} />
        </> : belt ? <>
          <Path d="M17 64Q78 29 139 65L137 96Q80 67 19 96Z" /><Rect x={62} y={65} width={38} height={29} rx={4} fill="none" stroke="#B59C60" strokeWidth={5} /><Path d="M82 68V90H101" stroke="#B59C60" strokeWidth={3} fill="none" />
        </> : <>
          <Path d="M46 73V49Q46 16 80 16Q114 16 114 49V73" fill="none" stroke={empty ? ink : color} strokeWidth={10} />
          <Path d="M30 63Q80 54 130 63L141 149Q80 166 19 149Z" /><Path d="M32 74Q80 66 128 74M24 136Q80 152 137 136" fill="none" /><Rect x={69} y={89} width={22} height={14} rx={3} fill={empty ? "none" : "#B59C60"} stroke="none" />
        </>)}
      </G>
    </Svg>
  </View>;
}
