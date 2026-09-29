import { SupportedLanguage } from "./onboardingStrings";

export interface LandmarkPreset {
  id: string;
  name: string;
  hindiName: string;
  address: string;
  hindiAddress: string;
  latitude: number;
  longitude: number;
}

export interface LocationTranslation {
  headerTitle: string;
  headerTagline: string;
  searchPlaceholder: string;
  searchRecentTitle: string;
  locateMeLabel: string;
  locateMeHint: string;
  pinCalloutTitle: string;
  pinInstruction: string;
  confirmPickupButton: string;
  confirmDisabledText: string;
  coordinatesLabel: string;
  nextStepNotice: string;
  locationPermissionDeniedBanner: string;
  locationUnavailableBanner: string;
  locationTimeoutBanner: string;
}

export const LANDMARK_PRESETS: LandmarkPreset[] = [
  {
    id: "aiims-delhi",
    name: "AIIMS New Delhi (Main Emergency)",
    hindiName: "एम्स नई दिल्ली (मुख्य आपातकालीन वार्ड)",
    address: "Ansari Nagar, Sri Aurobindo Marg, New Delhi",
    hindiAddress: "अंसारी नगर, श्री अरबिंदो मार्ग, नई दिल्ली",
    latitude: 28.5672,
    longitude: 77.2100,
  },
  {
    id: "cp-delhi",
    name: "Connaught Place (Inner Circle)",
    hindiName: "कनॉट प्लेस (इनर सर्किल)",
    address: "Radial Road 1, Connaught Place, New Delhi",
    hindiAddress: "रेडियल रोड 1, कनॉट प्लेस, नई दिल्ली",
    latitude: 28.6315,
    longitude: 77.2167,
  },
  {
    id: "fortis-noida",
    name: "Fortis Hospital Noida (Sector 62)",
    hindiName: "फोर्टिस अस्पताल नोएडा (सेक्टर 62)",
    address: "B-22, Sector 62, Gautam Buddha Nagar, Noida, UP",
    hindiAddress: "बी-22, सेक्टर 62, गौतम बुद्ध नगर, नोएडा, उप्र",
    latitude: 28.6186,
    longitude: 77.3685,
  },
  {
    id: "max-vaishali",
    name: "Max Super Speciality Hospital Vaishali",
    hindiName: "मैक्स सुपर स्पेशलिटी अस्पताल वैशाली",
    address: "W-3, Sector 1, Vaishali, Ghaziabad, UP",
    hindiAddress: "डब्ल्यू-3, सेक्टर 1, वैशाली, गाजियाबाद, उप्र",
    latitude: 28.6433,
    longitude: 77.3391,
  },
  {
    id: "kgmu-lucknow",
    name: "KGMU Trauma Center Lucknow",
    hindiName: "केजीएमयू ट्रॉमा सेंटर लखनऊ",
    address: "Shah Mina Rd, Chowk, Lucknow, Uttar Pradesh",
    hindiAddress: "शाह मीना रोड, चौक, लखनऊ, उत्तर प्रदेश",
    latitude: 26.8687,
    longitude: 80.9168,
  },
];

export const locationStrings: Record<SupportedLanguage, LocationTranslation> = {
  en: {
    headerTitle: "Select Pickup Location",
    headerTagline: "Real-Time Emergency Geofence",
    searchPlaceholder: "Search hospital, landmark, or sector...",
    searchRecentTitle: "Suggested Hospitals & Landmarks",
    locateMeLabel: "Locate Me",
    locateMeHint: "Snap map to your current GPS position",
    pinCalloutTitle: "Set Ambulance Pickup",
    pinInstruction: "Drag the map to position pin at patient location",
    confirmPickupButton: "Confirm Pickup Location",
    confirmDisabledText: "Set the pickup point first",
    coordinatesLabel: "GPS Telemetry",
    nextStepNotice: "Next: Select Care Level (ALS / BLS / PTA)",
    locationPermissionDeniedBanner:
      "Location permission denied. Select your pickup point manually on the map below.",
    locationUnavailableBanner:
      "Unable to fetch your current GPS position. Select your pickup point manually on the map below.",
    locationTimeoutBanner:
      "GPS fix is taking too long. Select your pickup point manually on the map below.",
  },
  hi: {
    headerTitle: "पिकअप स्थान चुनें",
    headerTagline: "रीयल-टाइम आपातकालीन जियोफेंस",
    searchPlaceholder: "अस्पताल, लैंडमार्क या सेक्टर खोजें...",
    searchRecentTitle: "प्रमुख अस्पताल एवं लैंडमार्क",
    locateMeLabel: "मेरा स्थान",
    locateMeHint: "वर्तमान GPS स्थान पर जाएं",
    pinCalloutTitle: "एंबुलेंस पिकअप बिंदु",
    pinInstruction: "मरीज के सटीक स्थान पर पिन सेट करने हेतु नक्शा खिसकाएं",
    confirmPickupButton: "पिकअप स्थान सुनिश्चित करें",
    confirmDisabledText: "पहले पिकअप स्थान चुनें",
    coordinatesLabel: "GPS निर्देशांक",
    nextStepNotice: "अगला चरण: एंबुलेंस श्रेणी का चयन (ALS / BLS / PTA)",
    locationPermissionDeniedBanner:
      "स्थान अनुमति अस्वीकृत। कृपया नीचे नक्शे पर मैन्युअल रूप से पिकअप स्थान चुनें।",
    locationUnavailableBanner:
      "वर्तमान GPS स्थान प्राप्त करने में असमर्थ। कृपया नीचे नक्शे पर मैन्युअल रूप से पिकअप स्थान चुनें।",
    locationTimeoutBanner:
      "GPS स्थान प्राप्त करने में अधिक समय लग रहा है। कृपया नीचे नक्शे पर मैन्युअल रूप से पिकअप स्थान चुनें।",
  },
};
