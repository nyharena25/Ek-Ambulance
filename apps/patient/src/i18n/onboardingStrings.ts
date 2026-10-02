export type SupportedLanguage = "en" | "hi";

export interface OnboardingTranslation {
  brandName: string;
  brandTagline: string;
  heroHeading: string;
  heroSubheading: string;
  languageToggleLabel: string;
  signInTitle: string;
  signInSubtitle: string;
  createAccountTitle: string;
  createAccountSubtitle: string;
  emergencyDisclaimer: string;
  tollFreeCall: string;
}

export const onboardingStrings: Record<SupportedLanguage, OnboardingTranslation> = {
  en: {
    brandName: "Ek-Ambulance",
    brandTagline: "Emergency ambulance",
    heroHeading: "Welcome to Ek-Ambulance",
    heroSubheading: "Emergency medical assistance when you need it. Sign in with your phone number to request an ambulance.",
    languageToggleLabel: "Language Selector. Current language: English",
    signInTitle: "Sign in",
    signInSubtitle: "Phone number and a 6-digit code",
    createAccountTitle: "Create account",
    createAccountSubtitle: "New here? Your phone number is all you need",
    emergencyDisclaimer: "In a life-threatening emergency, call 108 now. You do not need to sign in to call.",
    tollFreeCall: "Call 108",
  },
  hi: {
    brandName: "एक-एंबुलेंस",
    brandTagline: "आपातकालीन एम्बुलेंस",
    heroHeading: "एक-एंबुलेंस में आपका स्वागत है",
    heroSubheading: "ज़रूरत के समय आपातकालीन चिकित्सा सहायता। एम्बुलेंस बुलाने के लिए अपने फ़ोन नंबर से साइन इन करें।",
    languageToggleLabel: "भाषा चयनकर्ता। वर्तमान भाषा: हिन्दी",
    signInTitle: "साइन इन करें",
    signInSubtitle: "फ़ोन नंबर और 6-अंकीय कोड",
    createAccountTitle: "खाता बनाएँ",
    createAccountSubtitle: "नए हैं? बस आपका फ़ोन नंबर चाहिए",
    emergencyDisclaimer: "जानलेवा आपात स्थिति में अभी 108 पर कॉल करें। कॉल करने के लिए साइन इन ज़रूरी नहीं है।",
    tollFreeCall: "108 पर कॉल करें",
  },
};
