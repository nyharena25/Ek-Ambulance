import { SupportedLanguage } from "./driverOnboardingStrings";

export interface DriverTransportTranslation {
  // Screen Header
  screenTitle: string;
  stateBadge: string;

  // ER Integration Alert Banner

  // Navigation Overlay
  destinationHeading: string;
  destinationHospitalName: string;
  currentSpeedUnit: string;

  // Secure Bottom Completion Slider
  sliderPromptComplete: string;
  sliderConfirmedComplete: string;
  sliderSafetyNotice: string;

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
  emtSignConfirmCheckbox: string;
  emtSignTimestampLabel: (time: string) => string;

  handoverChecklistHeading: string;
  checklistBedTransfer: string;
  checklistVentilatorTransfer: string;
  checklistEmrPacket: string;

  statutoryTariffHeading: string;
  dpdpNotice: string;

  btnSubmitSignOff: string;
  btnSubmitting: string;

  // Statutory Mission Summary Receipt (shown after sign-off, before shift return)
  receiptTitle: string;
  receiptSubtitle: string;
  receiptSignedByLabel: (name: string, department: string) => string;
  receiptEmtConfirmedLabel: string;
  btnCompleteAndReturn: string;
}

export const driverTransportStrings: Record<SupportedLanguage, DriverTransportTranslation> = {
  en: {
    // Header
    screenTitle: "In-Transit Emergency Transport",
    stateBadge: "TRANSPORTING PATIENT",
    // ER Integration Alert Banner

    // Navigation Overlay
    destinationHeading: "Destination Emergency Room",
    destinationHospitalName: "Destination hospital not available",
    currentSpeedUnit: "km/h",
    // Completion Slider
    sliderPromptComplete: "Slide to Complete Mission at Hospital ER",
    sliderConfirmedComplete: "MISSION COMPLETED AT HOSPITAL ER",
    sliderSafetyNotice: "Firm continuous swipe required to prevent accidental completion during vehicle motion",
    // Statutory Sign-Off Form
    signOffTitle: "Statutory Mission & Clinical Sign-Off",
    signOffSubtitle:
      "Mandatory clinical handoff under Clinical Establishments Act and Central Motor Vehicles Rules",
    physicianSectionHeading: "Receiving Emergency Physician Details",
    physicianNameLabel: "Attending Emergency Physician Name",
    physicianNamePlaceholder: "Receiving physician's full name",
    medicalRegNoLabel: "Medical Council Registration Number",
    medicalRegNoPlaceholder: "e.g. DMC/R/14298 or UPMC/66712",
    physicianDepartmentLabel: "Emergency Department / Unit",
    physicianDepartmentPlaceholder: "Apex Trauma & Resuscitation Unit",

    emtSignatureHeading: "EMT / Paramedic Digital Signature",
    emtNameLabel: "Attending crew member",
    emtSignConfirmCheckbox:
      "I hereby certify that patient care, telemetry, and physical custody have been safely handed over to the receiving hospital team.",
    emtSignTimestampLabel: (time) => `Electronically stamped at ${time} with verified GPS coordinates.`,

    handoverChecklistHeading: "Clinical Handover Checklist",
    checklistBedTransfer: "Patient transferred safely from ambulance stretcher to the ER bed",
    checklistVentilatorTransfer:
      "Transport ventilator / oxygen lines transferred to hospital central wall supply",
    checklistEmrPacket: "Physical triage record and digital telemetry handed over to head nurse",

    statutoryTariffHeading: "Regulated Statutory Tariff Summary",
    dpdpNotice:
      "DPDP Act 2023 Compliant: Patient EMR and GPS telemetry are encrypted and archived under statutory medical records retention policies.",

    btnSubmitSignOff: "Submit Statutory Sign-Off & View Receipt",
    btnSubmitting: "Recording Sign-Off...",
    receiptTitle: "Statutory Mission Summary Receipt",
    receiptSubtitle: "Review the completed mission record before returning to shift standby.",
    receiptSignedByLabel: (name, department) => `Received & Signed By: ${name} (${department})`,
    receiptEmtConfirmedLabel: "Attending EMT Signature Confirmed",
    btnCompleteAndReturn: "Complete & Return to Shift",
  },

  hi: {
    // Header
    screenTitle: "अस्पताल परिवहन (ट्रांसपोर्टिंग)",
    stateBadge: "मरीज को अस्पताल ले जा रहे हैं",
    // ER Integration Alert Banner

    // Navigation Overlay
    destinationHeading: "गंतव्य इमरजेंसी विभाग",
    destinationHospitalName: "गंतव्य अस्पताल उपलब्ध नहीं",
    currentSpeedUnit: "किमी/घं",
    // Completion Slider
    sliderPromptComplete: "अस्पताल ER पर मिशन पूर्ण करने हेतु स्लाइड करें",
    sliderConfirmedComplete: "अस्पताल ER पर मिशन सफलतापूर्वक पूर्ण हुआ",
    sliderSafetyNotice: "वाहन गति के दौरान आकस्मिक पूर्णता रोकने हेतु दृढ़ता से पूरा खींचें",
    // Statutory Sign-Off Form
    signOffTitle: "वैधानिक मिशन एवं क्लीनिकल हैंडऑफ साइन-ऑफ",
    signOffSubtitle: "क्लिनिकल एस्टेब्लिशमेंट एक्ट एवं केंद्रीय मोटर वाहन नियमों के तहत अनिवार्य हैंडऑफ प्रपत्र",
    physicianSectionHeading: "मरीज ग्रहणकर्ता आपातकालीन चिकित्सक विवरण",
    physicianNameLabel: "उपस्थित इमरजेंसी डॉक्टर का नाम",
    physicianNamePlaceholder: "प्राप्तकर्ता चिकित्सक का पूरा नाम",
    medicalRegNoLabel: "मेडिकल काउंसिल पंजीकरण संख्या",
    medicalRegNoPlaceholder: "उदा. DMC/R/14298 या UPMC/66712",
    physicianDepartmentLabel: "विभाग / ट्रॉमा यूनिट",
    physicianDepartmentPlaceholder: "आपातकालीन एवं रीससिटेशन विभाग",

    emtSignatureHeading: "EMT / पैरामेडिक डिजिटल हस्ताक्षर",
    emtNameLabel: "उपस्थित क्रू सदस्य",
    emtSignConfirmCheckbox:
      "मैं प्रमाणित करता/करती हूं कि मरीज की देखभाल, टेलीमेट्री और भौतिक अभिरक्षा अस्पताल टीम को सुरक्षित रूप से सौंप दी गई है।",
    emtSignTimestampLabel: (time) => `सत्यापित जीपीएस निर्देशांकों के साथ ${time} पर इलेक्ट्रॉनिक रूप से दर्ज।`,

    handoverChecklistHeading: "क्लीनिकल हैंडओवर चेकलिस्ट",
    checklistBedTransfer: "मरीज को एंबुलेंस स्ट्रेचर से ER बेड पर सुरक्षित स्थानांतरित किया गया",
    checklistVentilatorTransfer: "ट्रांसपोर्ट वेंटिलेटर / ऑक्सीजन लाइनों को अस्पताल की सेंट्रल सप्लाई पर स्थानांतरित किया गया",
    checklistEmrPacket: "भौतिक ट्रायज रिकॉर्ड एवं डिजिटल टेलीमेट्री हेड नर्स को सौंपी गई",

    statutoryTariffHeading: "वैधानिक विनियमित किराया सारांश",
    dpdpNotice:
      "DPDP अधिनियम 2023 अनुपालित: मरीज का EMR और जीपीएस टेलीमेट्री वैधानिक रिकॉर्ड नीति के तहत एन्क्रिप्टेड और सुरक्षित है।",

    btnSubmitSignOff: "वैधानिक साइन-ऑफ जमा करें एवं रसीद देखें",
    btnSubmitting: "साइन-ऑफ दर्ज हो रहा है...",
    receiptTitle: "वैधानिक मिशन सारांश रसीद",
    receiptSubtitle: "शिफ्ट स्टैंडबाय पर लौटने से पहले पूर्ण मिशन रिकॉर्ड की समीक्षा करें।",
    receiptSignedByLabel: (name, department) => `प्राप्तकर्ता एवं हस्ताक्षरकर्ता: ${name} (${department})`,
    receiptEmtConfirmedLabel: "उपस्थित EMT हस्ताक्षर पुष्ट",
    btnCompleteAndReturn: "पूर्ण करें एवं शिफ्ट पर लौटें",
  },
};
