import type { AIS125VehicleType, UrgencyTierName } from "@sahayak/domain";
import type { SupportedLanguage } from "./driverOnboardingStrings";

export interface DriverBookingTranslation {
  title: string;
  back: string;
  greenTab: string;
  redTab: string;
  greenHint: (km: number) => string;
  redHint: (from: number, to: number) => string;
  emptyGreen: string;
  emptyRed: string;
  offlineTitle: string;
  offlineBody: string;
  busyBanner: string;
  loadError: string;
  pageOf: (page: number, pages: number) => string;
  previous: string;
  next: string;
  accept: string;
  accepting: string;
  viewOnly: string;
  confirmTitle: string;
  confirmBody: (km: number, complaint: string | undefined) => string;
  confirmYes: string;
  confirmNo: string;
  km: (km: number) => string;
  timerOverdue: string;
  timerLeft: string;
  unknownComplaint: string;
  urgency: Record<UrgencyTierName, string>;
  vehicle: Record<AIS125VehicleType, string>;
  fallbackTitle: string;
  fallbackBody: (km: number) => string;
  bookingEntry: string;
  bookingEntryHint: (count: number) => string;
  profileEntry: string;
  ageSex: (age: string | undefined, sex: string | undefined) => string;
}

const ageSexEn = (age?: string, sex?: string) => [age, sex].filter(Boolean).join(" · ");

export const driverBookingStrings: Record<SupportedLanguage, DriverBookingTranslation> = {
  en: {
    title: "Booking",
    back: "Back",
    greenTab: "Green",
    redTab: "Red",
    greenHint: (km) => `New emergencies within ${km} km of your ambulance`,
    redHint: (from, to) => `Nobody answered within ${from} km. Now open within ${to} km`,
    emptyGreen: "No emergencies near you right now.",
    emptyRed: "No unanswered emergencies in this range.",
    offlineTitle: "You are offline",
    offlineBody: "Go online on the home screen to see emergencies near your ambulance.",
    busyBanner: "You have an active mission. Emergencies are view-only until it ends.",
    loadError: "Could not refresh. Showing the last list.",
    pageOf: (page, pages) => `Page ${page} of ${pages}`,
    previous: "Previous",
    next: "Next",
    accept: "Accept",
    accepting: "Accepting…",
    viewOnly: "View only",
    confirmTitle: "Take this emergency?",
    confirmBody: (km, complaint) => `${complaint ?? "Emergency"} · ${km} km away. You will be assigned and taken to navigation.`,
    confirmYes: "Accept and go",
    confirmNo: "Cancel",
    km: (km) => `${km} km`,
    timerOverdue: "Overdue",
    timerLeft: "left",
    unknownComplaint: "Details shared after you accept",
    urgency: { CAT_1_IMMEDIATE: "Critical", CAT_2_URGENT: "Urgent", CAT_3_DELAYED: "Routine" },
    vehicle: { TYPE_D_ALS: "ALS", TYPE_C_BLS: "BLS", TYPE_B_PTA: "PTA", TYPE_A_MFR: "MFR" },
    fallbackTitle: "Emergency in a wider area",
    fallbackBody: (km) => `No ambulance nearby answered. Within ${km} km of you.`,
    bookingEntry: "Booking",
    bookingEntryHint: (count) => (count === 0 ? "No emergencies near you" : `${count} emergenc${count === 1 ? "y" : "ies"} you can take`),
    profileEntry: "Profile",
    ageSex: ageSexEn,
  },
  hi: {
    title: "बुकिंग",
    back: "वापस",
    greenTab: "हरा",
    redTab: "लाल",
    greenHint: (km) => `आपकी एम्बुलेंस से ${km} किमी के भीतर नई आपात स्थितियाँ`,
    redHint: (from, to) => `${from} किमी में किसी ने उत्तर नहीं दिया। अब ${to} किमी तक खुला`,
    emptyGreen: "अभी आपके पास कोई आपात स्थिति नहीं है।",
    emptyRed: "इस दायरे में कोई अनुत्तरित आपात स्थिति नहीं है।",
    offlineTitle: "आप ऑफ़लाइन हैं",
    offlineBody: "अपनी एम्बुलेंस के पास की आपात स्थितियाँ देखने के लिए होम स्क्रीन पर ऑनलाइन जाएँ।",
    busyBanner: "आपका एक मिशन चल रहा है। मिशन पूरा होने तक आपात स्थितियाँ केवल देखी जा सकती हैं।",
    loadError: "रीफ़्रेश नहीं हो सका। पिछली सूची दिखाई जा रही है।",
    pageOf: (page, pages) => `पृष्ठ ${page} / ${pages}`,
    previous: "पिछला",
    next: "अगला",
    accept: "स्वीकार करें",
    accepting: "स्वीकार हो रहा है…",
    viewOnly: "केवल देखें",
    confirmTitle: "यह आपात स्थिति लें?",
    confirmBody: (km, complaint) => `${complaint ?? "आपात स्थिति"} · ${km} किमी दूर। आपको असाइन कर नेविगेशन पर ले जाया जाएगा।`,
    confirmYes: "स्वीकार करें और चलें",
    confirmNo: "रद्द करें",
    km: (km) => `${km} किमी`,
    timerOverdue: "समय पार",
    timerLeft: "शेष",
    unknownComplaint: "स्वीकार करने के बाद विवरण मिलेगा",
    urgency: { CAT_1_IMMEDIATE: "गंभीर", CAT_2_URGENT: "तत्काल", CAT_3_DELAYED: "सामान्य" },
    vehicle: { TYPE_D_ALS: "ALS", TYPE_C_BLS: "BLS", TYPE_B_PTA: "PTA", TYPE_A_MFR: "MFR" },
    fallbackTitle: "व्यापक क्षेत्र में आपात स्थिति",
    fallbackBody: (km) => `पास की किसी एम्बुलेंस ने उत्तर नहीं दिया। आपसे ${km} किमी के भीतर।`,
    bookingEntry: "बुकिंग",
    bookingEntryHint: (count) => (count === 0 ? "आपके पास कोई आपात स्थिति नहीं" : `${count} आपात स्थिति जो आप ले सकते हैं`),
    profileEntry: "प्रोफ़ाइल",
    ageSex: ageSexEn,
  },
};
