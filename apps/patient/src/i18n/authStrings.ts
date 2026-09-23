import { SupportedLanguage } from "./onboardingStrings";

export interface AuthTranslation {
  headerTitle: string;
  headerTagline: string;
  backButton: string;
  secureAuthBadge: string;

  // Step 1: Phone Entry
  phoneStepTitle: string;
  phoneStepSubtitle: string;
  phoneInputLabel: string;
  phoneInputPlaceholder: string;
  countryCode: string;
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
  dpdpPurposes: {
    title: string;
    description: string;
  }[];
  consentGeolocationLabel: string;
  consentGeolocationError: string;
  consentMedicalLabel: string;
  consentMedicalError: string;
  dpdpRightsNotice: string;

  // Error Messages
  invalidOtpError: string;
  rateLimitError: string;
  networkError: string;
  genericError: string;
}

export const authStrings: Record<SupportedLanguage, AuthTranslation> = {
  en: {
    headerTitle: "Phone Verification",
    secureAuthBadge: "AIS-125 Secure Auth",
    headerTagline: "Ek-Ambulance Patient Access",
    backButton: "Back",

    phoneStepTitle: "Enter Your Mobile Number",
    phoneStepSubtitle:
      "We will send an SMS with a 6-digit verification code to authenticate your emergency profile.",
    phoneInputLabel: "Mobile Number",
    phoneInputPlaceholder: "98765 43210",
    countryCode: "+91",
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
      "In compliance with the Digital Personal Data Protection (DPDP) Act, 2023, Ek-Ambulance processes your personal data strictly for life-critical healthcare response:",
    dpdpPurposes: [
      {
        title: "Emergency Dispatch",
        description:
          "Assigning the nearest verified AIS-125 ambulance and certified crew to your location.",
      },
      {
        title: "Real-time GPS Telemetry",
        description:
          "Live route tracking and high-precision telemetry during emergency navigation.",
      },
      {
        title: "Hospital Pre-Arrival Handoff",
        description:
          "Relaying clinical triage urgency and vitals to the receiving trauma center.",
      },
    ],
    consentGeolocationLabel:
      "I consent to continuous GPS telemetry collection for real-time ambulance routing and location accuracy.",
    consentGeolocationError:
      "Geolocation consent is required for ambulance dispatch.",
    consentMedicalLabel:
      "I consent to the collection and processing of medical triage symptoms and vitals for hospital pre-arrival handoff.",
    consentMedicalError:
      "Medical data consent is required for clinical emergency response.",
    dpdpRightsNotice:
      "You retain the right to review, update, or withdraw consent under Section 6 of the DPDP Act 2023 via your profile settings.",

    invalidOtpError: "Invalid code. Please check the 6-digit SMS OTP and try again.",
    rateLimitError:
      "Too many requests. Please wait for the cooldown timer before requesting another code.",
    networkError: "Network connection unavailable. Operating in local demo mode.",
    genericError: "Authentication failed. Please try again.",
  },
  hi: {
    headerTitle: "फ़ोन सत्यापन",
    secureAuthBadge: "AIS-125 सुरक्षित प्रमाणीकरण",
    headerTagline: "एक-एंबुलेंस मरीज सेवा",
    backButton: "वापस",

    phoneStepTitle: "अपना मोबाइल नंबर दर्ज करें",
    phoneStepSubtitle:
      "आपके आपातकालीन प्रोफ़ाइल के सत्यापन के लिए हम 6 अंकों का सुरक्षा कोड SMS द्वारा भेजेंगे।",
    phoneInputLabel: "मोबाइल नंबर",
    phoneInputPlaceholder: "98765 43210",
    countryCode: "+91",
    invalidPhoneError:
      "कृपया 10 अंकों का मान्य भारतीय मोबाइल नंबर दर्ज करें (6, 7, 8 या 9 से शुरू)।",
    requestOtpButton: "सत्यापन कोड प्राप्त करें",
    requestingOtp: "कोड भेजा जा रहा है...",

    otpStepTitle: "6 अंकों का कोड दर्ज करें",
    otpStepSubtitle: "इस नंबर पर भेजा गया 6 अंकों का कोड दर्ज करें:",
    otpInputLabel: "6 अंकों का OTP कोड",
    resendCountdown: (seconds: number) => `${seconds} सेकंड में पुनः भेजें`,
    resendButton: "पुनः OTP भेजें",
    resendingOtp: "पुनः भेजा जा रहा है...",
    changePhoneButton: "नंबर बदलें",
    verifyButton: "सत्यापित करें और आगे बढ़ें",
    verifyingOtp: "सत्यापित किया जा रहा है...",

    dpdpNoticeTitle: "DPDP अधिनियम 2023 वैधानिक डेटा सूचना",
    dpdpActTag: "वैधानिक अनुपालन",
    dpdpPreamble:
      "डिजिटल व्यक्तिगत डेटा संरक्षण (DPDP) अधिनियम 2023 के अनुसार, एक-एंबुलेंस आपके व्यक्तिगत डेटा का उपयोग केवल आपातकालीन स्वास्थ्य सेवाओं हेतु करता है:",
    dpdpPurposes: [
      {
        title: "आपातकालीन वाहन आवंटन",
        description:
          "निकटतम प्रमाणित AIS-125 एंबुलेंस और मेडिकल क्रू को आपके स्थान पर तुरंत भेजना।",
      },
      {
        title: "रीयल-टाइम GPS ट्रैकिंग",
        description:
          "आपातकालीन यात्रा के दौरान सटीक नेविगेशन और लाइव मार्ग ट्रैकिंग।",
      },
      {
        title: "अस्पताल पूर्व-हस्तांतरण समन्वय",
        description:
          "गंतव्य ट्रॉमा सेंटर को मरीज के लक्षण और स्थिति की अग्रिम जानकारी साझा करना।",
      },
    ],
    consentGeolocationLabel:
      "मैं एंबुलेंस रूटिंग और सटीक आपातकालीन नेविगेशन हेतु GPS डेटा संग्रह की सहमति देता/देती हूँ।",
    consentGeolocationError: "एंबुलेंस भेजने के लिए लोकेशन सहमति आवश्यक है।",
    consentMedicalLabel:
      "मैं अस्पताल में तत्काल उपचार और ट्राइएज समन्वय हेतु स्वास्थ्य लक्षणों के प्रसंस्करण की सहमति देता/देती हूँ।",
    consentMedicalError: "चिकित्सीय ट्राइएज हेतु स्वास्थ्य डेटा सहमति आवश्यक है।",
    dpdpRightsNotice:
      "DPDP अधिनियम 2023 की धारा 6 के तहत आप अपनी प्रोफ़ाइल सेटिंग्स से किसी भी समय सहमति वापस ले सकते हैं।",

    invalidOtpError: "अमान्य कोड। कृपया 6 अंकों का SMS कोड जांचें और पुनः प्रयास करें।",
    rateLimitError:
      "बहुत अधिक अनुरोध। नया कोड प्राप्त करने के लिए कृपया प्रतीक्षा करें।",
    networkError: "नेटवर्क कनेक्शन उपलब्ध नहीं है। लोकल डेमो मोड में चल रहा है।",
    genericError: "सत्यापन असफल रहा। कृपया पुनः प्रयास करें।",
  },
};
