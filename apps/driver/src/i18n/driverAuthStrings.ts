import { SupportedLanguage } from "./driverOnboardingStrings";

export interface DriverAuthTranslation {
  headerTitle: string;
  headerTagline: string;
  backButton: string;
  secureAuthBadge: string;

  // Step 1: Phone Entry
  phoneStepTitle: string;
  phoneStepSubtitle: string;
  phoneInputLabel: string;
  phoneInputPlaceholder: string;
  invalidPhoneError: string;
  requestOtpButton: string;
  requestingOtp: string;

  // Step 2: OTP Verification
  otpStepTitle: string;
  otpStepSubtitle: string;
  otpInputLabel: string;
  resendCountdown: (seconds: number) => string;
  resendButton: string;
  resendingOtp: string;
  changePhoneButton: string;
  verifyButton: string;
  verifyingOtp: string;

  // DPDP Act 2023 Statutory Consent
  dpdpNoticeTitle: string;
  dpdpActTag: string;
  dpdpPreamble: string;
  dpdpPurposes: { title: string; description: string }[];
  consentLocationLabel: string;
  consentLocationError: string;
  consentCredentialLabel: string;
  consentCredentialError: string;
  dpdpRightsNotice: string;

  // Error Messages
  invalidOtpError: string;
  rateLimitError: string;
  networkError: string;
  genericError: string;
  /** Verbatim per docs/prompts/driver-app/P03-otp-authentication-driver-role.md */
  unauthorizedRoleError: string;
}

export const driverAuthStrings: Record<SupportedLanguage, DriverAuthTranslation> = {
  en: {
    headerTitle: "Driver Verification",
    headerTagline: "Ek-Ambulance Driver Access",
    backButton: "Back",
    secureAuthBadge: "AIS-125 Secure Auth",

    phoneStepTitle: "Enter Registered Mobile Number",
    phoneStepSubtitle:
      "We will send an SMS with a 6-digit verification code to authenticate your driver account.",
    phoneInputLabel: "Mobile Number",
    phoneInputPlaceholder: "98765 43210",
    invalidPhoneError:
      "Please enter a valid 10-digit Indian mobile number (starts with 6, 7, 8, or 9).",
    requestOtpButton: "Get Verification Code",
    requestingOtp: "Sending Code...",

    otpStepTitle: "Verify 6-Digit Code",
    otpStepSubtitle: "Enter the 6-digit code sent to",
    otpInputLabel: "6-digit OTP code",
    resendCountdown: (seconds: number) => `Resend code in ${seconds}s`,
    resendButton: "Resend Code",
    resendingOtp: "Resending...",
    changePhoneButton: "Change Number",
    verifyButton: "Verify & Continue",
    verifyingOtp: "Verifying...",

    dpdpNoticeTitle: "DPDP Act 2023 Statutory Data Notice",
    dpdpActTag: "Statutory Compliance",
    dpdpPreamble:
      "In compliance with the Digital Personal Data Protection (DPDP) Act, 2023, Ek-Ambulance processes your personal data strictly for emergency dispatch operations:",
    dpdpPurposes: [
      {
        title: "Live Dispatch Location",
        description:
          "Real-time GPS location while on shift, to resolve your operating jurisdiction and route emergency dispatch offers.",
      },
      {
        title: "Crew & Vehicle Credentials",
        description:
          "Your CDL, EMT certification, and AIS-125 vehicle registration, to verify you are an authorized ambulance driver.",
      },
    ],
    consentLocationLabel: "I consent to live GPS location sharing while on shift.",
    consentLocationError: "Location consent is required to go on shift.",
    consentCredentialLabel: "I consent to processing of my driver and vehicle credentials.",
    consentCredentialError: "Credential processing consent is required to continue.",
    dpdpRightsNotice:
      "Under Section 6 of the DPDP Act, you may withdraw consent or request data correction/erasure at any time via Settings.",

    invalidOtpError: "The code you entered is incorrect or has expired. Please try again.",
    rateLimitError: "Too many attempts. Please wait before requesting another code.",
    networkError: "Network connection unavailable. Please try again.",
    genericError: "Something went wrong. Please try again.",
    unauthorizedRoleError:
      "Unauthorized: This phone number is not registered as an active ambulance driver.",
  },

  hi: {
    headerTitle: "चालक सत्यापन",
    headerTagline: "Ek-Ambulance चालक अभिगम",
    backButton: "पिछला",
    secureAuthBadge: "AIS-125 सुरक्षित प्रमाणन",

    phoneStepTitle: "पंजीकृत मोबाइल नंबर दर्ज करें",
    phoneStepSubtitle:
      "आपके चालक खाते को प्रमाणित करने हेतु हम 6-अंकीय सत्यापन कोड वाला SMS भेजेंगे।",
    phoneInputLabel: "मोबाइल नंबर",
    phoneInputPlaceholder: "98765 43210",
    invalidPhoneError:
      "कृपया वैध 10-अंकीय भारतीय मोबाइल नंबर दर्ज करें (6, 7, 8, या 9 से शुरू)।",
    requestOtpButton: "सत्यापन कोड प्राप्त करें",
    requestingOtp: "कोड भेजा जा रहा है...",

    otpStepTitle: "6-अंकीय कोड सत्यापित करें",
    otpStepSubtitle: "भेजा गया 6-अंकीय कोड दर्ज करें",
    otpInputLabel: "6-अंकीय OTP कोड",
    resendCountdown: (seconds: number) => `${seconds} सेकंड में कोड पुनः भेजें`,
    resendButton: "कोड पुनः भेजें",
    resendingOtp: "पुनः भेजा जा रहा है...",
    changePhoneButton: "नंबर बदलें",
    verifyButton: "सत्यापित करें और जारी रखें",
    verifyingOtp: "सत्यापित हो रहा है...",

    dpdpNoticeTitle: "DPDP अधिनियम 2023 वैधानिक डेटा सूचना",
    dpdpActTag: "वैधानिक अनुपालन",
    dpdpPreamble:
      "डिजिटल व्यक्तिगत डेटा संरक्षण (DPDP) अधिनियम, 2023 के अनुपालन में, Ek-Ambulance आपके व्यक्तिगत डेटा को केवल आपातकालीन डिस्पैच संचालन हेतु संसाधित करता है:",
    dpdpPurposes: [
      {
        title: "लाइव डिस्पैच लोकेशन",
        description:
          "शिफ्ट के दौरान वास्तविक समय जीपीएस स्थान, ताकि आपका कार्य क्षेत्र (जुरिसडिक्शन) निर्धारित किया जा सके और आपातकालीन डिस्पैच ऑफर भेजे जा सकें।",
      },
      {
        title: "क्रू व वाहन प्रमाण पत्र",
        description:
          "आपका CDL, EMT प्रमाणन, और AIS-125 वाहन पंजीकरण, यह सत्यापित करने हेतु कि आप एक अधिकृत एंबुलेंस चालक हैं।",
      },
    ],
    consentLocationLabel: "मैं शिफ्ट के दौरान लाइव जीपीएस स्थान साझा करने हेतु सहमत हूं।",
    consentLocationError: "शिफ्ट पर जाने हेतु स्थान सहमति आवश्यक है।",
    consentCredentialLabel: "मैं अपने चालक व वाहन प्रमाण पत्रों के प्रसंस्करण हेतु सहमत हूं।",
    consentCredentialError: "जारी रखने हेतु प्रमाण पत्र प्रसंस्करण सहमति आवश्यक है।",
    dpdpRightsNotice:
      "DPDP अधिनियम की धारा 6 के अंतर्गत, आप किसी भी समय सेटिंग्स के माध्यम से सहमति वापस ले सकते हैं या डेटा सुधार/मिटाने का अनुरोध कर सकते हैं।",

    invalidOtpError: "आपके द्वारा दर्ज कोड गलत है या समाप्त हो चुका है। कृपया पुनः प्रयास करें।",
    rateLimitError: "बहुत अधिक प्रयास। कृपया दूसरा कोड मांगने से पहले प्रतीक्षा करें।",
    networkError: "नेटवर्क कनेक्शन उपलब्ध नहीं है। कृपया पुनः प्रयास करें।",
    genericError: "कुछ गलत हो गया। कृपया पुनः प्रयास करें।",
    unauthorizedRoleError:
      "अनधिकृत: यह फ़ोन नंबर एम्बुलेंस चालक के रूप में पंजीकृत नहीं है।",
  },
};
