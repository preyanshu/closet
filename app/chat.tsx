import { adaptiveColors, radius, GlassButton, GlassLayer, ItemImage, ModalHeader } from "@/components/ui";
import type { Outfit } from "@/data/mock";
import { decideRetryDirection } from "@/services/decision";
import { CHAT_SYSTEM, type AgentProgressEvent } from "@/services/stylist-agent";
import { chatWithAlta, type Occasion } from "@/services/outfit-engine";
import { useCloset } from "@/state/closet-context";
import { useWeather } from "@/state/use-weather";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { useState, useRef, useEffect } from "react";
import {
  ActivityIndicator,
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  type ScrollViewInstance,
} from "react-native";

type ChatStep = {
  id: string;
  label: string;
  detail?: string;
  summary?: string;
  state: "running" | "done";
};

type ChatMessage = {
  id: string;
  role: "user" | "alta";
  text: string;
  outfits?: Outfit[];
  steps?: ChatStep[];
  streaming?: boolean;
  kind?: "text" | "error";
  originalPrompt?: string;
  rejected?: string[];
  failedRetry?: boolean;
};

const quickReplies = ["Dinner out", "Date night", "Casual hangout", "Work event"];

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const rejectedRef = useRef<Array<{ label: string; itemIds: string[] }>>([]);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const { items, favoriteIds, savedLooks, toggleSavedLook, profile } = useCloset();
  const { weather } = useWeather();

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: false });
  }, [messages, busy]);

  const history = () =>
    messages
      .filter((m) => m.text || m.outfits?.length)
      .map((m) => ({
        role: m.role === "alta" ? "assistant" : "user",
        content: m.outfits?.length
          ? `${m.text}\nOutfits proposed: ${m.outfits.map((o) => `${o.label} (${o.itemIds.join(",")})`).join("; ")}`
          : m.text,
      }));

  const beginDraft = (originalPrompt: string) => {
    const draftId = `${Date.now()}-a`;
    let pending = "";
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      if (!pending) return;
      const chunk = pending;
      pending = "";
      setMessages((prev) => prev.map((m) => (m.id === draftId ? { ...m, text: m.text + chunk } : m)));
    };
    const stop = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      flush();
    };

    setMessages((prev) => [...prev, { id: draftId, role: "alta", text: "", steps: [], streaming: true, originalPrompt }]);

    const onEvent = (event: AgentProgressEvent) => {
      if (event.type === "text_delta") {
        pending += event.text;
        if (!timer) {
          timer = setTimeout(() => { timer = null; flush(); }, 40);
        }
        return;
      }
      if (event.type === "tool_call") {
        const step: ChatStep = {
          id: `${draftId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          label: event.label,
          detail: event.detail,
          state: "running",
        };
        setMessages((prev) => prev.map((m) => (m.id === draftId ? { ...m, steps: [...(m.steps ?? []), step] } : m)));
        return;
      }
      setMessages((prev) => prev.map((m) => {
        if (m.id !== draftId) return m;
        const steps = [...(m.steps ?? [])];
        for (let i = steps.length - 1; i >= 0; i -= 1) {
          if (steps[i].state === "running") {
            steps[i] = { ...steps[i], state: "done", summary: event.summary };
            break;
          }
        }
        return { ...m, steps };
      }));
    };

    const complete = (result: { reply: string; outfits: Outfit[] }) => {
      stop();
      setMessages((prev) => prev.map((m) => (m.id === draftId ? {
        ...m,
        text: result.reply,
        outfits: result.outfits.length > 0 ? result.outfits : undefined,
        streaming: false,
      } : m)));
    };

    const fail = () => {
      stop();
      setMessages((prev) => prev.map((m) => (m.id === draftId ? { ...m, text: "", steps: [], kind: "error", streaming: false } : m)));
    };

    return { onEvent, complete, fail };
  };

  const send = async (text?: string) => {
    const body = (text ?? input).trim();
    if (!body || busy) return;

    const userMsg: ChatMessage = { id: `${Date.now()}-u`, role: "user", text: body };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    rejectedRef.current = [];
    setRejected([]);

    const draft = beginDraft(body);
    setBusy(true);
    try {
      const result = await chatWithAlta(
        { occasion: pickOccasion(body), count: 3 },
        items,
        {
          favoriteIds: [...favoriteIds],
          savedLooks,
          userRequest: body,
          system: CHAT_SYSTEM,
          history: history(),
          weather: weather ?? undefined,
          presentation: profile.presentation,
          onEvent: draft.onEvent,
        },
      );

      if (!result.reply && result.outfits.length === 0) throw new Error("Empty reply");
      draft.complete(result);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      draft.fail();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  };

  const retryAnswer = async (originalPrompt: string) => {
    if (busy || !originalPrompt) return;
    const draft = beginDraft(originalPrompt);
    setBusy(true);
    try {
      const result = await chatWithAlta(
        { occasion: pickOccasion(originalPrompt), count: 3 },
        items,
        {
          favoriteIds: [...favoriteIds],
          savedLooks,
          userRequest: originalPrompt,
          system: CHAT_SYSTEM,
          history: history(),
          weather: weather ?? undefined,
          presentation: profile.presentation,
          onEvent: draft.onEvent,
        },
      );
      if (!result.reply && result.outfits.length === 0) throw new Error("Empty reply");
      draft.complete(result);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      draft.fail();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  };

  const retry = async (originalPrompt: string) => {
    if (busy || !originalPrompt) return;
    const draft = beginDraft(originalPrompt);
    setBusy(true);
    try {
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

      const result = await chatWithAlta(
        { occasion: pickOccasion(originalPrompt), count: 3 },
        items,
        {
          favoriteIds: [...favoriteIds],
          savedLooks,
          userRequest: `${originalPrompt}\n${seed}\nThe user explicitly wants a fresh set of outfit options now.`,
          system: `${CHAT_SYSTEM}\n\nFor this turn the user explicitly wants another set of outfit options — include outfit cards using the <<<OUTFITS>>> marker.`,
          history: history(),
          weather: weather ?? undefined,
          presentation: profile.presentation,
          onEvent: draft.onEvent,
        },
      );

      if (result.outfits.length === 0) throw new Error("No new outfits");
      draft.complete(result);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRejected([]);
    } catch {
      draft.fail();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
        <ModalHeader title="Ask Alta" subtitle="Ask anything about your wardrobe." />
      </View>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 20, paddingBottom: 12, gap: 14 }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 && (
          <View style={{ gap: 8, paddingTop: 4 }}>
            <Text style={{ fontSize: 24, lineHeight: 29, fontWeight: "800", letterSpacing: -0.6, color: adaptiveColors.label }}>What are we wearing?</Text>
            <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "500", color: adaptiveColors.secondaryLabel }}>Ask about a piece, an occasion, or what your closet is missing.</Text>
          </View>
        )}
        {messages.map((msg) => (
          <View key={msg.id} style={{ gap: 8 }}>
            {msg.steps?.length ? <ActivityFeed steps={msg.steps} /> : null}
            {msg.streaming && !msg.text && !msg.steps?.length ? <ThinkingRow /> : null}
            {msg.text ? <Bubble role={msg.role} text={msg.streaming ? `${msg.text}▍` : msg.text} /> : null}
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
                accessibilityRole="button"
                accessibilityLabel="Retry"
                onPress={() => retryAnswer(msg.originalPrompt ?? "")}
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
      </ScrollView>

      {messages.length === 0 && !busy && (
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

function ActivityFeed({ steps }: { steps: ChatStep[] }) {
  return (
    <View style={{ alignSelf: "flex-start", gap: 6, paddingLeft: 2 }}>
      {steps.map((step) => (
        <View key={step.id} style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          {step.state === "running"
            ? <ActivityIndicator size="small" color={adaptiveColors.tertiaryLabel} />
            : <SymbolView name="checkmark.circle.fill" tintColor={adaptiveColors.tertiaryLabel} style={{ width: 13, height: 13 }} />}
          <Text style={{ fontSize: 12, fontWeight: "600", color: adaptiveColors.secondaryLabel }}>
            {step.label}
            {step.detail ? ` · ${step.detail}` : ""}
            {step.summary ? ` — ${step.summary}` : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ThinkingRow() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start" }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: adaptiveColors.surfaceMuted, alignItems: "center", justifyContent: "center" }}>
        <SymbolView name="sparkles" tintColor={adaptiveColors.tertiaryLabel} style={{ width: 15, height: 15 }} />
      </View>
      <Text style={{ fontSize: 13, fontWeight: "600", color: adaptiveColors.secondaryLabel }}>Thinking…</Text>
    </View>
  );
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
