import type { IconRef } from "../components/AppIcon";
import { SupportedLanguage } from "./driverOnboardingStrings";

export interface NavigationManeuver {
  instruction: string;
  subInstruction: string;
  streetName: string;
  distanceToManeuver: string;
  icon: IconRef;
}

export interface IncidentDelayOption {
  id: string;
  title: string;
  addedMinutes: number;
  icon: IconRef;
  impactLevel: "MODERATE" | "HIGH" | "SEVERE";
}

export interface DriverNavigationTranslation {
  // Status Bar & Header
  missionStatusEnRoute: string;
  missionStatusOnScene: string;
  missionIdLabel: string;
  greenCorridorBadge: string;
  sirenPriorityActive: string;
  speedLimitAdvisory: (speed: number) => string;
  currentSpeedUnit: string;

  // Turn-by-Turn Navigation
  /** Non-empty: the screen renders primaryManeuvers[0] as the active maneuver. */
  primaryManeuvers: readonly [NavigationManeuver, ...NavigationManeuver[]];
  distanceRemainingLabel: string;
  etaLabel: string;
  destinationWaypointName: string;
  destinationAddress: string;

  // Slide to Confirm Arrival (Irreversible)
  sliderPromptArrival: string;
  sliderReleaseToConfirm: string;
  sliderConfirmedArrival: string;
  sliderAccidentalTapNotice: string;
  serverConfirmingNotice: string;

  // Masked Virtual Calling (DPDP Act 2023)
  callerAttendantName: string;
  callerRole: string;
  maskedVirtualNumber: string;
  dpdpPrivacyNotice: string;
  btnCallPatientMasked: string;
  btnCallDispatchDesk: string;
  callingConnectingModal: (number: string) => string;

  // Incident Delay Drawer
  btnOpenDelayDrawer: string;
  btnCloseDialog: string;
  delayDrawerTitle: string;
  delayDrawerSubtitle: string;
  delayOptions: IncidentDelayOption[];
  btnBroadcastDelay: (mins: number) => string;
  btnCancelDelay: string;
  delayBroadcastSuccessNotice: (mins: number) => string;

  // On-Scene Arrival Success Modal
  arrivedSceneTitle: string;
  arrivedSceneSubtitle: string;
  triagePreparationNotice: string;
  btnProceedToTriageHandoff: string;
}

export const driverNavigationStrings: Record<SupportedLanguage, DriverNavigationTranslation> = {
  en: {
    // Header
    missionStatusEnRoute: "EN ROUTE TO PATIENT (CODE 1 RED)",
    missionStatusOnScene: "ARRIVED ON SCENE (PATIENT CONTACT)",
    missionIdLabel: "Active Mission",
    greenCorridorBadge: "GREEN CORRIDOR ACTIVE",
    sirenPriorityActive: "Priority Siren & Traffic Signal Interconnect Active",
    speedLimitAdvisory: (speed) => `Advisory Max ${speed} km/h`,
    currentSpeedUnit: "km/h",

    // Turn-by-Turn
    primaryManeuvers: [
      {
        instruction: "In 250m, Turn Right onto Noida-Gr. Noida Expressway",
        subInstruction: "Then in 400m, take Exit 6 toward Sector 142 Advant Navis",
        streetName: "Dadri Main Road → Expressway Connector",
        distanceToManeuver: "250 m",
        icon: { set: "ion", name: "return-up-forward" },
      },
      {
        instruction: "In 400m, Take Exit 6 onto Service Road",
        subInstruction: "Stay in rightmost emergency lane for direct gate access",
        streetName: "Expressway Service Road",
        distanceToManeuver: "400 m",
        icon: { set: "ion", name: "return-up-forward" },
      },
      {
        instruction: "In 1.1 km, Arrive at Gate No. 3 Advant Navis",
        subInstruction: "Patient is located at Ground Floor Porch (Ramp Access)",
        streetName: "Advant Navis Internal Access Road",
        distanceToManeuver: "1.1 km",
        icon: { set: "ion", name: "flag" },
      },
    ],
    distanceRemainingLabel: "Distance Left",
    etaLabel: "Estimated Arrival",
    destinationWaypointName: "Advant Navis Business Park (Gate 3)",
    destinationAddress: "Sector 142, Noida, Uttar Pradesh (Near Metro Pillar 142)",

    // Irreversible Arrival Slider
    sliderPromptArrival: "Slide to Confirm Arrival on Scene",
    sliderReleaseToConfirm: "Release to confirm on-scene arrival",
    sliderConfirmedArrival: "ARRIVED ON SCENE",
    sliderAccidentalTapNotice: "Firm continuous swipe required to avoid accidental taps while driving",
    serverConfirmingNotice: "Broadcasting timestamp & GPS arrival to central dispatch...",

    // Masked Calling
    callerAttendantName: "Amit Verma",
    callerRole: "Caller / Family Attendant",
    maskedVirtualNumber: "+91 11 4084 3910 Ext: 8821",
    dpdpPrivacyNotice: "DPDP Act 2023 Compliant • Both caller and pilot numbers are masked via telecom gateway",
    btnCallPatientMasked: "Call Attendant (Masked)",
    btnCallDispatchDesk: "Call Central Dispatch Desk",
    callingConnectingModal: (number) => `Connecting masked virtual telecom bridge to ${number}...`,

    // Incident Delay Drawer
    btnOpenDelayDrawer: "Report Incident Delay",
    btnCloseDialog: "Close Dialog",
    delayDrawerTitle: "Report En Route Incident Delay",
    delayDrawerSubtitle:
      "Select an unforeseen route impedance. Central dispatch and the patient tracking dashboard will be updated immediately with your revised ETA.",
    delayOptions: [
      {
        id: "traffic_gridlock",
        title: "Severe Corridor Gridlock / Accident Jam",
        addedMinutes: 5,
        icon: { set: "ion", name: "car" },
        impactLevel: "MODERATE",
      },
      {
        id: "road_blockage",
        title: "Road Construction / Unannounced Diversion",
        addedMinutes: 7,
        icon: { set: "ion", name: "construct" },
        impactLevel: "HIGH",
      },
      {
        id: "railway_crossing",
        title: "Railway Level Crossing Gate Closed",
        addedMinutes: 8,
        icon: { set: "ion", name: "train" },
        impactLevel: "HIGH",
      },
      {
        id: "police_barricade",
        title: "Police Security Barricade / VIP Convoy",
        addedMinutes: 6,
        icon: { set: "mci", name: "police-badge" },
        impactLevel: "MODERATE",
      },
      {
        id: "flooding",
        title: "Severe Water-logging / Underpass Flooded",
        addedMinutes: 10,
        icon: { set: "ion", name: "rainy" },
        impactLevel: "SEVERE",
      },
      {
        id: "vehicle_issue",
        title: "Minor Vehicle Mechanical / Tire Warning",
        addedMinutes: 4,
        icon: { set: "ion", name: "build" },
        impactLevel: "MODERATE",
      },
    ],
    btnBroadcastDelay: (mins) => `Broadcast +${mins} Mins Delay to Dispatch`,
    btnCancelDelay: "Cancel / No Delay",
    delayBroadcastSuccessNotice: (mins) =>
      `Incident delay (+${mins} mins) broadcasted to dispatch radar & patient tracking screen.`,

    // On-Scene Modal
    arrivedSceneTitle: "Arrival on Scene Confirmed!",
    arrivedSceneSubtitle: "Your arrival has been recorded with GPS coordinates and statutory timestamp.",
    triagePreparationNotice: "Prepare stretchers, cervical immobilization, and transport oxygen kit. Approach patient calmly.",
    btnProceedToTriageHandoff: "Proceed to Patient Triage & Onboarding",
  },

  hi: {
    // Header
    missionStatusEnRoute: "मरीज की ओर प्रस्थान (कोड 1 रेड)",
    missionStatusOnScene: "दृश्य स्थल पर पहुंचे (मरीज संपर्क)",
    missionIdLabel: "सक्रिय मिशन",
    greenCorridorBadge: "ग्रीन कॉरिडोर सक्रिय",
    sirenPriorityActive: "प्राथमिकता सायरन एवं ट्रैफिक सिग्नल इंटरकनेक्ट सक्रिय",
    speedLimitAdvisory: (speed) => `अधिकतम अनुशंसित गति ${speed} किमी/घंटा`,
    currentSpeedUnit: "किमी/घं",

    // Turn-by-Turn
    primaryManeuvers: [
      {
        instruction: "250 मीटर में, नोएडा-ग्रेटर नोएडा एक्सप्रेसवे पर दाएं मुड़ें",
        subInstruction: "तत्पश्चात 400 मीटर में, सेक्टर 142 एडवांट नाविस हेतु निकास 6 लें",
        streetName: "दादरी मेन रोड → एक्सप्रेसवे कनेक्टर",
        distanceToManeuver: "250 मी.",
        icon: { set: "ion", name: "return-up-forward" },
      },
      {
        instruction: "400 मीटर में, सर्विस रोड हेतु निकास 6 लें",
        subInstruction: "सीधे गेट प्रवेश हेतु सबसे दाहिनी आपातकालीन लेन में रहें",
        streetName: "एक्सप्रेसवे सर्विस रोड",
        distanceToManeuver: "400 मी.",
        icon: { set: "ion", name: "return-up-forward" },
      },
      {
        instruction: "1.1 किमी में, एडवांट नाविस गेट नंबर 3 पर पहुंचेंगे",
        subInstruction: "मरीज ग्राउंड फ्लोर पोर्च पर उपस्थित हैं (रैंप सुविधा उपलब्ध)",
        streetName: "एडवांट नाविस आंतरिक पहुंच मार्ग",
        distanceToManeuver: "1.1 किमी",
        icon: { set: "ion", name: "flag" },
      },
    ],
    distanceRemainingLabel: "शेष दूरी",
    etaLabel: "अनुमानित आगमन (ETA)",
    destinationWaypointName: "एडवांट नाविस बिजनेस पार्क (गेट 3)",
    destinationAddress: "सेक्टर 142, नोएडा, उत्तर प्रदेश (मेट्रो पिलर 142 के पास)",

    // Irreversible Arrival Slider
    sliderPromptArrival: "दृश्य स्थल पर आगमन पुष्टि हेतु स्लाइड करें",
    sliderReleaseToConfirm: "आगमन पुष्टि करने हेतु छोड़ें",
    sliderConfirmedArrival: "घटनास्थल पर पहुँच गए",
    sliderAccidentalTapNotice: "ड्राइविंग के दौरान आकस्मिक स्पर्श रोकने हेतु स्लाइडर को दृढ़ता से पूरा खींचें",
    serverConfirmingNotice: "सेंट्रल डिस्पैच को जीपीएस लोकेशन व समय प्रसारित हो रहा है...",

    // Masked Calling
    callerAttendantName: "अमित वर्मा",
    callerRole: "कॉलर / पारिवारिक परिचारक",
    maskedVirtualNumber: "+91 11 4084 3910 Ext: 8821",
    dpdpPrivacyNotice: "DPDP अधिनियम 2023 अनुपालित • कॉलर व पायलट दोनों के फोन नंबर पूरी तरह सुरक्षित व मास्क हैं",
    btnCallPatientMasked: "परिचारक को कॉल करें (मास्क नंबर)",
    btnCallDispatchDesk: "सेंट्रल डिस्पैच डेस्क को कॉल करें",
    callingConnectingModal: (number) => `मास्क वर्चुअल टेलीकॉम गेटवे द्वारा ${number} से संपर्क स्थापित हो रहा है...`,

    // Incident Delay Drawer
    btnOpenDelayDrawer: "मार्ग बाधा / विलंब की सूचना दें",
    btnCloseDialog: "संवाद बंद करें",
    delayDrawerTitle: "रास्ते में अप्रत्याशित विलंब दर्ज करें",
    delayDrawerSubtitle:
      "रास्ते में आई बाधा चुनें। सेंट्रल डिस्पैच एवं मरीज के ऐप पर आपका नया आगमन समय (ETA) तत्काल अपडेट हो जाएगा।",
    delayOptions: [
      {
        id: "traffic_gridlock",
        title: "भीषण ट्रैफिक जाम / दुर्घटना के कारण अवरोध",
        addedMinutes: 5,
        icon: { set: "ion", name: "car" },
        impactLevel: "MODERATE",
      },
      {
        id: "road_blockage",
        title: "सड़क निर्माण कार्य / अनापेक्षित डायवर्जन",
        addedMinutes: 7,
        icon: { set: "ion", name: "construct" },
        impactLevel: "HIGH",
      },
      {
        id: "railway_crossing",
        title: "रेलवे क्रॉसिंग फाटक बंद",
        addedMinutes: 8,
        icon: { set: "ion", name: "train" },
        impactLevel: "HIGH",
      },
      {
        id: "police_barricade",
        title: "पुलिस सुरक्षा बैरिकेड / वीआईपी काफिला",
        addedMinutes: 6,
        icon: { set: "mci", name: "police-badge" },
        impactLevel: "MODERATE",
      },
      {
        id: "flooding",
        title: "भारी जलभराव / अंडरपास में पानी भरा",
        addedMinutes: 10,
        icon: { set: "ion", name: "rainy" },
        impactLevel: "SEVERE",
      },
      {
        id: "vehicle_issue",
        title: "एंबुलेंस में तकनीकी खराबी / टायर समस्या",
        addedMinutes: 4,
        icon: { set: "ion", name: "build" },
        impactLevel: "MODERATE",
      },
    ],
    btnBroadcastDelay: (mins) => `डिस्पैच को +${mins} मिनट का विलंब भेजें`,
    btnCancelDelay: "रद्द करें / कोई विलंब नहीं",
    delayBroadcastSuccessNotice: (mins) =>
      `विलंब सूचना (+${mins} मिनट) डिस्पैच रडार एवं मरीज ट्रैकिंग स्क्रीन पर प्रसारित कर दी गई है।`,

    // On-Scene Modal
    arrivedSceneTitle: "दृश्य स्थल पर आगमन सत्यापित!",
    arrivedSceneSubtitle: "आपका आगमन जीपीएस लोकेशन एवं आधिकारिक समय के साथ दर्ज कर लिया गया है।",
    triagePreparationNotice: "स्ट्रेचर, सर्वाइकल कॉलर और पोर्टेबल ऑक्सीजन किट तैयार रखें। शांत भाव से मरीज के पास जाएं।",
    btnProceedToTriageHandoff: "मरीज ट्रायज एवं ऑनबोर्डिंग की ओर बढ़ें",
  },
};
