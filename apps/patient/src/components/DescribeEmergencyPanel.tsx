import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radii, spacing, typography } from "@sahayak/ui";
import { extractTriageIndicators, type TriageExtraction } from "../services/openRouterTriage";
import AppIcon from "./AppIcon";

const STRINGS = {
  en: {
    title: "Describe the Emergency (optional)",
    hint: "Type or tap your keyboard's mic to speak. English, Hindi or Hinglish.",
    placeholder: "e.g. Papa ko seene mein dard hai aur saans nahi aa rahi",
    mic: "Speak using keyboard microphone",
    analyze: "Analyze",
    analyzing: "Analyzing...",
    filled: "Form pre-filled from your description. Please review below.",
    review: "The assistant suggested higher urgency than the protocol result. Please review the answers below.",
    failed: "Assistant unavailable. Please use the buttons below.",
  },
  hi: {
    title: "आपातकाल का वर्णन करें (वैकल्पिक)",
    hint: "टाइप करें या कीबोर्ड के माइक से बोलें। हिंदी, अंग्रेज़ी या हिंग्लिश।",
    placeholder: "जैसे: पापा को सीने में दर्द है और सांस नहीं आ रही",
    mic: "कीबोर्ड माइक से बोलें",
    analyze: "विश्लेषण करें",
    analyzing: "विश्लेषण हो रहा है...",
    filled: "आपके विवरण से फ़ॉर्म भरा गया है। कृपया नीचे जांच लें।",
    review: "सहायक ने प्रोटोकॉल परिणाम से अधिक गंभीरता सुझाई है। कृपया नीचे के उत्तर जांचें।",
    failed: "सहायक उपलब्ध नहीं है। कृपया नीचे दिए बटन उपयोग करें।",
  },
} as const;

export interface DescribeEmergencyPanelProps {
  language: "en" | "hi";
  /** Applies the suggestion to the form; returns true if the AI's tier was more severe than the engine's. */
  onExtracted: (extraction: TriageExtraction) => boolean;
  /** The caller's real Supabase session token (verified by the gateway's /triage/extract proxy). Null/absent
   *  (no real session, e.g. the anonymous quick-emergency path) degrades to manual triage below - the same
   *  behavior the old "no key configured" case had, now gated on real auth instead of an env var. */
  authToken?: string | null;
}

export default function DescribeEmergencyPanel({ language, onExtracted, authToken }: DescribeEmergencyPanelProps) {
  const s = STRINGS[language];
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"filled" | "review" | "failed" | null>(null);

  const analyze = async () => {
    if (loading || !text.trim()) return;
    setLoading(true);
    setStatus(null);
    const result = await extractTriageIndicators(text, { authToken });
    setLoading(false);
    setStatus(result.ok ? (onExtracted(result.data) ? "review" : "filled") : "failed");
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{s.title}</Text>
      <Text style={styles.hint}>{s.hint}</Text>
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={s.placeholder}
          placeholderTextColor={colors.slate600}
          multiline
          maxLength={1000}
          accessibilityLabel={s.title}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={s.mic}
          style={styles.iconButton}
          onPress={() => inputRef.current?.focus()}
        >
          <AppIcon icon={{ set: "ion", name: "mic" }} size={24} color={colors.info} />
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: loading || !text.trim(), busy: loading }}
        disabled={loading || !text.trim()}
        style={[styles.analyzeButton, (loading || !text.trim()) && styles.analyzeDisabled]}
        onPress={analyze}
      >
        {loading ? <ActivityIndicator color={colors.white} /> : <AppIcon icon={{ set: "ion", name: "sparkles" }} size={18} color={colors.white} />}
        <Text style={styles.analyzeText}>{loading ? s.analyzing : s.analyze}</Text>
      </Pressable>
      {status && (
        <Text
          accessibilityRole="alert"
          style={[styles.status, status === "failed" && styles.statusMuted, status === "review" && styles.statusWarn]}
        >
          {s[status]}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.infoLight,
    borderWidth: 1.5,
    borderColor: colors.info,
    borderRadius: radii.lg,
    padding: spacing.base,
    marginBottom: spacing.base,
    gap: spacing.sm,
  },
  title: { fontSize: typography.fontSizes.base, fontWeight: typography.fontWeights.bold, color: colors.slate900 },
  hint: { fontSize: typography.fontSizes.xs, color: colors.slate600 },
  inputRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  input: {
    flex: 1,
    minHeight: 72,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: radii.md,
    padding: spacing.sm,
    fontSize: typography.fontSizes.sm,
    color: colors.slate900,
    textAlignVertical: "top",
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.info,
    alignItems: "center",
    justifyContent: "center",
  },
  analyzeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radii.md,
    backgroundColor: colors.info,
  },
  analyzeDisabled: { opacity: 0.5 },
  analyzeText: { color: colors.white, fontSize: typography.fontSizes.sm, fontWeight: typography.fontWeights.bold },
  status: { fontSize: typography.fontSizes.xs, color: colors.success, fontWeight: typography.fontWeights.bold },
  statusMuted: { color: colors.slate600 },
  statusWarn: { color: colors.emergencyDark },
});
