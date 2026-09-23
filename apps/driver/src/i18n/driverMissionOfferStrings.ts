import { SupportedLanguage } from "./driverOnboardingStrings";
import { UrgencyTier } from "@sahayak/domain";

export interface TriageBadgeDetails {
  code: UrgencyTier;
  title: string;
  badge: string;
  careLevel: string;
  description: string;
  crewRequirement: string;
}

export interface DriverMissionOfferTranslation {
  // Banner & Alert
  alertBannerTitle: string;
  alertWaveTag: string;
  soundAlertMute: string;
  soundAlertUnmute: string;
  incomingOfferHeading: string;

  // 15s Radial Countdown Timer
  timerSecondsRemaining: (seconds: number) => string;
  timerAutoEscalateNotice: string;
  timerExpiredTitle: string;

  // Triage Urgency Badges
  triageBadges: Record<UrgencyTier, TriageBadgeDetails>;
  triageSeverityLabel: string;
  mandatedCareLabel: string;

  // Pickup Location & Distance / ETA
  pickupSectionTitle: string;
  pickupDistanceLabel: string;
  pickupEtaLabel: string;
  trafficStatusNormal: string;
  openGpsNavigationHint: string;

  // Required AIS-125 Vehicle Category & Tier-Eligibility Gate
  requiredVehicleSectionTitle: string;
  requiredVehicleLabel: string;
  yourVehicleLabel: string;
  vehicleTierMismatchBanner: string;
  vehicleTierMismatchSliderPrompt: string;

  // Patient Primary Symptom Summary
  patientSectionTitle: string;
  symptomSummaryLabel: string;
  vitalsOverviewLabel: string;
  patientDemographics: (age: number, gender: string) => string;
  vitalsConscious: string;
  vitalsBleeding: string;
  vitalsBreathing: string;

  // Swipe to Accept Slider
  sliderTrackPrompt: string;
  sliderReleaseToConfirm: string;
  sliderConfirmed: string;
  sliderAccidentalTapNotice: string;

  // Decline Button & Sheet
  btnDecline: string;
  declineSheetTitle: string;
  declineSheetSubtitle: string;
  declineReasonTraffic: string;
  declineReasonMaintenance: string;
  declineReasonPatientOnboard: string;
  declineReasonOther: string;
  btnConfirmDecline: string;
  btnCancelDecline: string;

  // Demo Switcher
  switchAcuityBtn: (current: UrgencyTier) => string;
}

const ACUITY_SHORT_LABEL_EN: Record<UrgencyTier, string> = {
  CAT_1_IMMEDIATE: "RED (ALS)",
  CAT_2_URGENT: "YELLOW (BLS)",
  CAT_3_DELAYED: "GREEN (PTA)",
};

const ACUITY_SHORT_LABEL_HI: Record<UrgencyTier, string> = {
  CAT_1_IMMEDIATE: "लाल (ALS)",
  CAT_2_URGENT: "पीला (BLS)",
  CAT_3_DELAYED: "हरा (PTA)",
};

/**
 * Cycles a driver's demo/verification acuity toggle through the domain's
 * three official urgency tiers. Exhaustive switch: a 4th tier added to
 * UrgencyTier becomes a compile error here rather than a silent no-op.
 */
export function nextUrgencyTier(tier: UrgencyTier): UrgencyTier {
  switch (tier) {
    case "CAT_1_IMMEDIATE":
      return "CAT_2_URGENT";
    case "CAT_2_URGENT":
      return "CAT_3_DELAYED";
    case "CAT_3_DELAYED":
      return "CAT_1_IMMEDIATE";
  }
}

export const driverMissionOfferStrings: Record<SupportedLanguage, DriverMissionOfferTranslation> = {
  en: {
    // Alert Banner
    alertBannerTitle: "EMERGENCY DISPATCH BROADCAST",
    alertWaveTag: "WAVE 1 • HIGH PRIORITY",
    soundAlertMute: "Mute Siren",
    soundAlertUnmute: "Sound Siren",
    incomingOfferHeading: "New Urgent Mission Assigned",

    // Countdown Timer
    timerSecondsRemaining: (sec) => `${sec}s`,
    timerAutoEscalateNotice: "Seconds left to accept before wave escalates to next fleet tier",
    timerExpiredTitle: "Offer Expired • Escalated to Wave 2",

    // Triage Urgency Badges
    triageBadges: {
      CAT_1_IMMEDIATE: {
        code: "CAT_1_IMMEDIATE",
        title: "RED - Critical (ALS Required)",
        badge: "CAT 1 • IMMEDIATE ICU",
        careLevel: "Type D (ALS) Mobile ICU Mandated",
        description: "Cat 1 Immediate Life Threat: Severe poly-trauma, cardiac arrest, or acute respiratory collapse.",
        crewRequirement: "Driver + Certified Paramedic Onboard",
      },
      CAT_2_URGENT: {
        code: "CAT_2_URGENT",
        title: "YELLOW - Urgent (BLS)",
        badge: "CAT 2 • URGENT CARE",
        careLevel: "Type C (BLS) / D Eligible",
        description: "Cat 2 Urgent Trauma: Severe fractures, stabilized respiratory distress, or bleeding control.",
        crewRequirement: "Driver + Trained EMT Crew",
      },
      CAT_3_DELAYED: {
        code: "CAT_3_DELAYED",
        title: "GREEN - Non-Emergency (PTA)",
        badge: "CAT 3 • DELAYED TRANSPORT",
        careLevel: "Type B (PTA) Patient Transport Ambulance",
        description: "Cat 3 Non-Life-Threatening: Minor injury or stable condition; safe, comfortable transfer only.",
        crewRequirement: "Driver + Attendant",
      },
    },
    triageSeverityLabel: "Clinical Severity Tier",
    mandatedCareLabel: "Statutory Life-Support Mandate",

    // Pickup & Navigation
    pickupSectionTitle: "Pickup Location & Route ETA",
    pickupDistanceLabel: "Driving Distance",
    pickupEtaLabel: "Estimated Arrival Time",
    trafficStatusNormal: "Normal Corridor Traffic (Green Corridor Active)",
    openGpsNavigationHint: "Turn-by-turn navigation starts automatically on acceptance",

    // Required Vehicle Tier
    requiredVehicleSectionTitle: "Required AIS-125 Vehicle Category",
    requiredVehicleLabel: "Mission Requires",
    yourVehicleLabel: "Your Registered Vehicle",
    vehicleTierMismatchBanner:
      "Your registered vehicle tier does not match this mission's required AIS-125 category. This offer cannot be accepted from this vehicle.",
    vehicleTierMismatchSliderPrompt: "Vehicle Tier Mismatch - Cannot Accept",

    // Patient Symptoms
    patientSectionTitle: "Patient Clinical Complaint & Triage Summary",
    symptomSummaryLabel: "Primary Reported Symptom",
    vitalsOverviewLabel: "Field Triage Status",
    patientDemographics: (age, gender) => `${gender}, approx. ${age} years old`,
    vitalsConscious: "Consciousness: Responding to voice",
    vitalsBleeding: "Severe Hemorrhage: Active bleeding reported",
    vitalsBreathing: "Respiration: Labored (26 bpm)",

    // Swipe to Accept Slider
    sliderTrackPrompt: "Swipe to Accept Mission",
    sliderReleaseToConfirm: "Release to confirm dispatch",
    sliderConfirmed: "Mission Accepted! Launching Navigation...",
    sliderAccidentalTapNotice: "Swipe slider fully across to prevent accidental taps while driving",

    // Decline
    btnDecline: "Decline / Busy",
    declineSheetTitle: "Decline Dispatch Offer?",
    declineSheetSubtitle:
      "The mission will immediately be reassigned to the next closest ambulance on the Redis dispatch radar.",
    declineReasonTraffic: "Too far away / Blocked in gridlock traffic",
    declineReasonMaintenance: "Vehicle mechanical issue / Low medical oxygen",
    declineReasonPatientOnboard: "Another emergency patient already onboard",
    declineReasonOther: "Personal break / Shift handover in progress",
    btnConfirmDecline: "Confirm Decline & Return to Standby",
    btnCancelDecline: "Keep Reviewing Offer",

    // Demo Switcher
    switchAcuityBtn: (current) => `Test Acuity: Switch to ${ACUITY_SHORT_LABEL_EN[nextUrgencyTier(current)]}`,
  },

  hi: {
    // Alert Banner
    alertBannerTitle: "आपातकालीन डिस्पैच प्रसारण",
    alertWaveTag: "वेव 1 • सर्वोच्च प्राथमिकता",
    soundAlertMute: "सायरन म्यूट करें",
    soundAlertUnmute: "सायरन बजाएं",
    incomingOfferHeading: "नया आपातकालीन मिशन प्राप्त हुआ",

    // Countdown Timer
    timerSecondsRemaining: (sec) => `${sec} से.`,
    timerAutoEscalateNotice: "अगले एंबुलेंस बेड़े में एस्केलेट होने से पूर्व स्वीकार करने हेतु शेष समय",
    timerExpiredTitle: "समय समाप्त • वेव 2 में स्थानांतरित",

    // Triage Urgency Badges
    triageBadges: {
      CAT_1_IMMEDIATE: {
        code: "CAT_1_IMMEDIATE",
        title: "लाल - अति-गंभीर (ALS आवश्यक)",
        badge: "श्रेणी 1 • आपातकालीन ICU",
        careLevel: "टाइप D (ALS) मोबाइल ICU अनिवार्य",
        description: "श्रेणी 1 तत्काल जीवन संकट: गंभीर मल्टी-सिस्टम आघात, कार्डियक अरेस्ट, या तीव्र श्वसन विफलता।",
        crewRequirement: "चालक + प्रमाणित पैरामेडिक उपस्थित होना अनिवार्य",
      },
      CAT_2_URGENT: {
        code: "CAT_2_URGENT",
        title: "पीला - गंभीर (BLS आवश्यक)",
        badge: "श्रेणी 2 • गंभीर चिकित्सा",
        careLevel: "टाइप C (BLS) अथवा D हेतु पात्र",
        description: "श्रेणी 2 गंभीर आघात: फ्रैक्चर, नियंत्रित श्वसन संकट, अथवा घाव व रक्तस्राव नियंत्रण।",
        crewRequirement: "चालक + प्रशिक्षित बेसिक EMT क्रू",
      },
      CAT_3_DELAYED: {
        code: "CAT_3_DELAYED",
        title: "हरा - गैर-आपातकालीन (PTA)",
        badge: "श्रेणी 3 • विलंबित परिवहन",
        careLevel: "टाइप B (PTA) पेशेंट ट्रांसपोर्ट एंबुलेंस",
        description: "श्रेणी 3 गैर-जीवन-घातक: सामान्य चोट या स्थिर स्थिति; केवल सुरक्षित, आरामदायक स्थानांतरण।",
        crewRequirement: "चालक + सहायक",
      },
    },
    triageSeverityLabel: "चिकित्सीय गंभीरता श्रेणी",
    mandatedCareLabel: "वैधानिक लाइफ-सपोर्ट अधिदेश",

    // Pickup & Navigation
    pickupSectionTitle: "पिकअप स्थान एवं पहुंचने का समय (ETA)",
    pickupDistanceLabel: "ड्राइविंग दूरी",
    pickupEtaLabel: "अनुमानित पहुंचने का समय",
    trafficStatusNormal: "सामान्य यातायात कॉरिडोर (ग्रीन कॉरिडोर सक्रिय)",
    openGpsNavigationHint: "स्वीकार करते ही टर्न-बाय-टर्न जीपीएस नेविगेशन स्वतः प्रारंभ होगा",

    // Required Vehicle Tier
    requiredVehicleSectionTitle: "आवश्यक AIS-125 वाहन श्रेणी",
    requiredVehicleLabel: "मिशन हेतु आवश्यक",
    yourVehicleLabel: "आपका पंजीकृत वाहन",
    vehicleTierMismatchBanner:
      "आपके पंजीकृत वाहन की श्रेणी इस मिशन की आवश्यक AIS-125 श्रेणी से मेल नहीं खाती। इस वाहन से यह ऑफर स्वीकार नहीं किया जा सकता।",
    vehicleTierMismatchSliderPrompt: "वाहन श्रेणी असंगत - स्वीकार नहीं किया जा सकता",

    // Patient Symptoms
    patientSectionTitle: "मरीज की प्राथमिक शिकायत एवं ट्रायज सारांश",
    symptomSummaryLabel: "मुख्य रिपोर्टेड लक्षण",
    vitalsOverviewLabel: "फील्ड ट्रायज स्थिति",
    patientDemographics: (age, gender) => `${gender === "Male" ? "पुरुष" : "महिला"}, लगभग ${age} वर्ष`,
    vitalsConscious: "चेतना: आवाज पर प्रतिक्रिया दे रहे हैं",
    vitalsBleeding: "गंभीर रक्तस्राव: सक्रिय रक्तस्राव की सूचना",
    vitalsBreathing: "श्वसन: कष्टदायक सांस (26 bpm)",

    // Swipe to Accept Slider
    sliderTrackPrompt: "मिशन स्वीकारने हेतु स्वाइप करें",
    sliderReleaseToConfirm: "स्वीकृति हेतु छोड़ें",
    sliderConfirmed: "मिशन स्वीकृत! नेविगेशन खुल रहा है...",
    sliderAccidentalTapNotice: "ड्राइविंग के दौरान आकस्मिक स्पर्श रोकने हेतु स्लाइडर को पूरा खींचें",

    // Decline
    btnDecline: "अस्वीकार / व्यस्त",
    declineSheetTitle: "डिस्पैच ऑफर अस्वीकार करें?",
    declineSheetSubtitle:
      "यह मिशन तत्काल Redis डिस्पैच रडार पर उपस्थित अगली निकटतम एंबुलेंस को सौंप दिया जाएगा।",
    declineReasonTraffic: "बहुत दूर / भीषण ट्रैफिक जाम में फंसे हैं",
    declineReasonMaintenance: "वाहन यांत्रिक खराबी / मेडिकल ऑक्सीजन स्तर कम",
    declineReasonPatientOnboard: "एंबुलेंस में पहले से मरीज उपस्थित है",
    declineReasonOther: "व्यक्तिगत अवकाश / शिफ्ट समाप्ति प्रक्रिया में",
    btnConfirmDecline: "अस्वीकार करें एवं स्टैंडबाय पर लौटें",
    btnCancelDecline: "ऑफर की समीक्षा जारी रखें",

    // Demo Switcher
    switchAcuityBtn: (current) => `परीक्षण: ${ACUITY_SHORT_LABEL_HI[nextUrgencyTier(current)]} में बदलें`,
  },
};
