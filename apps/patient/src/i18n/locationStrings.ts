import { SupportedLanguage } from "./onboardingStrings";

export interface LandmarkPreset {
  id: string;
  name: string;
  hindiName: string;
  address: string;
  hindiAddress: string;
  latitude: number;
  longitude: number;
  expectedState: "DL" | "UP" | "OUT_OF_BOUNDS";
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
  jurisdictionLabel: string;
  outOfZoneTitle: string;
  outOfZoneDescription: string;
  call108Button: string;
  call108Subtitle: string;
  confirmPickupButton: string;
  confirmDisabledText: string;
  coordinatesLabel: string;
  nextStepNotice: string;
  locationPermissionDeniedBanner: string;
  locationUnavailableBanner: string;
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
    expectedState: "DL",
  },
  {
    id: "cp-delhi",
    name: "Connaught Place (Inner Circle)",
    hindiName: "कनॉट प्लेस (इनर सर्किल)",
    address: "Radial Road 1, Connaught Place, New Delhi",
    hindiAddress: "रेडियल रोड 1, कनॉट प्लेस, नई दिल्ली",
    latitude: 28.6315,
    longitude: 77.2167,
    expectedState: "DL",
  },
  {
    id: "fortis-noida",
    name: "Fortis Hospital Noida (Sector 62)",
    hindiName: "फोर्टिस अस्पताल नोएडा (सेक्टर 62)",
    address: "B-22, Sector 62, Gautam Buddha Nagar, Noida, UP",
    hindiAddress: "बी-22, सेक्टर 62, गौतम बुद्ध नगर, नोएडा, उप्र",
    latitude: 28.6186,
    longitude: 77.3685,
    expectedState: "UP",
  },
  {
    id: "max-vaishali",
    name: "Max Super Speciality Hospital Vaishali",
    hindiName: "मैक्स सुपर स्पेशलिटी अस्पताल वैशाली",
    address: "W-3, Sector 1, Vaishali, Ghaziabad, UP",
    hindiAddress: "डब्ल्यू-3, सेक्टर 1, वैशाली, गाजियाबाद, उप्र",
    latitude: 28.6433,
    longitude: 77.3391,
    expectedState: "UP",
  },
  {
    id: "kgmu-lucknow",
    name: "KGMU Trauma Center Lucknow",
    hindiName: "केजीएमयू ट्रॉमा सेंटर लखनऊ",
    address: "Shah Mina Rd, Chowk, Lucknow, Uttar Pradesh",
    hindiAddress: "शाह मीना रोड, चौक, लखनऊ, उत्तर प्रदेश",
    latitude: 26.8687,
    longitude: 80.9168,
    expectedState: "UP",
  },
  {
    id: "mumbai-out-of-bounds",
    name: "Marine Drive, Mumbai (Out-of-Zone Test)",
    hindiName: "मरीन ड्राइव, मुंबई (परीक्षण: क्षेत्र से बाहर)",
    address: "Netaji Subhash Chandra Bose Road, Mumbai, Maharashtra",
    hindiAddress: "नेताजी सुभाष चंद्र बोस रोड, मुंबई, महाराष्ट्र",
    latitude: 18.9432,
    longitude: 72.8230,
    expectedState: "OUT_OF_BOUNDS",
  },
  {
    id: "bengaluru-out-of-bounds",
    name: "Victoria Hospital, Bengaluru (Out-of-Zone Test)",
    hindiName: "विक्टोरिया अस्पताल, बेंगलुरु (परीक्षण: क्षेत्र से बाहर)",
    address: "Fort Road, Kalasipalyam, Bengaluru, Karnataka",
    hindiAddress: "फोर्ट रोड, कलासीपाल्यम, बेंगलुरु, कर्नाटक",
    latitude: 12.9629,
    longitude: 77.5753,
    expectedState: "OUT_OF_BOUNDS",
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
    jurisdictionLabel: "Active Jurisdiction",
    outOfZoneTitle: "Dispatch Unavailable In This Region",
    outOfZoneDescription:
      "Ek-Ambulance on-demand dispatch is currently restricted to the NCT of Delhi and Uttar Pradesh. We cannot dispatch an AIS-125 ambulance to these coordinates.",
    call108Button: "Call 108 National Helpline",
    call108Subtitle: "Direct toll-free ambulance emergency dialer",
    confirmPickupButton: "Confirm Pickup Location",
    confirmDisabledText: "Select location inside Delhi or UP",
    coordinatesLabel: "GPS Telemetry",
    nextStepNotice: "Next: Select Care Level (ALS / BLS / PTA)",
    locationPermissionDeniedBanner:
      "Location permission denied. Select your pickup point manually on the map below.",
    locationUnavailableBanner:
      "Unable to fetch your current GPS position. Select your pickup point manually on the map below.",
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
    jurisdictionLabel: "सक्रिय कार्यक्षेत्र",
    outOfZoneTitle: "इस क्षेत्र में सेवा उपलब्ध नहीं है",
    outOfZoneDescription:
      "एक-एंबुलेंस ऑन-डिमांड सेवा वर्तमान में केवल राष्ट्रीय राजधानी क्षेत्र (NCT) दिल्ली और उत्तर प्रदेश में ही संचालित है। इस स्थान के लिए एंबुलेंस नहीं भेजी जा सकती।",
    call108Button: "108 राष्ट्रीय हेल्पलाइन पर कॉल करें",
    call108Subtitle: "निःशुल्क तत्काल आपातकालीन सेवा",
    confirmPickupButton: "पिकअप स्थान सुनिश्चित करें",
    confirmDisabledText: "कृपया दिल्ली या उप्र का स्थान चुनें",
    coordinatesLabel: "GPS निर्देशांक",
    nextStepNotice: "अगला चरण: एंबुलेंस श्रेणी का चयन (ALS / BLS / PTA)",
    locationPermissionDeniedBanner:
      "स्थान अनुमति अस्वीकृत। कृपया नीचे नक्शे पर मैन्युअल रूप से पिकअप स्थान चुनें।",
    locationUnavailableBanner:
      "वर्तमान GPS स्थान प्राप्त करने में असमर्थ। कृपया नीचे नक्शे पर मैन्युअल रूप से पिकअप स्थान चुनें।",
  },
};
