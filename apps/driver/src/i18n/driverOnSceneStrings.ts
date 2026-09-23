import type { SupportedLanguage } from "./driverOnboardingStrings.ts";
import type { GeoPoint } from "@sahayak/domain";

export interface TraumaCentreItem {
  id: string;
  name: string;
  hindiName: string;
  category: "GOVERNMENT" | "PRIVATE";
  traumaLevel: string;
  hindiTraumaLevel: string;
  distanceKm: number;
  etaMinutes: number;
  coordinates: GeoPoint;
  totalIcuBeds: number;
  availableIcuBeds: number;
  availableTraumaBays: number;
  ventilatorsReady: number;
  bedsHeldCounter: number;
  inboundAmbulances: number;
  specialities: string[];
  hindiSpecialities: string[];
}

export interface DriverOnSceneTranslation {
  // Screen Header
  screenTitle: string;
  screenSubtitle: string;
  stateBadge: string;
  patientIdLabel: (id: string) => string;

  // Vitals Entry Form
  vitalsSectionTitle: string;
  vitalsSectionSubtitle: string;
  pulseLabel: string;
  pulseUnit: string;
  pulsePlaceholder: string;
  pulseStatusNormal: string;
  pulseStatusTachycardia: string;
  pulseStatusBradycardia: string;

  spO2Label: string;
  spO2Unit: string;
  spO2Placeholder: string;
  spO2StatusNormal: string;
  spO2StatusHypoxia: string;

  bpLabel: string;
  bpUnit: string;
  systolicLabel: string;
  diastolicLabel: string;
  bpPlaceholderSys: string;
  bpPlaceholderDia: string;

  gcsLabel: string;
  gcsTotalLabel: (score: number) => string;
  gcsSeverityMild: string;
  gcsSeverityModerate: string;
  gcsSeveritySevere: string;
  gcsEyeLabel: string;
  gcsVerbalLabel: string;
  gcsMotorLabel: string;

  // Immediate Departure Bypass (Load & Go)
  bypassToggleLabel: string;
  bypassToggleSub: string;
  bypassActiveNoticeTitle: string;
  bypassActiveNoticeDesc: string;

  // Ranked Trauma Centres
  traumaCentresTitle: string;
  traumaCentresSubtitle: string;
  filterAll: string;
  filterGovt: string;
  filterPrivate: string;
  icuAvailabilityLabel: (avail: number, total: number) => string;
  traumaBaysLabel: (bays: number) => string;
  ventilatorsReadyLabel: (count: number) => string;
  /** Short capacity-grid captions (paired with a large number stat above). */
  capacityIcuFreeLabel: string;
  capacityResusBaysLabel: string;
  capacityVentilatorsLabel: string;
  bedsHeldBadge: (count: number) => string;
  /** Shown on a trauma centre card when isHospitalSelectable() rejects it. */
  hospitalAtCapacityBadge: string;
  inboundUnitsNotice: (count: number) => string;
  etaDistanceLabel: (mins: number, km: number) => string;
  selectedDestinationLabel: string;

  // Bottom Action Bar
  btnStartTransport: string;
  btnStartTransportSub: string;
  btnStartTransportDisabledWarning: string;

  // Pre-Arrival Handoff Alert Modal
  handoffModalTitle: string;
  handoffModalSubtitle: string;
  bedReservedConfirmation: (hospital: string, bedNumber: string) => string;
  traumaTeamAlertedNotice: string;
  proceedToTransportRoute: string;
}

export const driverOnSceneStrings: Record<SupportedLanguage, DriverOnSceneTranslation> = {
  en: {
    // Header
    screenTitle: "On-Scene Care & Trauma Handoff",
    screenSubtitle: "Pre-Transport Assessment & Destination Bed Reservation",
    stateBadge: "ON SCENE • PATIENT CONTACT",
    patientIdLabel: (id) => `Mission Ref: #${id}`,

    // Vitals Entry
    vitalsSectionTitle: "Field Triage & Vital Signs Entry",
    vitalsSectionSubtitle: "Record baseline patient vitals before initiating emergency transport",
    pulseLabel: "Heart Rate / Pulse",
    pulseUnit: "BPM",
    pulsePlaceholder: "88",
    pulseStatusNormal: "Normal (60-100)",
    pulseStatusTachycardia: "Tachycardia (>100)",
    pulseStatusBradycardia: "Bradycardia (<60)",

    spO2Label: "Blood Oxygen Saturation (SpO2)",
    spO2Unit: "%",
    spO2Placeholder: "94",
    spO2StatusNormal: "Optimal (≥95%)",
    spO2StatusHypoxia: "Hypoxia / O2 Req (<90%)",

    bpLabel: "Blood Pressure (NIBP)",
    bpUnit: "mmHg",
    systolicLabel: "Systolic",
    diastolicLabel: "Diastolic",
    bpPlaceholderSys: "120",
    bpPlaceholderDia: "80",

    gcsLabel: "Glasgow Coma Scale (GCS Score 3-15)",
    gcsTotalLabel: (score) => `Total GCS: ${score}/15`,
    gcsSeverityMild: "Mild (GCS 13-15)",
    gcsSeverityModerate: "Moderate (GCS 9-12)",
    gcsSeveritySevere: "Severe / Comatose (GCS ≤8)",
    gcsEyeLabel: "Eye (1-4)",
    gcsVerbalLabel: "Verbal (1-5)",
    gcsMotorLabel: "Motor (1-6)",

    // Bypass
    bypassToggleLabel: "Immediate Departure Bypass (Load & Go Protocol)",
    bypassToggleSub: "Enable if patient condition demands rapid surgical transport; vitals deferred to en-route phase",
    bypassActiveNoticeTitle: "Emergency Load & Go Bypass Active",
    bypassActiveNoticeDesc: "Patient requires immediate trauma surgery/resuscitation. Pre-transport vitals requirement waived; continuous telemetry will be transmitted en-route.",

    // Ranked Trauma Centres
    traumaCentresTitle: "Ranked Nearest Emergency Trauma Centres",
    traumaCentresSubtitle: "Sorted by algorithmic combination of drive ETA, trauma accreditation, and live ICU bed availability",
    filterAll: "All Facilities",
    filterGovt: "Government Apex",
    filterPrivate: "Private Super Speciality",
    icuAvailabilityLabel: (avail, total) => `${avail} / ${total} ICU Beds Free`,
    traumaBaysLabel: (bays) => `${bays} Resus Bays Ready`,
    ventilatorsReadyLabel: (count) => `${count} Ventilators Ready`,
    capacityIcuFreeLabel: "ICU Free",
    capacityResusBaysLabel: "Resus Bays",
    capacityVentilatorsLabel: "Ventilators",
    bedsHeldBadge: (count) => `${count} Bed Pre-Alert Held`,
    hospitalAtCapacityBadge: "AT CAPACITY - Cannot Select",
    inboundUnitsNotice: (count) => `${count} Inbound Units En Route`,
    etaDistanceLabel: (mins, km) => `${mins} mins (${km.toFixed(1)} km)`,
    selectedDestinationLabel: "Selected Destination Hospital",

    // Action Bar
    btnStartTransport: "Start Transport to Hospital",
    btnStartTransportSub: "Locks destination ward reservation and advances state machine to 'transporting'",
    btnStartTransportDisabledWarning: "Select a destination trauma centre to start transport",

    // Handoff Modal
    handoffModalTitle: "Trauma Ward Pre-Alert Dispatched!",
    handoffModalSubtitle: "Destination emergency department has acknowledged pre-arrival telemetry.",
    bedReservedConfirmation: (hospital, bedNumber) =>
      `Reserved Bay: ${bedNumber} at ${hospital}`,
    traumaTeamAlertedNotice:
      "Level 1 Trauma resuscitation team has been alerted with patient clinical profile and estimated arrival time.",
    proceedToTransportRoute: "Launch Turn-by-Turn Hospital Navigation",
  },

  hi: {
    // Header
    screenTitle: "घटनास्थल चिकित्सा एवं ट्रॉमा हैंडऑफ",
    screenSubtitle: "परिवहन-पूर्व जांच एवं गंतव्य अस्पताल बेड आरक्षण",
    stateBadge: "घटनास्थल पर उपस्थित • मरीज संपर्क",
    patientIdLabel: (id) => `मिशन संदर्भ: #${id}`,

    // Vitals Entry
    vitalsSectionTitle: "फील्ड ट्रायज एवं मरीज के महत्वपूर्ण संकेत (Vitals)",
    vitalsSectionSubtitle: "अस्पताल प्रस्थान से पूर्व मरीज के प्रारंभिक स्वास्थ्य संकेत दर्ज करें",
    pulseLabel: "हृदय गति / नब्ज (Pulse)",
    pulseUnit: "BPM",
    pulsePlaceholder: "88",
    pulseStatusNormal: "सामान्य (60-100)",
    pulseStatusTachycardia: "तीव्र हृदय गति (>100)",
    pulseStatusBradycardia: "धीमी हृदय गति (<60)",

    spO2Label: "रक्त ऑक्सीजन संतृप्ति (SpO2)",
    spO2Unit: "%",
    spO2Placeholder: "94",
    spO2StatusNormal: "अनुकूल (≥95%)",
    spO2StatusHypoxia: "ऑक्सीजन कमी (<90%)",

    bpLabel: "रक्तचाप (Blood Pressure)",
    bpUnit: "mmHg",
    systolicLabel: "सिस्टोलिक",
    diastolicLabel: "डायस्टोलिक",
    bpPlaceholderSys: "120",
    bpPlaceholderDia: "80",

    gcsLabel: "ग्लासगो कोमा स्केल (GCS स्कोर 3-15)",
    gcsTotalLabel: (score) => `कुल GCS स्कोर: ${score}/15`,
    gcsSeverityMild: "हल्की गंभीरता (GCS 13-15)",
    gcsSeverityModerate: "मध्यम गंभीरता (GCS 9-12)",
    gcsSeveritySevere: "अति-गंभीर / बेहोश (GCS ≤8)",
    gcsEyeLabel: "नेत्र (1-4)",
    gcsVerbalLabel: "मौखिक (1-5)",
    gcsMotorLabel: "गति (1-6)",

    // Bypass
    bypassToggleLabel: "तत्काल प्रस्थान बाईपास (लोड एंड गो प्रोटोकॉल)",
    bypassToggleSub: "यदि मरीज को तत्काल सर्जरी की आवश्यकता है तो सक्रिय करें; वाइटल्स रास्ते में दर्ज किए जाएंगे",
    bypassActiveNoticeTitle: "तत्काल लोड एंड गो बाईपास सक्रिय",
    bypassActiveNoticeDesc: "मरीज को तत्काल ट्रॉमा सर्जरी की आवश्यकता है। घटनास्थल पर वाइटल्स की औपचारिकता बाईपास कर दी गई है; रास्ते में टेलीमेट्री भेजी जाएगी।",

    // Ranked Trauma Centres
    traumaCentresTitle: "निकटतम आपातकालीन ट्रॉमा सेंटर (वरीयता अनुसार)",
    traumaCentresSubtitle: "पहुंचने का समय, ट्रॉमा मान्यता एवं रियल-टाइम ICU बेड उपलब्धता के आधार पर क्रमबद्ध",
    filterAll: "सभी अस्पताल",
    filterGovt: "सरकारी शीर्ष संस्थान",
    filterPrivate: "निजी सुपर स्पेशियलिटी",
    icuAvailabilityLabel: (avail, total) => `${avail} / ${total} ICU बेड उपलब्ध`,
    traumaBaysLabel: (bays) => `${bays} ट्रॉमा बे तैयार`,
    ventilatorsReadyLabel: (count) => `${count} वेंटिलेटर तैयार`,
    capacityIcuFreeLabel: "ICU खाली",
    capacityResusBaysLabel: "रिससिटेशन बे",
    capacityVentilatorsLabel: "वेंटिलेटर",
    bedsHeldBadge: (count) => `${count} बेड आरक्षित (होल्ड)`,
    hospitalAtCapacityBadge: "क्षमता पूर्ण - चयन संभव नहीं",
    inboundUnitsNotice: (count) => `${count} एंबुलेंस रास्ते में`,
    etaDistanceLabel: (mins, km) => `${mins} मिनट (${km.toFixed(1)} किमी)`,
    selectedDestinationLabel: "चयनित गंतव्य अस्पताल",

    // Action Bar
    btnStartTransport: "अस्पताल की ओर प्रस्थान शुरू करें",
    btnStartTransportSub: "गंतव्य वार्ड आरक्षण लॉक करता है और मिशन स्थिति 'transporting' में बदलता है",
    btnStartTransportDisabledWarning: "प्रस्थान शुरू करने हेतु गंतव्य ट्रॉमा सेंटर का चयन करें",

    // Handoff Modal
    handoffModalTitle: "ट्रॉमा वार्ड प्री-अराइवल अलर्ट प्रेषित!",
    handoffModalSubtitle: "गंतव्य अस्पताल आपातकालीन विभाग ने प्री-अराइवल टेलीमेट्री स्वीकार कर ली है।",
    bedReservedConfirmation: (hospital, bedNumber) =>
      `आरक्षित बे: ${bedNumber} - ${hospital}`,
    traumaTeamAlertedNotice:
      "लेवल 1 ट्रॉमा टीम को मरीज के क्लीनिकल प्रोफाइल एवं अनुमानित आगमन समय की पूर्व सूचना दे दी गई है।",
    proceedToTransportRoute: "अस्पताल नेविगेशन प्रारंभ करें",
  },
};

// Preset ranked trauma centres around Delhi NCR / Gautam Buddha Nagar
export const RANKED_TRAUMA_CENTRES: readonly [
  TraumaCentreItem,
  ...TraumaCentreItem[]
] = [
  {
    id: "hosp_jaypee",
    name: "Jaypee Hospital (Sec 128)",
    hindiName: "जेपी अस्पताल (सेक्टर 128)",
    category: "PRIVATE",
    traumaLevel: "Level 1 Private Super Speciality",
    hindiTraumaLevel: "लेवल 1 निजी सुपर स्पेशियलिटी",
    distanceKm: 4.2,
    etaMinutes: 8,
    coordinates: { latitude: 28.5144, longitude: 77.3698 },
    totalIcuBeds: 16,
    availableIcuBeds: 4,
    availableTraumaBays: 2,
    ventilatorsReady: 3,
    bedsHeldCounter: 1, // Bed held counter!
    inboundAmbulances: 1,
    specialities: ["Interventional Cardiac", "Polytrauma", "Neuro ICU", "Burns"],
    hindiSpecialities: ["कार्डियक", "पॉलीट्रामा", "न्यूरो ICU", "बर्न यूनिट"],
  },
  {
    id: "hosp_fortis_noida",
    name: "Fortis Hospital (Sec 62)",
    hindiName: "फोर्टिस अस्पताल (सेक्टर 62)",
    category: "PRIVATE",
    traumaLevel: "Level 2 Critical Care & Cardiac Centre",
    hindiTraumaLevel: "लेवल 2 क्रिटिकल केयर एवं कार्डियक सेंटर",
    distanceKm: 6.8,
    etaMinutes: 12,
    coordinates: { latitude: 28.6186, longitude: 77.3725 },
    totalIcuBeds: 12,
    availableIcuBeds: 3,
    availableTraumaBays: 1,
    ventilatorsReady: 2,
    bedsHeldCounter: 0,
    inboundAmbulances: 2,
    specialities: ["Cardiac Emergency", "Stroke Unit", "Orthopaedic Surgery"],
    hindiSpecialities: ["हार्ट अटैक", "स्ट्रोक यूनिट", "हड्डी फ्रैक्चर सर्जरी"],
  },
  {
    id: "hosp_aiims_trauma",
    name: "AIIMS Apex Trauma Centre",
    hindiName: "एम्स एपेक्स ट्रॉमा सेंटर (नई दिल्ली)",
    category: "GOVERNMENT",
    traumaLevel: "Level 1 Apex Government Trauma Centre",
    hindiTraumaLevel: "लेवल 1 शीर्ष सरकारी ट्रॉमा सेंटर",
    distanceKm: 14.5,
    etaMinutes: 19,
    coordinates: { latitude: 28.5672, longitude: 77.21 },
    totalIcuBeds: 30,
    availableIcuBeds: 6,
    availableTraumaBays: 4,
    ventilatorsReady: 5,
    bedsHeldCounter: 2, // 2 beds held!
    inboundAmbulances: 3,
    specialities: ["Comprehensive Polytrauma", "Emergency Neurosurgery", "Blood Bank", "Pediatric Trauma"],
    hindiSpecialities: ["समग्र पॉलीट्रामा", "आपातकालीन न्यूरोसर्जरी", "ब्लड बैंक", "बाल चिकित्सा"],
  },
  {
    id: "hosp_safdarjung",
    name: "Safdarjung Super Speciality Emergency",
    hindiName: "सफदरजंग सुपर स्पेशियलिटी इमरजेंसी",
    category: "GOVERNMENT",
    traumaLevel: "Level 1 Apex Government Emergency",
    hindiTraumaLevel: "लेवल 1 शीर्ष सरकारी आपातकालीन विभाग",
    distanceKm: 15.1,
    etaMinutes: 21,
    coordinates: { latitude: 28.5701, longitude: 77.2075 },
    totalIcuBeds: 24,
    availableIcuBeds: 5,
    availableTraumaBays: 3,
    ventilatorsReady: 4,
    bedsHeldCounter: 1,
    inboundAmbulances: 2,
    specialities: ["Burns & Plastic", "Severe Trauma", "Toxicology"],
    hindiSpecialities: ["बर्न व प्लास्टिक सर्जरी", "गंभीर आघात", "विष विज्ञान"],
  },
  {
    id: "hosp_max_saket",
    name: "Max Super Speciality Hospital (Saket)",
    hindiName: "मैक्स सुपर स्पेशियलिटी अस्पताल (साकेत)",
    category: "PRIVATE",
    traumaLevel: "Level 1 Private Super Speciality",
    hindiTraumaLevel: "लेवल 1 निजी सुपर स्पेशियलिटी",
    distanceKm: 12.8,
    etaMinutes: 17,
    coordinates: { latitude: 28.5273, longitude: 77.2115 },
    totalIcuBeds: 18,
    availableIcuBeds: 3,
    availableTraumaBays: 2,
    ventilatorsReady: 2,
    bedsHeldCounter: 1,
    inboundAmbulances: 1,
    specialities: ["Comprehensive Cardiac", "Complex Trauma", "Organ Transplant"],
    hindiSpecialities: ["कार्डियक केयर", "जटिल आघात", "अंग प्रत्यारोपण"],
  },
  {
    id: "hosp_sharda_gnoida",
    name: "Sharda Hospital (Greater Noida)",
    hindiName: "शारदा अस्पताल (ग्रेटर नोएडा)",
    category: "PRIVATE",
    traumaLevel: "Level 2 Medical College & Trauma Centre",
    hindiTraumaLevel: "लेवल 2 मेडिकल कॉलेज एवं ट्रॉमा सेंटर",
    distanceKm: 9.6,
    etaMinutes: 15,
    coordinates: { latitude: 28.4744, longitude: 77.504 },
    totalIcuBeds: 10,
    availableIcuBeds: 1,
    availableTraumaBays: 0,
    ventilatorsReady: 0,
    bedsHeldCounter: 1,
    // Deliberately overcrowded (2 inbound ambulances against 1 free ICU
    // bed already held) - exercises the capacity gate live, not just in
    // the unit test; every other seeded centre currently has spare capacity.
    inboundAmbulances: 2,
    specialities: ["Orthopaedic Trauma", "General Surgery"],
    hindiSpecialities: ["हड्डी रोग आघात", "सामान्य शल्य चिकित्सा"],
  },
];
