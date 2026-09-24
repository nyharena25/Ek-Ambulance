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
  /** Says who ended the mission when the server told us; falls back to `cancelledDescription` (P12: no invented cause). */
  cancelledDescriptionFor: (cancelledBy?: string, reason?: string) => string;
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
    cancelledDescriptionFor: (by?: string, reason?: string) =>
      reason === "no_ambulance_available"
        ? "No ambulance was available near you. Please call 108 now."
        : by === "patient"
          ? "You cancelled this request. No ambulance is en route."
          : by === "driver"
            ? "The ambulance crew could not complete this mission. If you need help now, call 108."
            : "Dispatch or the assigned driver has cancelled this mission. No ambulance is currently en route to your location.",
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
    cancelledDescriptionFor: (by?: string, reason?: string) =>
      reason === "no_ambulance_available"
        ? "आपके पास कोई एम्बुलेंस उपलब्ध नहीं थी। कृपया अभी 108 पर कॉल करें।"
        : by === "patient"
          ? "आपने यह अनुरोध रद्द किया। कोई एम्बुलेंस रास्ते में नहीं है।"
          : by === "driver"
            ? "एम्बुलेंस क्रू यह मिशन पूरा नहीं कर सका। यदि अभी मदद चाहिए तो 108 पर कॉल करें।"
            : "डिस्पैच या नियुक्त ड्राइवर द्वारा इस मिशन को रद्द कर दिया गया है। वर्तमान में कोई एंबुलेंस आपके स्थान की ओर नहीं आ रही है।",
    fallbackGuidanceTitle: "तत्काल आपातकालीन सहायता चाहिए?",
    fallbackGuidanceDescription:
      "यदि यह जानलेवा आपातस्थिति है, तो पुनः बुकिंग की प्रतीक्षा न करें। तत्काल डिस्पैच हेतु सीधे 108 राष्ट्रीय हेल्पलाइन पर कॉल करें, या नई बुकिंग हेतु होम स्क्रीन पर लौटें।",
    call108Button: "108 राष्ट्रीय हेल्पलाइन पर कॉल करें",
    call108Subtitle: "निःशुल्क तत्काल आपातकालीन सेवा",
    returnHomeButton: "होम पर लौटें एवं नई बुकिंग करें",
  },
};
