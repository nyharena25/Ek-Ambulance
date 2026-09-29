import type { AIS125VehicleType } from "@sahayak/domain";
import type { SupportedLanguage } from "./driverOnboardingStrings";
import type { PasswordError, ProfileFieldError, ServiceZone } from "../lib/driverProfile.core";

export interface DriverProfileTranslation {
  title: string;
  back: string;
  lockedBanner: string;
  personalSection: string;
  fullName: string;
  phone: string;
  changePhone: string;
  newPhone: string;
  sendCode: string;
  codeLabel: string;
  confirmCode: string;
  cancel: string;
  phoneChanged: string;
  securitySection: string;
  newPassword: string;
  confirmPassword: string;
  updatePassword: string;
  passwordHint: string;
  passwordUpdated: string;
  serviceSection: string;
  zone: Record<ServiceZone, string>;
  hospital: string;
  hospitalNone: string;
  hospitalHint: string;
  vehicleSection: string;
  tier: string;
  tierName: Record<AIS125VehicleType, string>;
  plate: string;
  makeModel: string;
  color: string;
  crew: string;
  crewHint: string;
  regulatedLocked: string;
  shownToPatient: string;
  save: string;
  saving: string;
  saved: string;
  nothingToSave: string;
  loading: string;
  loadError: string;
  retry: string;
  fieldError: Record<ProfileFieldError, string>;
  passwordError: Record<PasswordError, string>;
  invalidPhone: string;
}

export const driverProfileStrings: Record<SupportedLanguage, DriverProfileTranslation> = {
  en: {
    title: "Profile",
    back: "Back",
    lockedBanner: "Your profile is locked during an emergency. You can edit it again when the mission ends.",
    personalSection: "Personal details",
    fullName: "Full name",
    phone: "Phone number",
    changePhone: "Change number",
    newPhone: "New phone number",
    sendCode: "Send code",
    codeLabel: "6-digit code sent to the new number",
    confirmCode: "Confirm number",
    cancel: "Cancel",
    phoneChanged: "Phone number updated.",
    securitySection: "Password",
    newPassword: "New password",
    confirmPassword: "Confirm new password",
    updatePassword: "Update password",
    passwordHint: "You still sign in with an SMS code. This password is saved on your account for later use.",
    passwordUpdated: "Password updated.",
    serviceSection: "Service area and hospital",
    zone: { DL: "Delhi (DL)", UP: "Uttar Pradesh (UP)" },
    hospital: "Affiliated hospital",
    hospitalNone: "No hospital",
    hospitalHint: "The hospital your crew is attached to.",
    vehicleSection: "Ambulance",
    tier: "AIS-125 category",
    tierName: { TYPE_D_ALS: "Type D · ALS", TYPE_C_BLS: "Type C · BLS", TYPE_B_PTA: "Type B · PTA", TYPE_A_MFR: "Type A · MFR" },
    plate: "Registration number",
    makeModel: "Make and model",
    color: "Colour",
    crew: "Crew on board",
    crewHint: "Including the driver.",
    regulatedLocked: "Registration and model come from your verified documents. Contact support to change them.",
    shownToPatient: "The patient sees your first name, registration, model, colour and crew size when you accept.",
    save: "Save changes",
    saving: "Saving…",
    saved: "Profile saved.",
    nothingToSave: "No changes to save.",
    loading: "Loading your profile…",
    loadError: "Could not load your profile.",
    retry: "Try again",
    fieldError: {
      name: "Enter your full name (2 to 80 characters).",
      plate: "Enter a valid registration number, for example DL 01 AB 1234.",
      makeModel: "Make and model can be at most 80 characters.",
      color: "Colour can be at most 30 characters.",
      crew: "Crew size must be between 1 and 12.",
    },
    passwordError: {
      too_short: "Use at least 8 characters.",
      needs_letter_and_digit: "Use at least one letter and one number.",
      mismatch: "The two passwords do not match.",
    },
    invalidPhone: "Enter a valid 10-digit Indian mobile number.",
  },
  hi: {
    title: "प्रोफ़ाइल",
    back: "वापस",
    lockedBanner: "आपात स्थिति के दौरान आपकी प्रोफ़ाइल बंद है। मिशन पूरा होने पर आप इसे फिर बदल सकते हैं।",
    personalSection: "व्यक्तिगत विवरण",
    fullName: "पूरा नाम",
    phone: "फ़ोन नंबर",
    changePhone: "नंबर बदलें",
    newPhone: "नया फ़ोन नंबर",
    sendCode: "कोड भेजें",
    codeLabel: "नए नंबर पर भेजा गया 6 अंकों का कोड",
    confirmCode: "नंबर की पुष्टि करें",
    cancel: "रद्द करें",
    phoneChanged: "फ़ोन नंबर बदल दिया गया।",
    securitySection: "पासवर्ड",
    newPassword: "नया पासवर्ड",
    confirmPassword: "नया पासवर्ड दोबारा लिखें",
    updatePassword: "पासवर्ड बदलें",
    passwordHint: "साइन-इन अभी भी SMS कोड से होता है। यह पासवर्ड बाद के उपयोग के लिए आपके खाते में सहेजा जाता है।",
    passwordUpdated: "पासवर्ड बदल दिया गया।",
    serviceSection: "सेवा क्षेत्र और अस्पताल",
    zone: { DL: "दिल्ली (DL)", UP: "उत्तर प्रदेश (UP)" },
    hospital: "संबद्ध अस्पताल",
    hospitalNone: "कोई अस्पताल नहीं",
    hospitalHint: "जिस अस्पताल से आपकी टीम जुड़ी है।",
    vehicleSection: "एम्बुलेंस",
    tier: "AIS-125 श्रेणी",
    tierName: { TYPE_D_ALS: "टाइप D · ALS", TYPE_C_BLS: "टाइप C · BLS", TYPE_B_PTA: "टाइप B · PTA", TYPE_A_MFR: "टाइप A · MFR" },
    plate: "पंजीकरण संख्या",
    makeModel: "मेक और मॉडल",
    color: "रंग",
    crew: "टीम में लोग",
    crewHint: "ड्राइवर सहित।",
    regulatedLocked: "पंजीकरण और मॉडल आपके सत्यापित दस्तावेज़ों से आते हैं। बदलने के लिए सहायता से संपर्क करें।",
    shownToPatient: "स्वीकार करने पर मरीज़ को आपका पहला नाम, पंजीकरण, मॉडल, रंग और टीम का आकार दिखता है।",
    save: "बदलाव सहेजें",
    saving: "सहेजा जा रहा है…",
    saved: "प्रोफ़ाइल सहेजी गई।",
    nothingToSave: "सहेजने के लिए कोई बदलाव नहीं।",
    loading: "आपकी प्रोफ़ाइल लोड हो रही है…",
    loadError: "आपकी प्रोफ़ाइल लोड नहीं हो सकी।",
    retry: "फिर कोशिश करें",
    fieldError: {
      name: "अपना पूरा नाम लिखें (2 से 80 अक्षर)।",
      plate: "सही पंजीकरण संख्या लिखें, जैसे DL 01 AB 1234।",
      makeModel: "मेक और मॉडल अधिकतम 80 अक्षर का हो सकता है।",
      color: "रंग अधिकतम 30 अक्षर का हो सकता है।",
      crew: "टीम का आकार 1 से 12 के बीच होना चाहिए।",
    },
    passwordError: {
      too_short: "कम से कम 8 अक्षर रखें।",
      needs_letter_and_digit: "कम से कम एक अक्षर और एक अंक रखें।",
      mismatch: "दोनों पासवर्ड मेल नहीं खाते।",
    },
    invalidPhone: "सही 10 अंकों का भारतीय मोबाइल नंबर लिखें।",
  },
};
