import { SupportedLanguage } from "./onboardingStrings";

export interface HomeTranslation {
  screenTitle: string;
  screenSubtitle: string;
  requestButtonLabel: string;
  call108Label: string;
}

export const homeStrings: Record<SupportedLanguage, HomeTranslation> = {
  en: {
    screenTitle: "Ek-Ambulance Dispatch",
    screenSubtitle: "Request Emergency Medical Assistance",
    requestButtonLabel: "Request Ambulance",
    call108Label: "Call 108 Emergency Helpline",
  },
  hi: {
    screenTitle: "एक-एंबुलेंस डिस्पैच",
    screenSubtitle: "आपातकालीन चिकित्सा सहायता का अनुरोध करें",
    requestButtonLabel: "एम्बुलेंस का अनुरोध करें",
    call108Label: "108 आपातकालीन हेल्पलाइन",
  },
};
