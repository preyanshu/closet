import { GlassLayer } from "@/components/ui";
import { SymbolView } from "expo-symbols";
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

type Message = { id: string; role: "user" | "alta"; text: string };

const initialMessages: Message[] = [
  {
    id: "1",
    role: "alta",
    text: "Hey! I'm Alta, your personal stylist. What's the occasion tonight?",
  },
];

const quickReplies = ["Dinner out", "Date night", "Casual hangout", "Work event"];

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: false });
  }, [messages]);

  const send = (text?: string) => {
    const body = (text ?? input).trim();
    if (!body) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", text: body };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    setTimeout(() => {
      const altaMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "alta",
        text: getAltaResponse(body),
      };
      setMessages((prev) => [...prev, altaMsg]);
    }, 800);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: "#FFFDF3" }}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 20, paddingBottom: 12, gap: 14 }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((msg) => (
          <Bubble key={msg.id} role={msg.role} text={msg.text} />
        ))}
      </ScrollView>

      {messages.length <= 2 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 20, paddingBottom: 10 }}>
          {quickReplies.map((reply) => (
            <Pressable
              key={reply}
              onPress={() => send(reply)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 999,
                backgroundColor: "rgba(0,0,0,0.04)",
                borderWidth: 1,
                borderColor: "rgba(0,0,0,0.06)",
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
          backgroundColor: "#FFFDF3",
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
            color: "#000",
            backgroundColor: "rgba(0,0,0,0.03)",
            borderRadius: 999,
            paddingHorizontal: 18,
            paddingVertical: 12,
            borderWidth: 1,
            borderColor: "rgba(0,0,0,0.06)",
          }}
        />
        <SendButton onPress={() => send()} disabled={!input.trim()} />
      </View>
    </KeyboardAvoidingView>
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
          backgroundColor: isAlta ? "rgba(0,0,0,0.04)" : "#000",
          overflow: "hidden",
        }}
      >
        {isAlta && <GlassLayer />}
        <Text
          style={{
            fontSize: 15,
            lineHeight: 21,
            fontWeight: "500",
            color: isAlta ? "#000" : "#FFFDF3",
          }}
        >
          {text}
        </Text>
      </View>
    </View>
  );
}

function SendButton({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      accessibilityLabel="Send message"
      onPress={onPress}
      disabled={disabled}
      style={{
        width: 42,
        height: 42,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: disabled ? "rgba(0,0,0,0.04)" : "#000",
        overflow: "hidden",
      }}
    >
      {!disabled && <GlassLayer tintColor="#000000" />}
      <SymbolView
        name="arrow.up"
        tintColor={disabled ? "rgba(0,0,0,0.2)" : "#FFFDF3"}
        style={{ width: 18, height: 18 }}
      />
    </Pressable>
  );
}

function getAltaResponse(input: string): string {
  const lower = input.toLowerCase();
  if (lower.includes("dinner") || lower.includes("date"))
    return "Love it. For a dinner date I'd go with something polished but effortless — a well-fitted dark knit, tailored trousers, and clean leather shoes. Want me to pull specific pieces from your closet?";
  if (lower.includes("casual"))
    return "Nice, keeping it easy. A relaxed tee, your favorite straight-leg jeans, and sneakers would be perfect. I can match it to your wardrobe right now.";
  if (lower.includes("work") || lower.includes("event"))
    return "Got it — professional but with personality. A structured blazer over a simple tee, slim chinos, and loafers always works. Let me check what you have.";
  return "Great question! Tell me more about the vibe — is it dressy, casual, or somewhere in between? I'll put together the perfect look from your closet.";
}
