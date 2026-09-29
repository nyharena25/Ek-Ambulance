import { SupportedLanguage } from "./onboardingStrings";

export interface ConfirmTranslation {
  screenTitle: string;
  pickupLocationLabel: string;
  fleetVehicleLabel: string;
  signInRequired: string;
  call108: string;
  /** Shown instead of the fare sheet when this screen was reached without a real pickup lat/lon (e.g. a stale
   *  deep link) - a missing location must never be silently replaced by a hardcoded address before dispatch. */
  pickupLocationMissing: string;
}

export const confirmStrings: Record<SupportedLanguage, ConfirmTranslation> = {
  en: {
    screenTitle: "Confirm Ambulance Dispatch",
    pickupLocationLabel: "PICKUP LOCATION",
    fleetVehicleLabel: "AIS-125 FLEET VEHICLE",
    signInRequired: "Sign in with your phone number to request an ambulance. If this is an emergency, call 108 now.",
    call108: "Call 108",
    pickupLocationMissing: "We lost your pickup location. Please go back and set it again. If this is an emergency, call 108 now.",
  },
  hi: {
    screenTitle: "एंबुलेंस डिस्पैच की पुष्टि करें",
    pickupLocationLabel: "पिकअप स्थान",
    fleetVehicleLabel: "AIS-125 फ्लीट वाहन",
    signInRequired: "एम्बुलेंस के लिए अपने फ़ोन नंबर से साइन इन करें। यदि यह आपात स्थिति है, तो अभी 108 पर कॉल करें।",
    call108: "108 पर कॉल करें",
    pickupLocationMissing: "आपका पिकअप स्थान नहीं मिला। कृपया वापस जाएं और इसे फिर से सेट करें। यदि यह आपातकाल है, तो अभी 108 पर कॉल करें।",
  },
};
