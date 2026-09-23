import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import type { ColorValue, StyleProp, TextStyle } from "react-native";

/**
 * Typed reference to a production vector glyph.
 *
 * Ionicons is the primary set. MaterialCommunityIcons is used only for the
 * clinical and vehicle glyphs Ionicons has no true equivalent for
 * (ambulance, stethoscope, lungs, brain, hospital-building, blood-bag).
 * Approximating those would misrepresent clinical meaning.
 */
export type IconRef =
  | { set: "ion"; name: keyof typeof Ionicons.glyphMap }
  | { set: "mci"; name: keyof typeof MaterialCommunityIcons.glyphMap };

export interface AppIconProps {
  icon: IconRef;
  size?: number;
  color?: ColorValue;
  style?: StyleProp<TextStyle>;
}

/** Renders an IconRef. Decorative by default: pass accessibilityLabel on the parent control. */
export function AppIcon({ icon, size = 20, color, style }: AppIconProps) {
  return icon.set === "ion" ? (
    <Ionicons name={icon.name} size={size} color={color} style={style} />
  ) : (
    <MaterialCommunityIcons name={icon.name} size={size} color={color} style={style} />
  );
}

export default AppIcon;
