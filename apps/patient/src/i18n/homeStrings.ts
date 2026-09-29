import { SupportedLanguage } from "./onboardingStrings";

export interface HomeTranslation {
  screenTitle: string;
  screenSubtitle: string;
  requestButtonLabel: string;
  call108Label: string;
  signedInAs: string;
  signOut: string;
  signOutConfirmTitle: string;
  signOutConfirmBody: string;
  signOutCancel: string;
  signOutBlocked: string;
  signOutFailed: string;
}

export const homeStrings: Record<SupportedLanguage, HomeTranslation> = {
  en: {
    screenTitle: "Ek-Ambulance Dispatch",
    screenSubtitle: "Request Emergency Medical Assistance",
    requestButtonLabel: "Request Ambulance",
    call108Label: "Call 108 Emergency Helpline",
    signedInAs: "Signed in as",
    signOut: "Sign out",
    signOutConfirmTitle: "Sign out?",
    signOutConfirmBody: "You will need to sign in with a phone number again before requesting an ambulance.",
    signOutCancel: "Cancel",
    signOutBlocked: "Sign-out is available once your current request or mission has ended.",
    signOutFailed: "Could not sign out. Check your connection and try again.",
  },
  hi: {
    screenTitle: "एक-एंबुलेंस डिस्पैच",
    screenSubtitle: "आपातकालीन चिकित्सा सहायता का अनुरोध करें",
    requestButtonLabel: "एम्बुलेंस का अनुरोध करें",
    call108Label: "108 आपातकालीन हेल्पलाइन",
    signedInAs: "साइन इन:",
    signOut: "साइन आउट",
    signOutConfirmTitle: "साइन आउट करें?",
    signOutConfirmBody: "एंबुलेंस का अनुरोध करने से पहले आपको फ़ोन नंबर से फिर साइन इन करना होगा।",
    signOutCancel: "रद्द करें",
    signOutBlocked: "वर्तमान अनुरोध या मिशन समाप्त होने के बाद साइन आउट उपलब्ध होगा।",
    signOutFailed: "साइन आउट नहीं हो सका। कनेक्शन जाँचकर फिर कोशिश करें।",
  },
};
