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
    heroSubheading: "Request an ambulance to your location and follow it on the map. Sign in with your phone number first.",
    languageToggleLabel: "Language Selector. Current language: English",
    signInTitle: "Sign in",
    signInSubtitle: "I already have an account",
    createAccountTitle: "Create account",
    createAccountSubtitle: "First time? Sign up with your phone number",
    emergencyDisclaimer: "In a life-threatening emergency, call 108 now. You do not need to sign in to call.",
    tollFreeCall: "Call 108",
  },
  hi: {
    brandName: "एक-एंबुलेंस",
    brandTagline: "आपातकालीन एम्बुलेंस",
    heroHeading: "एक-एंबुलेंस में आपका स्वागत है",
    heroSubheading: "अपने स्थान पर एम्बुलेंस बुलाएँ और मानचित्र पर उसे देखें। पहले अपने फ़ोन नंबर से साइन इन करें।",
    languageToggleLabel: "भाषा चयनकर्ता। वर्तमान भाषा: हिन्दी",
    signInTitle: "साइन इन करें",
    signInSubtitle: "मेरा खाता पहले से है",
    createAccountTitle: "खाता बनाएँ",
    createAccountSubtitle: "पहली बार? अपने फ़ोन नंबर से साइन अप करें",
    emergencyDisclaimer: "जानलेवा आपात स्थिति में अभी 108 पर कॉल करें। कॉल करने के लिए साइन इन ज़रूरी नहीं है।",
    tollFreeCall: "108 पर कॉल करें",
  },
};
