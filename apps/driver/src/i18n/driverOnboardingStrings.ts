import type { IconRef } from "../components/AppIcon";
import type { AIS125VehicleType } from "@sahayak/domain";

export type SupportedLanguage = "en" | "hi";

export interface AIS125TypeDetails {
  id: AIS125VehicleType;
  code: string;
  badge: string;
  name: string;
  subtitle: string;
  description: string;
  icon: IconRef;
  staffing: string;
  mandatoryEquipment: string[];
  regulatoryStandard: string;
  recommendedUse: string;
}

export interface DocumentSlotConfig {
  id: string;
  key: "arai_certificate" | "fitness_permit" | "commercial_dl" | "emt_certificate" | "vehicle_rc" | "commercial_insurance" | "puc_certificate";
  title: string;
  subtitle: string;
  mandatory: boolean;
  acceptedFormats: string;
  regulatoryReference: string;
  maxSizeBytes: number;
}

export interface DriverOnboardingTranslation {
  // Navigation & Header
  screenTitle: string;
  screenSubtitle: string;
  appBadge: string;
  morthComplianceNotice: string;

  // Step Indicators
  step1Title: string;
  step2Title: string;
  step3Title: string;
  step4Title: string;

  // Step 1: Commercial Driver's License
  step1Header: string;
  step1Description: string;
  dlNumberLabel: string;
  dlNumberPlaceholder: string;
  dlNumberHelp: string;
  dlExpiryLabel: string;
  dlExpiryPlaceholder: string;
  dlStateLabel: string;
  dlStatePlaceholder: string;
  psvBadgeLabel: string;
  psvBadgePlaceholder: string;
  psvBadgeHelp: string;
  cdlUploadHeading: string;
  cdlUploadNotice: string;

  // Step 2: EMT Certification
  step2Header: string;
  step2Description: string;
  emtLevelLabel: string;
  emtLevels: {
    id: "EMT_P" | "EMT_A" | "EMT_B" | "FMR";
    title: string;
    subtitle: string;
    tag: string;
  }[];
  emtNumberLabel: string;
  emtNumberPlaceholder: string;
  emtCouncilLabel: string;
  emtCouncilPlaceholder: string;
  emtExpiryLabel: string;
  emtExpiryPlaceholder: string;
  aclsCertifiedLabel: string;
  aclsCertifiedSub: string;
  blsCertifiedLabel: string;
  blsCertifiedSub: string;
  emtUploadHeading: string;

  // Step 3: Vehicle Registration & AIS-125
  step3Header: string;
  step3Description: string;
  vehicleRegLabel: string;
  vehicleRegPlaceholder: string;
  vehicleRegHelp: string;
  makeModelLabel: string;
  makeModelPlaceholder: string;
  manufactureYearLabel: string;
  manufactureYearPlaceholder: string;
  vinChassisLabel: string;
  vinChassisPlaceholder: string;
  rcUploadHeading: string;
  ais125SelectorTitle: string;
  ais125SelectorDescription: string;
  /** Formal regulatory standard code - identical across languages, like a legal citation. */
  ais125StandardBadge: string;
  ais125Categories: AIS125TypeDetails[];
  selectedAIS125Summary: (type: string) => string;
  staffingLabel: string;
  equipmentLabel: string;

  // Step 4: Statutory Document Uploads
  step4Header: string;
  step4Description: string;
  mandatoryDocsTitle: string;
  statutoryMandatoryBadge: string;
  araiHighlightBoxTitle: string;
  araiHighlightBoxDescription: string;
  /** Statutory citation - identical across languages, like a legal citation. */
  araiStatutoryRef: string;
  fitnessHighlightBoxTitle: string;
  fitnessHighlightBoxDescription: string;
  /** Statutory citation - identical across languages, like a legal citation. */
  fitnessStatutoryRef: string;
  requiredBadgeLabel: string;
  documentSlots: DocumentSlotConfig[];
  uploadButtonText: string;
  reuploadButtonText: string;
  removeButtonText: string;
  statusNotUploaded: string;
  statusUploading: string;
  statusUploaded: string;
  filePickerCamera: string;
  filePickerGallery: string;
  filePickerPdf: string;
  cancelText: string;

  // Navigation Buttons
  buttonBack: string;
  buttonNext: string;
  buttonSubmit: string;
  submittingText: string;

  // Validation Warnings
  errorMissingRequired: string;
  errorInvalidDL: string;
  errorExpiredDL: string;
  errorMissingPSV: string;
  errorMissingEMT: string;
  errorInvalidVehicleReg: string;
  errorMissingAIS125: string;
  errorMissingARAI: string;
  errorMissingFitness: string;
  errorMissingRC: string;

  // Submission Success Modal
  successTitle: string;
  successSubtitle: string;
  applicationIdLabel: string;
  categoryRegisteredLabel: string;
  reviewTimeNotice: string;
  helplineNotice: string;
  goToDashboardButton: string;
}

export const driverOnboardingStrings: Record<SupportedLanguage, DriverOnboardingTranslation> = {
  en: {
    // Header
    screenTitle: "Ambulance Driver Onboarding",
    screenSubtitle: "National Fleet Registration & AIS-125 Compliance",
    appBadge: "MoRTH AIS-125 REGULATED",
    morthComplianceNotice: "Under Central Motor Vehicles Rules (CMVR) & Indian Standard AIS-125 Part 1/2",
    // Steps
    step1Title: "License & Type",
    step2Title: "EMT Details",
    step3Title: "Vehicle",
    step4Title: "Statutory Permits",
    // Step 1: CDL
    step1Header: "Commercial Driver Credentials",
    step1Description:
      "Enter your state-issued Commercial Driver's License (CDL) and Public Service Vehicle (PSV) ambulance badge authorized by the Regional Transport Office (RTO), and choose your ambulance's AIS-125 type. Its classification determines the patient triage levels you are authorized to accept.",
    dlNumberLabel: "Commercial Driving License (CDL) Number",
    dlNumberPlaceholder: "e.g. DL-0420110012345",
    dlNumberHelp: "Must contain valid state code followed by RTO license format (minimum 10 characters).",
    dlExpiryLabel: "License Expiry Date",
    dlExpiryPlaceholder: "DD/MM/YYYY",
    dlStateLabel: "State / UT of Issuance",
    dlStatePlaceholder: "e.g. NCT of Delhi (DL), Uttar Pradesh (UP)",
    psvBadgeLabel: "Ambulance PSV Commercial Badge Number",
    psvBadgePlaceholder: "e.g. PSV-AMB-2023-8891",
    psvBadgeHelp: "Mandatory statutory badge for operating passenger/emergency transport vehicles under Motor Vehicles Act.",
    cdlUploadHeading: "Upload Commercial Driving License (CDL)",
    cdlUploadNotice: "Upload clear photo or PDF copy of front and back of your driving license with valid transport endorsement.",

    // Step 2: EMT Details
    step2Header: "Emergency Medical Technician (EMT) Certification",
    step2Description:
      "All ambulance pilots and medical crew operating under AIS-125 must hold valid medical first-response or EMT qualifications recognized by HSSC/NELS or State Councils.",
    emtLevelLabel: "Select Your EMT Certification Level",
    emtLevels: [
      {
        id: "EMT_P",
        title: "EMT - Paramedic (EMT-P / ALS)",
        subtitle: "Advanced Life Support, Intubation, IV Infusions & Cardiac Resuscitation",
        tag: "Type D (ALS) Eligible",
      },
      {
        id: "EMT_A",
        title: "EMT - Advanced (EMT-A / Intermediate)",
        subtitle: "Airway Management, IV Access & Emergency Trauma Stabilization",
        tag: "Type C (BLS) / D Eligible",
      },
      {
        id: "EMT_B",
        title: "EMT - Basic (EMT-B / BLS)",
        subtitle: "CPR, Automated Defibrillation (AED), Oxygenation & Splinting",
        tag: "Type B (PTA) / C Eligible",
      },
      {
        id: "FMR",
        title: "First Medical Responder (FMR)",
        subtitle: "Basic Life Support, Scene Hemorrhage Control & First-aid",
        tag: "Type A (MFR) / B Eligible",
      },
    ],
    emtNumberLabel: "EMT Registration / Certificate Number",
    emtNumberPlaceholder: "e.g. HSSC/EMT-P/2022/49102",
    emtCouncilLabel: "Issuing Council or Training Institute",
    emtCouncilPlaceholder: "e.g. Healthcare Sector Skill Council (HSSC) / Red Cross / AIIMS",
    emtExpiryLabel: "Certificate Expiration Date",
    emtExpiryPlaceholder: "DD/MM/YYYY",
    aclsCertifiedLabel: "AHA / ERC ACLS Certified (Advanced Cardiovascular Life Support)",
    aclsCertifiedSub: "Mandatory for Type D (ALS) mobile ICU deployment",
    blsCertifiedLabel: "AHA / ERC BLS Certified (Basic Life Support for Healthcare Providers)",
    blsCertifiedSub: "Mandatory for all emergency response ambulance personnel",
    emtUploadHeading: "Upload EMT / Paramedic Certificate",

    // Step 3: Vehicle & AIS-125
    step3Header: "Vehicle Registration",
    step3Description:
      "Register the emergency vehicle you will operate. Its AIS-125 classification was chosen in Step 1.",
    vehicleRegLabel: "Vehicle Registration Number (License Plate)",
    vehicleRegPlaceholder: "Format: SS 00 XX 0000 (state, district, series, number)",
    vehicleRegHelp: "Must be registered as a Commercial Emergency Vehicle (Ambulance) with RTO.",
    makeModelLabel: "Vehicle Make & Model",
    makeModelPlaceholder: "e.g. Force Traveller 3350 / Tata Winger / Mahindra Bolero Maxx",
    manufactureYearLabel: "Year of Manufacture",
    manufactureYearPlaceholder: "e.g. 2023",
    vinChassisLabel: "Chassis / VIN Number (17 digits)",
    vinChassisPlaceholder: "e.g. MAT452098P1B76543",
    rcUploadHeading: "Upload Vehicle Registration Certificate (RC)",
    ais125SelectorTitle: "Select AIS-125 Vehicle Classification",
    ais125StandardBadge: "MoRTH AIS-125:2014",
    ais125SelectorDescription:
      "Select the certified specification tier under Indian Standard AIS-125 (Part 1 & 2) corresponding to your vehicle's physical configuration and onboard equipment:",
    ais125Categories: [
      {
        id: "TYPE_D_ALS",
        code: "Type D",
        badge: "ADVANCED LIFE SUPPORT (ALS)",
        name: "Type D: Advanced Life Support Ambulance",
        subtitle: "Mobile Intensive Care Unit (ICU on Wheels)",
        description:
          "Designed and equipped for the transport and advanced clinical monitoring of critically ill or injured patients. Required for Cat 1 cardiac arrest, respiratory failure, and polytrauma.",
        icon: { set: "mci", name: "ambulance" },
        staffing: "Driver + Certified Paramedic (EMT-P / Critical Care Nurse)",
        mandatoryEquipment: [
          "Transport ICU Ventilator (Adult/Pediatric)",
          "Biphasic Defibrillator with Manual Pacing & AED",
          "Multiparameter Patient Monitor (ECG, SpO2, NIBP, EtCO2)",
          "Dual Central Oxygen System with High-Flow Regulators",
          "Automated Syringe & Volumetric Infusion Pumps",
          "Emergency Resuscitation Crash Drug Kit",
          "Suction Machine (High Vacuum / High Flow)",
          "Scoop Stretcher, Spine Board & Cervical Collars",
        ],
        regulatoryStandard: "AIS-125:2014 Part 1 Cl. 3.4 & Part 2 Cl. 4.4",
        recommendedUse: "Immediate life threats, STEMI cardiac events, ventilator transfers",
      },
      {
        id: "TYPE_C_BLS",
        code: "Type C",
        badge: "BASIC LIFE SUPPORT (BLS)",
        name: "Type C: Basic Life Support Ambulance",
        subtitle: "Emergency Medical Care & Rapid Stabilization",
        description:
          "Designed and equipped for the transport, resuscitation, and monitoring of patients requiring basic life support care during transit.",
        icon: { set: "mci", name: "van-passenger" },
        staffing: "Driver + Certified Basic EMT (EMT-B)",
        mandatoryEquipment: [
          "Dual Oxygen Cylinders (Minimum 2x 10L water capacity)",
          "Automated External Defibrillator (AED)",
          "Portable Suction Apparatus (Battery Operated)",
          "Manual Bag-Valve-Mask (BVM) Resuscitator (Adult/Pediatric)",
          "Full Spine Board with Head Immobilizer & Straps",
          "Emergency Splints & Cervical Immobilization Kit",
          "Auto-loading Roll-in Main Stretcher",
          "Comprehensive First-Aid Trauma Dressing Kit",
        ],
        regulatoryStandard: "AIS-125:2014 Part 1 Cl. 3.3 & Part 2 Cl. 4.3",
        recommendedUse: "Urgent trauma, stroke, respiratory distress, stabilized emergency cases",
      },
      {
        id: "TYPE_B_PTA",
        code: "Type B",
        badge: "PATIENT TRANSPORT (PTA)",
        name: "Type B: Patient Transport Ambulance",
        subtitle: "Non-Emergency Transfer & Convalescent Transit",
        description:
          "Designed and equipped for the transport of patients who are not expected to become emergency patients during transit, such as routine hospital visits and dialysis.",
        icon: { set: "ion", name: "bed" },
        staffing: "Driver + Medical Attendant / First Responder",
        mandatoryEquipment: [
          "Roll-in Auto-loading Main Stretcher with Restraints",
          "Wheelchair Ramp or Foldable Transit Wheelchair",
          "Portable Oxygen Cylinder with Flowmeter & Mask",
          "Standard Medical First-Aid Kit",
          "Sphygmomanometer (BP Apparatus) & Pulse Oximeter",
          "Disinfection & Bio-hazard Disposal Bin",
        ],
        regulatoryStandard: "AIS-125:2014 Part 1 Cl. 3.2 & Part 2 Cl. 4.2",
        recommendedUse: "Planned transfers, dialysis, orthopaedic non-emergency transport",
      },
      {
        id: "TYPE_A_MFR",
        code: "Type A",
        badge: "MEDICAL FIRST RESPONDER (MFR)",
        name: "Type A: Medical First Responder Vehicle",
        subtitle: "Rapid First Response & Urban Congestion Interceptor",
        description:
          "High-mobility vehicle (two-wheeler / compact SUV) designed and equipped for the provision of immediate medical first-response to stabilize patients prior to ambulance arrival.",
        icon: { set: "mci", name: "motorbike" },
        staffing: "Certified First Medical Responder (FMR) / Solo EMT",
        mandatoryEquipment: [
          "Automated External Defibrillator (AED)",
          "Portable Resuscitation Kit with O2 Delivery",
          "Tactical Bleeding Control & Tourniquet Pack",
          "Burn Dressing Kit & Cervical Collar",
          "Two-way Siren, GPS Telemetry & LED Flasher",
        ],
        regulatoryStandard: "AIS-125:2014 Part 1 Cl. 3.1 & Part 2 Cl. 4.1",
        recommendedUse: "High-density traffic interceptor, immediate CPR dispatch",
      },
    ],
    selectedAIS125Summary: (type) => `Selected: ${type} under Indian Standard AIS-125`,
    staffingLabel: "Mandatory Staffing",
    equipmentLabel: "Required Onboard Equipment (AIS-125)",

    // Step 4: Statutory Documents
    step4Header: "Statutory Permits & ARAI Verification",
    step4Description:
      "Upload original scanned certificates or high-resolution photos. ARAI inspection certificate and commercial vehicle fitness permit are strictly mandatory to ensure zero illegal ambulance operations.",
    mandatoryDocsTitle: "Mandatory Regulatory Documents (MoRTH Requirement)",
    statutoryMandatoryBadge: "MANDATORY STATUTORY",
    araiHighlightBoxTitle: "ARAI AIS-125 Compliance Certificate (Mandatory)",
    araiHighlightBoxDescription:
      "Issued by Automotive Research Association of India (ARAI) or ICAT certifying compliance of vehicle body, medical equipment mounting, lightbar/siren, and electrical insulation under AIS-125.",
    araiStatutoryRef: "AIS-125 / CMVR Rule 125(C)",
    fitnessHighlightBoxTitle: "State Vehicle Fitness Permit / Form 38 (Mandatory)",
    fitnessHighlightBoxDescription:
      "Valid Fitness Certificate issued by State Transport Department verifying the mechanical, roadworthiness, and emission compliance of the commercial ambulance.",
    fitnessStatutoryRef: "MV Act Sec 56 / Form 38",
    documentSlots: [
      {
        id: "slot_arai",
        key: "arai_certificate",
        title: "ARAI AIS-125 Inspection Certificate",
        subtitle: "Compliance report issued by ARAI/ICAT for body code and life support layout",
        mandatory: true,
        acceptedFormats: "PDF, JPG, PNG (Max 10 MB)",
        regulatoryReference: "Rule 125(C) Central Motor Vehicles Rules",
        maxSizeBytes: 10 * 1024 * 1024,
      },
      {
        id: "slot_fitness",
        key: "fitness_permit",
        title: "Commercial Vehicle Fitness Permit (Form 38)",
        subtitle: "Current valid roadworthiness certificate issued by RTO / STA",
        mandatory: true,
        acceptedFormats: "PDF, JPG, PNG (Max 10 MB)",
        regulatoryReference: "Section 56 Motor Vehicles Act 1988",
        maxSizeBytes: 10 * 1024 * 1024,
      },
      {
        id: "slot_dl",
        key: "commercial_dl",
        title: "Commercial Driver's License (Front & Back)",
        subtitle: "Clear scan showing commercial heavy / transport vehicle authorization",
        mandatory: true,
        acceptedFormats: "PDF, JPG, PNG (Max 10 MB)",
        regulatoryReference: "Section 9 Motor Vehicles Act",
        maxSizeBytes: 10 * 1024 * 1024,
      },
      {
        id: "slot_emt",
        key: "emt_certificate",
        title: "EMT / Paramedic Qualification Certificate",
        subtitle: "Degree/Diploma or Council registration certificate with validity",
        mandatory: true,
        acceptedFormats: "PDF, JPG, PNG (Max 10 MB)",
        regulatoryReference: "AIS-125 Crew Qualifications Standard",
        maxSizeBytes: 10 * 1024 * 1024,
      },
      {
        id: "slot_rc",
        key: "vehicle_rc",
        title: "Vehicle Registration Certificate (RC)",
        subtitle: "Official registration smart card showing 'Ambulance' class",
        mandatory: true,
        acceptedFormats: "PDF, JPG, PNG (Max 10 MB)",
        regulatoryReference: "Section 39 Motor Vehicles Act",
        maxSizeBytes: 10 * 1024 * 1024,
      },
      {
        id: "slot_insurance",
        key: "commercial_insurance",
        title: "Commercial Vehicle Insurance Policy",
        subtitle: "Active Comprehensive / Third Party Commercial Ambulance policy",
        mandatory: false,
        acceptedFormats: "PDF, JPG, PNG (Max 10 MB)",
        regulatoryReference: "Section 146 Motor Vehicles Act",
        maxSizeBytes: 10 * 1024 * 1024,
      },
      {
        id: "slot_puc",
        key: "puc_certificate",
        title: "Pollution Under Control (PUC) Certificate",
        subtitle: "Valid emission inspection certificate with QR code",
        mandatory: false,
        acceptedFormats: "PDF, JPG, PNG (Max 10 MB)",
        regulatoryReference: "Rule 115 Central Motor Vehicles Rules",
        maxSizeBytes: 10 * 1024 * 1024,
      },
    ],
    requiredBadgeLabel: "REQUIRED",
    uploadButtonText: "Upload Document",
    reuploadButtonText: "Re-upload",
    removeButtonText: "Remove",
    statusNotUploaded: "Pending Upload",
    statusUploading: "Uploading...",
    statusUploaded: "Verified Upload",
    filePickerCamera: "Take Photo (Camera)",
    filePickerGallery: "Choose from Gallery",
    filePickerPdf: "Select Document (PDF)",
    cancelText: "Cancel",

    // Buttons
    buttonBack: "Back",
    buttonNext: "Continue",
    buttonSubmit: "Submit Statutory Application",
    submittingText: "Validating & Submitting...",

    // Errors
    errorMissingRequired: "Please fill all mandatory fields to continue.",
    errorInvalidDL: "Please enter a valid Commercial Driving License number (e.g. DL-0420110012345).",
    errorExpiredDL: "License expiry date is invalid or expired. Please check.",
    errorMissingPSV: "PSV Commercial Badge number is required for ambulance operations.",
    errorMissingEMT: "EMT certificate number and issuing council are required.",
    errorInvalidVehicleReg: "Please enter a valid Indian vehicle registration number (format SS 00 XX 0000).",
    errorMissingAIS125: "Please select an AIS-125 vehicle classification tier.",
    errorMissingARAI: "ARAI AIS-125 Inspection Certificate is required by law.",
    errorMissingFitness: "Vehicle Fitness Permit (Form 38) is mandatory to operate on public roads.",
    errorMissingRC: "Vehicle Registration Certificate (RC) must be uploaded.",

    // Success Modal
    successTitle: "Onboarding Application Submitted!",
    successSubtitle: "Your vehicle & credentials have been submitted for State Transport Authority (STA) & MoRTH verification.",
    applicationIdLabel: "Application Tracking Reference",
    categoryRegisteredLabel: "Registered AIS-125 Classification",
    reviewTimeNotice: "Digital document verification is typically processed within 2 to 4 business hours. You will receive an SMS and push notification once your ambulance is approved for dispatch.",
    helplineNotice: "The review result will appear on this screen and on your Profile.",
    goToDashboardButton: "Proceed to Dispatch Standby",
  },

  hi: {
    // Header
    screenTitle: "एंबुलेंस चालक ऑनबोर्डिंग",
    screenSubtitle: "राष्ट्रीय आपातकालीन बेड़ा पंजीकरण एवं AIS-125 अनुपालन",
    appBadge: "MoRTH AIS-125 वैधानिक प्रमाणित",
    morthComplianceNotice: "केंद्रीय मोटर वाहन नियम (CMVR) एवं भारतीय मानक AIS-125 भाग 1/2 के अंतर्गत",
    // Steps
    step1Title: "लाइसेंस व प्रकार",
    step2Title: "EMT विवरण",
    step3Title: "वाहन",
    step4Title: "वैधानिक परमिट",
    // Step 1: CDL
    step1Header: "वाणिज्यिक चालक पहचान व लाइसेंस",
    step1Description:
      "परिवहन कार्यालय (RTO) द्वारा जारी अपना वैध वाणिज्यिक ड्राइविंग लाइसेंस (CDL) और सार्वजनिक सेवा वाहन (PSV) एंबुलेंस बैज विवरण दर्ज करें, और अपनी एंबुलेंस का AIS-125 प्रकार चुनें। इसका वर्गीकरण निर्धारित करता है कि आप किन चिकित्सा आपातकालों के लिए अधिकृत हैं।",
    dlNumberLabel: "वाणिज्यिक ड्राइविंग लाइसेंस (CDL) नंबर",
    dlNumberPlaceholder: "उदा. DL-0420110012345",
    dlNumberHelp: "राज्य कोड के साथ सही RTO लाइसेंस प्रारूप दर्ज करें (कम से कम 10 अक्षर)।",
    dlExpiryLabel: "लाइसेंस समाप्ति तिथि (वैधता)",
    dlExpiryPlaceholder: "दिनांक/माह/वर्ष (DD/MM/YYYY)",
    dlStateLabel: "लाइसेंस जारी करने वाला राज्य / केंद्र शासित प्रदेश",
    dlStatePlaceholder: "उदा. दिल्ली (DL), उत्तर प्रदेश (UP)",
    psvBadgeLabel: "एंबुलेंस PSV वाणिज्यिक बैज नंबर",
    psvBadgePlaceholder: "उदा. PSV-AMB-2023-8891",
    psvBadgeHelp: "मोटर वाहन अधिनियम के तहत आपातकालीन रोगी परिवहन हेतु अनिवार्य सरकारी वाणिज्यिक बैज।",
    cdlUploadHeading: "वाणिज्यिक ड्राइविंग लाइसेंस (CDL) अपलोड करें",
    cdlUploadNotice: "परिवहन श्रेणी (Commercial Transport) दर्शाने वाले लाइसेंस के दोनों तरफ की स्पष्ट फोटो या PDF अपलोड करें।",

    // Step 2: EMT Details
    step2Header: "आपातकालीन चिकित्सा तकनीशियन (EMT) प्रमाणन",
    step2Description:
      "AIS-125 मानक के अनुसार सभी एंबुलेंस पायलट एवं मेडिकल क्रू के पास HSSC/NELS अथवा राज्य पैरामेडिकल काउंसिल से मान्यता प्राप्त प्रमाण पत्र होना अनिवार्य है।",
    emtLevelLabel: "अपना EMT प्रमाणन स्तर चुनें",
    emtLevels: [
      {
        id: "EMT_P",
        title: "ईएमटी - पैरामेडिक (EMT-P / ALS)",
        subtitle: "एडवांस्ड लाइफ सपोर्ट, इंट्यूबेशन, IV ड्रिप एवं कार्डियक रीससिटेशन",
        tag: "टाइप D (ALS) हेतु पात्र",
      },
      {
        id: "EMT_A",
        title: "ईएमटी - एडवांस्ड (EMT-A / इंटरमीडिएट)",
        subtitle: "एयरवे मैनेजमेंट, IV एक्सेस और गंभीर आघात स्थिरीकरण",
        tag: "टाइप C (BLS) / D हेतु पात्र",
      },
      {
        id: "EMT_B",
        title: "ईएमटी - बेसिक (EMT-B / BLS)",
        subtitle: "सीपीआर, ऑटोमेटेड डिफिब्रिलेशन (AED), ऑक्सीजन सहायता और स्प्लिंट",
        tag: "टाइप B (PTA) / C हेतु पात्र",
      },
      {
        id: "FMR",
        title: "फर्स्ट मेडिकल रिस्पॉन्डर (FMR)",
        subtitle: "बेसिक लाइफ सपोर्ट, त्वरित रक्तस्राव नियंत्रण और प्राथमिक चिकित्सा",
        tag: "टाइप A (MFR) / B हेतु पात्र",
      },
    ],
    emtNumberLabel: "EMT पंजीकरण / प्रमाण पत्र संख्या",
    emtNumberPlaceholder: "उदा. HSSC/EMT-P/2022/49102",
    emtCouncilLabel: "प्रमाणन जारीकर्ता काउंसिल या संस्थान",
    emtCouncilPlaceholder: "उदा. हेल्थकेयर सेक्टर स्किल काउंसिल (HSSC) / रेड क्रॉस / एम्स",
    emtExpiryLabel: "प्रमाण पत्र समाप्ति तिथि (वैधता)",
    emtExpiryPlaceholder: "दिनांक/माह/वर्ष (DD/MM/YYYY)",
    aclsCertifiedLabel: "AHA / ERC ACLS प्रमाणित (एडवांस्ड कार्डियोवस्कुलर लाइफ सपोर्ट)",
    aclsCertifiedSub: "टाइप D (ALS) मोबाइल ICU ड्यूटी हेतु अनिवार्य",
    blsCertifiedLabel: "AHA / ERC BLS प्रमाणित (बेसिक लाइफ सपोर्ट)",
    blsCertifiedSub: "सभी आपातकालीन एंबुलेंस कार्मिकों हेतु अनिवार्य प्रमाण पत्र",
    emtUploadHeading: "EMT / पैरामेडिक प्रमाण पत्र अपलोड करें",

    // Step 3: Vehicle & AIS-125
    step3Header: "वाहन पंजीकरण",
    step3Description:
      "जिस आपातकालीन वाहन को आप चलाएंगे उसका पंजीकरण करें। इसका AIS-125 वर्गीकरण चरण 1 में चुना गया था।",
    vehicleRegLabel: "वाहन पंजीकरण संख्या (नंबर प्लेट)",
    vehicleRegPlaceholder: "प्रारूप: SS 00 XX 0000 (राज्य, ज़िला, सीरीज़, नंबर)",
    vehicleRegHelp: "RTO में वाणिज्यिक आपातकालीन वाहन (एंबुलेंस) के रूप में पंजीकृत होना आवश्यक है।",
    makeModelLabel: "वाहन निर्माता एवं मॉडल",
    makeModelPlaceholder: "उदा. फोर्स ट्रैवलर 3350 / टाटा विंगर / महिंद्रा बोलेरो मैक्स",
    manufactureYearLabel: "निर्माण का वर्ष",
    manufactureYearPlaceholder: "उदा. 2023",
    vinChassisLabel: "चेसिस / VIN नंबर (17 अंक)",
    vinChassisPlaceholder: "उदा. MAT452098P1B76543",
    rcUploadHeading: "वाहन पंजीकरण प्रमाण पत्र (RC) अपलोड करें",
    ais125SelectorTitle: "AIS-125 वाहन श्रेणी चुनें",
    ais125StandardBadge: "MoRTH AIS-125:2014",
    ais125SelectorDescription:
      "अपने वाहन के भौतिक निर्माण और ऑनबोर्ड चिकित्सा उपकरणों के अनुसार भारतीय मानक AIS-125 (भाग 1 और 2) का सही स्तर चुनें:",
    ais125Categories: [
      {
        id: "TYPE_D_ALS",
        code: "टाइप D",
        badge: "एडवांस्ड लाइफ सपोर्ट (ALS)",
        name: "टाइप D: एडवांस्ड लाइफ सपोर्ट एंबुलेंस",
        subtitle: "मोबाइल गहन चिकित्सा इकाई (पहियों पर ICU)",
        description:
          "गंभीर हृदय रोग, श्वसन विफलता और गंभीर आघात वाले मरीजों के सुरक्षित परिवहन व गहन निगरानी हेतु डिजाइन व सुसज्जित।",
        icon: { set: "mci", name: "ambulance" },
        staffing: "प्रमाणित चालक + योग्य पैरामेडिक (EMT-P / क्रिटिकल केयर नर्स)",
        mandatoryEquipment: [
          "ट्रांसपोर्ट आईसीयू वेंटिलेटर (वयस्क एवं बाल चिकित्सा)",
          "बाइफेसिक डिफिब्रिलेटर (मैन्युअल पेसिंग व AED सहित)",
          "मल्टीपैरामीटर पेशेंट मॉनिटर (ECG, SpO2, NIBP, EtCO2)",
          "दोहरा सेंट्रल ऑक्सीजन सिस्टम व हाई-फ्लो रेगुलेटर",
          "ऑटोमेटेड सिरिंज एवं इन्फ्यूजन पंप्स",
          "आपातकालीन रीससिटेशन क्रैश ड्रग किट",
          "हाई-वैक्यूम सक्शन मशीन",
          "स्कूप स्ट्रेचर, स्पाइन बोर्ड व सर्वाइकल कॉलर",
        ],
        regulatoryStandard: "AIS-125:2014 भाग 1 खंड 3.4 एवं भाग 2 खंड 4.4",
        recommendedUse: "हार्ट अटैक, कार्डियक अरेस्ट, वेंटिलेटर ट्रांसफर और गंभीर एक्सीडेंट",
      },
      {
        id: "TYPE_C_BLS",
        code: "टाइप C",
        badge: "बेसिक लाइफ सपोर्ट (BLS)",
        name: "टाइप C: बेसिक लाइफ सपोर्ट एंबुलेंस",
        subtitle: "आपातकालीन चिकित्सा देखभाल व त्वरित स्थिरीकरण",
        description:
          "बेसिक लाइफ सपोर्ट की आवश्यकता वाले रोगियों के त्वरित परिवहन, पुनर्जीवन और निगरानी हेतु सुसज्जित एंबुलेंस।",
        icon: { set: "mci", name: "van-passenger" },
        staffing: "प्रमाणित चालक + प्रशिक्षित बेसिक ईएमटी (EMT-B)",
        mandatoryEquipment: [
          "दोहरे ऑक्सीजन सिलेंडर (न्यूनतम 2x 10L जल क्षमता)",
          "ऑटोमेटेड एक्सटर्नल डिफिब्रिलेटर (AED)",
          "पोर्टेबल सक्शन मशीन (बैटरी चालित)",
          "मैन्युअल बैग-वाल्व-मास्क (BVM) रिससिटेटर",
          "फुल स्पाइन बोर्ड, हेड इमोबिलाइजर और पट्टियां",
          "आपातकालीन स्प्लिंट्स और सर्वाइकल इमोबिलाइजेशन किट",
          "ऑटो-लोडिंग मुख्य स्ट्रेचर",
          "व्यापक फर्स्ट-एड आघात ड्रेसिंग किट",
        ],
        regulatoryStandard: "AIS-125:2014 भाग 1 खंड 3.3 एवं भाग 2 खंड 4.3",
        recommendedUse: "सांस की तकलीफ, फ्रैक्चर, स्ट्रोक और आपातकालीन प्राथमिक चिकित्सा",
      },
      {
        id: "TYPE_B_PTA",
        code: "टाइप B",
        badge: "पेशेंट ट्रांसपोर्ट (PTA)",
        name: "टाइप B: पेशेंट ट्रांसपोर्ट एंबुलेंस",
        subtitle: "सामान्य रोगी स्थानांतरण व डायलिसिस आवागमन",
        description:
          "ऐसे मरीजों के सुरक्षित आवागमन हेतु जो आपातकालीन स्थिति में नहीं हैं, जैसे नियमित अस्पताल जांच, डायलिसिस और डिस्चार्ज।",
        icon: { set: "ion", name: "bed" },
        staffing: "प्रमाणित चालक + चिकित्सा सहायक / प्राथमिक परिचारक",
        mandatoryEquipment: [
          "रोल-इन ऑटो-लोडिंग मुख्य स्ट्रेचर",
          "व्हीलचेयर रैंप या फोल्डेबल ट्रांजिट व्हीलचेयर",
          "पोर्टेबल ऑक्सीजन सिलेंडर, फ्लोमीटर और मास्क",
          "मानक प्राथमिक चिकित्सा (First-Aid) किट",
          "रक्तचाप मापक यंत्र (BP) और पल्स ऑक्सीमीटर",
          "कीटाणुशोधन व बायो-हैजर्ड कचरा पात्र",
        ],
        regulatoryStandard: "AIS-125:2014 भाग 1 खंड 3.2 एवं भाग 2 खंड 4.2",
        recommendedUse: "नियोजित अस्पताल यात्रा, डायलिसिस, आर्थोपेडिक गैर-आपातकालीन आवागमन",
      },
      {
        id: "TYPE_A_MFR",
        code: "टाइप A",
        badge: "मेडिकल फर्स्ट रिस्पॉन्डर (MFR)",
        name: "टाइप A: मेडिकल फर्स्ट रिस्पॉन्डर वाहन",
        subtitle: "त्वरित रिस्पॉन्स वाहन व ट्रैफिक इंटरसेप्टर",
        description:
          "सघन यातायात में तत्काल पहुंचकर मरीज को एंबुलेंस आने से पूर्व प्राथमिक जीवन रक्षक उपचार प्रदान करने हेतु दोपहिया या एसयूवी वाहन।",
        icon: { set: "mci", name: "motorbike" },
        staffing: "प्रमाणित फर्स्ट मेडिकल रिस्पॉन्डर (FMR) / सोलो ईएमटी",
        mandatoryEquipment: [
          "पोर्टेबल ऑटोमेटेड डिफिब्रिलेटर (AED)",
          "ऑक्सीजन सहित पोर्टेबल रिससिटेशन किट",
          "टैक्टिकल ब्लीडिंग कंट्रोल व टूर्निकेट पैक",
          "बर्न ड्रेसिंग किट व सर्वाइकल कॉलर",
          "टू-वे सायरन, जीपीएस ट्रैकर व हाई-बीम फ्लैशर",
        ],
        regulatoryStandard: "AIS-125:2014 भाग 1 खंड 3.1 एवं भाग 2 खंड 4.1",
        recommendedUse: "भीड़भाड़ वाले इलाकों में तत्काल सीपीआर और फर्स्ट-एड रिस्पॉन्स",
      },
    ],
    selectedAIS125Summary: (type) => `चयनित: भारतीय मानक AIS-125 के अंतर्गत ${type}`,
    staffingLabel: "अनिवार्य क्रू / कर्मचारी",
    equipmentLabel: "अनिवार्य ऑनबोर्ड उपकरण (AIS-125)",

    // Step 4: Statutory Documents
    step4Header: "वैधानिक परमिट एवं ARAI सत्यापन",
    step4Description:
      "मूल दस्तावेजों की स्पष्ट स्कैन या उच्च गुणवत्ता वाली तस्वीर अपलोड करें। अवैध एंबुलेंस संचालन रोकने हेतु ARAI निरीक्षण प्रमाण पत्र और वाहन फिटनेस परमिट अनिवार्य हैं।",
    mandatoryDocsTitle: "अनिवार्य वैधानिक दस्तावेज (MoRTH दिशानिर्देश)",
    statutoryMandatoryBadge: "वैधानिक रूप से अनिवार्य",
    araiHighlightBoxTitle: "ARAI AIS-125 निरीक्षण प्रमाण पत्र (अनिवार्य)",
    araiHighlightBoxDescription:
      "ऑटोमोटिव रिसर्च एसोसिएशन ऑफ इंडिया (ARAI) या ICAT द्वारा जारी प्रमाण पत्र, जो वाहन की बॉडी, मेडिकल कैबिनेट माउंटिंग, लाइटबार/सायरन और इलेक्ट्रिकल सुरक्षा की पुष्टि करता है।",
    araiStatutoryRef: "AIS-125 / CMVR Rule 125(C)",
    fitnessHighlightBoxTitle: "राज्य वाहन फिटनेस परमिट / फॉर्म 38 (अनिवार्य)",
    fitnessHighlightBoxDescription:
      "परिवहन विभाग द्वारा जारी वाणिज्यिक एंबुलेंस की यांत्रिक कार्यप्रणाली, सड़क योग्यता (Roadworthiness) और फिटनेस की पुष्टि करने वाला वैध परमिट।",
    fitnessStatutoryRef: "MV Act Sec 56 / Form 38",
    documentSlots: [
      {
        id: "slot_arai",
        key: "arai_certificate",
        title: "ARAI AIS-125 निरीक्षण प्रमाण पत्र",
        subtitle: "बॉडी कोड, सायरन व लाइफ सपोर्ट लेआउट हेतु ARAI/ICAT अनुपालन रिपोर्ट",
        mandatory: true,
        acceptedFormats: "PDF, JPG, PNG (अधिकतम 10 MB)",
        regulatoryReference: "केंद्रीय मोटर वाहन नियम नियम 125(C)",
        maxSizeBytes: 10 * 1024 * 1024,
      },
      {
        id: "slot_fitness",
        key: "fitness_permit",
        title: "वाणिज्यिक वाहन फिटनेस परमिट (फॉर्म 38)",
        subtitle: "RTO / राज्य परिवहन प्राधिकरण द्वारा जारी वैध रोडवर्दीनेस प्रमाण पत्र",
        mandatory: true,
        acceptedFormats: "PDF, JPG, PNG (अधिकतम 10 MB)",
        regulatoryReference: "मोटर वाहन अधिनियम 1988 धारा 56",
        maxSizeBytes: 10 * 1024 * 1024,
      },
      {
        id: "slot_dl",
        key: "commercial_dl",
        title: "वाणिज्यिक ड्राइविंग लाइसेंस (आगे व पीछे)",
        subtitle: "वाणिज्यिक भारी / परिवहन वाहन प्राधिकार दर्शाने वाली स्पष्ट प्रति",
        mandatory: true,
        acceptedFormats: "PDF, JPG, PNG (अधिकतम 10 MB)",
        regulatoryReference: "मोटर वाहन अधिनियम धारा 9",
        maxSizeBytes: 10 * 1024 * 1024,
      },
      {
        id: "slot_emt",
        key: "emt_certificate",
        title: "EMT / पैरामेडिक योग्यता प्रमाण पत्र",
        subtitle: "काउंसिल पंजीकरण अथवा मान्यता प्राप्त डिग्री/डिप्लोमा",
        mandatory: true,
        acceptedFormats: "PDF, JPG, PNG (अधिकतम 10 MB)",
        regulatoryReference: "AIS-125 क्रू योग्यता मानक",
        maxSizeBytes: 10 * 1024 * 1024,
      },
      {
        id: "slot_rc",
        key: "vehicle_rc",
        title: "वाहन पंजीकरण प्रमाण पत्र (RC)",
        subtitle: "स्मार्ट कार्ड जिस पर 'Ambulance' वर्ग दर्ज हो",
        mandatory: true,
        acceptedFormats: "PDF, JPG, PNG (अधिकतम 10 MB)",
        regulatoryReference: "मोटर वाहन अधिनियम धारा 39",
        maxSizeBytes: 10 * 1024 * 1024,
      },
      {
        id: "slot_insurance",
        key: "commercial_insurance",
        title: "वाणिज्यिक वाहन बीमा पॉलिसी",
        subtitle: "सक्रिय कमर्शियल एंबुलेंस व्यापक / थर्ड पार्टी बीमा पॉलिसी",
        mandatory: false,
        acceptedFormats: "PDF, JPG, PNG (अधिकतम 10 MB)",
        regulatoryReference: "मोटर वाहन अधिनियम धारा 146",
        maxSizeBytes: 10 * 1024 * 1024,
      },
      {
        id: "slot_puc",
        key: "puc_certificate",
        title: "प्रदूषण नियंत्रण प्रमाण पत्र (PUC)",
        subtitle: "QR कोड युक्त वैध उत्सर्जन प्रमाण पत्र",
        mandatory: false,
        acceptedFormats: "PDF, JPG, PNG (अधिकतम 10 MB)",
        regulatoryReference: "केंद्रीय मोटर वाहन नियम नियम 115",
        maxSizeBytes: 10 * 1024 * 1024,
      },
    ],
    requiredBadgeLabel: "आवश्यक",
    uploadButtonText: "दस्तावेज अपलोड करें",
    reuploadButtonText: "पुनः अपलोड करें",
    removeButtonText: "हटाएं",
    statusNotUploaded: "अपलोड शेष है",
    statusUploading: "अपलोड हो रहा है...",
    statusUploaded: "सत्यापित अपलोड",
    filePickerCamera: "कैमरा से फोटो लें",
    filePickerGallery: "गैलरी से चुनें",
    filePickerPdf: "दस्तावेज चुनें (PDF)",
    cancelText: "रद्द करें",

    // Buttons
    buttonBack: "पिछला",
    buttonNext: "आगे बढ़ें",
    buttonSubmit: "वैधानिक आवेदन जमा करें",
    submittingText: "सत्यापन एवं आवेदन जमा हो रहा है...",

    // Errors
    errorMissingRequired: "कृपया आगे बढ़ने के लिए सभी आवश्यक जानकारी भरें।",
    errorInvalidDL: "कृपया सही वाणिज्यिक ड्राइविंग लाइसेंस नंबर दर्ज करें (उदा. DL-0420110012345)।",
    errorExpiredDL: "ड्राइविंग लाइसेंस की वैधता तिथि समाप्त हो चुकी है या अमान्य है।",
    errorMissingPSV: "एंबुलेंस संचालन हेतु PSV वाणिज्यिक बैज नंबर अनिवार्य है।",
    errorMissingEMT: "EMT प्रमाण पत्र नंबर एवं काउंसिल नाम अनिवार्य है।",
    errorInvalidVehicleReg: "कृपया सही भारतीय वाहन पंजीकरण संख्या दर्ज करें (प्रारूप SS 00 XX 0000)।",
    errorMissingAIS125: "कृपया AIS-125 वाहन श्रेणी का चयन करें।",
    errorMissingARAI: "कानूनी रूप से ARAI AIS-125 निरीक्षण प्रमाण पत्र अनिवार्य है।",
    errorMissingFitness: "सड़क पर वाहन संचालन हेतु वाहन फिटनेस परमिट (फॉर्म 38) अनिवार्य है।",
    errorMissingRC: "वाहन पंजीकरण प्रमाण पत्र (RC) अपलोड करना अनिवार्य है।",

    // Success Modal
    successTitle: "ऑनबोर्डिंग आवेदन सफलतापूर्वक जमा हुआ!",
    successSubtitle: "आपके वाहन और दस्तावेजों का विवरण राज्य परिवहन प्राधिकरण (STA) एवं MoRTH सत्यापन हेतु भेज दिया गया है।",
    applicationIdLabel: "आवेदन ट्रैकिंग संदर्भ",
    categoryRegisteredLabel: "पंजीकृत AIS-125 श्रेणी",
    reviewTimeNotice: "डिजिटल दस्तावेज सत्यापन आमतौर पर 2 से 4 कार्य घंटों के भीतर पूरा होता है। एंबुलेंस को डिस्पैच के लिए स्वीकृति मिलते ही आपको SMS और ऐप सूचना प्राप्त होगी।",
    helplineNotice: "समीक्षा का परिणाम इसी स्क्रीन और आपकी प्रोफ़ाइल पर दिखेगा।",
    goToDashboardButton: "डिस्पैच स्टैंडबाय पर जाएं",
  },
};
