import type { SupportedLanguage } from "./onboardingStrings";

export interface ProfileTranslation {
  title: string;
  back: string;
  accountSection: string;
  phone: string;
  status: string;
  signedIn: string;
  name: string;
  namePlaceholder: string;
  nameHint: string;
  save: string;
  saving: string;
  saved: string;
  saveFailed: string;
  loading: string;
  loadFailed: string;
  retry: string;
  privacySection: string;
  consentPurpose: Record<string, string>;
  consentGiven: (date: string) => string;
  consentWithdrawn: (date: string) => string;
  noConsents: string;
  emergencySection: string;
  call108: string;
  call108Sub: string;
  signOut: string;
  signOutConfirmTitle: string;
  signOutConfirmBody: string;
  cancel: string;
  signOutBlocked: string;
  signOutFailed: string;
}

export const profileStrings: Record<SupportedLanguage, ProfileTranslation> = {
  en: {
    title: "Profile",
    back: "Back",
    accountSection: "Account",
    phone: "Phone number",
    status: "Status",
    signedIn: "Signed in",
    name: "Your name",
    namePlaceholder: "Optional",
    nameHint: "Helps the ambulance crew greet you. You can leave it empty.",
    save: "Save name",
    saving: "Saving…",
    saved: "Saved.",
    saveFailed: "Could not save. Check your connection and try again.",
    loading: "Loading your profile…",
    loadFailed: "Could not load your profile.",
    retry: "Try again",
    privacySection: "Privacy and consent",
    consentPurpose: {
      geolocation: "Location for ambulance pickup",
      medical_data: "Medical information for the crew",
      third_party_llm: "AI help describing the emergency",
    },
    consentGiven: (date) => `Given on ${date}`,
    consentWithdrawn: (date) => `Declined on ${date}`,
    noConsents: "No consent has been recorded yet. You are asked when you sign in.",
    emergencySection: "Emergency",
    call108: "Call 108",
    call108Sub: "National emergency helpline",
    signOut: "Sign out",
    signOutConfirmTitle: "Sign out?",
    signOutConfirmBody: "You will need your phone number and a new code to sign in again.",
    cancel: "Cancel",
    signOutBlocked: "You can sign out after your current ambulance request ends.",
    signOutFailed: "Could not sign out. Check your connection and try again.",
  },
  hi: {
    title: "प्रोफ़ाइल",
    back: "वापस",
    accountSection: "खाता",
    phone: "फ़ोन नंबर",
    status: "स्थिति",
    signedIn: "साइन इन है",
    name: "आपका नाम",
    namePlaceholder: "वैकल्पिक",
    nameHint: "एम्बुलेंस टीम को आपको पहचानने में मदद करता है। आप इसे खाली छोड़ सकते हैं।",
    save: "नाम सहेजें",
    saving: "सहेजा जा रहा है…",
    saved: "सहेज लिया गया।",
    saveFailed: "सहेजा नहीं जा सका। कनेक्शन जाँचकर फिर कोशिश करें।",
    loading: "आपकी प्रोफ़ाइल लोड हो रही है…",
    loadFailed: "आपकी प्रोफ़ाइल लोड नहीं हो सकी।",
    retry: "फिर कोशिश करें",
    privacySection: "गोपनीयता और सहमति",
    consentPurpose: {
      geolocation: "एम्बुलेंस पिकअप के लिए लोकेशन",
      medical_data: "टीम के लिए चिकित्सा जानकारी",
      third_party_llm: "आपात स्थिति बताने में AI सहायता",
    },
    consentGiven: (date) => `${date} को दी गई`,
    consentWithdrawn: (date) => `${date} को अस्वीकार की गई`,
    noConsents: "अभी तक कोई सहमति दर्ज नहीं है। साइन इन करते समय पूछा जाता है।",
    emergencySection: "आपातकाल",
    call108: "108 पर कॉल करें",
    call108Sub: "राष्ट्रीय आपातकालीन हेल्पलाइन",
    signOut: "साइन आउट",
    signOutConfirmTitle: "साइन आउट करें?",
    signOutConfirmBody: "दोबारा साइन इन के लिए फ़ोन नंबर और नया कोड चाहिए होगा।",
    cancel: "रद्द करें",
    signOutBlocked: "मौजूदा एम्बुलेंस अनुरोध समाप्त होने के बाद आप साइन आउट कर सकते हैं।",
    signOutFailed: "साइन आउट नहीं हो सका। कनेक्शन जाँचकर फिर कोशिश करें।",
  },
};
