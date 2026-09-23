/**
 * @sahayak/ui - Ek-Ambulance Design System Specification
 * High-contrast, WCAG AAA compliant design tokens and clinical contracts.
 *
 * Grounded in:
 * - MoRTH AIS-125 Ambulance Fleet Norms
 * - START / ESI Clinical Triage Protocols
 * - Dual-Script Typography Parity (Latin: Inter, Devanagari: Noto Sans Devanagari)
 * - Zero Text Truncation & Zero Layout Shift Architecture
 */

export * from "./tokens/colors.ts";
export * from "./tokens/typography.ts";
export * from "./tokens/triage.ts";
export * from "./tokens/layout.ts";
export * from "./types/designSystem.types.ts";

import { colors, semanticColors } from "./tokens/colors.ts";
import { typography } from "./tokens/typography.ts";
import { triageTokens } from "./tokens/triage.ts";
import { spacing, radii, shadows, touchTargets } from "./tokens/layout.ts";

/**
 * Unified Ek-Ambulance Design System Theme Object
 */
export const theme = {
  colors: {
    primary: semanticColors.emergency.primary,
    primaryDark: semanticColors.emergency.dark,
    secondary: semanticColors.clinicalSurface.slate900,
    background: colors.white,
    surface: semanticColors.clinicalSurface.slate50,
    surfaceMuted: semanticColors.clinicalSurface.slate100,
    text: semanticColors.clinicalSurface.slate900,
    textSecondary: semanticColors.clinicalSurface.slate700,
    textMuted: semanticColors.clinicalSurface.slate600,
    border: semanticColors.clinicalSurface.slate300,
    borderSubtle: semanticColors.clinicalSurface.slate200,
    ...colors,
  },
  semanticColors,
  triage: triageTokens,
  typography,
  spacing,
  radii,
  shadows,
  touchTargets,
};

export type Theme = typeof theme;
