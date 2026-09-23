/**
 * @sahayak/ui - Design System Specification Types
 * Medical Emergency & Ambulance Logistics UI Design System
 * Grounded in MoRTH AIS-125, START/ESI Triage Protocols & WCAG AAA Accessibility
 */

export type SupportedScript = "latin" | "devanagari";
export type SupportedLanguage = "en" | "hi";

export type FontWeightToken =
  | "normal"
  | "medium"
  | "semibold"
  | "bold"
  | "extrabold";

export interface FontConfig {
  fontFamily: string;
  fontFamilyDevanagari: string;
  weights: Record<FontWeightToken, string>;
}

export interface TextStyleDefinition {
  fontSize: number;
  lineHeight: number;
  fontWeight: "400" | "500" | "600" | "700" | "800";
  letterSpacing?: number;
  // Calibrated vertical padding compensation for zero layout shift in Devanagari
  verticalPaddingOffset?: number;
}

export type TypographyScaleKey =
  | "display"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "bodyLarge"
  | "body"
  | "bodySmall"
  | "caption"
  | "overline"
  | "emergencyButton";

export type TypographyScale = Record<TypographyScaleKey, TextStyleDefinition>;

export interface ColorTokenWithContrast {
  value: string;
  contrastOnWhite: number;
  contrastOnSlate950: number;
  wcagAaaCompliant: boolean;
  description: string;
}

export type TriageCategory = "IMMEDIATE" | "URGENT" | "DELAYED" | "EXPECTANT";

export interface TriageCategoryToken {
  category: TriageCategory;
  esiLevel: string; // e.g. "ESI-1", "ESI-2/3", "ESI-4/5"
  startCategory: string; // e.g. "RED", "YELLOW", "GREEN", "BLACK"
  baseColor: string;
  surfaceTint: string;
  borderColor: string;
  textAccessible: string;
  pulseGlowColor: string;
  labelEn: string;
  labelHi: string;
  descriptionEn: string;
  descriptionHi: string;
  maxWaitTimeMinutes: number;
}

export interface DesignTokens {
  colors: Record<string, string>;
  semanticColors: {
    emergency: {
      primary: string;
      dark: string;
      deep: string;
      light: string;
      border: string;
    };
    triage: {
      red: TriageCategoryToken;
      yellow: TriageCategoryToken;
      green: TriageCategoryToken;
      black: TriageCategoryToken;
    };
    clinicalSurface: {
      slate950: string;
      slate900: string;
      slate800: string;
      slate700: string;
      slate600: string;
      slate500: string;
      slate400: string;
      slate300: string;
      slate200: string;
      slate100: string;
      slate50: string;
    };
  };
  typography: {
    fontFamilies: {
      latin: string;
      devanagari: string;
      systemFallback: string;
    };
    scale: TypographyScale;
  };
  spacing: Record<string, number>;
  radii: Record<string, number>;
  shadows: Record<string, object>;
  touchTargets: {
    minTouchTargetSize: number; // 48dp (WCAG 2.5.5)
    emergencyActionSize: number; // 56dp - 60dp for fast physical engagement
  };
}
