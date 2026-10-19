import { adaptiveColors, radius, GlassButton, GlassLayer, ItemImage, ModalHeader } from "@/components/ui";
import type { Outfit } from "@/data/mock";
import { parseStylingPrompt, shouldAskToNarrowDown, decideRetryDirection } from "@/services/decision";
import { CHAT_SYSTEM } from "@/services/stylist-agent";
import { composeOutfitsAI, type Occasion } from "@/services/outfit-engine";
import { useCloset } from "@/state/closet-context";
import { useWeather } from "@/state/use-weather";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";

type ChatMessage = {
  id: string;
  role: "user" | "alta";
  text: string;
  outfits?: Outfit[];
  kind?: "text" | "narrow" | "error";
  originalPrompt?: string;
  rejected?: string[];
  failedRetry?: boolean;
};

const initialMessages: ChatMessage[] = [
  {
    id: "1",
    role: "alta",
    text: "Hey! I'm Alta, your personal stylist. What's the occasion tonight?",
  },
];

const quickReplies = ["Dinner out", "Date night", "Casual hangout", "Work event"];

const TRIVIAL_REPLY =
  "I'm all about outfits — tell me where you're headed and how dressy you want to be, and I'll pull looks straight from your closet.";

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const rejectedRef = useRef<Array<{ label: string; itemIds: string[] }>>([]);
  const retryCountRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const { items, favoriteIds, savedLooks, toggleSavedLook } = useCloset();
  const { weather } = useWeather();

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: false });
  }, [messages, busy]);

  const history = () =>
    messages
      .filter((m) => m.text)
      .map((m) => ({
        role: m.role === "alta" ? "assistant" : "user",
        content: m.outfits?.length
          ? `${m.text}\nOutfits proposed: ${m.outfits.map((o) => `${o.label} (${o.itemIds.join(",")})`).join("; ")}`
          : m.text,
      }));

  const send = async (text?: string) => {
    const body = (text ?? input).trim();
    if (!body || busy) return;

    const userMsg: ChatMessage = { id: `${Date.now()}-u`, role: "user", text: body };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    rejectedRef.current = [];
    retryCountRef.current = 0;
    setRejected([]);

    setBusy(true);
    try {
      // Trivial-chat gate: one cheap Clef call decides chit-chat vs styling.
      let isStyling = true;
      try {
        const parsed = await parseStylingPrompt(body);
        isStyling = parsed.isStylingRequest;
      } catch {
        isStyling = true; // gate unavailable → treat as styling
      }

      if (!isStyling) {
        setMessages((prev) => [...prev, { id: `${Date.now()}-a`, role: "alta", text: TRIVIAL_REPLY, originalPrompt: body }]);
        return;
      }

      const result = await composeOutfitsAI(
        {
          occasion: pickOccasion(body),
          count: 2,
        },
        items,
        {
          favoriteIds: [...favoriteIds],
          savedLooks,
          userRequest: body,
          system: CHAT_SYSTEM,
          history: history(),
          weather: weather ?? undefined,
        },
      );

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-a`,
          role: "alta",
          text: result.reply ?? "Here's what I'd pull from your closet.",
          outfits: result.outfits,
          originalPrompt: body,
        },
      ]);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-e`,
          role: "alta",
          text: "Styling hiccup — I couldn't reach the stylist just now.",
          kind: "error",
          originalPrompt: body,
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const retry = async (originalPrompt: string) => {
    if (busy || !originalPrompt) return;
    setBusy(true);
    try {
      // Courtesy gate: after a few try-agains, ask instead of burning sessions.
      const shouldNarrow = await shouldAskToNarrowDown(retryCountRef.current, originalPrompt).catch(() => retryCountRef.current >= 3);
      if (shouldNarrow) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-n`,
            role: "alta",
            text: "Before I try again — can you narrow it down a little? Occasion, vibe, or how dressy you're feeling.",
            kind: "narrow",
          },
        ]);
        return;
      }

      let direction: string | undefined;
      if (rejectedRef.current.length > 0) {
        direction = await decideRetryDirection(
          rejectedRef.current.map((entry) => entry.label),
          rejectedRef.current.map((entry) => entry.itemIds),
          originalPrompt,
        ).catch(() => undefined);
      }

      const seed = [
        rejectedRef.current.length
          ? `I rejected these: ${rejectedRef.current.map((entry) => `${entry.label} (${entry.itemIds.join(",")})`).join("; ")}.`
          : "I want another option.",
        direction ? `Propose VISIBLY DIFFERENT outfits, pushing in this direction: ${direction}.` : "",
      ].filter(Boolean).join(" ");

      const result = await composeOutfitsAI(
        { occasion: pickOccasion(originalPrompt), count: 2 },
        items,
        {
          favoriteIds: [...favoriteIds],
          savedLooks,
          userRequest: `${originalPrompt}\n${seed}`,
          system: CHAT_SYSTEM,
          history: history(),
          weather: weather ?? undefined,
        },
      );

      retryCountRef.current += 1;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRejected([]);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-a`,
          role: "alta",
          text: result.reply ?? "Fair — try these instead.",
          outfits: result.outfits,
          originalPrompt,
        },
      ]);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-e`,
          role: "alta",
          text: "Styling hiccup — I couldn't reach the stylist just now.",
          kind: "error",
          originalPrompt,
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const markRejected = (messageId: string, outfit: Outfit) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    rejectedRef.current = [
      ...rejectedRef.current.filter((entry) => entry.label !== outfit.label),
      { label: outfit.label, itemIds: outfit.itemIds },
    ];
    setRejected((prev) => [...prev, `${messageId}:${outfit.id}`]);
  };

  const lastPrompt = [...messages].reverse().find((m) => m.originalPrompt && m.role === "alta")?.originalPrompt;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: adaptiveColors.canvas }}
    >
      <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
        <ModalHeader title="Ask Alta" subtitle="Get help styling your closet." />
      </View>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 20, paddingBottom: 12, gap: 14 }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((msg) => (
          <View key={msg.id} style={{ gap: 8 }}>
            <Bubble role={msg.role} text={msg.text} />
            {msg.outfits?.map((outfit) => (
              <OutfitCard
                key={outfit.id}
                outfit={outfit}
                itemIdOrder={outfit.itemIds}
                rejected={rejected.includes(`${msg.id}:${outfit.id}`)}
                onSave={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  toggleSavedLook(outfit.id, outfit);
                }}
                onReject={() => markRejected(msg.id, outfit)}
              />
            ))}
            {msg.outfits?.length ? (
              <Pressable
                onPress={() => retry(msg.originalPrompt ?? lastPrompt ?? "")}
                disabled={busy}
                style={{
                  alignSelf: "flex-start",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: radius.pill,
                  backgroundColor: "rgba(0,0,0,0.04)",
                  borderWidth: 1,
                  borderColor: adaptiveColors.border,
                  opacity: busy ? 0.5 : 1,
                }}
              >
                <SymbolView name="arrow.clockwise" tintColor="rgba(0,0,0,0.5)" style={{ width: 13, height: 13 }} />
                <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(0,0,0,0.58)" }}>
                  {rejected.length > 0 ? "Try something different" : "Try again"}
                </Text>
              </Pressable>
            ) : null}
            {msg.kind === "error" && msg.originalPrompt ? (
              <Pressable
                onPress={() => retry(msg.originalPrompt ?? "")}
                disabled={busy}
                style={{
                  alignSelf: "flex-start",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: radius.pill,
                  backgroundColor: "rgba(0,0,0,0.72)",
                  opacity: busy ? 0.5 : 1,
                }}
              >
                <SymbolView name="arrow.clockwise" tintColor="#fff" style={{ width: 13, height: 13 }} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#fff" }}>Retry</Text>
              </Pressable>
            ) : null}
          </View>
        ))}

        {busy && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start" }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(0,0,0,0.05)", alignItems: "center", justifyContent: "center" }}>
              <SymbolView name="sparkles" tintColor="rgba(0,0,0,0.45)" style={{ width: 15, height: 15 }} />
            </View>
            <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(0,0,0,0.4)" }}>Styling…</Text>
          </View>
        )}
      </ScrollView>

      {messages.length <= 2 && !busy && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 20, paddingBottom: 10 }}>
          {quickReplies.map((reply) => (
            <Pressable
              key={reply}
              onPress={() => send(reply)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: radius.pill,
                backgroundColor: "rgba(0,0,0,0.04)",
                borderWidth: 1,
                borderColor: adaptiveColors.border,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(0,0,0,0.58)" }}>{reply}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: "rgba(0,0,0,0.06)",
          backgroundColor: adaptiveColors.canvas,
        }}
      >
        <TextInput
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => send()}
          returnKeyType="send"
          placeholder="Ask Alta anything..."
          placeholderTextColor="rgba(0,0,0,0.3)"
          style={{
            flex: 1,
            fontSize: 15,
            fontWeight: "500",
            color: adaptiveColors.label,
            backgroundColor: "rgba(0,0,0,0.03)",
            borderRadius: radius.pill,
            paddingHorizontal: 18,
            paddingVertical: 12,
            borderWidth: 1,
            borderColor: adaptiveColors.border,
          }}
        />
        <SendButton onPress={() => send()} disabled={!input.trim() || busy} />
      </View>
    </KeyboardAvoidingView>
  );
}

function pickOccasion(text: string): Occasion {
  const lower = text.toLowerCase();
  if (lower.includes("work") || lower.includes("present") || lower.includes("office")) return "work";
  if (lower.includes("dinner") || lower.includes("date") || lower.includes("restaurant")) return "dinner";
  if (lower.includes("formal") || lower.includes("wedding") || lower.includes("gala")) return "formal";
  if (lower.includes("evening") || lower.includes("cocktail") || lower.includes("party")) return "evening";
  if (lower.includes("travel") || lower.includes("flight") || lower.includes("trip")) return "travel";
  if (lower.includes("casual") || lower.includes("hangout") || lower.includes("errand")) return "casual";
  return "everyday";
}

function Bubble({ role, text }: { role: "user" | "alta"; text: string }) {
  const isAlta = role === "alta";

  return (
    <View style={{ maxWidth: "82%", alignSelf: isAlta ? "flex-start" : "flex-end" }}>
      {isAlta && (
        <Text style={{ fontSize: 11, fontWeight: "700", color: "rgba(0,0,0,0.3)", marginBottom: 4, marginLeft: 4 }}>
          ALTA
        </Text>
      )}
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 20,
          borderBottomRightRadius: isAlta ? 20 : 6,
          borderBottomLeftRadius: isAlta ? 6 : 20,
          backgroundColor: isAlta ? "rgba(0,0,0,0.04)" : adaptiveColors.label,
          overflow: "hidden",
        }}
      >
        {isAlta && <GlassLayer />}
        <Text
          style={{
            fontSize: 15,
            lineHeight: 21,
            fontWeight: "500",
            color: isAlta ? adaptiveColors.label : adaptiveColors.onAccent,
          }}
        >
          {text}
        </Text>
      </View>
    </View>
  );
}

function OutfitCard({
  outfit,
  itemIdOrder,
  rejected,
  onSave,
  onReject,
}: {
  outfit: Outfit;
  itemIdOrder: string[];
  rejected: boolean;
  onSave: () => void;
  onReject: () => void;
}) {
  const { items, isSavedLook } = useCloset();
  const outfitItems = itemIdOrder
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 4);
  const saved = isSavedLook(outfit.id);

  return (
    <View
      style={{
        alignSelf: "flex-start",
        width: "92%",
        borderRadius: 18,
        backgroundColor: rejected ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.72)",
        borderWidth: 1,
        borderColor: rejected ? "rgba(0,0,0,0.08)" : adaptiveColors.border,
        padding: 14,
        gap: 10,
        opacity: rejected ? 0.55 : 1,
      }}
    >
      <GlassLayer />
      <View style={{ flexDirection: "row", gap: 8 }}>
        {outfitItems.map((item) => (
          <View key={item.id} style={{ width: 56 }}>
            <ItemImage imageUrl={item.displayAssetUri} label={item.name} size="small" />
          </View>
        ))}
      </View>
      <View style={{ gap: 3 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: adaptiveColors.label }}>
          {rejected ? "Not this one" : outfit.label}
        </Text>
        <Text numberOfLines={2} style={{ fontSize: 12, lineHeight: 16, fontWeight: "500", color: "rgba(0,0,0,0.5)" }}>
          {outfit.description}
        </Text>
      </View>
      {!rejected && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <GlassButton
            icon={saved ? "heart.fill" : "heart"}
            label={saved ? "Saved" : "Save"}
            tintColor={saved ? "#FF3B30" : "rgba(0,0,0,0.6)"}
            onPress={onSave}
            size={36}
          />
          <GlassButton icon="xmark" label="Not this" onPress={onReject} size={36} />
        </View>
      )}
      {rejected && (
        <Text style={{ fontSize: 12, fontWeight: "600", color: "rgba(0,0,0,0.4)" }}>Noted — hit Try again for a new take.</Text>
      )}
    </View>
  );
}

function SendButton({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  return <GlassButton icon="arrow.up" label="Send message" onPress={onPress} disabled={disabled} variant="dark" />;
}
