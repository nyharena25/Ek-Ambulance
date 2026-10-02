import { SupportedLanguage } from "./onboardingStrings";

export interface AuthTranslation {
  headerTitle: string;
  createAccountHeader: string;
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
  /** Sign In with a phone that has no account (nothing is created). */
  accountNotFoundError: string;
  createAccountAction: string;
  /** Create Account refused because sign-ups are switched off server-side. */
  signupUnavailableError: string;
  smsSendFailedError: string;
  incompletePhoneError: string;
  invalidStartError: string;

  // Sign in vs create account
  modeSignInNote: string;
  modeSignUpNote: string;
  switchToSignUp: string;
  switchToSignIn: string;
  phoneHelper: string;
  waitCountdown: (seconds: number) => string;
  otpInputHint: string;
  signedIn: string;
  call108: string;
}

export const authStrings: Record<SupportedLanguage, AuthTranslation> = {
  en: {
    headerTitle: "Sign in",
    createAccountHeader: "Create account",
    secureAuthBadge: "AIS-125 Secure Auth",
    headerTagline: "Ek-Ambulance Patient Access",
    backButton: "Back",

    phoneStepTitle: "Enter Your Mobile Number",
    phoneStepSubtitle:
      "You need to be signed in to request an ambulance.",
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

    invalidOtpError: "That code is incorrect or has expired. Check the SMS, or request a new code.",
    rateLimitError:
      "Too many code requests. Please wait a moment before asking for another code.",
    networkError: "Network connection unavailable. Please try again.",
    genericError: "We couldn't complete sign-in right now. Please try again.",
    accountNotFoundError: "No account found for this number. Nothing was created. Check the number, or create a new account with it.",
    createAccountAction: "Create an account with this number",
    signupUnavailableError: "New accounts can't be created right now. If you already have an account, sign in instead. In an emergency, call 108.",
    smsSendFailedError: "We couldn't send a code to this number. Check the number and try again.",
    incompletePhoneError: "Enter all 10 digits of your mobile number.",
    invalidStartError: "Indian mobile numbers start with 6, 7, 8 or 9.",

    modeSignInNote: "For patients who already have an account. Signing in never creates a new account.",
    modeSignUpNote: "We'll set up your account with this number. If it already has one, you'll simply be signed in to it.",
    switchToSignUp: "New here? Create an account",
    switchToSignIn: "Already have an account? Sign in",
    phoneHelper: "10-digit mobile number. We'll text you a 6-digit code.",
    waitCountdown: (seconds: number) => `Try again in ${seconds}s`,
    otpInputHint: "Enter the 6-digit code from the SMS. It may fill in automatically.",
    signedIn: "Signed in",
    call108: "Emergency? Call 108",
  },
  hi: {
    headerTitle: "साइन इन",
    createAccountHeader: "खाता बनाएँ",
    secureAuthBadge: "AIS-125 सुरक्षित प्रमाणीकरण",
    headerTagline: "एक-एंबुलेंस मरीज सेवा",
    backButton: "वापस",

    phoneStepTitle: "अपना मोबाइल नंबर दर्ज करें",
    phoneStepSubtitle:
      "एम्बुलेंस बुलाने के लिए साइन इन होना ज़रूरी है।",
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

    invalidOtpError: "यह कोड गलत है या इसकी अवधि समाप्त हो गई है। SMS जाँचें, या नया कोड मँगाएँ।",
    rateLimitError:
      "बहुत अधिक अनुरोध। नया कोड प्राप्त करने के लिए कृपया प्रतीक्षा करें।",
    networkError: "नेटवर्क कनेक्शन उपलब्ध नहीं है। कृपया पुनः प्रयास करें।",
    genericError: "हम अभी साइन इन पूरा नहीं कर सके। कृपया पुनः प्रयास करें।",
    accountNotFoundError: "इस नंबर से कोई खाता नहीं मिला। कुछ भी नहीं बनाया गया। नंबर जाँचें, या इस नंबर से नया खाता बनाएँ।",
    createAccountAction: "इस नंबर से खाता बनाएँ",
    signupUnavailableError: "अभी नए खाते नहीं बनाए जा सकते। यदि आपका खाता पहले से है, तो साइन इन करें। आपात स्थिति में 108 पर कॉल करें।",
    smsSendFailedError: "हम इस नंबर पर कोड नहीं भेज सके। नंबर जाँचें और पुनः प्रयास करें।",
    incompletePhoneError: "अपने मोबाइल नंबर के सभी 10 अंक दर्ज करें।",
    invalidStartError: "भारतीय मोबाइल नंबर 6, 7, 8 या 9 से शुरू होते हैं।",

    modeSignInNote: "उन मरीज़ों के लिए जिनका खाता पहले से है। साइन इन करने से कभी नया खाता नहीं बनता।",
    modeSignUpNote: "हम इस नंबर से आपका खाता बनाएँगे। यदि इस नंबर का खाता पहले से है, तो आप उसी में साइन इन हो जाएँगे।",
    switchToSignUp: "नए हैं? खाता बनाएँ",
    switchToSignIn: "पहले से खाता है? साइन इन करें",
    phoneHelper: "10 अंकों का मोबाइल नंबर। हम SMS से 6 अंकों का कोड भेजेंगे।",
    waitCountdown: (seconds: number) => `${seconds} सेकंड बाद पुनः प्रयास करें`,
    otpInputHint: "SMS से मिला 6 अंकों का कोड दर्ज करें। यह अपने आप भी भर सकता है।",
    signedIn: "साइन इन हो गया",
    call108: "आपात स्थिति? 108 पर कॉल करें",
  },
};
