import type { IconRef } from "../components/AppIcon";
import { SupportedLanguage } from "./onboardingStrings";
import { AIS125VehicleType } from "@sahayak/domain";

export interface VehicleCategoryMetadata {
  id: AIS125VehicleType;
  icon: IconRef;
  code: string;
  title: string;
  hindiTitle: string;
  badge: string;
  hindiBadge: string;
  subtitle: string;
  hindiSubtitle: string;
  equipment: string[];
  hindiEquipment: string[];
  baseFareInr: number;
  perKmRateInr: number;
  minimumTierRequired: "CAT_1_IMMEDIATE" | "CAT_2_URGENT" | "CAT_3_DELAYED" | "CAT_4_MFR";
}

export interface CategoryTranslation {
  headerTitle: string;
  headerTagline: string;
  triageContextTitle: string;
  triageAcuityLabel: string;
  triageMandateNotice: (level: string) => string;
  equipmentHeading: string;
  statutoryFareLabel: string;
  lockoutCat1: string;
  lockoutCat2: string;
  lockoutCat3: string;
  statutoryRegulationFootnote: string;
  /** Before a route exists the card shows the statutory starting fare (first 5 km), prefixed with this. */
  fareFromPrefix: string;
  confirmButtonText: (name: string, fare: number) => string;
  confirmButtonSubtitle: string;
}

export const AIS125_VEHICLES: VehicleCategoryMetadata[] = [
  {
    id: "TYPE_D_ALS",
    icon: { set: "mci", name: "ambulance" },
    code: "Type D",
    title: "Type D: Advanced Life Support (ALS)",
    hindiTitle: "टाइप D: एडवांस्ड लाइफ सपोर्ट (ALS)",
    badge: "CAT 1 • ICU ON WHEELS",
    hindiBadge: "श्रेणी 1 • मोबाइल ICU",
    subtitle:
      "Equipped for critical cardiac, respiratory, and severe poly-trauma life-support.",
    hindiSubtitle:
      "हार्ट अटैक, सांस रुकने और गंभीर दुर्घटनाओं हेतु वेंटिलेटर एवं पैरामेडिक युक्त।",
    equipment: [
      "Transport Ventilator",
      "Defibrillator (AED/Manual)",
      "Multiparameter ICU Monitor",
      "High-Flow Oxygen",
      "Emergency Drug Kit",
      "Certified Paramedic",
    ],
    hindiEquipment: [
      "ट्रांसपोर्ट वेंटिलेटर",
      "डिफिब्रिलेटर (AED)",
      "मल्टीपैरामीटर मॉनिटर",
      "हाई-फ्लो ऑक्सीजन",
      "आपातकालीन दवाएं",
      "प्रमाणित पैरामेडिक",
    ],
    baseFareInr: 500,
    perKmRateInr: 25,
    minimumTierRequired: "CAT_1_IMMEDIATE",
  },
  {
    id: "TYPE_C_BLS",
    icon: { set: "mci", name: "van-passenger" },
    code: "Type C",
    title: "Type C: Basic Life Support (BLS)",
    hindiTitle: "टाइप C: बेसिक लाइफ सपोर्ट (BLS)",
    badge: "CAT 2 • URGENT CARE",
    hindiBadge: "श्रेणी 2 • गंभीर चिकित्सा",
    subtitle:
      "Equipped for oxygen administration, spinal immobilization, and wound management.",
    hindiSubtitle:
      "ऑक्सीजन सहायता, रीढ़ की हड्डी स्थिरीकरण और प्राथमिक उपचार युक्त एंबुलेंस।",
    equipment: [
      "Dual Oxygen Cylinders",
      "Automated Defibrillator (AED)",
      "Suction Apparatus",
      "Spine Board & Splints",
      "Trained EMT Crew",
    ],
    hindiEquipment: [
      "दोहरा ऑक्सीजन सिलेंडर",
      "ऑटोमेटेड डिफिब्रिलेटर",
      "सक्शन उपकरण",
      "स्पाइन बोर्ड व स्प्लिंट",
      "प्रशिक्षित EMT क्रू",
    ],
    baseFareInr: 300,
    perKmRateInr: 15,
    minimumTierRequired: "CAT_2_URGENT",
  },
  {
    id: "TYPE_B_PTA",
    icon: { set: "ion", name: "bed" },
    code: "Type B",
    title: "Type B: Patient Transport Ambulance (PTA)",
    hindiTitle: "टाइप B: पेशेंट ट्रांसपोर्ट एंबुलेंस (PTA)",
    badge: "CAT 3 • NON-EMERGENCY",
    hindiBadge: "श्रेणी 3 • सामान्य आवागमन",
    subtitle:
      "Designed for non-emergency hospital transit, convalescent, and dialysis patients.",
    hindiSubtitle:
      "सामान्य मरीजों, डायलिसिस और अस्पताल सुरक्षित स्थानांतरण हेतु स्ट्रेचर वाहन।",
    equipment: [
      "Auto-Loading Stretcher",
      "Wheelchair Ramp",
      "Portable Oxygen Tank",
      "First Aid Kit",
    ],
    hindiEquipment: [
      "ऑटो-लोडिंग स्ट्रेचर",
      "व्हीलचेयर सुविधा",
      "पोर्टेबल ऑक्सीजन टैंक",
      "प्राथमिक चिकित्सा किट",
    ],
    baseFareInr: 200,
    perKmRateInr: 12,
    minimumTierRequired: "CAT_3_DELAYED",
  },
  {
    id: "TYPE_A_MFR",
    icon: { set: "mci", name: "motorbike" },
    code: "Type A",
    title: "Type A: Medical First Responder (MFR)",
    hindiTitle: "टाइप A: मेडिकल फर्स्ट रिस्पॉन्डर (MFR)",
    badge: "CAT 4 • RAPID RESPONSE",
    hindiBadge: "श्रेणी 4 • त्वरित रिस्पॉन्स",
    subtitle:
      "Rapid first responder deployment to initiate on-scene resuscitation in traffic congestion.",
    hindiSubtitle:
      "भीड़भाड़ में तत्काल प्राथमिक चिकित्सा और पुनर्जीवन शुरू करने हेतु फर्स्ट रिस्पॉन्डर।",
    equipment: [
      "Rapid Response Bike/SUV",
      "Portable AED Defibrillator",
      "Bag-Valve-Mask Resuscitator",
      "Tactical Hemorrhage Kit",
    ],
    hindiEquipment: [
      "त्वरित रिस्पॉन्स वाहन",
      "पोर्टेबल AED",
      "बैग-वाल्व-मास्क रिससिटेटर",
      "रक्तस्राव नियंत्रण किट",
    ],
    baseFareInr: 150,
    perKmRateInr: 8,
    minimumTierRequired: "CAT_4_MFR",
  },
];

export const categoryStrings: Record<SupportedLanguage, CategoryTranslation> = {
  en: {
    headerTitle: "Select AIS-125 Vehicle",
    headerTagline: "MoRTH Certified Emergency Fleet",
    triageContextTitle: "Clinical Triage Protocol Enforced",
    triageAcuityLabel: "Acuity Assessment",
    triageMandateNotice: (level: string) =>
      `Clinical safety protocol mandates minimum ${level} specification. Lower vehicle tiers are locked out for patient safety.`,
    equipmentHeading: "Mandatory AIS-125 Equipment Onboard",
    statutoryFareLabel: "Statutory Regulated Tariff",
    lockoutCat1:
      "Clinical Lockout: Triage mandates Advanced Life Support (ALS) with mechanical ventilator & paramedic.",
    lockoutCat2:
      "Clinical Lockout: Minimum Basic Life Support (BLS) required for oxygen & monitoring.",
    lockoutCat3:
      "Clinical Lockout: Stretcher transport required; two-wheeler first responder unavailable.",
    statutoryRegulationFootnote:
      "Statutory fares strictly regulated under MoRTH AIS-125 Tariff Rules. Zero surge gouging.",
    fareFromPrefix: "from ",
    confirmButtonText: (name: string, fare: number) =>
      `Confirm ${name} (from ₹${fare})`,
    confirmButtonSubtitle: "Review final fare breakdown & dispatch driver",
  },
  hi: {
    headerTitle: "AIS-125 एंबुलेंस चुनें",
    headerTagline: "MoRTH प्रमाणित आपातकालीन बेड़ा",
    triageContextTitle: "क्लिनिकल ट्राइएज प्रोटोकॉल लागू",
    triageAcuityLabel: "गंभीरता मूल्यांकन",
    triageMandateNotice: (level: string) =>
      `मरीज की सुरक्षा हेतु न्यूनतम ${level} एंबुलेंस अनिवार्य है। निचले स्तर के वाहन लॉक कर दिए गए हैं।`,
    equipmentHeading: "वाहन में अनिवार्य AIS-125 उपकरण",
    statutoryFareLabel: "शासकीय निर्धारित किराया",
    lockoutCat1:
      "चिकित्सीय लॉकआउट: मरीज को वेंटिलेटर एवं पैरामेडिक युक्त ALS एंबुलेंस अनिवार्य है।",
    lockoutCat2:
      "चिकित्सीय लॉकआउट: ऑक्सीजन और प्राथमिक उपचार हेतु न्यूनतम BLS एंबुलेंस अनिवार्य है।",
    lockoutCat3:
      "चिकित्सीय लॉकआउट: मरीज को स्ट्रेचर वाहन आवश्यक है; फर्स्ट रिस्पॉन्डर अनुपयुक्त है।",
    statutoryRegulationFootnote:
      "MoRTH AIS-125 नियमों के तहत सरकारी नियंत्रित दरें। कोई आपातकालीन सर्ज शुल्क नहीं।",
    fareFromPrefix: "से शुरू ",
    confirmButtonText: (name: string, fare: number) =>
      `${name} सुनिश्चित करें (₹${fare} से शुरू)`,
    confirmButtonSubtitle: "किराया विवरण देखें और एंबुलेंस बुक करें",
  },
};
