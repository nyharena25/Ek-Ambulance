import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View, useWindowDimensions, type ViewStyle } from "react-native";
import { colors, radii, shadows, spacing, timerTones, typography } from "@sahayak/ui";
import { DISPATCH_CONFIG } from "@sahayak/domain";
import AppIcon from "./AppIcon";
import type { MatchingTranslation } from "../i18n/matchingStrings";

export interface SearchRadarProps {
  /** The offer wave the search has reached (1: 0-3 km, 2: 3-6 km, 3: 6-10 km). */
  wave: 1 | 2 | 3;
  /** Every wave has run and nobody accepted: the whole radar turns red and 108 is the action. */
  overtime: boolean;
  strings: MatchingTranslation;
}

const KM = DISPATCH_CONFIG.radiiKm; // [3, 6, 10]
const ZONE_TONES = ["green", "yellow", "orange"] as const;
const MAX_SIZE = 264;
const PIN = 38;
const LABEL_W = 48;
const LABEL_H = 20;
const FILL: ViewStyle = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 };
const FADE_MS = 300;
const PULSE_MS = 1800;

type ZoneState = "searching" | "searched" | "next";

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduce(v));
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/** A coloured overlay that fades in when `on` (instantly under reduced motion): the zone changes colour without a hard cut. */
function Fade({ on, reduce, style }: { on: boolean; reduce: boolean; style: ViewStyle }) {
  const opacity = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) {
      opacity.setValue(on ? 1 : 0);
      return;
    }
    const fade = Animated.timing(opacity, { toValue: on ? 1 : 0, duration: FADE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true });
    fade.start();
    return () => fade.stop();
  }, [on, reduce, opacity]);
  return <Animated.View pointerEvents="none" style={[style, { opacity }]} />;
}

/** The one moving element: a ring that swells across the zone being searched. Not rendered under reduced motion. */
function Pulse({ diameter, color, reduce }: { diameter: number; color: string; reduce: boolean }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    t.setValue(0);
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: PULSE_MS, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [t, reduce, diameter]);
  if (reduce) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        width: diameter,
        height: diameter,
        borderRadius: diameter / 2,
        borderWidth: 3,
        borderColor: color,
        opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
        transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }],
      }}
    />
  );
}

/**
 * Where the ambulance search has reached, around the patient's pickup pin. Three zones drawn to scale (3 / 6 / 10 km) fill
 * light green, yellow and orange as the search arrives in each; once every wave has run with no taker the whole radar turns red
 * and the status line says to call 108. Colour is never the only cue: each ring is labelled, and each zone has a legend chip
 * with an icon and a word for its state (searching / searched / next).
 */
export default function SearchRadar({ wave, overtime, strings: t }: SearchRadarProps) {
  const reduce = useReduceMotion();
  const { width } = useWindowDimensions();
  const size = Math.min(MAX_SIZE, Math.floor(width - 2 * spacing.lg - 2 * spacing.base - 4));
  const outerKm = KM[KM.length - 1]!;

  const zones = KM.map((km, i) => ({ km, from: i === 0 ? 0 : KM[i - 1]!, tone: timerTones[ZONE_TONES[i]!], d: (km / outerKm) * size }));
  const stateOf = (i: number): ZoneState => (overtime || wave > i + 1 ? "searched" : wave === i + 1 ? "searching" : "next");
  const active = zones[overtime ? zones.length - 1 : wave - 1]!;
  const pulseColor = overtime ? timerTones.red.fill : active.tone.fill;
  const c = size / 2;
  const cos45 = Math.SQRT1_2;

  return (
    <View style={styles.card}>
      <View style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel={t.radarAria}>
        {/* Outermost first, so each smaller zone sits on top of the larger one. */}
        {[...zones].reverse().map((z) => {
          const i = zones.indexOf(z);
          const zoneStyle: ViewStyle = { ...FILL, borderRadius: z.d / 2, borderWidth: 2 };
          return (
            <View key={z.km} style={[styles.disc, { width: z.d, height: z.d, borderRadius: z.d / 2, left: c - z.d / 2, top: c - z.d / 2 }]}>
              <Fade on={stateOf(i) !== "next"} reduce={reduce} style={{ ...zoneStyle, backgroundColor: z.tone.tint, borderColor: z.tone.fill }} />
              <Fade on={overtime} reduce={reduce} style={{ ...zoneStyle, backgroundColor: timerTones.red.tint, borderColor: timerTones.red.fill }} />
            </View>
          );
        })}

        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
          <Pulse diameter={active.d} color={pulseColor} reduce={reduce} />
        </View>

        {/* Ring labels sit on each ring's edge at 45 degrees, clear of the pin. The legend below says the same in words. */}
        {zones.map((z, i) => (
          <View
            key={z.km}
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.ringLabel,
              {
                left: c + (z.d / 2) * cos45 - LABEL_W / 2,
                top: c - (z.d / 2) * cos45 - LABEL_H / 2,
                borderColor: overtime ? timerTones.red.fill : stateOf(i) === "next" ? colors.slate300 : z.tone.fill,
              },
            ]}
          >
            <Text style={styles.ringLabelText}>{t.kmLabel(z.km)}</Text>
          </View>
        ))}

        {/* The pickup: just a red pin. */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
          <View style={styles.pin}>
            <AppIcon icon={{ set: "ion", name: "location" }} size={26} color={colors.emergency} />
          </View>
        </View>
      </View>

      {/* What is happening, announced when it changes. */}
      <View
        accessible
        accessibilityLiveRegion="polite"
        style={[styles.status, overtime ? { backgroundColor: timerTones.red.surface, borderColor: timerTones.red.fill } : styles.statusCalm]}
      >
        <AppIcon icon={{ set: "ion", name: overtime ? "call" : "search" }} size={18} color={overtime ? timerTones.red.text : colors.slate700} />
        <Text style={[styles.statusText, overtime && { color: timerTones.red.text, fontWeight: typography.fontWeights.extrabold }]}>
          {overtime ? t.noAmbulanceCall108 : t.searchingRadius(active.from, active.km)}
        </Text>
      </View>

      <View style={styles.legend}>
        {zones.map((z, i) => {
          const state = stateOf(i);
          const tone = overtime ? timerTones.red : z.tone;
          const idle = state === "next";
          const word = state === "searching" ? t.zoneSearching : state === "searched" ? t.zoneSearched : t.zoneNext;
          const ink = idle ? colors.slate600 : tone.text;
          return (
            <View
              key={z.km}
              accessible
              accessibilityLabel={`${t.kmRange(z.from, z.km)}, ${word}`}
              style={[styles.chip, !idle && { borderColor: tone.fill, backgroundColor: tone.surface }]}
            >
              <View style={styles.chipHead}>
                <View style={[styles.swatch, { backgroundColor: idle ? colors.slate200 : tone.tint, borderColor: idle ? colors.slate300 : tone.fill }]} />
                <Text style={styles.chipRange}>{t.kmRange(z.from, z.km)}</Text>
              </View>
              <View style={styles.chipState}>
                <AppIcon icon={{ set: "ion", name: state === "searching" ? "pulse" : state === "searched" ? "checkmark-circle" : "ellipse-outline" }} size={12} color={ink} />
                <Text style={[styles.chipStateText, { color: ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{word}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    alignItems: "center",
    gap: spacing.md,
    ...shadows.sm,
  },
  disc: { position: "absolute", backgroundColor: colors.slate100, borderWidth: 1.5, borderColor: colors.slate300 },
  center: { alignItems: "center", justifyContent: "center" },
  ringLabel: {
    position: "absolute",
    width: LABEL_W,
    height: LABEL_H,
    borderRadius: radii.full,
    borderWidth: 1.5,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  ringLabelText: { fontSize: 11, lineHeight: 14, fontWeight: typography.fontWeights.bold, color: colors.slate900 },
  pin: {
    width: PIN,
    height: PIN,
    borderRadius: PIN / 2,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.emergency,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.sm,
  },
  status: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1.5,
  },
  statusCalm: { backgroundColor: colors.slate50, borderColor: colors.slate200 },
  statusText: { flex: 1, fontSize: typography.fontSizes.sm, lineHeight: typography.lineHeights.sm, fontWeight: typography.fontWeights.bold, color: colors.slate900 },
  legend: { width: "100%", flexDirection: "row", gap: 6 },
  chip: {
    flex: 1,
    gap: 4,
    paddingVertical: spacing.sm,
    paddingHorizontal: 6,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.slate200,
    backgroundColor: colors.white,
  },
  chipHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5 },
  chipRange: { fontSize: typography.fontSizes.xs, lineHeight: typography.lineHeights.xs, fontWeight: typography.fontWeights.extrabold, color: colors.slate900 },
  chipState: { flexDirection: "row", alignItems: "center", gap: 3 },
  chipStateText: { flexShrink: 1, fontSize: typography.fontSizes.xs, lineHeight: typography.lineHeights.xs, fontWeight: typography.fontWeights.semibold },
});
