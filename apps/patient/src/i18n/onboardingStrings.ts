export type SupportedLanguage = "en" | "hi";

export interface ValuePropItem {
  id: "pricing" | "ais125" | "triage";
  title: string;
  badge: string;
  subtitle: string;
  description: string;
  accessibilityLabel: string;
}

export interface OnboardingTranslation {
  brandName: string;
  brandTagline: string;
  regulatedBadge: string;
  heroHeading: string;
  heroSubheading: string;
  languageToggleLabel: string;
  englishLabel: string;
  hindiLabel: string;
  valuePropsHeading: string;
  valueProps: ValuePropItem[];
  quickEmergencyTitle: string;
  quickEmergencySubtitle: string;
  quickEmergencyAccessibility: string;
  signInPhoneTitle: string;
  signInPhoneSubtitle: string;
  signInPhoneAccessibility: string;
  emergencyDisclaimer: string;
  tollFreeCall: string;
}

export const onboardingStrings: Record<SupportedLanguage, OnboardingTranslation> = {
  en: {
    brandName: "Ek-Ambulance",
    brandTagline: "National Emergency Dispatch",
    regulatedBadge: "Verified AIS-125 Fleet",
    heroHeading: "Every Second Counts In An Emergency",
    heroSubheading:
      "Statutory government-approved rates, clinical severity triage, and certified AIS-125 ambulances dispatched within minutes.",
    languageToggleLabel: "Language Selector. Current language: English",
    englishLabel: "English",
    hindiLabel: "हिन्दी",
    valuePropsHeading: "Emergency Standards & Guarantees",
    valueProps: [
      {
        id: "pricing",
        title: "Transparent Pricing",
        badge: "Statutory Fares",
        subtitle: "Zero surge gouging",
        description:
          "Upfront pricing based on official regional government rates. No distress pricing or hidden surcharges.",
        accessibilityLabel:
          "Transparent Pricing: Statutory government-approved rates with upfront fare breakdown before dispatch.",
      },
      {
        id: "ais125",
        title: "Verified AIS-125 Ambulances",
        badge: "MoRTH Certified",
        subtitle: "ALS, BLS & PTA standards",
        description:
          "Every ambulance is physically inspected to Indian MoRTH AIS-125 standards with calibrated oxygen, defibrillators, and monitors.",
        accessibilityLabel:
          "Verified AIS-125 Ambulances: MoRTH certified ALS, BLS, and PTA vehicles equipped with tested life-support systems.",
      },
      {
        id: "triage",
        title: "Clinical Triage",
        badge: "Golden Hour Dispatch",
        subtitle: "Paramedic-guided assessment",
        description:
          "Instant symptom-based acuity assessment coordinates the right medical crew and pre-alerts hospital trauma teams.",
        accessibilityLabel:
          "Clinical Triage: Real-time symptom triage ensuring optimal care level dispatch during the critical Golden Hour.",
      },
    ],
    quickEmergencyTitle: "Quick Emergency Access",
    quickEmergencySubtitle: "Instant Dispatch • Skip Registration",
    quickEmergencyAccessibility:
      "Quick Emergency Access: Immediately request an ambulance without registering. Button.",
    signInPhoneTitle: "Sign In with Phone",
    signInPhoneSubtitle: "For planned transport, records & tracking",
    signInPhoneAccessibility:
      "Sign In with Phone: Log in using phone number and OTP for full account features. Button.",
    emergencyDisclaimer:
      "For extreme cardiac arrest, stroke, or fatal trauma emergencies, direct line 108 / 102 is also supported.",
    tollFreeCall: "Call 108",
  },
  hi: {
    brandName: "एक-एंबुलेंस",
    brandTagline: "राष्ट्रीय आपातकालीन सेवा",
    regulatedBadge: "AIS-125 प्रमाणित बेड़ा",
    heroHeading: "आपातकाल में हर एक सेकंड कीमती है",
    heroSubheading:
      "सरकारी नियमों द्वारा निर्धारित दरें, त्वरित चिकित्सीय ट्राइएज, और प्रमाणित AIS-125 एंबुलेंस सेवा कुछ ही पलों में।",
    languageToggleLabel: "भाषा चयनकर्ता। वर्तमान भाषा: हिन्दी",
    englishLabel: "English",
    hindiLabel: "हिन्दी",
    valuePropsHeading: "आपातकालीन मानक एवं सुरक्षा गारंटी",
    valueProps: [
      {
        id: "pricing",
        title: "पारदर्शी शुल्क",
        badge: "शासकीय दरें",
        subtitle: "कोई अनुचित किराया नहीं",
        description:
          "सरकारी नियमों के अनुसार निर्धारित दरें। बुकिंग से पहले स्पष्ट किराया विवरण, बिना किसी छुपे या आपातकालीन अधिभार के।",
        accessibilityLabel:
          "पारदर्शी शुल्क: सरकारी नियमों के अनुसार निर्धारित दरें, बुकिंग से पहले स्पष्ट विवरण।",
      },
      {
        id: "ais125",
        title: "प्रमाणित AIS-125 एंबुलेंस",
        badge: "MoRTH प्रमाणित",
        subtitle: "ALS, BLS एवं PTA मानक",
        description:
          "सभी वाहन भारतीय MoRTH AIS-125 मानकों से प्रमाणित: कैलिब्रेटेड ऑक्सीजन, डिफिब्रिलेटर और जीवन रक्षक उपकरणों से युक्त।",
        accessibilityLabel:
          "प्रमाणित AIS-125 एंबुलेंस: MoRTH प्रमाणित ALS, BLS एवं PTA वाहन, जीवन रक्षक उपकरणों से सुसज्जित।",
      },
      {
        id: "triage",
        title: "क्लिनिकल ट्राइएज",
        badge: "गोल्डन ऑवर सुरक्षा",
        subtitle: "चिकित्सीय प्राथमिक मूल्यांकन",
        description:
          "लक्षणों के आधार पर तत्काल गंभीरता मूल्यांकन, जिससे गोल्डन ऑवर में मरीज को उचित जीवन रक्षक सहायता तुरंत मिले।",
        accessibilityLabel:
          "क्लिनिकल ट्राइएज: आपातकालीन स्थिति में उपयुक्त जीवन रक्षक सहायता और अस्पताल समन्वय।",
      },
    ],
    quickEmergencyTitle: "त्वरित आपातकालीन सेवा",
    quickEmergencySubtitle: "बिना लॉगिन तुरंत एंबुलेंस बुलाएं",
    quickEmergencyAccessibility:
      "त्वरित आपातकालीन सेवा: बिना लॉगिन किए तुरंत एंबुलेंस का अनुरोध करें। बटन।",
    signInPhoneTitle: "फ़ोन नंबर से साइन इन करें",
    signInPhoneSubtitle: "नियोजित यात्रा, मेडिकल रिकॉर्ड और ट्रैकिंग हेतु",
    signInPhoneAccessibility:
      "फ़ोन नंबर से साइन इन करें: फोन नंबर और OTP के साथ लॉगिन करें। बटन।",
    emergencyDisclaimer:
      "अति गंभीर हृदय गति रुकने या बड़ी सड़क दुर्घटना की स्थिति में राष्ट्रीय हेल्पलाइन 108 / 102 भी उपलब्ध है।",
    tollFreeCall: "108 पर कॉल करें",
  },
};
