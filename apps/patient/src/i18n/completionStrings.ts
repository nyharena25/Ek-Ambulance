import type { IconRef } from "../components/AppIcon";
import type { SupportedLanguage } from "./onboardingStrings";

export interface DataInventoryItem {
  id: string;
  icon: IconRef;
  title: string;
  category: string;
  description: string;
  retentionPeriod: string;
}

export interface CompletionTranslation {
  // Screen Header & Status
  screenTitle: string;
  missionIdLabel: (id: string) => string;
  completionBannerBadge: string;
  completionBannerTitle: string;
  completionBannerSubtitle: string;
  languageToggleLabel: string;
  englishLabel: string;
  hindiLabel: string;

  // Mission Summary
  pickupLocationLabel: string;
  destinationHospitalLabel: string;
  vehicleLabel: string;
  crewLabel: string;
  completedAtLabel: string;

  // Statutory Receipt Breakdown
  receiptHeading: string;
  receiptSubtitle: string;
  mandateCitation: string;
  /** Only for a distance the server measured from the transport-leg GPS track (distanceSource `measured`). */
  finalDistanceRow: (km: number) => string;
  /** Every other case: the server billed the booking estimate, or the source is unknown. */
  estimatedDistanceRow: (km: number) => string;
  baseFareRow: (initialKm: number) => string;
  additionalDistanceRow: (km: number, rate: number) => string;
  emtStaffingRow: string;
  emtStaffingValue: string;
  surgeMultiplierRow: string;
  surgeMultiplierValue: string;
  totalFareRow: string;
  paymentStatusLabel: string;
  paymentStatusValue: string;
  transactionRefLabel: (ref: string) => string;
  disputeFareButton: string;

  // DPDP Privacy Panel (Act 2023 & 2025 Rules)
  dpdpPanelHeading: string;
  dpdpPanelTag: string;
  dpdpPanelDescription: string;
  collectedDataHeading: string;
  collectedDataItems: DataInventoryItem[];

  // EMR Download Action
  downloadEmrButton: string;
  downloadEmrSubtitle: string;
  downloadingToast: string;

  // Premature Deletion Toggle
  deletionToggleLabel: string;
  deletionToggleSubtitle: string;
  deletionModalTitle: string;
  deletionModalDescription: string;
  deletionWhatIsPurgedTitle: string;
  deletionPurgedList: string[];
  deletionStatutoryRetainedTitle: string;
  deletionRetainedList: string[];
  deletionConfirmButton: string;
  deletionCancelButton: string;
  deletionQueuedBadge: (ref: string) => string;
  deletionQueuedToast: string;
  deletionErrorToast: string;
  dpoNotice: (email: string) => string;
  disputeFareRecordedToast: string;
  disputeFareErrorToast: string;

  // Navigation
  returnHomeButton: string;
}

export const completionStrings: Record<
  SupportedLanguage,
  CompletionTranslation
> = {
  en: {
    screenTitle: "Mission Receipt & Privacy",
    missionIdLabel: (id: string) => `Mission ID: ${id}`,
    completionBannerBadge: "COMPLETED",
    completionBannerTitle: "Patient Safely Transferred to Emergency",
    completionBannerSubtitle:
      "The crew has handed the patient over to the hospital team.",
    languageToggleLabel: "Language Switch",
    englishLabel: "EN",
    hindiLabel: "हिन्दी",

    pickupLocationLabel: "PICKUP LOCATION",
    destinationHospitalLabel: "DESTINATION HOSPITAL",
    vehicleLabel: "AIS-125 FLEET VEHICLE",
    crewLabel: "ATTENDING PARAMEDIC",
    completedAtLabel: "HANDOFF TIMESTAMP",

    receiptHeading: "Statutory Regulated Receipt",
    receiptSubtitle:
      "State-mandated tariff issued under Delhi Transport Department Emergency Gazette Order. Zero surge guarantee enforced.",
    mandateCitation: "Regulated Non-Surge Emergency Pricing under State Mandate",
    finalDistanceRow: (km: number) =>
      `Route Traveled, GPS-measured (${km.toFixed(1)} km)`,
    estimatedDistanceRow: (km: number) =>
      `Estimated, pickup to hospital in a straight line, not GPS-measured (${km.toFixed(1)} km)`,
    baseFareRow: (initialKm: number) =>
      `Base Ambulance Tariff (Includes initial ${initialKm.toFixed(1)} km)`,
    additionalDistanceRow: (km: number, rate: number) =>
      `Additional Distance Tariff (${km.toFixed(1)} km @ ₹${rate.toFixed(2)}/km)`,
    emtStaffingRow: "Certified EMT / Paramedic Staffing",
    emtStaffingValue: "₹0.00 (Statutory Included)",
    surgeMultiplierRow: "Surge Multiplier",
    surgeMultiplierValue: "1.0x (Regulated Non-Surge)",
    totalFareRow: "Total Regulated Fare",
    paymentStatusLabel: "PAYMENT STATUS",
    paymentStatusValue: "Fare payable at the regulated statutory tariff",
    transactionRefLabel: (ref: string) => `Ref: ${ref}`,
    disputeFareButton: "Dispute Statutory Fare Calculation",

    dpdpPanelHeading: "DPDP Data Fiduciary Privacy Panel",
    dpdpPanelTag: "DPDP 2025 Statutory Rights (Sec 12 & Rule 8)",
    dpdpPanelDescription:
      "As a Data Fiduciary under the Digital Personal Data Protection (DPDP) Act 2023 and DPDP 2025 Rules, Ek-Ambulance provides full transparency into all telemetry and clinical data processed during this emergency mission:",
    collectedDataHeading: "Processed Personal Data Inventory",
    collectedDataItems: [
      {
        id: "gps",
        icon: { set: "ion", name: "location" },
        title: "GPS Telemetry & Route Breadcrumbs",
        category: "Location Data",
        description:
          "GPS coordinates of the ambulance recorded along the pickup and hospital route.",
        retentionPeriod: "Default: 30 days (Purgeable on request)",
      },
      {
        id: "triage",
        icon: { set: "mci", name: "heart-pulse" },
        title: "Clinical Symptoms & Triage Urgency",
        category: "Health Data",
        description:
          "The START/ESI triage answers you entered and the urgency category they produced.",
        retentionPeriod: "Default: 30 days (Purgeable on request)",
      },
      {
        id: "vitals",
        icon: { set: "ion", name: "trending-up" },
        title: "In-Transit Clinical Vitals (AIS-125)",
        category: "Health Data",
        description:
          "Vital signs the ambulance crew entered during transport, when they recorded any.",
        retentionPeriod: "Default: 30 days (Purgeable on request)",
      },
      {
        id: "handoff",
        icon: { set: "mci", name: "hospital-building" },
        title: "Hospital Handoff Record",
        category: "Clinical Handoff",
        description:
          "The receiving physician's sign-off recorded by the ambulance crew at hospital handoff.",
        retentionPeriod: "Default: 30 days (Purgeable on request)",
      },
    ],

    downloadEmrButton: "Download EMR Handoff PDF",
    downloadEmrSubtitle: "Emergency Medical Record for Hospital / ABHA Record",
    downloadingToast: "Downloading encrypted EMR handoff summary PDF...",

    deletionToggleLabel: "Request Premature Deletion of Personal Journey Data",
    deletionToggleSubtitle:
      "Exercise your Right to Erasure under DPDP Act 2023 Section 12 and DPDP 2025 Rules",
    deletionModalTitle: "Confirm Premature Data Erasure Request",
    deletionModalDescription:
      "Under the Digital Personal Data Protection Act 2023 and DPDP 2025 Rules, you have the legal right to request erasure of your personal data once the emergency health response is complete.",
    deletionWhatIsPurgedTitle: "DATA TO BE PURGED (Within 72 Hours):",
    deletionPurgedList: [
      "High-resolution GPS telemetry breadcrumbs and route logs",
      "Triaged medical symptoms and in-transit clinical vitals from Ek-Ambulance cloud servers",
      "Temporary emergency dispatch notes and chat transcripts",
    ],
    deletionStatutoryRetainedTitle: "MANDATORY STATUTORY RETENTION (Under Law):",
    deletionRetainedList: [
      "Statutory financial tax invoice and fare payment ledger (retained for statutory audit as required by GST & Motor Vehicles Act)",
      "Anonymized aggregated distance and transport safety metrics without personal identifiers",
    ],
    deletionConfirmButton: "Confirm & Queue Data Erasure",
    deletionCancelButton: "Keep Standard 30-Day Retention",
    deletionQueuedBadge: (ref: string) => `Erasure Request Queued (${ref})`,
    deletionQueuedToast:
      "Premature erasure request successfully registered under DPDP 2025 Rules",
    deletionErrorToast: "Could not register the erasure request. Please try again.",
    dpoNotice: (email: string) =>
      `Grievance Redressal / Data Protection Officer: ${email}`,
    disputeFareRecordedToast: "Dispute recorded. Our team will review this fare.",
    disputeFareErrorToast: "Could not record the dispute. Please try again or call 108.",

    returnHomeButton: "Done • Return to Home",
  },
  hi: {
    screenTitle: "मिशन रसीद एवं डेटा गोपनीयता",
    missionIdLabel: (id: string) => `मिशन आईडी: ${id}`,
    completionBannerBadge: "सफलतापूर्वक पूर्ण",
    completionBannerTitle: "मरीज को आपातकालीन वार्ड में सुरक्षित सौंपा गया",
    completionBannerSubtitle:
      "टीम ने मरीज़ को अस्पताल की टीम को सौंप दिया है।",
    languageToggleLabel: "भाषा चयन",
    englishLabel: "EN",
    hindiLabel: "हिन्दी",

    pickupLocationLabel: "पिकअप स्थान",
    destinationHospitalLabel: "गंतव्य अस्पताल",
    vehicleLabel: "AIS-125 एंबुलेंस श्रेणी",
    crewLabel: "उपस्थित पैरामेडिक",
    completedAtLabel: "हैंडऑफ समय",

    receiptHeading: "शासकीय नियंत्रित रसीद",
    receiptSubtitle:
      "दिल्ली परिवहन विभाग आपातकालीन गजट आदेश के तहत जारी वैधानिक दरें। बिना-सर्ज गारंटी लागू।",
    mandateCitation: "शासकीय आदेशानुसार नियंत्रित बिना-सर्ज आपातकालीन दरें",
    finalDistanceRow: (km: number) =>
      `तय की गई दूरी, GPS द्वारा मापी गई (${km.toFixed(1)} किमी)`,
    estimatedDistanceRow: (km: number) =>
      `अनुमान, पिकअप से अस्पताल सीधी दूरी, GPS द्वारा मापी नहीं गई (${km.toFixed(1)} किमी)`,
    baseFareRow: (initialKm: number) =>
      `मूल एंबुलेंस किराया (प्रारंभिक ${initialKm.toFixed(1)} किमी सम्मिलित)`,
    additionalDistanceRow: (km: number, rate: number) =>
      `अतिरिक्त दूरी शुल्क (${km.toFixed(1)} किमी @ ₹${rate.toFixed(2)}/किमी)`,
    emtStaffingRow: "प्रमाणित पैरामेडिक / EMT क्रू शुल्क",
    emtStaffingValue: "₹0.00 (शासकीय नियमानुसार सम्मिलित)",
    surgeMultiplierRow: "सर्ज मल्टीप्लायर",
    surgeMultiplierValue: "1.0x (बिना सर्ज शुल्क गारंटी)",
    totalFareRow: "कुल शासकीय किराया",
    paymentStatusLabel: "भुगतान स्थिति",
    paymentStatusValue: "नियंत्रित सरकारी दर पर देय किराया",
    transactionRefLabel: (ref: string) => `संदर्भ: ${ref}`,
    disputeFareButton: "शासकीय किराया गणना पर आपत्ति दर्ज करें",

    dpdpPanelHeading: "DPDP डेटा संरक्षण व गोपनीयता पैनल",
    dpdpPanelTag: "DPDP 2025 वैधानिक अधिकार (धारा 12 एवं नियम 8)",
    dpdpPanelDescription:
      "डिजिटल व्यक्तिगत डेटा संरक्षण (DPDP) अधिनियम 2023 एवं DPDP 2025 नियमों के तहत डेटा फिड्यूशरी के रूप में, एक-एंबुलेंस इस मिशन के दौरान संसाधित सभी डेटा का पूर्ण विवरण प्रस्तुत करता है:",
    collectedDataHeading: "संसाधित व्यक्तिगत डेटा विवरण",
    collectedDataItems: [
      {
        id: "gps",
        icon: { set: "ion", name: "location" },
        title: "जीपीएस टेलीमेट्री व रूट ब्रेडक्रम्ब्स",
        category: "लोकेशन डेटा",
        description:
          "पिकअप व अस्पताल मार्ग के दौरान एम्बुलेंस के जीपीएस निर्देशांक दर्ज किए गए।",
        retentionPeriod: "मानक अवधि: 30 दिन (अनुरोध पर तत्काल विलोपन योग्य)",
      },
      {
        id: "triage",
        icon: { set: "mci", name: "heart-pulse" },
        title: "चिकित्सीय लक्षण व ट्राइएज स्कोर",
        category: "स्वास्थ्य डेटा",
        description:
          "आपके द्वारा दिए गए START/ESI ट्राइएज उत्तर और उनसे बनी तात्कालिकता श्रेणी।",
        retentionPeriod: "मानक अवधि: 30 दिन (अनुरोध पर तत्काल विलोपन योग्य)",
      },
      {
        id: "vitals",
        icon: { set: "ion", name: "trending-up" },
        title: "परिवहन के दौरान लाइव वाइटल्स (AIS-125)",
        category: "स्वास्थ्य डेटा",
        description:
          "परिवहन के दौरान एम्बुलेंस क्रू द्वारा दर्ज किए गए वाइटल संकेत, यदि उन्होंने दर्ज किए हों।",
        retentionPeriod: "मानक अवधि: 30 दिन (अनुरोध पर तत्काल विलोपन योग्य)",
      },
      {
        id: "handoff",
        icon: { set: "mci", name: "hospital-building" },
        title: "अस्पताल हैंडऑफ रिकॉर्ड",
        category: "हैंडऑफ रिकॉर्ड",
        description:
          "अस्पताल हैंडऑफ पर एम्बुलेंस क्रू द्वारा दर्ज प्राप्तकर्ता चिकित्सक की स्वीकृति।",
        retentionPeriod: "मानक अवधि: 30 दिन (अनुरोध पर तत्काल विलोपन योग्य)",
      },
    ],

    downloadEmrButton: "आपातकालीन मेडिकल रिकॉर्ड (EMR) PDF डाउनलोड करें",
    downloadEmrSubtitle: "अस्पताल व ABHA स्वास्थ्य खाते हेतु आधिकारिक सारांश",
    downloadingToast: "सुरक्षित EMR हैंडऑफ सारांश PDF डाउनलोड हो रहा है...",

    deletionToggleLabel: "व्यक्तिगत यात्रा डेटा को समय से पूर्व हटाने का अनुरोध करें",
    deletionToggleSubtitle:
      "DPDP अधिनियम 2023 की धारा 12 एवं DPDP 2025 नियमों के तहत डेटा विलोपन अधिकार",
    deletionModalTitle: "समय-पूर्व डेटा विलोपन अनुरोध की पुष्टि करें",
    deletionModalDescription:
      "DPDP अधिनियम 2023 एवं DPDP 2025 नियमों के अनुसार, आपातकालीन चिकित्सा सेवा पूर्ण होने पर आपको अपना व्यक्तिगत डेटा समय से पूर्व हटाने का कानूनी अधिकार है।",
    deletionWhatIsPurgedTitle: "हटाया जाने वाला डेटा (72 घंटों के भीतर):",
    deletionPurgedList: [
      "उच्च-सटीकता जीपीएस लोकेशन ब्रेडक्रम्ब्स व मार्ग विवरण",
      "क्लाउड सर्वर से दर्ज किए गए स्वास्थ्य लक्षण व लाइव वाइटल्स",
      "अस्थायी आपातकालीन संदेश व चैट विवरण",
    ],
    deletionStatutoryRetainedTitle: "कानूनन अनिवार्य रूप से रखा जाने वाला डेटा:",
    deletionRetainedList: [
      "शासकीय वित्तीय टैक्स इनवॉइस व किराया भुगतान रिकॉर्ड (जीएसटी व मोटर वाहन अधिनियम के तहत ऑडिट हेतु आवश्यक)",
      "बिना किसी व्यक्तिगत पहचान के केवल कुल दूरी व सुरक्षा सांख्यिकी",
    ],
    deletionConfirmButton: "पुष्टि करें एवं डेटा विलोपन अनुरोध दर्ज करें",
    deletionCancelButton: "मानक 30-दिवसीय अवधि बनाए रखें",
    deletionQueuedBadge: (ref: string) => `डेटा विलोपन अनुरोध दर्ज (${ref})`,
    deletionQueuedToast:
      "DPDP 2025 नियमों के तहत समय-पूर्व डेटा विलोपन अनुरोध सफलतापूर्वक पंजीकृत",
    deletionErrorToast: "विलोपन अनुरोध दर्ज नहीं हो सका। कृपया पुनः प्रयास करें।",
    dpoNotice: (email: string) =>
      `शिकायत निवारण / डेटा संरक्षण अधिकारी (DPO): ${email}`,
    disputeFareRecordedToast: "आपत्ति दर्ज की गई। हमारी टीम इस किराए की समीक्षा करेगी।",
    disputeFareErrorToast: "आपत्ति दर्ज नहीं हो सकी। कृपया पुनः प्रयास करें या 108 पर कॉल करें।",

    returnHomeButton: "पूर्ण • होम स्क्रीन पर जाएं",
  },
};

/**
 * The receipt's distance row names where the billed distance came from. Only a server-confirmed `measured` distance is
 * called GPS-measured; the server's no-track fallback (the pickup -> hospital leg, 20261003000000) and an older publisher
 * read as an estimate. The amount itself is the server's either way.
 */
export function distanceRowLabel(strings: CompletionTranslation, km: number, source: "measured" | "estimate" | undefined): string {
  return source === "measured" ? strings.finalDistanceRow(km) : strings.estimatedDistanceRow(km);
}
