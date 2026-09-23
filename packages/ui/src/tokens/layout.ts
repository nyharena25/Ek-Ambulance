/**
 * @sahayak/ui - Spatial & Physical Ergonomics Tokens
 * Calibrated for High-Stress Emergency Ambulance Cockpits (WCAG 2.5.5 Touch Targets)
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  "2xl": 32,
  "3xl": 40,
  "4xl": 48,
} as const;

export const radii = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 16,
  xl: 20,
  "2xl": 24,
  full: 9999,
} as const;

export const shadows = {
  sm: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  lg: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 8,
  },
  emergency: {
    shadowColor: "#DC2626",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
} as const;

/**
 * Ergonomic Touch Targets for Ambulance In-Transit Operations
 */
export const touchTargets = {
  /** Minimum touch target size (48dp per WCAG 2.5.5 Target Size) */
  minTargetSize: 48,
  /** Primary emergency CTA size (56dp - 60dp for high-vibration ambulance transit) */
  emergencyActionSize: 56,
  /** Irreversible arrival / handoff slider thumb diameter */
  sliderThumbSize: 58,
} as const;
