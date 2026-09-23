import { SupportedLanguage } from "./onboardingStrings";

export interface CancellationTranslation {
  screenTitle: string;
  missionIdLabel: (id: string) => string;
  languageToggleLabel: string;
  englishLabel: string;
  hindiLabel: string;
  cancelledBadge: string;
  cancelledTitle: string;
  cancelledDescription: string;
  fallbackGuidanceTitle: string;
  fallbackGuidanceDescription: string;
  call108Button: string;
  call108Subtitle: string;
  returnHomeButton: string;
}

export const cancellationStrings: Record<SupportedLanguage, CancellationTranslation> = {
  en: {
    screenTitle: "Mission Cancelled",
    missionIdLabel: (id: string) => `Mission ID: ${id}`,
    languageToggleLabel: "Language Switch",
    englishLabel: "EN",
    hindiLabel: "हिन्दी",
    cancelledBadge: "CANCELLED",
    cancelledTitle: "This Ambulance Mission Has Been Cancelled",
    cancelledDescription:
      "Dispatch or the assigned driver has cancelled this mission. No ambulance is currently en route to your location.",
    fallbackGuidanceTitle: "Need Immediate Emergency Assistance?",
    fallbackGuidanceDescription:
      "If this is a life-threatening emergency, do not wait for a re-booking. Call the national 108 helpline directly for immediate dispatch, or return home to start a new request.",
    call108Button: "Call 108 National Helpline",
    call108Subtitle: "Direct toll-free ambulance emergency dialer",
    returnHomeButton: "Return to Home & Start New Request",
  },
  hi: {
    screenTitle: "मिशन रद्द किया गया",
    missionIdLabel: (id: string) => `मिशन आईडी: ${id}`,
    languageToggleLabel: "भाषा चयन",
    englishLabel: "EN",
    hindiLabel: "हिन्दी",
    cancelledBadge: "रद्द",
    cancelledTitle: "यह एंबुलेंस मिशन रद्द कर दिया गया है",
    cancelledDescription:
      "डिस्पैच या नियुक्त ड्राइवर द्वारा इस मिशन को रद्द कर दिया गया है। वर्तमान में कोई एंबुलेंस आपके स्थान की ओर नहीं आ रही है।",
    fallbackGuidanceTitle: "तत्काल आपातकालीन सहायता चाहिए?",
    fallbackGuidanceDescription:
      "यदि यह जानलेवा आपातस्थिति है, तो पुनः बुकिंग की प्रतीक्षा न करें। तत्काल डिस्पैच हेतु सीधे 108 राष्ट्रीय हेल्पलाइन पर कॉल करें, या नई बुकिंग हेतु होम स्क्रीन पर लौटें।",
    call108Button: "108 राष्ट्रीय हेल्पलाइन पर कॉल करें",
    call108Subtitle: "निःशुल्क तत्काल आपातकालीन सेवा",
    returnHomeButton: "होम पर लौटें एवं नई बुकिंग करें",
  },
};
