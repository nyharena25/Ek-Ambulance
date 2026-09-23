import { SupportedLanguage } from "./onboardingStrings";

export interface ConfirmTranslation {
  screenTitle: string;
  pickupLocationLabel: string;
  fleetVehicleLabel: string;
}

export const confirmStrings: Record<SupportedLanguage, ConfirmTranslation> = {
  en: {
    screenTitle: "Confirm Ambulance Dispatch",
    pickupLocationLabel: "PICKUP LOCATION",
    fleetVehicleLabel: "AIS-125 FLEET VEHICLE",
  },
  hi: {
    screenTitle: "एंबुलेंस डिस्पैच की पुष्टि करें",
    pickupLocationLabel: "पिकअप स्थान",
    fleetVehicleLabel: "AIS-125 फ्लीट वाहन",
  },
};
