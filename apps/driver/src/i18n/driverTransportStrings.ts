import { SupportedLanguage } from "./driverOnboardingStrings";

export interface DriverTransportTranslation {
  // Screen Header
  screenTitle: string;
  stateBadge: string;
  missionIdLabel: (id: string) => string;

  // ER Integration Alert Banner
  erAlertBannerTitle: string;
  erIntegrationSub: string;
  hl7GatewayStatus: string;
  assignedBayText: string;
  traumaTeamStatus: string;
  preArrivalVitalsStream: string;

  // Navigation Overlay
  destinationHeading: string;
  destinationHospitalName: string;
  destinationRampAccess: string;
  distanceLeftLabel: string;
  etaLabel: string;
  currentSpeedUnit: string;
  greenCorridorNotice: string;

  // Secure Bottom Completion Slider
  sliderPromptComplete: string;
  sliderReleaseToConfirm: string;
  sliderConfirmedComplete: string;
  sliderSafetyNotice: string;
  serverCompletingNotice: string;

  // Statutory Mission Sign-Off Form
  signOffTitle: string;
  signOffSubtitle: string;
  physicianSectionHeading: string;
  physicianNameLabel: string;
  physicianNamePlaceholder: string;
  medicalRegNoLabel: string;
  medicalRegNoPlaceholder: string;
  physicianDepartmentLabel: string;
  physicianDepartmentPlaceholder: string;

  emtSignatureHeading: string;
  emtNameLabel: string;
  emtRegNumberLabel: string;
  emtSignConfirmCheckbox: string;
  emtSignTimestampLabel: (time: string) => string;

  handoverChecklistHeading: string;
  checklistBedTransfer: string;
  checklistVentilatorTransfer: string;
  checklistEmrPacket: string;

  statutoryTariffHeading: string;
  baseTariffLabel: string;
  distanceTariffLabel: (km: number) => string;
  totalStatutoryFareLabel: (fare: number) => string;
  dpdpNotice: string;

  btnSubmitSignOff: string;
  btnSubmitting: string;
  signOffSuccessToast: string;

  // Statutory Mission Summary Receipt (shown after sign-off, before shift return)
  receiptTitle: string;
  receiptSubtitle: string;
  receiptTotalDistanceLabel: (km: number) => string;
  receiptSignedByLabel: (name: string, department: string) => string;
  receiptEmtConfirmedLabel: string;
  btnCompleteAndReturn: string;
}

export const driverTransportStrings: Record<SupportedLanguage, DriverTransportTranslation> = {
  en: {
    // Header
    screenTitle: "In-Transit Emergency Transport",
    stateBadge: "TRANSPORTING PATIENT (CODE 1 RED)",
    missionIdLabel: (id) => `Mission #${id}`,

    // ER Integration Alert Banner
    erAlertBannerTitle: "Hospital Triage Desk Notified via Integration",
    erIntegrationSub: "Live HL7/FHIR gateway connected • Real-time patient telemetry streaming to ER dashboard",
    hl7GatewayStatus: "HL7/FHIR Gateway: CONNECTED (200 OK)",
    assignedBayText: "Assigned: Bay 02 - Red Resus (Ventilator Ready)",
    traumaTeamStatus: "Trauma Team: In Position at ER Ramp",
    preArrivalVitalsStream: "Telemetry: HR 88 • SpO2 94% • MAP 93 mmHg",

    // Navigation Overlay
    destinationHeading: "Destination Emergency Room",
    destinationHospitalName: "Jaypee Hospital (Sector 128, Noida)",
    destinationRampAccess: "Follow Red Emergency Lane to Trauma Bay Ramp Entrance",
    distanceLeftLabel: "Distance to ER",
    etaLabel: "Arrival ETA",
    currentSpeedUnit: "km/h",
    greenCorridorNotice: "GREEN CORRIDOR ACTIVE • TRAFFIC SIGNALS SYNCHRONIZED",

    // Completion Slider
    sliderPromptComplete: "Slide to Complete Mission at Hospital ER",
    sliderReleaseToConfirm: "Release to confirm hospital arrival & complete mission",
    sliderConfirmedComplete: "MISSION COMPLETED AT HOSPITAL ER",
    sliderSafetyNotice: "Firm continuous swipe required to prevent accidental completion during vehicle motion",
    serverCompletingNotice: "Transmitting final GPS coordinates and timestamps to dispatch engine...",

    // Statutory Sign-Off Form
    signOffTitle: "Statutory Mission & Clinical Sign-Off",
    signOffSubtitle:
      "Mandatory clinical handoff under Clinical Establishments Act and Central Motor Vehicles Rules",
    physicianSectionHeading: "Receiving Emergency Physician Details",
    physicianNameLabel: "Attending Emergency Physician Name",
    physicianNamePlaceholder: "e.g. Dr. A. K. Singhal, MD",
    medicalRegNoLabel: "Medical Council Registration Number",
    medicalRegNoPlaceholder: "e.g. DMC/R/14298 or UPMC/66712",
    physicianDepartmentLabel: "Emergency Department / Unit",
    physicianDepartmentPlaceholder: "Apex Trauma & Resuscitation Unit",

    emtSignatureHeading: "EMT / Paramedic Digital Signature",
    emtNameLabel: "Attending Paramedic: Pilot Rajesh Sharma",
    emtRegNumberLabel: "Council Reg: HSSC/EMT-P/2022/7718",
    emtSignConfirmCheckbox:
      "I hereby certify that patient care, telemetry, and physical custody have been safely handed over to the receiving hospital team.",
    emtSignTimestampLabel: (time) => `Electronically stamped at ${time} with verified GPS coordinates.`,

    handoverChecklistHeading: "Clinical Handover Checklist",
    checklistBedTransfer: "Patient transferred safely from ambulance stretcher to ER Resus Bay 02",
    checklistVentilatorTransfer:
      "Transport ventilator / oxygen lines transferred to hospital central wall supply",
    checklistEmrPacket: "Physical triage record and digital telemetry handed over to head nurse",

    statutoryTariffHeading: "Regulated Statutory Tariff Summary",
    baseTariffLabel: "Statutory Base Dispatch Tariff: ₹ 500",
    distanceTariffLabel: (km) => `Distance Tariff (${km.toFixed(1)} km @ ₹25/km): ₹ ${Math.round(km * 25)}`,
    totalStatutoryFareLabel: (fare) => `Total Regulated Fare: ₹ ${fare}`,
    dpdpNotice:
      "DPDP Act 2023 Compliant: Patient EMR and GPS telemetry are encrypted and archived under statutory medical records retention policies.",

    btnSubmitSignOff: "Submit Statutory Sign-Off & View Receipt",
    btnSubmitting: "Recording Sign-Off...",
    signOffSuccessToast: "Mission successfully archived! Shift stats updated.",

    receiptTitle: "Statutory Mission Summary Receipt",
    receiptSubtitle: "Review the completed mission record before returning to shift standby.",
    receiptTotalDistanceLabel: (km) => `Total Distance Driven: ${km.toFixed(1)} km`,
    receiptSignedByLabel: (name, department) => `Received & Signed By: ${name} (${department})`,
    receiptEmtConfirmedLabel: "Attending EMT Signature Confirmed",
    btnCompleteAndReturn: "Complete & Return to Shift",
  },

  hi: {
    // Header
    screenTitle: "अस्पताल परिवहन (ट्रांसपोर्टिंग)",
    stateBadge: "मरीज को अस्पताल ले जा रहे हैं (कोड 1 रेड)",
    missionIdLabel: (id) => `मिशन #${id}`,

    // ER Integration Alert Banner
    erAlertBannerTitle: "अस्पताल ट्रायज डेस्क को इंटीग्रेशन द्वारा सूचित कर दिया गया है",
    erIntegrationSub: "लाइव HL7/FHIR गेटवे कनेक्टेड • रियल-टाइम मरीज टेलीमेट्री इमरजेंसी डैशबोर्ड पर स्ट्रीम हो रही है",
    hl7GatewayStatus: "HL7/FHIR गेटवे: कनेक्टेड (200 OK)",
    assignedBayText: "आवंटित: बे 02 - रेड ट्रॉमा रिससिटेटर (वेंटिलेटर तैयार)",
    traumaTeamStatus: "ट्रॉमा टीम: ER रैंप पर उपस्थित",
    preArrivalVitalsStream: "टेलीमेट्री: HR 88 • SpO2 94% • MAP 93 mmHg",

    // Navigation Overlay
    destinationHeading: "गंतव्य इमरजेंसी विभाग",
    destinationHospitalName: "जेपी अस्पताल (सेक्टर 128, नोएडा)",
    destinationRampAccess: "ट्रॉमा बे रैंप प्रवेश हेतु लाल आपातकालीन लेन का पालन करें",
    distanceLeftLabel: "अस्पताल तक शेष दूरी",
    etaLabel: "पहुंचने का समय (ETA)",
    currentSpeedUnit: "किमी/घं",
    greenCorridorNotice: "ग्रीन कॉरिडोर सक्रिय • ट्रैफिक सिग्नल सिंक्रोनाइज़्ड",

    // Completion Slider
    sliderPromptComplete: "अस्पताल ER पर मिशन पूर्ण करने हेतु स्लाइड करें",
    sliderReleaseToConfirm: "मिशन पूर्ण करने एवं अस्पताल आगमन पुष्टि हेतु छोड़ें",
    sliderConfirmedComplete: "अस्पताल ER पर मिशन सफलतापूर्वक पूर्ण हुआ",
    sliderSafetyNotice: "वाहन गति के दौरान आकस्मिक पूर्णता रोकने हेतु दृढ़ता से पूरा खींचें",
    serverCompletingNotice: "डिस्पैच इंजन को अंतिम जीपीएस लोकेशन व समय प्रेषित हो रहा है...",

    // Statutory Sign-Off Form
    signOffTitle: "वैधानिक मिशन एवं क्लीनिकल हैंडऑफ साइन-ऑफ",
    signOffSubtitle: "क्लिनिकल एस्टेब्लिशमेंट एक्ट एवं केंद्रीय मोटर वाहन नियमों के तहत अनिवार्य हैंडऑफ प्रपत्र",
    physicianSectionHeading: "मरीज ग्रहणकर्ता आपातकालीन चिकित्सक विवरण",
    physicianNameLabel: "उपस्थित इमरजेंसी डॉक्टर का नाम",
    physicianNamePlaceholder: "उदा. डॉ. ए. के. सिंघल, MD",
    medicalRegNoLabel: "मेडिकल काउंसिल पंजीकरण संख्या",
    medicalRegNoPlaceholder: "उदा. DMC/R/14298 या UPMC/66712",
    physicianDepartmentLabel: "विभाग / ट्रॉमा यूनिट",
    physicianDepartmentPlaceholder: "आपातकालीन एवं रीससिटेशन विभाग",

    emtSignatureHeading: "EMT / पैरामेडिक डिजिटल हस्ताक्षर",
    emtNameLabel: "उपस्थित पैरामेडिक: पायलट राजेश शर्मा",
    emtRegNumberLabel: "काउंसिल पंजीकरण: HSSC/EMT-P/2022/7718",
    emtSignConfirmCheckbox:
      "मैं प्रमाणित करता/करती हूं कि मरीज की देखभाल, टेलीमेट्री और भौतिक अभिरक्षा अस्पताल टीम को सुरक्षित रूप से सौंप दी गई है।",
    emtSignTimestampLabel: (time) => `सत्यापित जीपीएस निर्देशांकों के साथ ${time} पर इलेक्ट्रॉनिक रूप से दर्ज।`,

    handoverChecklistHeading: "क्लीनिकल हैंडओवर चेकलिस्ट",
    checklistBedTransfer: "मरीज को एंबुलेंस स्ट्रेचर से ER ट्रॉमा बे 02 में सुरक्षित स्थानांतरित किया गया",
    checklistVentilatorTransfer: "ट्रांसपोर्ट वेंटिलेटर / ऑक्सीजन लाइनों को अस्पताल की सेंट्रल सप्लाई पर स्थानांतरित किया गया",
    checklistEmrPacket: "भौतिक ट्रायज रिकॉर्ड एवं डिजिटल टेलीमेट्री हेड नर्स को सौंपी गई",

    statutoryTariffHeading: "वैधानिक विनियमित किराया सारांश",
    baseTariffLabel: "सरकारी आधार किराया: ₹ 500",
    distanceTariffLabel: (km) => `दूरी किराया (${km.toFixed(1)} किमी @ ₹25/किमी): ₹ ${Math.round(km * 25)}`,
    totalStatutoryFareLabel: (fare) => `कुल वैधानिक किराया: ₹ ${fare}`,
    dpdpNotice:
      "DPDP अधिनियम 2023 अनुपालित: मरीज का EMR और जीपीएस टेलीमेट्री वैधानिक रिकॉर्ड नीति के तहत एन्क्रिप्टेड और सुरक्षित है।",

    btnSubmitSignOff: "वैधानिक साइन-ऑफ जमा करें एवं रसीद देखें",
    btnSubmitting: "साइन-ऑफ दर्ज हो रहा है...",
    signOffSuccessToast: "मिशन सफलतापूर्वक पूर्ण एवं आर्काइव! शिफ्ट विवरण अपडेट हुआ।",

    receiptTitle: "वैधानिक मिशन सारांश रसीद",
    receiptSubtitle: "शिफ्ट स्टैंडबाय पर लौटने से पहले पूर्ण मिशन रिकॉर्ड की समीक्षा करें।",
    receiptTotalDistanceLabel: (km) => `कुल तय दूरी: ${km.toFixed(1)} किमी`,
    receiptSignedByLabel: (name, department) => `प्राप्तकर्ता एवं हस्ताक्षरकर्ता: ${name} (${department})`,
    receiptEmtConfirmedLabel: "उपस्थित EMT हस्ताक्षर पुष्ट",
    btnCompleteAndReturn: "पूर्ण करें एवं शिफ्ट पर लौटें",
  },
};
