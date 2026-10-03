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
  pulseStatusNormal: string;
  pulseStatusTachycardia: string;
  pulseStatusBradycardia: string;

  spO2Label: string;
  spO2Unit: string;
  spO2StatusNormal: string;
  spO2StatusHypoxia: string;

  bpLabel: string;
  systolicLabel: string;
  diastolicLabel: string;

  gcsLabel: string;
  gcsTotalLabel: (score: number) => string;

  // Immediate Departure Bypass (Load & Go)
  bypassToggleLabel: string;
  bypassToggleSub: string;
  bypassActiveNoticeTitle: string;
  bypassActiveNoticeDesc: string;


  // Bottom Action Bar
  btnStartTransport: string;
  btnStartTransportDisabledWarning: string;

  // Pre-Arrival Handoff Alert Modal
  handoffModalTitle: string;
  handoffModalSubtitle: string;
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
    pulseStatusNormal: "Normal (60-100)",
    pulseStatusTachycardia: "Tachycardia (>100)",
    pulseStatusBradycardia: "Bradycardia (<60)",

    spO2Label: "Blood Oxygen Saturation (SpO2)",
    spO2Unit: "%",
    spO2StatusNormal: "Optimal (≥95%)",
    spO2StatusHypoxia: "Hypoxia / O2 Req (<90%)",

    bpLabel: "Blood Pressure (NIBP)",
    systolicLabel: "Systolic",
    diastolicLabel: "Diastolic",
    gcsLabel: "Glasgow Coma Scale (GCS Score 3-15)",
    gcsTotalLabel: (score) => `Total GCS: ${score}/15`,
    // Bypass
    bypassToggleLabel: "Immediate Departure Bypass (Load & Go Protocol)",
    bypassToggleSub: "Enable if patient condition demands rapid surgical transport; vitals deferred to en-route phase",
    bypassActiveNoticeTitle: "Emergency Load & Go Bypass Active",
    bypassActiveNoticeDesc: "Patient needs immediate transport. Vitals before departure are not required; record them en route.",

    // Ranked Trauma Centres
    // Action Bar
    btnStartTransport: "Start Transport to Hospital",
    btnStartTransportDisabledWarning: "Select a destination trauma centre to start transport",

    // Handoff Modal
    handoffModalTitle: "Patient on board",
    handoffModalSubtitle: "Confirm the destination hospital before you leave.",
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
    pulseStatusNormal: "सामान्य (60-100)",
    pulseStatusTachycardia: "तीव्र हृदय गति (>100)",
    pulseStatusBradycardia: "धीमी हृदय गति (<60)",

    spO2Label: "रक्त ऑक्सीजन संतृप्ति (SpO2)",
    spO2Unit: "%",
    spO2StatusNormal: "अनुकूल (≥95%)",
    spO2StatusHypoxia: "ऑक्सीजन कमी (<90%)",

    bpLabel: "रक्तचाप (Blood Pressure)",
    systolicLabel: "सिस्टोलिक",
    diastolicLabel: "डायस्टोलिक",
    gcsLabel: "ग्लासगो कोमा स्केल (GCS स्कोर 3-15)",
    gcsTotalLabel: (score) => `कुल GCS स्कोर: ${score}/15`,
    // Bypass
    bypassToggleLabel: "तत्काल प्रस्थान बाईपास (लोड एंड गो प्रोटोकॉल)",
    bypassToggleSub: "यदि मरीज को तत्काल सर्जरी की आवश्यकता है तो सक्रिय करें; वाइटल्स रास्ते में दर्ज किए जाएंगे",
    bypassActiveNoticeTitle: "तत्काल लोड एंड गो बाईपास सक्रिय",
    bypassActiveNoticeDesc: "मरीज़ को तुरंत ले जाना है। निकलने से पहले वाइटल्स ज़रूरी नहीं; रास्ते में दर्ज करें।",

    // Ranked Trauma Centres
    // Action Bar
    btnStartTransport: "अस्पताल की ओर प्रस्थान शुरू करें",
    btnStartTransportDisabledWarning: "प्रस्थान शुरू करने हेतु गंतव्य ट्रॉमा सेंटर का चयन करें",

    // Handoff Modal
    handoffModalTitle: "मरीज़ एम्बुलेंस में",
    handoffModalSubtitle: "निकलने से पहले गंतव्य अस्पताल की पुष्टि करें।",
    traumaTeamAlertedNotice:
      "ऐप अस्पताल को सूचना नहीं भेजता। मरीज़ गंभीर हो तो पहले फ़ोन करें।",
    proceedToTransportRoute: "अस्पताल नेविगेशन प्रारंभ करें",
  },
};
