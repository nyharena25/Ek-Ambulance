import type { SupportedLanguage } from "./driverOnboardingStrings.ts";

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
    bypassActiveNoticeDesc: "Patient needs immediate transport. Vitals before departure are not required; record them en route.",

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
    handoffModalTitle: "Patient on board",
    handoffModalSubtitle: "Confirm the destination hospital before you leave.",
    bedReservedConfirmation: (hospital, bedNumber) =>
      `Reserved Bay: ${bedNumber} at ${hospital}`,
    traumaTeamAlertedNotice:
      "The hospital is not notified by the app. Call ahead if the patient is critical.",
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
    bypassActiveNoticeDesc: "मरीज़ को तुरंत ले जाना है। निकलने से पहले वाइटल्स ज़रूरी नहीं; रास्ते में दर्ज करें।",

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
    handoffModalTitle: "मरीज़ एम्बुलेंस में",
    handoffModalSubtitle: "निकलने से पहले गंतव्य अस्पताल की पुष्टि करें।",
    bedReservedConfirmation: (hospital, bedNumber) =>
      `आरक्षित बे: ${bedNumber} - ${hospital}`,
    traumaTeamAlertedNotice:
      "ऐप अस्पताल को सूचना नहीं भेजता। मरीज़ गंभीर हो तो पहले फ़ोन करें।",
    proceedToTransportRoute: "अस्पताल नेविगेशन प्रारंभ करें",
  },
};
