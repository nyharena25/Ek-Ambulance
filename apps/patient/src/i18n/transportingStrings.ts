import { SupportedLanguage } from "./onboardingStrings";

export interface TransportingTranslation {
  // Header & Lifecycle State
  screenTitle: string;
  missionIdLabel: (id: string) => string;
  stateBadge: string;
  stateDescription: string;
  languageToggleLabel: string;

  // Destination Hospital & Ward Readiness
  hospitalSectionTitle: string;

  // Map & Travel Time / Distance
  centrifugoLiveBadge: string;
  trackingConnectingBadge: string;
  trackingPausedBadge: string;
  etaOnlyLabel: (mins: number) => string;
  hospitalPendingText: string;
  hospitalArrivedNotice: string;
  /** Built only from facts the server supplied; never a plate, tracking URL or ETA that was not given. */
  familyShareMessage: (params: { hospitalName?: string; etaMinutes?: number }) => string;
  speedText: (kmh: number) => string;

  // Emergency Share with Family
  shareSectionTitle: string;
  shareSectionDescription: string;
  shareWhatsAppButton: string;
  shareSmsButton: string;
  shareMessageTitle: string;
  shareSuccessToast: string;
  shareOpenedToast: string;


  // Ambulance & Crew Card
  vehicleLicensePlateLabel: string;
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
      "The patient is in the ambulance on the way to hospital.",
    languageToggleLabel: "Language Switch",

    hospitalSectionTitle: "ASSIGNED DESTINATION HOSPITAL",

    centrifugoLiveBadge: "Live tracking",
    trackingConnectingBadge: "Connecting to live tracking...",
    trackingPausedBadge: "Live tracking paused - last position shown",
    etaOnlyLabel: (mins: number) => `${mins} MINS`,
    hospitalPendingText: "Destination hospital not confirmed yet",
    hospitalArrivedNotice: "The ambulance has reached the hospital. The crew is completing the handoff.",
    familyShareMessage: ({ hospitalName, etaMinutes }) =>
      `Ek-Ambulance update: the patient is on board an ambulance` +
      `${hospitalName ? ` going to ${hospitalName}` : ""}` +
      `${etaMinutes !== undefined ? ` (about ${etaMinutes} min away)` : ""}.`,
    speedText: (kmh: number) => `${kmh} km/h`,

    shareSectionTitle: "SHARE LIVE TRACKING WITH FAMILY",
    shareSectionDescription:
      "Send real-time GPS location, ambulance plate, and hospital ward readiness directly to family members:",
    shareWhatsAppButton: "Share via WhatsApp",
    shareSmsButton: "Share via SMS / System",
    shareMessageTitle: "Emergency Mission Sharing",
    shareSuccessToast: "Emergency tracking details shared with family",
    shareOpenedToast: "WhatsApp opened with tracking details - press Send to share",

    vehicleLicensePlateLabel: "AMBULANCE REGISTRATION",
    callCrewButton: "Call Onboard Crew",
    callCrewSubtitle: "Private telecom relay to paramedic",

    emergency108Button: "Call 108 Emergency Helpline Fallback",
  },
  hi: {
    screenTitle: "अस्पताल की ओर परिवहन जारी",
    missionIdLabel: (id: string) => `मिशन आईडी: ${id}`,
    stateBadge: "परिवहन अवस्था • मरीज एंबुलेंस में सवार",
    stateDescription:
      "मरीज़ एम्बुलेंस में अस्पताल जा रहे हैं।",
    languageToggleLabel: "भाषा चयन",

    hospitalSectionTitle: "संबद्ध गंतव्य अस्पताल",

    centrifugoLiveBadge: "लाइव ट्रैकिंग",
    trackingConnectingBadge: "लाइव ट्रैकिंग से जुड़ रहा है...",
    trackingPausedBadge: "लाइव ट्रैकिंग रुकी है - आख़िरी स्थिति दिखाई गई",
    etaOnlyLabel: (mins: number) => `${mins} मिनट`,
    hospitalPendingText: "गंतव्य अस्पताल की पुष्टि अभी नहीं हुई",
    hospitalArrivedNotice: "एम्बुलेंस अस्पताल पहुँच गई है। क्रू हैंडऑफ पूरा कर रहा है।",
    familyShareMessage: ({ hospitalName, etaMinutes }) =>
      `एक-एंबुलेंस अपडेट: मरीज एम्बुलेंस में सवार हैं` +
      `${hospitalName ? ` और ${hospitalName} की ओर जा रहे हैं` : ""}` +
      `${etaMinutes !== undefined ? ` (लगभग ${etaMinutes} मिनट दूर)` : ""}।`,
    speedText: (kmh: number) => `${kmh} किमी/घंटा`,

    shareSectionTitle: "परिजनों के साथ लाइव ट्रैकिंग साझा करें",
    shareSectionDescription:
      "रीयल-टाइम जीपीएस लोकेशन, एंबुलेंस नंबर व अस्पताल बेड की स्थिति परिजनों को सीधे भेजें:",
    shareWhatsAppButton: "व्हाट्सएप पर साझा करें",
    shareSmsButton: "एसएमएस द्वारा साझा करें",
    shareMessageTitle: "आपातकालीन मिशन विवरण",
    shareSuccessToast: "आपातकालीन ट्रैकिंग विवरण परिजनों के साथ साझा किया गया",
    shareOpenedToast: "ट्रैकिंग विवरण के साथ व्हाट्सएप खुला - भेजने के लिए 'Send' दबाएं",

    vehicleLicensePlateLabel: "एंबुलेंस पंजीकरण संख्या",
    callCrewButton: "एंबुलेंस क्रू से संपर्क करें",
    callCrewSubtitle: "पैरामेडिक को सुरक्षित प्राइवेट कॉल",

    emergency108Button: "108 आपातकालीन हेल्पलाइन बैकअप",
  },
};
