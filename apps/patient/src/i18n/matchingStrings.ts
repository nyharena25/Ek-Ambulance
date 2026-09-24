import { SupportedLanguage } from "./onboardingStrings";

export interface MatchingTranslation {
  // Screen & Header
  screenTitle: string;
  stateMachineState: string;
  languageToggleLabel: string;
  englishLabel: string;
  hindiLabel: string;

  // Radar & Pickup Pin
  radarAria: string;
  pickupPinLabel: string;
  /** Ring label on the radar ("3 km") and a zone's span ("3-6 km"). */
  kmLabel: (km: number) => string;
  kmRange: (from: number, to: number) => string;
  /** Status line while the search is inside a zone. */
  searchingRadius: (from: number, to: number) => string;
  /** State word on each zone's legend chip (never colour alone). */
  zoneSearching: string;
  zoneSearched: string;
  zoneNext: string;
  /** Every zone searched, nobody accepted: the radar is red and this is the status; the action is 108. */
  noAmbulanceCall108: string;
  call108Now: string;

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
  wave3Title: string;
  wave3Subtitle: string;
  wave3StatusPending: string;
  wave3StatusActive: string;
  wave3EscalatedNotice: string;
  /** Shown instead of the countdown sentence once the timer is negative (the request is still open). */
  countdownOverdue: string;
  /** Every offer wave has run; the request stays open to drivers' Booking boards until the server's search window closes. */
  searchExtendedNotice: string;
  /** Any wave after it has run its window (wave1StatusCompleted names "the first wave"). */
  waveWindowElapsed: string;

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
    stateMachineState: "Active Dispatch • XState: Matching",
    languageToggleLabel: "Language switch",
    englishLabel: "EN",
    hindiLabel: "हिन्दी",

    radarAria: "Search area around your pickup point in three zones: up to 3, 6 and 10 kilometres",
    pickupPinLabel: "Pickup Beacon",
    kmLabel: (km) => `${km} km`,
    kmRange: (from, to) => `${from}-${to} km`,
    searchingRadius: (from, to) => `Searching ${from}-${to} km around you`,
    zoneSearching: "Searching",
    zoneSearched: "Searched",
    zoneNext: "Next",
    noAmbulanceCall108: "No ambulance has accepted yet. Call 108 now.",
    call108Now: "Call 108 now",

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
    wave3Title: "Wave 3: 6-10 km",
    wave3Subtitle: "Wide-Area Fleet",
    wave3StatusPending: "Escalates automatically if unaccepted",
    wave3StatusActive: "Escalated: Broadcasting to 6-10 km perimeter",
    wave3EscalatedNotice:
      "Perimeter expanded to 6-10 km to ensure prompt ambulance allocation.",
    waveWindowElapsed: "Broadcast window elapsed",
    countdownOverdue: "Still searching. Your request stays open to nearby ambulances.",
    searchExtendedNotice:
      "Your request stays open in case an ambulance accepts.",

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
    stateMachineState: "सक्रिय प्रेषण • XState: मैचिंग",
    languageToggleLabel: "भाषा चयन",
    englishLabel: "EN",
    hindiLabel: "हिन्दी",

    radarAria: "आपके पिकअप स्थान के आसपास खोज क्षेत्र, तीन दायरों में: 3, 6 और 10 किलोमीटर तक",
    pickupPinLabel: "पिकअप बीकन",
    kmLabel: (km) => `${km} किमी`,
    kmRange: (from, to) => `${from}-${to} किमी`,
    searchingRadius: (from, to) => `आपके आसपास ${from}-${to} किमी में खोज जारी`,
    zoneSearching: "खोज जारी",
    zoneSearched: "खोजा गया",
    zoneNext: "अगला",
    noAmbulanceCall108: "अभी तक किसी एंबुलेंस ने स्वीकार नहीं किया। अभी 108 पर कॉल करें।",
    call108Now: "अभी 108 पर कॉल करें",

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
    wave3Title: "तरंग 3: 6-10 किमी",
    wave3Subtitle: "विस्तृत क्षेत्रीय दल",
    wave3StatusPending: "स्वीकृति न मिलने पर स्वतः विस्तारित होगा",
    wave3StatusActive: "विस्तारित: 6-10 किमी के दायरे में प्रसारण",
    wave3EscalatedNotice:
      "एंबुलेंस शीघ्र उपलब्ध कराने हेतु दायरा 6-10 किमी तक विस्तारित किया गया है।",
    waveWindowElapsed: "प्रसारण समय सीमा समाप्त",
    countdownOverdue: "खोज जारी है। आपका अनुरोध आस-पास की एंबुलेंस के लिए खुला है।",
    searchExtendedNotice:
      "कोई एंबुलेंस स्वीकार कर ले, इसलिए आपका अनुरोध खुला रहेगा।",

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
