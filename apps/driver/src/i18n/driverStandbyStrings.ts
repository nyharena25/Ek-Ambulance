import { AIS125VehicleType } from "@sahayak/domain";
import { SupportedLanguage } from "./driverOnboardingStrings";

export interface DriverStandbyTranslation {
  // Navigation & Header
  pilotStatusOnline: string;
  pilotStatusOffline: string;

  // Prominent 'Go Online' / 'Go Offline' Toggle
  btnGoOnline: string;
  btnGoOnlineSubtitle: string;
  btnGoOffline: string;
  btnGoOfflineSubtitle: string;
  offlineBannerStatus: string;

  // Active Service Area Map
  mapSectionTitle: string;
  btnRecenterGps: string;

  // Current Registered Jurisdiction
  jurisdictionSectionTitle: string;
  jurisdictionChangeHint: string;
  serviceZoneLoading: string;
  serviceZoneNotSet: string;

  // Registered AIS-125 Tier Badge
  ais125TierTitle: string;
  ais125TierBadge: Record<AIS125VehicleType, {
    title: string;
    subtitle: string;
    badge: string;
  }>;

  // Offline Confirmation Modal
  offlineModalTitle: string;
  offlineModalSubtitle: string;
  offlineModalReasonShiftEnd: string;
  offlineModalReasonBreak: string;
  offlineModalReasonFuel: string;
  offlineModalConfirmBtn: string;
  offlineModalCancelBtn: string;

  documentsButton: string;
  waitingForGps: string;
  kycStatus: Record<string, string>;
  presenceRefused: string;
}

export const driverStandbyStrings: Record<SupportedLanguage, DriverStandbyTranslation> = {
  en: {
    // Header
    pilotStatusOnline: "ONLINE • STANDBY FOR DISPATCH",
    pilotStatusOffline: "OFFLINE • SHIFT PAUSED",

    // Toggle
    btnGoOnline: "GO ONLINE • START DISPATCH SHIFT",
    btnGoOnlineSubtitle: "Shares your live location so nearby emergencies can reach you",
    btnGoOffline: "GO OFFLINE • PAUSE DISPATCH",
    btnGoOfflineSubtitle: "Stops new emergency offers and location sharing",
    offlineBannerStatus: "Shift Offline • Dispatch Offers Suspended",

    // Service Area Map
    mapSectionTitle: "Active Dispatch Service Area",
    btnRecenterGps: "Recenter GPS",

    // Jurisdiction
    jurisdictionSectionTitle: "Registered service zone",
    jurisdictionChangeHint: "From your profile. Tap to change it in Profile.",
    serviceZoneLoading: "Loading your profile…",
    serviceZoneNotSet: "Not set - choose your service zone in Profile",

    // AIS-125 Tier Badge
    ais125TierTitle: "Registered ambulance classification",
    ais125TierBadge: {
      TYPE_D_ALS: {
        title: "Type D: Advanced Life Support (ALS)",
        subtitle: "Mobile Intensive Care Unit (ICU on Wheels)",
        badge: "CAT 1 • ICU FLEET",
      },
      TYPE_C_BLS: {
        title: "Type C: Basic Life Support (BLS)",
        subtitle: "Urgent Trauma & Stabilization Ambulance",
        badge: "CAT 2 • URGENT CARE",
      },
      TYPE_B_PTA: {
        title: "Type B: Patient Transport Ambulance (PTA)",
        subtitle: "Non-Emergency & Dialysis Transit",
        badge: "CAT 3 • PATIENT TRANSIT",
      },
      TYPE_A_MFR: {
        title: "Type A: Medical First Responder (MFR)",
        subtitle: "Rapid First Response & Urban Interceptor",
        badge: "CAT 4 • RAPID RESPONSE",
      },
    },
    // Offline Modal
    offlineModalTitle: "Confirm Going Offline?",
    offlineModalSubtitle: "You will stop receiving emergency offers until you go online again.",
    offlineModalReasonShiftEnd: "End of Shift / Relief Pilot Arrived",
    offlineModalReasonBreak: "Meal / Rest Break (30 mins)",
    offlineModalReasonFuel: "Fuel / Vehicle Maintenance / Oxygen Refill",
    offlineModalConfirmBtn: "Yes, Go Offline Now",
    offlineModalCancelBtn: "Remain Online",
    documentsButton: "Application & KYC",
    waitingForGps: "Waiting for your GPS location…",
    kycStatus: { draft: "KYC not submitted", pending_verification: "KYC under review", approved: "KYC approved", rejected: "KYC rejected" },
    presenceRefused: "Could not go online.",
  },

  hi: {
    // Header
    pilotStatusOnline: "ऑनलाइन • डिस्पैच हेतु स्टैंडबाय",
    pilotStatusOffline: "ऑफलाइन • शिफ्ट रुकी हुई",

    // Toggle
    btnGoOnline: "ऑनलाइन आएं • डिस्पैच शिफ्ट शुरू करें",
    btnGoOnlineSubtitle: "आपकी लाइव लोकेशन साझा करता है ताकि पास की आपात स्थितियाँ आप तक पहुँचें",
    btnGoOffline: "ऑफलाइन जाएं • डिस्पैच रोकें",
    btnGoOfflineSubtitle: "नए आपात ऑफ़र और लोकेशन साझा करना बंद करता है",
    offlineBannerStatus: "शिफ्ट ऑफलाइन • डिस्पैच कॉल्स निलंबित",

    // Service Area Map
    mapSectionTitle: "सक्रिय डिस्पैच सेवा क्षेत्र",
    btnRecenterGps: "GPS रीसेंटर करें",

    // Jurisdiction
    jurisdictionSectionTitle: "पंजीकृत सेवा क्षेत्र",
    jurisdictionChangeHint: "आपकी प्रोफ़ाइल से। बदलने के लिए टैप करें।",
    serviceZoneLoading: "आपकी प्रोफ़ाइल लोड हो रही है…",
    serviceZoneNotSet: "सेट नहीं - प्रोफ़ाइल में अपना सेवा क्षेत्र चुनें",

    // AIS-125 Tier Badge
    ais125TierTitle: "पंजीकृत एंबुलेंस वर्गीकरण",
    ais125TierBadge: {
      TYPE_D_ALS: {
        title: "टाइप D: एडवांस्ड लाइफ सपोर्ट (ALS)",
        subtitle: "मोबाइल गहन चिकित्सा इकाई (पहियों पर ICU)",
        badge: "श्रेणी 1 • मोबाइल ICU",
      },
      TYPE_C_BLS: {
        title: "टाइप C: बेसिक लाइफ सपोर्ट (BLS)",
        subtitle: "आपातकालीन आघात एवं स्थिरीकरण एंबुलेंस",
        badge: "श्रेणी 2 • गंभीर चिकित्सा",
      },
      TYPE_B_PTA: {
        title: "टाइप B: पेशेंट ट्रांसपोर्ट एंबुलेंस (PTA)",
        subtitle: "सामान्य रोगी एवं डायलिसिस स्थानांतरण",
        badge: "श्रेणी 3 • रोगी परिवहन",
      },
      TYPE_A_MFR: {
        title: "टाइप A: मेडिकल फर्स्ट रिस्पॉन्डर (MFR)",
        subtitle: "त्वरित प्राथमिक चिकित्सा एवं ट्रैफिक इंटरसेप्टर",
        badge: "श्रेणी 4 • त्वरित रिस्पॉन्स",
      },
    },
    // Offline Modal
    offlineModalTitle: "क्या आप सचमुच ऑफलाइन जाना चाहते हैं?",
    offlineModalSubtitle: "दोबारा ऑनलाइन होने तक आपको आपात ऑफ़र नहीं मिलेंगे।",
    offlineModalReasonShiftEnd: "शिफ्ट समाप्त / रिलीवर पायलट उपस्थित",
    offlineModalReasonBreak: "भोजन / विश्राम अवकाश (30 मिनट)",
    offlineModalReasonFuel: "ईंधन / वाहन सर्विस / ऑक्सीजन रीफिल",
    offlineModalConfirmBtn: "हां, अभी ऑफलाइन जाएं",
    offlineModalCancelBtn: "ऑनलाइन बने रहें",
    documentsButton: "आवेदन और KYC",
    waitingForGps: "आपकी GPS लोकेशन की प्रतीक्षा है…",
    kycStatus: { draft: "KYC जमा नहीं", pending_verification: "KYC समीक्षा में", approved: "KYC स्वीकृत", rejected: "KYC अस्वीकृत" },
    presenceRefused: "ऑनलाइन नहीं हो सके। फिर कोशिश करें।",
  },
};
