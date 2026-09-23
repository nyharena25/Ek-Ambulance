import { SupportedLanguage } from "./onboardingStrings";

export interface MatchingTranslation {
  // Screen & Header
  screenTitle: string;
  searchingStatus: string;
  stateMachineState: string;
  languageToggleLabel: string;
  englishLabel: string;
  hindiLabel: string;

  // Radar & Pickup Pin
  radarAria: string;
  pickupPinLabel: string;
  nearbyFleetCount: (count: number) => string;

  // Dispatch Waves Progress Indicator
  wavesSectionTitle: string;
  wave1Title: string;
  wave1Subtitle: string;
  wave1StatusActive: string;
  wave1StatusCompleted: string;
  wave2Title: string;
  wave2Subtitle: string;
  wave2StatusPending: string;
  wave2StatusActive: string;
  waveEscalatedNotice: string;

  // Driver Acceptance Countdown
  countdownLabel: string;
  countdownSubtext: (seconds: number) => string;
  secondsRemaining: (formatted: string) => string;

  // Mission Context
  requestedVehicleLabel: string;
  pickupLocationLabel: string;
  lifeSupportTelemetry: string;

  // Immediate Cancel
  cancelButtonText: string;
  cancelModalTitle: string;
  cancelModalDescription: string;
  cancelReasonTitle: string;
  reasonAlternative: string;
  reasonResolved: string;
  reasonIncorrectLocation: string;
  reasonOther: string;
  confirmCancelButton: string;
  keepSearchingButton: string;

  // 108 Emergency Fallback Pill
  fallbackPillTitle: string;
  fallbackPillSubtitle: string;
  calling108Alert: string;
  callBadgeLabel: string;
}

export const matchingStrings: Record<SupportedLanguage, MatchingTranslation> = {
  en: {
    screenTitle: "Searching for Ambulance",
    searchingStatus: "BROADCASTING TO FLEET",
    stateMachineState: "Active Dispatch • XState: Matching",
    languageToggleLabel: "Language switch",
    englishLabel: "EN",
    hindiLabel: "हिन्दी",

    radarAria: "Radar animation broadcasting dispatch signal to nearby ambulances",
    pickupPinLabel: "Pickup Beacon",
    nearbyFleetCount: (count: number) =>
      `${count} AIS-125 certified ambulances contacted`,

    wavesSectionTitle: "DISPATCH WAVES ESCALATION",
    wave1Title: "Wave 1: 0-3 km",
    wave1Subtitle: "Immediate Local Fleet",
    wave1StatusActive: "Broadcasting to 0-3 km radius",
    wave1StatusCompleted: "Broadcast window elapsed",
    wave2Title: "Wave 2: 3-6 km",
    wave2Subtitle: "Expanded Regional Fleet",
    wave2StatusPending: "Escalates automatically if unaccepted",
    wave2StatusActive: "Escalated: Broadcasting to 3-6 km perimeter",
    waveEscalatedNotice:
      "Perimeter expanded to 3-6 km to ensure prompt ambulance allocation.",

    countdownLabel: "Driver Acceptance Window",
    countdownSubtext: (seconds: number) =>
      `Nearby ambulances must accept within ${seconds}s before radius escalation`,
    secondsRemaining: (formatted: string) => `${formatted} remaining`,

    requestedVehicleLabel: "AIS-125 VEHICLE SPECIFICATION",
    pickupLocationLabel: "PICKUP LOCATION",
    lifeSupportTelemetry: "Regulated Non-Surge Tariff • Telemetry Active",

    cancelButtonText: "Immediate Cancel",
    cancelModalTitle: "Cancel Emergency Dispatch?",
    cancelModalDescription:
      "Emergency ambulances are actively reviewing your dispatch call. Cancelling now may delay critical medical intervention.",
    cancelReasonTitle: "Reason for cancellation",
    reasonAlternative: "Found alternative transport",
    reasonResolved: "Patient condition stabilized / not needed",
    reasonIncorrectLocation: "Incorrect pickup location entered",
    reasonOther: "Other emergency reason",
    confirmCancelButton: "Yes, Cancel Dispatch",
    keepSearchingButton: "No, Keep Searching",

    fallbackPillTitle: "Emergency 108 Call Fallback",
    fallbackPillSubtitle: "Tap for Free Govt. Emergency Ambulance",
    calling108Alert: "Calling 108 Emergency Helpline...",
    callBadgeLabel: "CALL 108",
  },
  hi: {
    screenTitle: "एंबुलेंस की खोज जारी है",
    searchingStatus: "एंबुलेंस दल को प्रसारण जारी",
    stateMachineState: "सक्रिय प्रेषण • XState: मैचिंग",
    languageToggleLabel: "भाषा चयन",
    englishLabel: "EN",
    hindiLabel: "हिन्दी",

    radarAria: "निकटवर्ती एंबुलेंसों को प्रेषण संकेत प्रसारित करता रडार एनिमेशन",
    pickupPinLabel: "पिकअप बीकन",
    nearbyFleetCount: (count: number) =>
      `${count} AIS-125 प्रमाणित एंबुलेंस से संपर्क जारी`,

    wavesSectionTitle: "प्रेषण तरंग विस्तार (डिस्पैच वेव्स)",
    wave1Title: "तरंग 1: 0-3 किमी",
    wave1Subtitle: "निकटतम स्थानीय दल",
    wave1StatusActive: "0-3 किमी के दायरे में प्रसारण",
    wave1StatusCompleted: "प्रथम तरंग समय सीमा समाप्त",
    wave2Title: "तरंग 2: 3-6 किमी",
    wave2Subtitle: "विस्तारित क्षेत्रीय दल",
    wave2StatusPending: "स्वीकृति न मिलने पर स्वतः विस्तारित होगा",
    wave2StatusActive: "विस्तारित: 3-6 किमी के दायरे में प्रसारण",
    waveEscalatedNotice:
      "एंबुलेंस शीघ्र उपलब्ध कराने हेतु दायरा 3-6 किमी तक विस्तारित किया गया है।",

    countdownLabel: "चालक स्वीकृति समय सीमा",
    countdownSubtext: (seconds: number) =>
      `दायरा विस्तार से पूर्व चालकों के पास स्वीकार करने हेतु ${seconds} सेकंड शेष`,
    secondsRemaining: (formatted: string) => `${formatted} शेष`,

    requestedVehicleLabel: "AIS-125 एंबुलेंस श्रेणी",
    pickupLocationLabel: "पिकअप स्थान",
    lifeSupportTelemetry: "शासकीय नियंत्रित किराया • टेलीमेट्री सक्रिय",

    cancelButtonText: "तत्काल अनुरोध रद्द करें",
    cancelModalTitle: "क्या आपातकालीन प्रेषण रद्द करें?",
    cancelModalDescription:
      "एंबुलेंस दल वर्तमान में आपके अनुरोध की समीक्षा कर रहे हैं। रद्द करने से आपातकालीन सहायता में देरी हो सकती है।",
    cancelReasonTitle: "रद्द करने का कारण चुनें",
    reasonAlternative: "अन्य वाहन का प्रबंध हो गया",
    reasonResolved: "मरीज की स्थिति स्थिर / आवश्यकता नहीं",
    reasonIncorrectLocation: "गलत पिकअप स्थान दर्ज हुआ",
    reasonOther: "अन्य आपातकालीन कारण",
    confirmCancelButton: "हाँ, प्रेषण रद्द करें",
    keepSearchingButton: "नहीं, खोज जारी रखें",

    fallbackPillTitle: "108 आपातकालीन हेल्पलाइन",
    fallbackPillSubtitle: "निःशुल्क शासकीय एंबुलेंस सेवा हेतु स्पर्श करें",
    calling108Alert: "108 आपातकालीन हेल्पलाइन पर कॉल किया जा रहा है...",
    callBadgeLabel: "108 पर कॉल करें",
  },
};
