import { SupportedLanguage } from "./onboardingStrings";

export interface HomeTranslation {
  screenTitle: string;
  screenSubtitle: string;
}

export const homeStrings: Record<SupportedLanguage, HomeTranslation> = {
  en: {
    screenTitle: "Ek-Ambulance Dispatch",
    screenSubtitle: "Request Emergency Medical Assistance",
  },
  hi: {
    screenTitle: "एक-एंबुलेंस डिस्पैच",
    screenSubtitle: "आपातकालीन चिकित्सा सहायता का अनुरोध करें",
  },
};
