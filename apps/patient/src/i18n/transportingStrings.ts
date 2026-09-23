import { SupportedLanguage } from "./onboardingStrings";

export interface TransportingTranslation {
  // Header & Lifecycle State
  screenTitle: string;
  missionIdLabel: (id: string) => string;
  stateBadge: string;
  stateDescription: string;
  languageToggleLabel: string;
  englishLabel: string;
  hindiLabel: string;

  // Destination Hospital & Ward Readiness
  hospitalSectionTitle: string;
  hospitalName: string;
  hospitalSubtitle: string;
  wardReadinessBannerTitle: string;
  wardReadinessBannerSubtitle: string;
  bedHeldBadge: string;
  bedNumberText: string;
  traumaTeamStatus: string;
  preArrivalHandoffStatus: string;
  emergencyDeskContact: string;

  // Map & Travel Time / Distance
  destinationMarkerLabel: string;
  ambulanceMarkerLabel: string;
  remainingTravelEta: (mins: number, km: number) => string;
  greenCorridorBadge: string;
  routeCorridorNotice: string;
  centrifugoLiveBadge: string;
  speedText: (kmh: number) => string;

  // Emergency Share with Family
  shareSectionTitle: string;
  shareSectionDescription: string;
  shareWhatsAppButton: string;
  shareSmsButton: string;
  shareMessageTitle: string;
  formattedShareMessage: (params: {
    patientName: string;
    vehiclePlate: string;
    hospitalName: string;
    etaMinutes: number;
    distanceKm: number;
    wardStatus: string;
    trackingUrl: string;
  }) => string;
  shareSuccessToast: string;

  // Onboard Clinical Telemetry
  telemetrySectionTitle: string;
  vitalHeartRateLabel: string;
  vitalHeartRateValue: string;
  vitalSpO2Label: string;
  vitalSpO2Value: string;
  vitalBloodPressureLabel: string;
  vitalBloodPressureValue: string;
  vitalOxygenFlowLabel: string;
  vitalOxygenFlowValue: string;
  paramedicObservation: string;

  // Ambulance & Crew Card
  vehicleLicensePlateLabel: string;
  vehicleLicensePlate: string;
  careTierBadge: string;
  callCrewButton: string;
  callCrewSubtitle: string;

  // 108 Emergency Fallback
  emergency108Button: string;
}

export const transportingStrings: Record<
  SupportedLanguage,
  TransportingTranslation
> = {
  en: {
    screenTitle: "En Route to Hospital",
    missionIdLabel: (id: string) => `Mission ID: ${id}`,
    stateBadge: "TRANSPORTING • PATIENT ON BOARD",
    stateDescription:
      "Patient is securely onboard the ambulance. Advanced life-support telemetry and priority hospital corridor are active.",
    languageToggleLabel: "Language Switch",
    englishLabel: "EN",
    hindiLabel: "हिन्दी",

    hospitalSectionTitle: "ASSIGNED DESTINATION HOSPITAL",
    hospitalName: "Jai Prakash Narayan Apex Trauma Center, AIIMS",
    hospitalSubtitle: "Ring Road, Safdarjung Enclave, New Delhi",
    wardReadinessBannerTitle: "Trauma ICU Alerted - Bed Held",
    wardReadinessBannerSubtitle:
      "Emergency department notified via pre-arrival telemetry. Receiving clinical team and ICU bed are prepared.",
    bedHeldBadge: "BED HELD",
    bedNumberText: "Resuscitation Bay #04 Held & Reserved",
    traumaTeamStatus: "Level-1 Trauma Surgery & Anesthesia Team on Standby",
    preArrivalHandoffStatus:
      "Pre-Arrival Clinical Telemetry (ECG & Vitals) Transmitted to CMO",
    emergencyDeskContact: "Hospital Emergency Desk: +91 11 2659 8651",

    destinationMarkerLabel: "AIIMS Trauma Center",
    ambulanceMarkerLabel: "ALS Ambulance",
    remainingTravelEta: (mins: number, km: number) =>
      `${mins} MINS (${km.toFixed(1)} km remaining)`,
    greenCorridorBadge: "GREEN CORRIDOR",
    routeCorridorNotice:
      "Priority Green Corridor Active • Direct Access via Ring Road Flyover",
    centrifugoLiveBadge: "Centrifugo WS: Live (24ms)",
    speedText: (kmh: number) => `${kmh} km/h`,

    shareSectionTitle: "SHARE LIVE TRACKING WITH FAMILY",
    shareSectionDescription:
      "Send real-time GPS location, ambulance plate, and hospital ward readiness directly to family members:",
    shareWhatsAppButton: "Share via WhatsApp",
    shareSmsButton: "Share via SMS / System",
    shareMessageTitle: "Emergency Mission Sharing",
    formattedShareMessage: ({
      patientName,
      vehiclePlate,
      hospitalName,
      etaMinutes,
      distanceKm,
      wardStatus,
      trackingUrl,
    }) =>
      `🚨 [Ek-Ambulance Emergency Dispatch Update]\n\n` +
      `Patient ${patientName ? `(${patientName}) ` : ""}is currently onboard an AIS-125 ALS Ambulance (${vehiclePlate}) en route to:\n` +
      `🏥 ${hospitalName}\n\n` +
      `• Remaining Travel Time: ${etaMinutes} mins (${distanceKm.toFixed(1)} km)\n` +
      `• Hospital Readiness: ${wardStatus}\n\n` +
      `Track the ambulance live in real-time:\n` +
      `🔗 ${trackingUrl}\n\n` +
      `Helpline: 108 | Ek-Ambulance Regulated Dispatch`,
    shareSuccessToast: "Emergency tracking details shared with family",

    telemetrySectionTitle: "ONBOARD CLINICAL TELEMETRY (AIS-125)",
    vitalHeartRateLabel: "HEART RATE",
    vitalHeartRateValue: "84 bpm (Normal Sinus)",
    vitalSpO2Label: "SpO₂ OXYGEN",
    vitalSpO2Value: "98% (Medical O₂ 4L/min)",
    vitalBloodPressureLabel: "BLOOD PRESSURE",
    vitalBloodPressureValue: "122/80 mmHg",
    vitalOxygenFlowLabel: "VENTILATION",
    vitalOxygenFlowValue: "Spontaneous (CPAP Ready)",
    paramedicObservation:
      "Paramedic Rajesh Kumar is actively managing patient stability and vitals.",

    vehicleLicensePlateLabel: "AMBULANCE REGISTRATION",
    vehicleLicensePlate: "DL 1E AM 4092",
    careTierBadge: "Type D - Advanced Life Support (ALS)",
    callCrewButton: "Call Onboard Crew",
    callCrewSubtitle: "Private telecom relay to paramedic",

    emergency108Button: "Call 108 Emergency Helpline Fallback",
  },
  hi: {
    screenTitle: "अस्पताल की ओर परिवहन जारी",
    missionIdLabel: (id: string) => `मिशन आईडी: ${id}`,
    stateBadge: "परिवहन अवस्था • मरीज एंबुलेंस में सवार",
    stateDescription:
      "मरीज एंबुलेंस में सुरक्षित है। एडवांस्ड लाइफ-सपोर्ट टेलीमेट्री एवं प्राथमिकता ग्रीन कॉरिडोर सक्रिय है।",
    languageToggleLabel: "भाषा चयन",
    englishLabel: "EN",
    hindiLabel: "हिन्दी",

    hospitalSectionTitle: "संबद्ध गंतव्य अस्पताल",
    hospitalName: "जय प्रकाश नारायण एपेक्स ट्रॉमा सेंटर, एम्स",
    hospitalSubtitle: "रिंग रोड, सफदरजंग एन्क्लेव, नई दिल्ली",
    wardReadinessBannerTitle: "ट्रॉमा आईसीयू अलर्टेड - बेड सुरक्षित",
    wardReadinessBannerSubtitle:
      "आगमन पूर्व टेलीमेट्री द्वारा अस्पताल को सूचित किया गया। आपातकालीन चिकित्सा दल व आईसीयू बेड तैयार हैं।",
    bedHeldBadge: "बेड सुरक्षित",
    bedNumberText: "ट्रॉमा रिससिटेशन बे #04 आरक्षित एवं तैयार",
    traumaTeamStatus: "लेवल-1 ट्रॉमा सर्जरी एवं एनेस्थीसिया दल अलर्ट पर",
    preArrivalHandoffStatus:
      "आगमन-पूर्व टेलीमेट्री (ईसीजी व वाइटल्स) सीएमओ को प्रेषित",
    emergencyDeskContact: "अस्पताल आपातकालीन डेस्क: +91 11 2659 8651",

    destinationMarkerLabel: "एम्स ट्रॉमा सेंटर",
    ambulanceMarkerLabel: "ALS एंबुलेंस",
    remainingTravelEta: (mins: number, km: number) =>
      `${mins} मिनट (${km.toFixed(1)} किमी शेष)`,
    greenCorridorBadge: "ग्रीन कॉरिडोर",
    routeCorridorNotice:
      "प्राथमिकता ग्रीन कॉरिडोर सक्रिय • रिंग रोड फ्लाईओवर द्वारा सीधा मार्ग",
    centrifugoLiveBadge: "सेंट्रीफ्यूगो WS: लाइव (24ms)",
    speedText: (kmh: number) => `${kmh} किमी/घंटा`,

    shareSectionTitle: "परिजनों के साथ लाइव ट्रैकिंग साझा करें",
    shareSectionDescription:
      "रीयल-टाइम जीपीएस लोकेशन, एंबुलेंस नंबर व अस्पताल बेड की स्थिति परिजनों को सीधे भेजें:",
    shareWhatsAppButton: "व्हाट्सएप पर साझा करें",
    shareSmsButton: "एसएमएस द्वारा साझा करें",
    shareMessageTitle: "आपातकालीन मिशन विवरण",
    formattedShareMessage: ({
      patientName,
      vehiclePlate,
      hospitalName,
      etaMinutes,
      distanceKm,
      wardStatus,
      trackingUrl,
    }) =>
      `🚨 [एक-एंबुलेंस आपातकालीन मिशन अपडेट]\n\n` +
      `मरीज ${patientName ? `(${patientName}) ` : ""}वर्तमान में प्रमाणित ALS एंबुलेंस (${vehiclePlate}) में सवार हैं और गंतव्य की ओर अग्रसर हैं:\n` +
      `🏥 ${hospitalName}\n\n` +
      `• शेष यात्रा समय: ${etaMinutes} मिनट (${distanceKm.toFixed(1)} किमी शेष)\n` +
      `• अस्पताल स्थिति: ${wardStatus}\n\n` +
      `एंबुलेंस की लाइव लोकेशन यहां ट्रैक करें:\n` +
      `🔗 ${trackingUrl}\n\n` +
      `हेल्पलाइन: 108 | एक-एंबुलेंस नियंत्रित सेवा`,
    shareSuccessToast: "आपातकालीन ट्रैकिंग विवरण परिजनों के साथ साझा किया गया",

    telemetrySectionTitle: "ऑनबोर्ड चिकित्सकीय टेलीमेट्री (AIS-125)",
    vitalHeartRateLabel: "हृदय गति",
    vitalHeartRateValue: "84 बीपीएम (सामान्य)",
    vitalSpO2Label: "SpO₂ ऑक्सीजन",
    vitalSpO2Value: "98% (मेडिकल ऑक्सीजन 4L/min)",
    vitalBloodPressureLabel: "रक्तचाप (बीपी)",
    vitalBloodPressureValue: "122/80 mmHg",
    vitalOxygenFlowLabel: "वेंटिलेशन",
    vitalOxygenFlowValue: "सहज श्वसन (CPAP स्टैंडबाय)",
    paramedicObservation:
      "पैरामेडिक राजेश कुमार मरीज की स्थिरता व वाइटल्स की निरंतर निगरानी कर रहे हैं।",

    vehicleLicensePlateLabel: "एंबुलेंस पंजीकरण संख्या",
    vehicleLicensePlate: "DL 1E AM 4092",
    careTierBadge: "टाइप D - एडवांस्ड लाइफ सपोर्ट (ALS)",
    callCrewButton: "एंबुलेंस क्रू से संपर्क करें",
    callCrewSubtitle: "पैरामेडिक को सुरक्षित प्राइवेट कॉल",

    emergency108Button: "108 आपातकालीन हेल्पलाइन बैकअप",
  },
};
