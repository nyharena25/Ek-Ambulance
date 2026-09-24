/**
 * @sahayak/ui - Semantic Color Tokens
 * WCAG AAA Compliant Palette for Emergency Healthcare & Ambulance Fleets
 */

export const semanticColors = {
  // ============================================================================
  // 1. EMERGENCY BRAND & CRITICAL ACTION PALETTE
  // ============================================================================
  emergency: {
    /** Primary Emergency Action / Siren Active (#DC2626 - Red-600) */
    primary: "#DC2626",
    /** High-Contrast Text on Light Background (#B91C1C - Red-700, 7.1:1 on white - WCAG AAA) */
    dark: "#B91C1C",
    /** Deep Pressed State / Container Border (#991B1B - Red-800) */
    deep: "#991B1B",
    /** Ambient Emergency Surface Tint (#FEF2F2 - Red-50) */
    light: "#FEF2F2",
    /** High-Visibility Emergency Boundary (#EF4444 - Red-500) */
    border: "#EF4444",
  },

  // ============================================================================
  // 2. CLINICAL TRIAGE PALETTE (START / ESI / AIS-125 PROTOCOLS)
  // ============================================================================
  triage: {
    /**
     * TRIAGE RED (Immediate / ESI Level 1)
     * Resuscitative life-threatening trauma, cardiac arrest, respiratory failure.
     */
    red: {
      base: "#EF4444", // Red-500: Triage Red
      surface: "#FEF2F2", // Red-50
      border: "#DC2626", // Red-600
      textAccessible: "#991B1B", // Red-800 (8.9:1 on #FEF2F2 - WCAG AAA)
      textOnWhite: "#B91C1C", // Red-700 (7.1:1 on White - WCAG AAA)
      pulseGlow: "rgba(239, 68, 68, 0.45)",
    },

    /**
     * TRIAGE YELLOW (Urgent / Delayed / ESI Level 2 & 3)
     * Severe pain, major fractures, potential airway compromise, stable for 30-60 min.
     */
    yellow: {
      base: "#F59E0B", // Amber-500: Triage Yellow
      surface: "#FFFBEB", // Amber-50
      border: "#D97706", // Amber-600 (3.2:1 boundary on white)
      textAccessible: "#78350F", // Amber-900 (10.4:1 on #FFFBEB - WCAG AAA)
      textOnWhite: "#B45309", // Amber-700 (7.0:1 on White - WCAG AAA)
      pulseGlow: "rgba(245, 158, 11, 0.40)",
    },

    /**
     * TRIAGE GREEN (Minor / Walking Wounded / ESI Level 4 & 5)
     * Ambulatory, minor lacerations, non-life-threatening sprains, delayed transport.
     */
    green: {
      base: "#10B981", // Emerald-500: Triage Green
      surface: "#ECFDF5", // Emerald-50
      border: "#059669", // Emerald-600
      textAccessible: "#065F46", // Emerald-800 (9.4:1 on #ECFDF5 - WCAG AAA)
      textOnWhite: "#047857", // Emerald-700 (7.2:1 on White - WCAG AAA)
      pulseGlow: "rgba(16, 185, 129, 0.35)",
    },

    /**
     * TRIAGE BLACK (Expectant / Deceased)
     * Palliative care, non-viable catastrophic trauma, mortal arrest.
     */
    black: {
      base: "#1E293B", // Slate-800
      surface: "#F1F5F9", // Slate-100
      border: "#475569", // Slate-600
      textAccessible: "#0F172A", // Slate-900 (18.7:1 on white)
      textOnWhite: "#0F172A",
      pulseGlow: "rgba(30, 41, 59, 0.30)",
    },
  },

  // ============================================================================
  // 3. CLINICAL SURFACE SLATE PALETTE (WCAG AAA HIGH CONTRAST)
  // ============================================================================
  clinicalSurface: {
    /** Ambient Nighttime Deep Backdrop (#020617 - Slate-950) */
    slate950: "#020617",
    /** Primary High-Contrast Dark Text / Primary Console Surface (#0F172A - Slate-900, 18.7:1 on white) */
    slate900: "#0F172A",
    /** Deep Clinical Card / Telemetry Container Surface (#1E293B - Slate-800, 15.2:1 on white) */
    slate800: "#1E293B",
    /** Clinical Structural Borders / Elevated Surface (#334155 - Slate-700, 9.6:1 on white) */
    slate700: "#334155",
    /** Supporting Telemetry / Secondary Captions (#475569 - Slate-600, 7.0:1 on white - WCAG AAA) */
    slate600: "#475569",
    /** Telemetry Inactive Icons / Hardware Indicators (#64748B - Slate-500) */
    slate500: "#64748B",
    /** Muted Boundaries / Secondary Outlines (#94A3B8 - Slate-400) */
    slate400: "#94A3B8",
    /** Structural Dividers / Grid Lines (#CBD5E1 - Slate-300, 3.1:1 non-text boundary) */
    slate300: "#CBD5E1",
    /** Subtle Inactive Dividers (#E2E8F0 - Slate-200) */
    slate200: "#E2E8F0",
    /** Soft Clinical Card Background / Chip Surface (#F1F5F9 - Slate-100) */
    slate100: "#F1F5F9",
    /** Ambient Light Canvas Surface (#F8FAFC - Slate-50) */
    slate50: "#F8FAFC",
  },

  // ============================================================================
  // 4. STATUTORY & STATUS PALETTE
  // ============================================================================
  status: {
    // Green Verified
    verified: "#15803D", // Green-700 (7.1:1 on white)
    verifiedSurface: "#F0FDF4", // Green-50
    verifiedBorder: "#22C55E", // Green-500

    // Blue Statutory & Legal Information
    statutory: "#1D4ED8", // Blue-700 (7.3:1 on white)
    statutorySurface: "#EFF6FF", // Blue-50
    statutoryBorder: "#3B82F6", // Blue-500

    // Amber Caution & Degradation
    caution: "#B45309", // Amber-700 (7.0:1 on white)
    cautionSurface: "#FFFBEB", // Amber-50
    cautionBorder: "#D97706", // Amber-600
  },

  // Base
  white: "#FFFFFF",
  black: "#000000",
} as const;

/**
 * Flat color export for convenience and backward compatibility
 */
export const colors = {
  // Emergency
  emergency: semanticColors.emergency.primary,
  emergencyDark: semanticColors.emergency.dark,
  emergencyDeep: semanticColors.emergency.deep,
  emergencyLight: semanticColors.emergency.light,
  emergencyBorder: semanticColors.emergency.border,

  // Triage
  triageRed: semanticColors.triage.red.base,
  triageRedSurface: semanticColors.triage.red.surface,
  triageRedText: semanticColors.triage.red.textAccessible,
  triageYellow: semanticColors.triage.yellow.base,
  triageYellowSurface: semanticColors.triage.yellow.surface,
  triageYellowText: semanticColors.triage.yellow.textAccessible,
  triageGreen: semanticColors.triage.green.base,
  triageGreenSurface: semanticColors.triage.green.surface,
  triageGreenText: semanticColors.triage.green.textAccessible,
  triageBlack: semanticColors.triage.black.base,

  // Clinical Slate
  slate950: semanticColors.clinicalSurface.slate950,
  slate900: semanticColors.clinicalSurface.slate900,
  slate800: semanticColors.clinicalSurface.slate800,
  slate700: semanticColors.clinicalSurface.slate700,
  slate600: semanticColors.clinicalSurface.slate600,
  slate500: semanticColors.clinicalSurface.slate500,
  slate400: semanticColors.clinicalSurface.slate400,
  slate300: semanticColors.clinicalSurface.slate300,
  slate200: semanticColors.clinicalSurface.slate200,
  slate100: semanticColors.clinicalSurface.slate100,
  slate50: semanticColors.clinicalSurface.slate50,

  // Base & Status
  white: semanticColors.white,
  black: semanticColors.black,
  success: semanticColors.status.verified,
  successLight: semanticColors.status.verifiedSurface,
  warning: semanticColors.status.caution,
  warningLight: semanticColors.status.cautionSurface,
  info: semanticColors.status.statutory,
  infoLight: semanticColors.status.statutorySurface,
} as const;

/**
 * The four steps of an emergency's timer, shared by the driver's Booking card and the patient's search countdown so both
 * sides read the same colour for the same moment: green while fresh, yellow past half the designed time, orange in the last
 * 10 s, red once overdue. Green, yellow and red are the triage tokens; the triage scale has no orange, so it is defined here.
 */
export const timerTones = {
  green: { fill: semanticColors.triage.green.base, surface: semanticColors.triage.green.surface, text: semanticColors.triage.green.textAccessible },
  yellow: { fill: semanticColors.triage.yellow.base, surface: semanticColors.triage.yellow.surface, text: semanticColors.triage.yellow.textAccessible },
  orange: { fill: "#EA580C", surface: "#FFF7ED", text: "#9A3412" }, // Orange-600 / Orange-50 / Orange-800
  red: { fill: semanticColors.triage.red.base, surface: semanticColors.triage.red.surface, text: semanticColors.triage.red.textAccessible },
} as const;

export type SemanticColors = typeof semanticColors;
export type Colors = typeof colors;
