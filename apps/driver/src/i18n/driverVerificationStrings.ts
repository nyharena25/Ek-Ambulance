import type { SupportedLanguage } from "./driverOnboardingStrings.ts";

export interface DriverVerificationTranslation {
  title: string;
  subtitle: string;
  statusLabel: string;
  /** Server kyc_status -> label. */
  status: Record<string, string>;
  stepSubmitted: string;
  stepReview: string;
  stepDecision: string;
  cannotOperate: string;
  nextTitle: string;
  nextBody: string;
  signedInAs: string;
  checkStatus: string;
  checking: string;
  checkFailed: string;
  signOut: string;
  signOutConfirmTitle: string;
  signOutConfirmBody: string;
  signOutFailed: string;
  cancel: string;
  loading: string;
  loadFailedTitle: string;
  loadFailedBody: string;
  retry: string;
}

export const driverVerificationStrings: Record<SupportedLanguage, DriverVerificationTranslation> = {
  en: {
    title: "Application Under Review",
    subtitle: "Verification in progress",
    statusLabel: "Current status",
    status: { draft: "Not submitted", pending_verification: "Under review", approved: "Approved", rejected: "Not approved" },
    stepSubmitted: "Application submitted",
    stepReview: "Documents being reviewed",
    stepDecision: "Approval decision",
    cannotOperate: "You cannot go online or accept ambulance missions until your application is approved.",
    nextTitle: "What happens next",
    nextBody:
      "Our team checks your driving licence, vehicle registration and other documents. Once approved, you can go online from the standby screen. If something needs correcting, you will see the reason and can fix it and submit again.",
    signedInAs: "Signed in as",
    checkStatus: "Check status",
    checking: "Checking…",
    checkFailed: "Could not reach the server. Your status was not updated.",
    signOut: "Sign out",
    signOutConfirmTitle: "Sign out?",
    signOutConfirmBody: "You will need a new OTP to sign in again.",
    signOutFailed: "Could not sign out. Check your connection and try again.",
    cancel: "Cancel",
    loading: "Checking your driver status…",
    loadFailedTitle: "Could not load your driver status",
    loadFailedBody: "Your verification status could not be read from the server. You cannot go online until it is.",
    retry: "Try again",
  },
  hi: {
    title: "आवेदन समीक्षाधीन है",
    subtitle: "सत्यापन जारी है",
    statusLabel: "वर्तमान स्थिति",
    status: { draft: "जमा नहीं हुआ", pending_verification: "समीक्षा में", approved: "स्वीकृत", rejected: "स्वीकृत नहीं" },
    stepSubmitted: "आवेदन जमा हुआ",
    stepReview: "दस्तावेज़ों की समीक्षा हो रही है",
    stepDecision: "स्वीकृति निर्णय",
    cannotOperate: "आवेदन स्वीकृत होने तक आप ऑनलाइन नहीं जा सकते और एम्बुलेंस मिशन स्वीकार नहीं कर सकते।",
    nextTitle: "आगे क्या होगा",
    nextBody:
      "हमारी टीम आपका ड्राइविंग लाइसेंस, वाहन पंजीकरण और अन्य दस्तावेज़ जांचती है। स्वीकृति के बाद आप स्टैंडबाय स्क्रीन से ऑनलाइन जा सकते हैं। यदि कुछ ठीक करना हो, तो कारण दिखेगा और आप सुधार कर फिर से जमा कर सकते हैं।",
    signedInAs: "साइन इन",
    checkStatus: "स्थिति जांचें",
    checking: "जांच हो रही है…",
    checkFailed: "सर्वर से संपर्क नहीं हो सका। स्थिति अपडेट नहीं हुई।",
    signOut: "साइन आउट",
    signOutConfirmTitle: "साइन आउट करें?",
    signOutConfirmBody: "फिर से साइन इन करने के लिए नया OTP चाहिए होगा।",
    signOutFailed: "साइन आउट नहीं हो सका। कनेक्शन जांचें और पुनः प्रयास करें।",
    cancel: "रद्द करें",
    loading: "आपकी ड्राइवर स्थिति जांची जा रही है…",
    loadFailedTitle: "ड्राइवर स्थिति लोड नहीं हो सकी",
    loadFailedBody: "सर्वर से आपकी सत्यापन स्थिति नहीं पढ़ी जा सकी। तब तक आप ऑनलाइन नहीं जा सकते।",
    retry: "पुनः प्रयास करें",
  },
};
