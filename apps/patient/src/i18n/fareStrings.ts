import { SupportedLanguage } from "./onboardingStrings";

export interface FareTranslation {
  // Explicit State Mandate Banner
  mandateBannerTitle: string;
  mandateBannerSubtitle: string;

  // Sheet Controls
  viewBreakdownButton: string;
  hideBreakdownButton: string;
  dragHandleAria: string;

  // Itemized Table
  tableHeading: string;
  vehicleTierLabel: string;
  jurisdictionLabel: string;
  baseFareRow: (initialKm: number) => string;
  additionalDistanceRow: (km: number, rate: number) => string;
  noAdditionalDistanceText: string;
  emtParamedicRow: string;
  emtParamedicValue: string;
  surgeMultiplierRow: string;
  surgeMultiplierValue: string;
  totalFareRow: string;

  // Disclaimers & Footnotes
  indicativeDisclaimer: string;
  statutoryAuthorityNotice: (ref: string) => string;
  zeroSurgeLawGuarantee: string;

  // Primary Action Button
  confirmButtonText: string;
  confirmButtonSubtitle: string;
}

export const fareStrings: Record<SupportedLanguage, FareTranslation> = {
  en: {
    mandateBannerTitle: "Regulated Non-Surge Emergency Pricing under State Mandate",
    mandateBannerSubtitle:
      "Statutory emergency tariff enforced by State Transport Department. Surge gouging strictly prohibited.",

    viewBreakdownButton: "View Itemized Statutory Breakdown",
    hideBreakdownButton: "Hide Itemized Breakdown",
    dragHandleAria: "Expandable statutory fare bottom sheet handle",

    tableHeading: "Itemized Statutory Fare Calculation",
    vehicleTierLabel: "AIS-125 Vehicle Specification",
    jurisdictionLabel: "Governing Transport Jurisdiction",
    baseFareRow: (initialKm: number) =>
      `Base Ambulance Fare (Includes initial ${initialKm.toFixed(1)} km)`,
    additionalDistanceRow: (km: number, rate: number) =>
      `Additional Distance Tariff (${km.toFixed(1)} km @ ₹${rate.toFixed(2)}/km)`,
    noAdditionalDistanceText: "Within initial 5.0 km threshold (₹0.00)",
    emtParamedicRow: "Certified Paramedic / EMT Staffing",
    emtParamedicValue: "₹0.00 (Statutory Included)",
    surgeMultiplierRow: "Emergency Surge Multiplier",
    surgeMultiplierValue: "1.0x (Zero Surge Guaranteed)",
    totalFareRow: "Total estimated fare",

    indicativeDisclaimer:
      "This is an estimate at the government-set rate. Your final fare uses the same rate and the distance actually travelled, and is shown when the trip ends.",
    statutoryAuthorityNotice: (ref: string) =>
      `Tariff strictly enforced under ${ref}.`,
    zeroSurgeLawGuarantee:
      "State High Court and Transport Authority directives prohibit surge pricing during medical emergencies.",

    confirmButtonText: "Confirm & Request Ambulance",
    confirmButtonSubtitle: "Instant dispatch • Real-time GPS mission tracking",
  },
  hi: {
    mandateBannerTitle: "शासकीय आदेशानुसार नियंत्रित बिना-सर्ज आपातकालीन दरें",
    mandateBannerSubtitle:
      "परिवहन विभाग द्वारा निर्धारित वैधानिक दरें। आपातकाल में सर्ज अधिभार पूर्णतः प्रतिबंधित।",

    viewBreakdownButton: "विस्तृत शासकीय किराया विवरण देखें",
    hideBreakdownButton: "किराया विवरण छुपाएं",
    dragHandleAria: "विस्तार योग्य शासकीय किराया बॉटम शीट हैंडल",

    tableHeading: "विस्तृत शासकीय किराया गणना",
    vehicleTierLabel: "AIS-125 एंबुलेंस श्रेणी",
    jurisdictionLabel: "संबद्ध राज्य परिवहन कार्यक्षेत्र",
    baseFareRow: (initialKm: number) =>
      `मूल एंबुलेंस किराया (प्रारंभिक ${initialKm.toFixed(1)} किमी सम्मिलित)`,
    additionalDistanceRow: (km: number, rate: number) =>
      `अतिरिक्त दूरी शुल्क (${km.toFixed(1)} किमी @ ₹${rate.toFixed(2)}/किमी)`,
    noAdditionalDistanceText: "प्रारंभिक 5.0 किमी के अंतर्गत (₹0.00)",
    emtParamedicRow: "प्रमाणित पैरामेडिक / EMT क्रू शुल्क",
    emtParamedicValue: "₹0.00 (शासकीय नियमानुसार सम्मिलित)",
    surgeMultiplierRow: "आपातकालीन सर्ज मल्टीप्लायर",
    surgeMultiplierValue: "1.0x (बिना सर्ज शुल्क गारंटी)",
    totalFareRow: "कुल अनुमानित शासकीय किराया",

    indicativeDisclaimer:
      "यह सरकारी दर पर अनुमान है। अंतिम किराया इसी दर और वास्तव में तय की गई दूरी से बनता है, और यात्रा पूरी होने पर दिखाया जाता है।",
    statutoryAuthorityNotice: (ref: string) =>
      `किराया ${ref} के तहत सख्ती से लागू है।`,
    zeroSurgeLawGuarantee:
      "उच्च न्यायालय एवं राज्य परिवहन विभाग के आदेशानुसार आपातकाल में सर्ज शुल्क लगाना दंडनीय है।",

    confirmButtonText: "पुष्टि करें एवं एंबुलेंस बुलाएं",
    confirmButtonSubtitle: "तत्काल वाहन आवंटन • रीयल-टाइम GPS ट्रैकिंग",
  },
};
