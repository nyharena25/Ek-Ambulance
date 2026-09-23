/**
 * @sahayak/ui - Clinical Triage System Specification
 * Grounded in MoRTH AIS-125 Ambulance Norms, START & ESI 5-Level Triage Protocols
 */

import type { TriageCategory, TriageCategoryToken } from "../types/designSystem.types.ts";
import { semanticColors } from "./colors.ts";

export const triageTokens: Record<TriageCategory, TriageCategoryToken> = {
  IMMEDIATE: {
    category: "IMMEDIATE",
    esiLevel: "ESI-1",
    startCategory: "RED",
    baseColor: semanticColors.triage.red.base, // #EF4444
    surfaceTint: semanticColors.triage.red.surface, // #FEF2F2
    borderColor: semanticColors.triage.red.border, // #DC2626
    textAccessible: semanticColors.triage.red.textAccessible, // #991B1B (8.9:1 on surface)
    pulseGlowColor: semanticColors.triage.red.pulseGlow,
    labelEn: "Immediate / Life-Threatening",
    labelHi: "अति-गंभीर / तत्काल जीवन रक्षक",
    descriptionEn: "Severe trauma, cardiac arrest, respiratory failure, stroke, unconsciousness.",
    descriptionHi: "गंभीर आघात, हृदय गति रुकना, सांस लेने में कठिनाई, पक्षाघात, बेहोशी।",
    maxWaitTimeMinutes: 0, // Zero tolerance, immediate dispatch
  },

  URGENT: {
    category: "URGENT",
    esiLevel: "ESI-2/3",
    startCategory: "YELLOW",
    baseColor: semanticColors.triage.yellow.base, // #F59E0B
    surfaceTint: semanticColors.triage.yellow.surface, // #FFFBEB
    borderColor: semanticColors.triage.yellow.border, // #D97706
    textAccessible: semanticColors.triage.yellow.textAccessible, // #78350F (10.4:1 on surface)
    pulseGlowColor: semanticColors.triage.yellow.pulseGlow,
    labelEn: "Urgent / Delayed",
    labelHi: "गंभीर / त्वरित देखभाल",
    descriptionEn: "Severe pain, major fractures, potential airway compromise, vitals stable for 30-60 min.",
    descriptionHi: "अत्यधिक दर्द, बड़े फ्रैक्चर, सांस नली में संभावित रुकावट, 30-60 मिनट तक स्थिर स्थिति।",
    maxWaitTimeMinutes: 15,
  },

  DELAYED: {
    category: "DELAYED",
    esiLevel: "ESI-4/5",
    startCategory: "GREEN",
    baseColor: semanticColors.triage.green.base, // #10B981
    surfaceTint: semanticColors.triage.green.surface, // #ECFDF5
    borderColor: semanticColors.triage.green.border, // #059669
    textAccessible: semanticColors.triage.green.textAccessible, // #065F46 (9.4:1 on surface)
    pulseGlowColor: semanticColors.triage.green.pulseGlow,
    labelEn: "Minor / Walking Wounded",
    labelHi: "साधारण / गैर-आपातकालीन",
    descriptionEn: "Ambulatory patients, minor lacerations, routine transfer, sprains.",
    descriptionHi: "चलने-फिरने योग्य मरीज, मामूली चोटें, सामान्य स्थानांतरण, मोच।",
    maxWaitTimeMinutes: 60,
  },

  EXPECTANT: {
    category: "EXPECTANT",
    esiLevel: "MORTAL",
    startCategory: "BLACK",
    baseColor: semanticColors.triage.black.base, // #1E293B
    surfaceTint: semanticColors.triage.black.surface, // #F1F5F9
    borderColor: semanticColors.triage.black.border, // #475569
    textAccessible: semanticColors.triage.black.textAccessible, // #0F172A (18.7:1 on white)
    pulseGlowColor: semanticColors.triage.black.pulseGlow,
    labelEn: "Expectant / Palliative",
    labelHi: "मृतप्राय / उपशामक देखभाल",
    descriptionEn: "Catastrophic non-survivable injuries, mortal arrest, palliative comfort.",
    descriptionHi: "घातक असहनीय चोटें, जीवन बचाने की संभावना नगण्य, उपशामक देखभाल।",
    maxWaitTimeMinutes: 120,
  },
};
