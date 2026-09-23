import type { CareLevel, TriageSymptomFlag } from "../types/index.ts";

export type UrgencyTier = "CAT_1_IMMEDIATE" | "CAT_2_URGENT" | "CAT_3_DELAYED";

export type PrimaryComplaintType =
  | "severe_trauma"
  | "chest_pain"
  | "breathing_distress"
  | "unconscious"
  | "minor_injury";

export interface TraumaBinaryAssessment {
  respiration: "normal" | "abnormal"; // Normal (12-20 bpm) vs Abnormal (>30 bpm / gasping / shallow)
  severeBleeding: boolean; // Active uncontrolled arterial or heavy bleeding
  responsiveness: "alert" | "unresponsive"; // Alert & responds vs Unresponsive / altered / confused
}

export interface TriageInput {
  primaryComplaint: PrimaryComplaintType;
  traumaAssessment?: TraumaBinaryAssessment;
}

export interface TriageResult {
  tier: UrgencyTier;
  tierCategory: "Cat 1" | "Cat 2" | "Cat 3";
  tierName: string;
  hindiTierName: string;
  tierColorHex: string;
  tierBgHex: string;
  recommendedCareLevel: CareLevel; // "ALS" | "BLS" | "PTA"
  clinicalRationale: string;
  hindiClinicalRationale: string;
  goldenHourActive: boolean;
  symptomFlags: TriageSymptomFlag[];
}

/**
 * START & ESI Protocol Triage Evaluator
 *
 * Rules:
 * 1. Chest Pain, Breathing Distress, Unconscious -> Immediate Tier 1 (Red / ALS)
 * 2. Severe Trauma -> Evaluated via START:
 *    - If Respiration is abnormal (>30 bpm or agonal) OR
 *    - Active severe bleeding is present OR
 *    - Responsiveness is altered/unresponsive
 *    -> Tier 1 (Red / ALS)
 *    - Otherwise (normal respiration, controlled bleeding, alert)
 *    -> Tier 2 (Yellow / BLS)
 * 3. Minor Injury / Non-Emergency -> Tier 3 (Green / PTA)
 */
export function computeTriageUrgency(input: TriageInput): TriageResult {
  const { primaryComplaint, traumaAssessment } = input;

  switch (primaryComplaint) {
    case "chest_pain":
      return {
        tier: "CAT_1_IMMEDIATE",
        tierCategory: "Cat 1",
        tierName: "Red - Immediate",
        hindiTierName: "लाल - तत्काल (अति गंभीर)",
        tierColorHex: "#DC2626", // Red-600
        tierBgHex: "#FEF2F2",    // Red-50
        recommendedCareLevel: "ALS",
        clinicalRationale:
          "Potential acute coronary syndrome / cardiac arrest risk. Mandates immediate ALS dispatch with ECG, defibrillator, and cardiac medications.",
        hindiClinicalRationale:
          "हृदय गति रुकने या हार्ट अटैक का संभावित खतरा। डिफिब्रिलेटर और ईसीजी युक्त ALS एंबुलेंस तत्काल आवश्यक।",
        goldenHourActive: true,
        symptomFlags: ["chest_pain", "cardiac_arrest"],
      };

    case "breathing_distress":
      return {
        tier: "CAT_1_IMMEDIATE",
        tierCategory: "Cat 1",
        tierName: "Red - Immediate",
        hindiTierName: "लाल - तत्काल (अति गंभीर)",
        tierColorHex: "#DC2626",
        tierBgHex: "#FEF2F2",
        recommendedCareLevel: "ALS",
        clinicalRationale:
          "Imminent respiratory compromise. Mandates ALS unit with calibrated mechanical ventilator, high-flow oxygen, and airway management.",
        hindiClinicalRationale:
          "सांस लेने में गंभीर रुकावट। वेंटिलेटर, ऑक्सीजन और प्रशिक्षित पैरामेडिक युक्त ALS एंबुलेंस आवश्यक।",
        goldenHourActive: true,
        symptomFlags: ["breathing_difficulty"],
      };

    case "unconscious":
      return {
        tier: "CAT_1_IMMEDIATE",
        tierCategory: "Cat 1",
        tierName: "Red - Immediate",
        hindiTierName: "लाल - तत्काल (अति गंभीर)",
        tierColorHex: "#DC2626",
        tierBgHex: "#FEF2F2",
        recommendedCareLevel: "ALS",
        clinicalRationale:
          "Unresponsive or severely altered mental status. High risk of airway compromise or acute neurological event (stroke/coma).",
        hindiClinicalRationale:
          "मरीज अचेत या बेहोश। स्ट्रोक या गंभीर आघात का खतरा। तुरंत ALS लाइफ-सपोर्ट एंबुलेंस की आवश्यकता।",
        goldenHourActive: true,
        symptomFlags: ["unconscious", "stroke_symptoms", "head_injury"],
      };

    case "severe_trauma": {
      const assessment = traumaAssessment || {
        respiration: "normal",
        severeBleeding: false,
        responsiveness: "alert",
      };

      const hasRespiratoryFailure = assessment.respiration === "abnormal";
      const hasHemorrhage = assessment.severeBleeding;
      const isAltered = assessment.responsiveness === "unresponsive";

      // START Protocol: Any failed vital checkpoint leads to RED / Immediate
      if (hasRespiratoryFailure || hasHemorrhage || isAltered) {
        const triggers: string[] = [];
        const hindiTriggers: string[] = [];
        if (hasRespiratoryFailure) {
          triggers.push("abnormal respiration (>30 bpm)");
          hindiTriggers.push("असामान्य श्वसन दर (>30)");
        }
        if (hasHemorrhage) {
          triggers.push("uncontrolled active bleeding");
          hindiTriggers.push("अत्यधिक रक्तस्राव");
        }
        if (isAltered) {
          triggers.push("altered responsiveness");
          hindiTriggers.push("अचेत या भ्रमित अवस्था");
        }

        return {
          tier: "CAT_1_IMMEDIATE",
          tierCategory: "Cat 1",
          tierName: "Red - Immediate",
          hindiTierName: "लाल - तत्काल (अति गंभीर)",
          tierColorHex: "#DC2626",
          tierBgHex: "#FEF2F2",
          recommendedCareLevel: "ALS",
          clinicalRationale: `START Protocol Red Alert: Severe trauma accompanied by ${triggers.join(
            ", "
          )}. Requires immediate ALS trauma team and Golden Hour resuscitation.`,
          hindiClinicalRationale: `START प्रोटोकॉल रेड अलर्ट: गंभीर दुर्घटना के साथ ${hindiTriggers.join(
            ", "
          )}। गोल्डन ऑवर में तत्काल ALS ट्रॉमा एंबुलेंस आवश्यक।`,
          goldenHourActive: true,
          symptomFlags: ["trauma", "severe_bleeding"],
        };
      }

      // START Protocol: Respiration < 30, bleeding controlled, alert -> Yellow / Urgent
      return {
        tier: "CAT_2_URGENT",
        tierCategory: "Cat 2",
        tierName: "Yellow - Urgent",
        hindiTierName: "पीला - गंभीर (तत्काल)",
        tierColorHex: "#B45309", // Amber-700
        tierBgHex: "#FFFBEB",    // Amber-50
        recommendedCareLevel: "BLS",
        clinicalRationale:
          "START Protocol Yellow Alert: Severe trauma with stable respiration, controlled bleeding, and alert response. Requires urgent BLS stabilization with oxygen & splints.",
        hindiClinicalRationale:
          "START प्रोटोकॉल येलो अलर्ट: स्थिर श्वसन और नियंत्रित रक्तस्राव के साथ चोट। ऑक्सीजन और प्राथमिक उपचार हेतु BLS एंबुलेंस आवश्यक।",
        goldenHourActive: false,
        symptomFlags: ["trauma", "fracture"],
      };
    }

    case "minor_injury":
    default:
      return {
        tier: "CAT_3_DELAYED",
        tierCategory: "Cat 3",
        tierName: "Green - Delayed",
        hindiTierName: "हरा - सामान्य (सुरक्षित)",
        tierColorHex: "#15803D", // Green-700
        tierBgHex: "#F0FDF4",    // Green-50
        recommendedCareLevel: "PTA",
        clinicalRationale:
          "Non-life-threatening or minor injury. Patient Transport Ambulance (PTA) is sufficient for safe, comfortable transfer to hospital.",
        hindiClinicalRationale:
          "सामान्य चोट या गैर-आपातकालीन स्थिति। अस्पताल सुरक्षित आवागमन के लिए सामान्य पेशेंट ट्रांसपोर्ट एंबुलेंस (PTA) उपयुक्त।",
        goldenHourActive: false,
        symptomFlags: ["other"],
      };
  }
}
