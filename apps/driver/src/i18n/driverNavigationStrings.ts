import { SupportedLanguage } from "./driverOnboardingStrings";

/**
 * En-route screen copy only. Routing is Google Maps' job (NavigateInGoogleMapsButton) and nothing on the server records an
 * en-route delay, so this file carries no turn-by-turn steps, addresses, urgency codes or delay "broadcasts" - those were
 * canned values shown regardless of the real mission.
 */
export interface DriverNavigationTranslation {
  missionStatusEnRoute: string;
  missionStatusOnScene: string;
  currentSpeedUnit: string;

  // Slide to Confirm Arrival (Irreversible)
  sliderPromptArrival: string;
  sliderConfirmedArrival: string;
  sliderAccidentalTapNotice: string;

  // On-Scene Arrival Modal (shown when the arrival is sent; the server's acceptance gates "Proceed")
  arrivedSceneTitle: string;
  arrivedSceneSubtitle: string;
  triagePreparationNotice: string;
  btnProceedToTriageHandoff: string;
}

export const driverNavigationStrings: Record<SupportedLanguage, DriverNavigationTranslation> = {
  en: {
    missionStatusEnRoute: "EN ROUTE TO PATIENT",
    missionStatusOnScene: "ARRIVED ON SCENE (PATIENT CONTACT)",
    currentSpeedUnit: "km/h",

    sliderPromptArrival: "Slide to Confirm Arrival on Scene",
    sliderConfirmedArrival: "ARRIVED ON SCENE",
    sliderAccidentalTapNotice: "Firm continuous swipe required to avoid accidental taps while driving",

    arrivedSceneTitle: "Arrival on Scene",
    arrivedSceneSubtitle: "Your arrival was sent to dispatch with your GPS position and time.",
    triagePreparationNotice: "Prepare stretchers, cervical immobilization, and transport oxygen kit. Approach patient calmly.",
    btnProceedToTriageHandoff: "Proceed to Patient Triage & Onboarding",
  },
  hi: {
    missionStatusEnRoute: "मरीज की ओर प्रस्थान",
    missionStatusOnScene: "दृश्य स्थल पर पहुंचे (मरीज संपर्क)",
    currentSpeedUnit: "किमी/घं",

    sliderPromptArrival: "दृश्य स्थल पर आगमन पुष्टि हेतु स्लाइड करें",
    sliderConfirmedArrival: "घटनास्थल पर पहुँच गए",
    sliderAccidentalTapNotice: "ड्राइविंग के दौरान आकस्मिक स्पर्श रोकने हेतु स्लाइडर को दृढ़ता से पूरा खींचें",

    arrivedSceneTitle: "दृश्य स्थल पर आगमन",
    arrivedSceneSubtitle: "आपका आगमन जीपीएस स्थान और समय के साथ डिस्पैच को भेज दिया गया है।",
    triagePreparationNotice: "स्ट्रेचर, सर्वाइकल कॉलर और पोर्टेबल ऑक्सीजन किट तैयार रखें। शांत भाव से मरीज के पास जाएं।",
    btnProceedToTriageHandoff: "मरीज ट्रायज एवं ऑनबोर्डिंग की ओर बढ़ें",
  },
};
