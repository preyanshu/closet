import { Markdown } from "@/components/markdown";
import { adaptiveColors, radius, ItemImage, ModalHeader } from "@/components/ui";
import { ErrorNotice } from "@/components/error-notice";
import { WardrobeApiError, errorMessage } from "@/services/api/wardrobe-api";
import type { Outfit } from "@/data/mock";
import { decideRetryDirection } from "@/services/decision";
import { dedupeParagraphs, dropRepeatedText, isRepeat } from "@/services/chat-text";
import { avoidNote, blockedLooks, dislikeLook, loadLookMemory, rememberLooks } from "@/services/look-memory";
import { CHAT_SYSTEM, sanitizeChatText, stripInternalTokens, type AgentProgressEvent } from "@/services/stylist-agent";
import { chatWithAlta, type Occasion } from "@/services/outfit-engine";
import { useCloset } from "@/state/closet-context";
import { useWeather } from "@/state/use-weather";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import Reanimated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useState, useRef, useEffect, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  type ColorValue,
  type PressableProps,
  type ViewStyle,
  type ScrollViewInstance,
} from "react-native";

type ChatPart =
  | { kind: "text"; id: string; text: string }
  | { kind: "tool"; id: string; name: string; label: string; detail?: string; summary?: string; state: "running" | "done" };

type ChatMessage = {
  id: string;
  role: "user" | "alta";
  /** Plain text of the message (all text parts joined), used for history. */
  text: string;
  /** Ordered timeline for Alta messages: text and tool calls exactly as they happened. */
  parts?: ChatPart[];
  outfits?: Outfit[];
  streaming?: boolean;
  thinking?: boolean;
  kind?: "text" | "error";
  errorDetail?: string;
  errorKind?: string;
  originalPrompt?: string;
};

const suggestions = [
  "What should I wear to dinner tonight?",
  "Style me for a casual weekend hangout",
  "Put together a look for a work event",
  "What is my closet missing?",
];

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const rejectedRef = useRef<Array<{ label: string; itemIds: string[] }>>([]);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const { items, favoriteIds, savedLooks, toggleSavedLook, isSavedLook, setAddedMessage, profile } = useCloset();
  const { weather } = useWeather();

  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // This screen is a sheet that starts well below the top of the display, which
  // KeyboardAvoidingView miscounts (the input ends up under the keyboard). Track
  // the real keyboard height instead and pad the composer by exactly that.
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const move = (height: number, duration?: number) => {
      LayoutAnimation.configureNext({ duration: duration ?? 250, update: { type: "keyboard" } });
      setKeyboardHeight(height);
      if (height > 0) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 30);
    };
    const show = Keyboard.addListener("keyboardWillShow", (e) => move(e.endCoordinates.height, e.duration));
    const hide = Keyboard.addListener("keyboardWillHide", (e) => move(0, e.duration));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const stickToBottom = useRef(true);
  const scrollToEnd = (animated = false) => {
    if (stickToBottom.current) scrollRef.current?.scrollToEnd({ animated });
  };

  useEffect(() => {
    if (busy) stickToBottom.current = true;
  }, [busy]);

  // Assistant turns stay plain prose. If they carried a "label (ids)" pattern the model
  // would imitate it as text instead of calling show_outfits.
  const history = () =>
    messages
      .filter((m) => m.kind !== "error" && m.text)
      .map((m) => ({ role: m.role === "alta" ? "assistant" : "user", content: m.text }));

  /** Looks already on screen, passed as private context on the next user turn. */
  const shownContext = () => {
    const shown = [...messages].reverse().find((m) => m.outfits?.length)?.outfits;
    if (!shown?.length) return "";
    return `\n\n[Private context, never quote or repeat it. Cards already shown to the user: ${shown.map((o) => `${o.label} = ${o.itemIds.join(" + ")}`).join(" | ")}]`;
  };

  /** Looks the user rejected in the past, as a private note (survives app restarts). */
  const dislikedNote = async () => avoidNote(blockedLooks(await loadLookMemory()), { hardOnly: true, passive: true });
  const contextNote = async () => shownContext() + (await dislikedNote());

  const beginDraft = (originalPrompt: string) => {
    const draftId = `${Date.now()}-a`;
    let pending = "";
    let seq = 0;
    let turnStarted = 0;
    let breakText = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const textOf = (parts: ChatPart[]) =>
      dropRepeatedText(parts.filter((p): p is Extract<ChatPart, { kind: "text" }> => p.kind === "text"), (p) => p.text)
        .map((p) => dedupeParagraphs(stripInternalTokens(p.text))).join("\n\n");

    const update = (fn: (parts: ChatPart[]) => ChatPart[], extra?: Partial<ChatMessage>) =>
      setMessages((prev) => prev.map((m) => {
        if (m.id !== draftId) return m;
        const parts = fn(m.parts ?? []);
        return { ...m, ...extra, parts, text: textOf(parts) };
      }));

    const flush = () => {
      if (!pending) return;
      const chunk = pending;
      pending = "";
      const newId = `${draftId}-t${seq++}`;
      const startNew = breakText;
      breakText = false;
      update((parts) => {
        const last = parts[parts.length - 1];
        if (last?.kind === "text" && !startNew) return [...parts.slice(0, -1), { ...last, text: last.text + chunk }];
        const lead = chunk.replace(/^\s+/, "");
        return lead ? [...parts, { kind: "text", id: newId, text: lead }] : parts;
      }, { thinking: false });
    };
    const flushNow = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      flush();
    };

    setMessages((prev) => [...prev, { id: draftId, role: "alta", text: "", parts: [], streaming: true, thinking: true, originalPrompt }]);

    const onEvent = (event: AgentProgressEvent) => {
      if (event.type === "text_delta") {
        pending += event.text.replace(/[ \t]*—[ \t]*/g, ", ");
        if (!timer) timer = setTimeout(() => { timer = null; flush(); }, 30);
        return;
      }
      if (event.type === "thinking") {
        flushNow();
        // Every model turn after the first gets its own text block.
        if (turnStarted++ > 0) breakText = true;
        update((parts) => parts, { thinking: true });
        return;
      }
      if (event.type === "discard_text") {
        // The agent is retrying this turn; drop the draft text it just streamed.
        flushNow();
        update((parts) => (parts[parts.length - 1]?.kind === "text" ? parts.slice(0, -1) : parts));
        return;
      }
      if (event.type === "tool_call") {
        flushNow();
        const part: ChatPart = { kind: "tool", id: `${draftId}-s${seq++}`, name: event.name, label: event.label, detail: event.detail, state: "running" };
        update((parts) => [...parts, part], { thinking: false });
        return;
      }
      flushNow();
      update((parts) => {
        const next = [...parts];
        for (let i = next.length - 1; i >= 0; i -= 1) {
          const part = next[i];
          if (part.kind === "tool" && part.state === "running") {
            next[i] = { ...part, state: "done", summary: event.summary };
            break;
          }
        }
        return next;
      }, { thinking: true });
    };

    const settleTools = (parts: ChatPart[]): ChatPart[] =>
      parts.map((part) => (part.kind === "tool" && part.state === "running" ? { ...part, state: "done" } : part));

    const complete = (result: { reply: string; outfits: Outfit[] }) => {
      flushNow();
      void rememberLooks(result.outfits, "shown");
      update((parts) => {
        // The streamed text is the source of truth. Only fall back to the final
        // reply if nothing streamed (non-streaming path).
        const hasText = parts.some((part) => part.kind === "text" && part.text.trim());
        const base: ChatPart[] = !hasText && result.reply.trim()
          ? [...parts, { kind: "text", id: `${draftId}-final`, text: sanitizeChatText(result.reply) }]
          : parts;
        return settleTools(base).map((part) =>
          part.kind === "text" && /\bscan-[A-Za-z0-9-]+/i.test(part.text) ? { ...part, text: sanitizeChatText(part.text) } : part);
      }, {
        outfits: result.outfits.length > 0 ? result.outfits : undefined,
        streaming: false,
        thinking: false,
      });
    };

    const fail = (error?: unknown) => {
      flushNow();
      const reason = errorMessage(error, "");
      const errorKind = error instanceof WardrobeApiError ? error.kind : undefined;
      update(settleTools, { errorDetail: reason || undefined, errorKind, kind: "error", streaming: false, thinking: false });
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
          userRequest: body + (await contextNote()),
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
    } catch (error) {
      draft.fail(error);
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
          userRequest: originalPrompt + (await contextNote()),
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
    } catch (error) {
      draft.fail(error);
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
          userRequest: `${originalPrompt}\n${seed}\nThe user explicitly wants a fresh set of outfit options now.${await contextNote()}`,
          system: `${CHAT_SYSTEM}\n\nFor this turn the user explicitly wants another set of outfit options. Write a short reply, then call show_outfits with structured looks.`,
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
    } catch (error) {
      draft.fail(error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  };

  const markRejected = (messageId: string, outfit: Outfit) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void dislikeLook(outfit);
    rejectedRef.current = [
      ...rejectedRef.current.filter((entry) => entry.label !== outfit.label),
      { label: outfit.label, itemIds: outfit.itemIds },
    ];
    setRejected((prev) => [...prev, `${messageId}:${outfit.id}`]);
  };

  const lastPrompt = [...messages].reverse().find((m) => m.originalPrompt && m.role === "alta")?.originalPrompt;

  const empty = messages.length === 0;
  const canSend = Boolean(input.trim()) && !busy;

  return (
    <KeyboardAvoidingView
      enabled={Platform.OS !== "ios"}
      behavior="height"
      style={{ flex: 1, backgroundColor: adaptiveColors.canvas }}
    >
      <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 }}>
        <ModalHeader title="Alta" />
      </View>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20, gap: 24, flexGrow: empty ? 1 : undefined }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={32}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          stickToBottom.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 80;
        }}
        onContentSizeChange={() => scrollToEnd(false)}
      >
        {empty && (
          <View style={{ flex: 1, justifyContent: "center", gap: 28, paddingBottom: 24 }}>
            <View style={{ gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: adaptiveColors.accentSoft, alignItems: "center", justifyContent: "center" }}>
                <SymbolView name="sparkles" tintColor={adaptiveColors.accent} style={{ width: 18, height: 18 }} />
              </View>
              <Text style={{ fontSize: 28, lineHeight: 33, fontWeight: "800", letterSpacing: -0.8, color: adaptiveColors.label }}>What are we wearing?</Text>
              <Text style={{ fontSize: 15, lineHeight: 21, color: adaptiveColors.secondaryLabel }}>Ask about a piece, an occasion, or what your closet is missing.</Text>
            </View>
            <View style={{ borderTopWidth: 1, borderTopColor: adaptiveColors.separator }}>
              {suggestions.map((text) => (
                <Tap
                  key={text}
                  accessibilityRole="button"
                  onPress={() => send(text)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 15,
                    borderBottomWidth: 1,
                    borderBottomColor: adaptiveColors.separator,
                  }}
                >
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: "500", color: adaptiveColors.label }}>{text}</Text>
                  <SymbolView name="arrow.up.right" tintColor={adaptiveColors.tertiaryLabel} style={{ width: 12, height: 12 }} />
                </Tap>
              ))}
            </View>
          </View>
        )}

        {messages.map((msg) => msg.role === "user" ? (
          <UserBubble key={msg.id} text={msg.text} />
        ) : (
          <View key={msg.id} style={{ gap: 14 }}>
            <Timeline parts={msg.parts} streaming={msg.streaming} thinking={msg.thinking} failed={msg.kind === "error"} />

            {msg.kind === "error" ? (
              <ErrorNotice
                kind={msg.errorKind}
                title={msg.errorKind ? undefined : "Couldn't get a reply"}
                message={msg.errorDetail ?? "Something went wrong. Try again."}
                onRetry={msg.originalPrompt ? () => retryAnswer(msg.originalPrompt ?? "") : undefined}
                busy={busy}
              />
            ) : null}

            {msg.outfits?.length ? (
              <View style={{ gap: 10 }}>
                {msg.outfits.map((outfit) => (
                  <OutfitCard
                    key={outfit.id}
                    outfit={outfit}
                    rejected={rejected.includes(`${msg.id}:${outfit.id}`)}
                    onSave={() => {
                      const wasSaved = isSavedLook(outfit.id);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      toggleSavedLook(outfit.id, outfit);
                      if (!wasSaved) setAddedMessage("Added to wardrobe");
                    }}
                    onReject={() => markRejected(msg.id, outfit)}
                  />
                ))}
                <Pill
                  icon="arrow.clockwise"
                  label={rejected.length > 0 ? "Try something different" : "Show other options"}
                  onPress={() => retry(msg.originalPrompt ?? lastPrompt ?? "")}
                  disabled={busy}
                />
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: keyboardHeight > 0 ? keyboardHeight + 10 : Math.max(insets.bottom, 12) + 10 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: 8,
            paddingLeft: 18,
            paddingRight: 6,
            paddingVertical: 6,
            borderRadius: 26,
            backgroundColor: adaptiveColors.surfaceRaised,
            borderWidth: 1,
            borderColor: adaptiveColors.border,
          }}
        >
          <TextInput
            value={input}
            onChangeText={setInput}
            multiline
            blurOnSubmit={false}
            placeholder="Ask Alta anything"
            placeholderTextColor={adaptiveColors.tertiaryLabel}
            style={{
              flex: 1,
              maxHeight: 120,
              minHeight: 40,
              paddingTop: 10,
              paddingBottom: 10,
              fontSize: 16,
              color: adaptiveColors.label,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            onPress={() => send()}
            disabled={!canSend}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: canSend ? adaptiveColors.label : adaptiveColors.surfaceMuted,
            }}
          >
            {busy
              ? <ActivityIndicator size="small" color={adaptiveColors.secondaryLabel} />
              : <SymbolView name="arrow.up" tintColor={canSend ? adaptiveColors.onAccent : adaptiveColors.tertiaryLabel} style={{ width: 15, height: 15 }} />}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/** Pressable with an object style (NativeWind drops function styles) and a pressed fade. */
function Tap({ style, disabled, children, ...rest }: { style: ViewStyle; disabled?: boolean; children: ReactNode } & Omit<PressableProps, "style" | "children">) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => { setPressed(true); rest.onPressIn?.(e); }}
      onPressOut={(e) => { setPressed(false); rest.onPressOut?.(e); }}
      style={{ ...style, opacity: disabled ? 0.4 : pressed ? 0.6 : 1 }}
    >
      {children}
    </Pressable>
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

function Timeline({ parts, streaming, thinking, failed }: { parts?: ChatPart[]; streaming?: boolean; thinking?: boolean; failed?: boolean }) {
  const list = parts ?? [];
  const last = list.length - 1;

  // Consecutive tool calls form one tight group; text blocks breathe around it.
  const groups: Array<{ key: string; tools?: Array<Extract<ChatPart, { kind: "tool" }>>; text?: Extract<ChatPart, { kind: "text" }>; index: number }> = [];
  const shownText: string[] = [];
  list.forEach((part, index) => {
    if (part.kind === "text") {
      if (isRepeat(part.text, shownText)) return;
      shownText.push(part.text);
      groups.push({ key: part.id, text: part, index });
      return;
    }
    const prev = groups[groups.length - 1];
    if (prev?.tools) prev.tools.push(part);
    else groups.push({ key: part.id, tools: [part], index });
  });

  return (
    <View style={{ gap: 12 }}>
      {groups.map((group) =>
        group.text ? (
          <Markdown
            key={group.key}
            text={dedupeParagraphs(stripInternalTokens(group.text.text))}
            streaming={Boolean(streaming && !thinking && group.index === last)}
            color={failed ? adaptiveColors.secondaryLabel : adaptiveColors.label}
          />
        ) : (
          <View key={group.key} style={{ gap: 7 }}>
            {group.tools!.map((tool) => <ToolRow key={tool.id} part={tool} />)}
          </View>
        ))}
      {streaming && thinking ? <ThinkingRow /> : null}
    </View>
  );
}

const TOOL_ICONS: Record<string, SymbolViewProps["name"]> = {
  get_wardrobe_overview: "tshirt",
  search_items: "magnifyingglass",
  get_items: "tshirt",
  get_item: "tshirt",
  get_saved_looks: "bookmark",
  show_outfits: "sparkles",
};

/** Looping 0..1 value for ambient animations. */
function useLoop(duration: number) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    value.setValue(0);
    const loop = Animated.loop(Animated.timing(value, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [value, duration]);
  return value;
}

/** Text with a soft light sweeping across it, letter by letter. */
function ShimmerText({ text, size = 14, weight = "600", color }: { text: string; size?: number; weight?: "500" | "600" | "700"; color: ColorValue }) {
  const progress = useLoop(1700);
  const chars = [...text];
  return (
    <View style={{ flexDirection: "row", flexShrink: 1 }}>
      {chars.map((char, i) => {
        const peak = (i / Math.max(1, chars.length - 1) + 0.3) / 1.6;
        const opacity = progress.interpolate({ inputRange: [peak - 0.18, peak, peak + 0.18], outputRange: [0.35, 1, 0.35], extrapolate: "clamp" });
        return (
          <Animated.Text key={`${i}-${char}`} style={{ opacity, fontSize: size, fontWeight: weight, color }}>
            {char === " " ? "\u00A0" : char}
          </Animated.Text>
        );
      })}
    </View>
  );
}

/** Three dots that ripple in sequence. */
function PulseDots({ color, size = 4 }: { color: ColorValue; size?: number }) {
  const progress = useLoop(1100);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
      {[0, 1, 2].map((i) => {
        const start = i * 0.16;
        const opacity = progress.interpolate({ inputRange: [start, start + 0.14, start + 0.3, 1], outputRange: [0.25, 1, 0.25, 0.25], extrapolate: "clamp" });
        const scale = progress.interpolate({ inputRange: [start, start + 0.14, start + 0.3, 1], outputRange: [0.8, 1.25, 0.8, 0.8], extrapolate: "clamp" });
        return <Animated.View key={i} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity, transform: [{ scale }] }} />;
      })}
    </View>
  );
}

function ToolRow({ part }: { part: Extract<ChatPart, { kind: "tool" }> }) {
  const running = part.state === "running";
  const icon = TOOL_ICONS[part.name] ?? "sparkles";
  return (
    <Reanimated.View
      entering={FadeInDown.duration(260)}
      style={{
        alignSelf: "flex-start",
        maxWidth: "100%",
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingLeft: 6,
        paddingRight: 12,
        paddingVertical: 6,
        borderRadius: 14,
        backgroundColor: running ? adaptiveColors.accentSoft : adaptiveColors.surfaceMuted,
        borderWidth: 1,
        borderColor: running ? adaptiveColors.accentSoft : adaptiveColors.border,
      }}
    >
      <View style={{ width: 26, height: 26, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: running ? adaptiveColors.surfaceRaised : adaptiveColors.accentSoft }}>
        <SymbolView name={icon} tintColor={adaptiveColors.accent} style={{ width: 13, height: 13 }} />
      </View>
      <View style={{ flexShrink: 1, gap: 1 }}>
        {running
          ? <ShimmerText text={part.label} size={13} color={adaptiveColors.label} />
          : <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "600", color: adaptiveColors.label }}>{part.label}</Text>}
        {part.detail ? <Text numberOfLines={1} style={{ fontSize: 11.5, color: adaptiveColors.secondaryLabel }}>{part.detail}</Text> : null}
      </View>
      {running ? (
        <PulseDots color={adaptiveColors.accent} />
      ) : (
        <Reanimated.View entering={ZoomIn.duration(220)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {part.summary ? <Text numberOfLines={1} style={{ fontSize: 12, color: adaptiveColors.tertiaryLabel }}>{part.summary}</Text> : null}
          <SymbolView name="checkmark.circle.fill" tintColor={adaptiveColors.accent} style={{ width: 14, height: 14 }} />
        </Reanimated.View>
      )}
    </Reanimated.View>
  );
}

function ThinkingRow() {
  const pulse = useLoop(1500);
  const scale = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.85, 1.2, 0.85] });
  const glow = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 1, 0.5] });
  return (
    <Reanimated.View entering={FadeInDown.duration(220)} style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
      <Animated.View style={{ opacity: glow, transform: [{ scale }] }}>
        <SymbolView name="sparkles" tintColor={adaptiveColors.accent} style={{ width: 16, height: 16 }} />
      </Animated.View>
      <ShimmerText text="Thinking" size={14} color={adaptiveColors.secondaryLabel} />
      <PulseDots color={adaptiveColors.tertiaryLabel} size={3.5} />
    </Reanimated.View>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <View style={{ maxWidth: "82%", alignSelf: "flex-end", paddingHorizontal: 15, paddingVertical: 10, borderRadius: 20, borderBottomRightRadius: 6, backgroundColor: adaptiveColors.surfaceMuted }}>
      <Text selectable style={{ fontSize: 15.5, lineHeight: 22, color: adaptiveColors.label }}>{text}</Text>
    </View>
  );
}

function Pill({ icon, label, onPress, disabled, solid }: { icon: "arrow.clockwise"; label: string; onPress: () => void; disabled?: boolean; solid?: boolean }) {
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 13,
        paddingVertical: 8,
        borderRadius: radius.pill,
        backgroundColor: solid ? adaptiveColors.label : "transparent",
        borderWidth: solid ? 0 : 1,
        borderColor: adaptiveColors.border,
      }}
    >
      <SymbolView name={icon} tintColor={solid ? adaptiveColors.onAccent : adaptiveColors.secondaryLabel} style={{ width: 12, height: 12 }} />
      <Text style={{ fontSize: 13, fontWeight: "600", color: solid ? adaptiveColors.onAccent : adaptiveColors.secondaryLabel }}>{label}</Text>
    </Tap>
  );
}

function OutfitCard({
  outfit,
  rejected,
  onSave,
  onReject,
}: {
  outfit: Outfit;
  rejected: boolean;
  onSave: () => void;
  onReject: () => void;
}) {
  const { items, isSavedLook } = useCloset();
  const outfitItems = outfit.itemIds
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 4);
  const saved = isSavedLook(outfit.id);

  return (
    <View
      style={{
        borderRadius: 20,
        backgroundColor: adaptiveColors.surfaceRaised,
        borderWidth: 1,
        borderColor: adaptiveColors.border,
        padding: 10,
        gap: 12,
        opacity: rejected ? 0.45 : 1,
      }}
    >
      <View style={{ flexDirection: "row", gap: 6 }}>
        {outfitItems.map((item) => (
          <View key={item.id} style={{ flex: 1 }}>
            <ItemImage imageUrl={item.displayAssetUri} label={item.name} size="large" />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 4, paddingBottom: 2 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", letterSpacing: -0.2, color: adaptiveColors.label }}>
            {rejected ? "Not this one" : outfit.label}
          </Text>
          {!rejected && outfit.description ? (
            <Text numberOfLines={3} style={{ fontSize: 13, lineHeight: 18, color: adaptiveColors.secondaryLabel }}>{outfit.description}</Text>
          ) : null}
        </View>
        {!rejected && (
          <View style={{ flexDirection: "row", gap: 6 }}>
            <CardAction icon={saved ? "checkmark" : "plus"} label={saved ? "Added to wardrobe" : "Add to wardrobe"} tint={saved ? adaptiveColors.accent : adaptiveColors.secondaryLabel} onPress={onSave} />
            <CardAction icon="xmark" label="Not this one" tint={adaptiveColors.secondaryLabel} onPress={onReject} />
          </View>
        )}
      </View>
    </View>
  );
}

function CardAction({ icon, label, tint, onPress }: { icon: "plus" | "checkmark" | "xmark"; label: string; tint: ColorValue; onPress: () => void }) {
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: adaptiveColors.surfaceMuted }}
    >
      <SymbolView name={icon} tintColor={tint} style={{ width: 14, height: 14 }} />
    </Tap>
  );
}
