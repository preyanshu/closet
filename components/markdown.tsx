import { closeOpenMarkers, parseBlocks } from "@/components/markdown-parse";
import { adaptiveColors } from "@/components/ui";
import { Fragment, memo, type ReactNode } from "react";
import { Linking, Text, View, type ColorValue, type TextStyle } from "react-native";

/**
 * Small dependency-free markdown renderer for chat. Tolerant of half-written
 * text so it can render every streamed chunk without flashing raw markers.
 */

const INLINE = /(\*\*([^*]+?)\*\*|__([^_]+?)__|~~([^~]+?)~~|`([^`]+?)`|\[([^\]]+?)\]\(([^)\s]+)\)|\*([^*\s][^*]*?)\*|(?<![A-Za-z0-9])_([^_\s][^_]*?)_(?![A-Za-z0-9]))/g;

function renderInline(text: string, base: TextStyle, keyPrefix = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const key = `${keyPrefix}-${k++}`;
    if (m[2] !== undefined || m[3] !== undefined) {
      out.push(<Text key={key} style={{ fontWeight: "700" }}>{renderInline(m[2] ?? m[3], base, key)}</Text>);
    } else if (m[4] !== undefined) {
      out.push(<Text key={key} style={{ textDecorationLine: "line-through" }}>{m[4]}</Text>);
    } else if (m[5] !== undefined) {
      out.push(
        <Text key={key} style={{ fontFamily: "Menlo", fontSize: (base.fontSize ?? 15) - 1, backgroundColor: adaptiveColors.surfaceMuted }}>
          {` ${m[5]} `}
        </Text>,
      );
    } else if (m[6] !== undefined) {
      const url = m[7];
      out.push(
        <Text
          key={key}
          accessibilityRole="link"
          onPress={() => { if (/^(https?:|mailto:)/i.test(url)) Linking.openURL(url).catch(() => undefined); }}
          style={{ color: adaptiveColors.accent, textDecorationLine: "underline" }}
        >
          {m[6]}
        </Text>,
      );
    } else {
      out.push(<Text key={key} style={{ fontStyle: "italic" }}>{renderInline(m[8] ?? m[9], base, key)}</Text>);
    }
    last = idx + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const HEADING_SIZE = [0, 20, 18, 16.5, 15.5, 15, 15];

type Props = { text: string; color?: ColorValue; fontSize?: number; streaming?: boolean };

function MarkdownImpl({ text, color = adaptiveColors.label, fontSize = 15.5, streaming }: Props) {
  const blocks = parseBlocks(streaming ? closeOpenMarkers(text) : text);
  const base: TextStyle = { fontSize, lineHeight: Math.round(fontSize * 1.5), color, fontWeight: "400" };
  const cursor = streaming ? <Text style={{ color: adaptiveColors.tertiaryLabel }}>{" ●"}</Text> : null;
  const lastIndex = blocks.length - 1;
  const tail = (i: number) => (i === lastIndex ? cursor : null);

  return (
    <View style={{ gap: 10 }}>
      {blocks.map((block, i) => {
        const key = `b${i}`;
        switch (block.type) {
          case "p":
            return <Text key={key} style={base}>{renderInline(block.text, base, key)}{tail(i)}</Text>;
          case "h":
            return (
              <Text key={key} style={{ ...base, fontSize: HEADING_SIZE[block.level], lineHeight: Math.round(HEADING_SIZE[block.level] * 1.35), fontWeight: "700", letterSpacing: -0.2, marginTop: i === 0 ? 0 : 4 }}>
                {renderInline(block.text, base, key)}{tail(i)}
              </Text>
            );
          case "ul":
          case "ol":
            return (
              <View key={key} style={{ gap: 5 }}>
                {block.items.map((item, j) => (
                  <View key={`${key}-${j}`} style={{ flexDirection: "row", gap: 8, paddingLeft: item.depth * 16 }}>
                    <Text style={{ ...base, width: block.type === "ol" ? 20 : 12, color: adaptiveColors.secondaryLabel, textAlign: block.type === "ol" ? "right" : "center", fontWeight: block.type === "ol" ? "600" : "400" }}>
                      {block.type === "ol" ? `${item.n ?? j + 1}.` : item.depth > 0 ? "◦" : "•"}
                    </Text>
                    <Text style={{ ...base, flex: 1 }}>
                      {renderInline(item.text, base, `${key}-${j}`)}
                      {i === lastIndex && j === block.items.length - 1 ? cursor : null}
                    </Text>
                  </View>
                ))}
              </View>
            );
          case "quote":
            return (
              <View key={key} style={{ borderLeftWidth: 3, borderLeftColor: adaptiveColors.accent, paddingLeft: 12 }}>
                <Text style={{ ...base, color: adaptiveColors.secondaryLabel, fontStyle: "italic" }}>
                  {renderInline(block.text, base, key)}{tail(i)}
                </Text>
              </View>
            );
          case "code":
            return (
              <View key={key} style={{ backgroundColor: adaptiveColors.surfaceMuted, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: adaptiveColors.border }}>
                <Text selectable style={{ fontFamily: "Menlo", fontSize: fontSize - 2, lineHeight: Math.round((fontSize - 2) * 1.45), color }}>
                  {block.text}{tail(i)}
                </Text>
              </View>
            );
          case "hr":
            return <View key={key} style={{ height: 1, backgroundColor: adaptiveColors.border, marginVertical: 4 }} />;
          default:
            return <Fragment key={key} />;
        }
      })}
      {blocks.length === 0 && cursor ? <Text style={base}>{cursor}</Text> : null}
    </View>
  );
}

export const Markdown = memo(MarkdownImpl);
