import type { IconRef } from "../components/AppIcon";
import { SupportedLanguage } from "./onboardingStrings";
import { PrimaryComplaintType } from "@sahayak/domain";

export interface PrimaryComplaintMetadata {
  id: PrimaryComplaintType;
  icon: IconRef;
  title: string;
  hindiTitle: string;
  subtitle: string;
  hindiSubtitle: string;
  quickBadge: string;
  hindiQuickBadge: string;
}

export interface TriageTranslation {
  headerTitle: string;
  headerTagline: string;
  protocolBadge: string;
  speedNotice: string;

  // Primary Complaints Section
  complaintsHeading: string;
  complaintsSubheading: string;

  // Trauma Drill-down Section
  traumaAlertBadgeLabel: string;
  traumaSectionHeading: string;
  traumaSectionSubheading: string;
  respirationLabel: string;
  respirationNormal: string;
  respirationAbnormal: string;
  bleedingLabel: string;
  bleedingControlled: string;
  bleedingActive: string;
  responsivenessLabel: string;
  responsivenessAlert: string;
  responsivenessUnresponsive: string;

  // Urgency Tier Display
  tierAssessmentTitle: string;
  careLevelPrefix: string;
  selectComplaintPrompt: string;
  /** Short label for the disabled action button before a symptom is chosen. */
  selectSymptomCta: string;
  goldenHourActiveBanner: string;

  // Actions
  confirmButtonText: (careLevel: string) => string;
  confirmButtonSubtitle: string;
}

export const PRIMARY_COMPLAINTS: PrimaryComplaintMetadata[] = [
  {
    id: "severe_trauma",
    icon: { set: "mci", name: "flash-alert" },
    title: "Severe Trauma / Accident",
    hindiTitle: "गंभीर चोट / सड़क दुर्घटना",
    subtitle: "High impact collision, fall from height, deep injury",
    hindiSubtitle: "तेज टक्कर, ऊंचाई से गिरना, गहरी चोट",
    quickBadge: "START Triage",
    hindiQuickBadge: "START परीक्षण",
  },
  {
    id: "chest_pain",
    icon: { set: "mci", name: "heart-pulse" },
    title: "Chest Pain / Cardiac",
    hindiTitle: "सीने में दर्द / हृदय संबंधी",
    subtitle: "Crushing chest pressure, arm radiation, sudden collapse",
    hindiSubtitle: "सीने में अत्यधिक दबाव, पसीना, अचानक गिरना",
    quickBadge: "Cat 1 Immediate",
    hindiQuickBadge: "श्रेणी 1 तत्काल",
  },
  {
    id: "breathing_distress",
    icon: { set: "mci", name: "lungs" },
    title: "Breathing Distress",
    hindiTitle: "सांस लेने में गंभीर तकलीफ",
    subtitle: "Severe shortness of breath, choking, blue lips",
    hindiSubtitle: "गंभीर सांस फूलना, दम घुटना, होंठ नीले पड़ना",
    quickBadge: "Cat 1 Immediate",
    hindiQuickBadge: "श्रेणी 1 तत्काल",
  },
  {
    id: "unconscious",
    icon: { set: "mci", name: "brain" },
    title: "Unconscious / Altered Mental",
    hindiTitle: "अचेत / बेहोश / भ्रमित",
    subtitle: "Not waking up, unresponsive, seizure, stroke signs",
    hindiSubtitle: "होश में न होना, दौरा पड़ना, स्ट्रोक के लक्षण",
    quickBadge: "Cat 1 Immediate",
    hindiQuickBadge: "श्रेणी 1 तत्काल",
  },
  {
    id: "minor_injury",
    icon: { set: "ion", name: "bandage" },
    title: "Minor Injury / Non-Emergency",
    hindiTitle: "सामान्य चोट / गैर-आपातकालीन",
    subtitle: "Minor cuts, isolated sprain, planned hospital transfer",
    hindiSubtitle: "हल्की खरोंच, मोच, अस्पताल सामान्य यात्रा",
    quickBadge: "Cat 3 Delayed",
    hindiQuickBadge: "श्रेणी 3 सामान्य",
  },
];

export const triageStrings: Record<SupportedLanguage, TriageTranslation> = {
  en: {
    headerTitle: "Clinical Emergency Triage",
    headerTagline: "START & ESI Protocol Severity Classification",
    protocolBadge: "AIS-125 Triage Engine",
    speedNotice: "Single-tap triage • Completed in <15 seconds",

    complaintsHeading: "Select Primary Medical Complaint",
    complaintsSubheading:
      "Tap the chief complaint to immediately trigger severity classification and life-support matching.",

    traumaAlertBadgeLabel: "START Protocol",
    traumaSectionHeading: "START Protocol Rapid Trauma Check",
    traumaSectionSubheading:
      "3 binary vital checks to pinpoint airway compromise and hemorrhage shock in <5 seconds.",
    respirationLabel: "1. Respiration Status",
    respirationNormal: "Normal (12-20 bpm)",
    respirationAbnormal: "Abnormal (>30 bpm / Gasping)",
    bleedingLabel: "2. Active Severe Bleeding",
    bleedingControlled: "Controlled / None",
    bleedingActive: "Active Heavy Bleeding",
    responsivenessLabel: "3. Responsiveness (Mental Status)",
    responsivenessAlert: "Alert & Answers",
    responsivenessUnresponsive: "Unresponsive / Confused",

    tierAssessmentTitle: "Assessed Urgency Tier",
    careLevelPrefix: "Mandatory Care Level",
    selectComplaintPrompt: "Choose the main symptom below (or describe it) to see the care level.",
    selectSymptomCta: "Choose a symptom to continue",
    goldenHourActiveBanner: "GOLDEN HOUR PROTOCOL ACTIVE • HIGH PRIORITY DISPATCH",

    confirmButtonText: (careLevel: string) =>
      `Proceed with ${careLevel} Ambulance`,
    confirmButtonSubtitle: "Instant ambulance reservation & GPS matching",
  },
  hi: {
    headerTitle: "आपातकालीन चिकित्सीय ट्राइएज",
    headerTagline: "START एवं ESI प्रोटोकॉल गंभीरता मूल्यांकन",
    protocolBadge: "AIS-125 ट्राइएज प्रणाली",
    speedNotice: "एक स्पर्श ट्राइएज • 15 सेकंड से भी कम में पूर्ण",

    complaintsHeading: "प्राथमिक चिकित्सीय समस्या चुनें",
    complaintsSubheading:
      "तत्काल गंभीरता निर्धारण और सही एंबुलेंस आवंटन हेतु मुख्य लक्षण पर स्पर्श करें।",

    traumaAlertBadgeLabel: "START प्रोटोकॉल",
    traumaSectionHeading: "START प्रोटोकॉल त्वरित दुर्घटना परीक्षण",
    traumaSectionSubheading:
      "श्वसन और रक्तस्राव की स्थिति जांचने हेतु 3 त्वरित विकल्प।",
    respirationLabel: "1. श्वसन (सांस की गति)",
    respirationNormal: "सामान्य (12-20 प्रति मिनट)",
    respirationAbnormal: "असामान्य (>30 / दम फूलना)",
    bleedingLabel: "2. अत्यधिक रक्तस्राव",
    bleedingControlled: "नियंत्रित / नहीं",
    bleedingActive: "अत्यधिक / लगातार बहता रक्त",
    responsivenessLabel: "3. मरीज की प्रतिक्रिया (होश)",
    responsivenessAlert: "सचेत / बोल रहा है",
    responsivenessUnresponsive: "अचेत / भ्रमित / अनुत्तरदायी",

    tierAssessmentTitle: "निर्धारित आपातकालीन स्तर",
    careLevelPrefix: "अनिवार्य एंबुलेंस स्तर",
    selectComplaintPrompt: "देखभाल स्तर देखने के लिए नीचे मुख्य लक्षण चुनें (या बताएं)।",
    selectSymptomCta: "आगे बढ़ने के लिए लक्षण चुनें",
    goldenHourActiveBanner: "गोल्डन ऑवर प्रोटोकॉल सक्रिय • सर्वोच्च प्राथमिकता",

    confirmButtonText: (careLevel: string) =>
      `${careLevel} एंबुलेंस के साथ आगे बढ़ें`,
    confirmButtonSubtitle: "त्वरित एंबुलेंस आवंटन एवं GPS ट्रैकिंग",
  },
};
