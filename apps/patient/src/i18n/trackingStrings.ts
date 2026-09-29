import type { IconRef } from "../components/AppIcon";
import { SupportedLanguage } from "./onboardingStrings";

export interface FirstAidInstruction {
  stepNumber: number;
  title: string;
  description: string;
  icon: IconRef;
}

export interface SymptomGuide {
  symptomName: string;
  badge: string;
  instructions: FirstAidInstruction[];
  warningText: string;
}

export interface TrackingTranslation {
  // Top Header & Status
  screenTitle: string;
  missionIdLabel: (id: string) => string;
  centrifugoLiveBadge: string;
  trackingConnectingBadge: string;
  trackingPausedBadge: string;
  etaOnlyLabel: (mins: number) => string;
  centrifugoConnectingBadge: string;
  languageToggleLabel: string;
  englishLabel: string;
  hindiLabel: string;

  // Map & Telemetry
  pickupPinTitle: string;
  pickupPinSubtitle: string;
  ambulanceMarkerLabel: string;
  trafficEtaLabel: (mins: number, km: number) => string;
  liveGpsBadge: string;
  trafficCorridorNotice: string;
  speedIndicator: (kmh: number) => string;

  // Mission State Progression
  stateStepAssigned: string;
  stateStepEnRoute: string;
  stateStepArrived: string;
  activeStatusBanner: string;

  // Driver Card
  driverSectionTitle: string;
  driverName: string;
  driverRoleBadge: string;
  driverRatingText: (rating: number, count: number) => string;
  verifiedDriverBadge: string;
  verifiedBadgeShort: string;

  // Ambulance Card
  vehicleSectionTitle: string;
  /** "Force Traveller · White" line under the plate, and the crew size. */
  crewSize: (count: number) => string;
  licensePlateLabel: string;
  licensePlateNumber: string;
  careTierBadge: string;
  equipmentVentilator: string;
  equipmentDefibrillator: string;
  equipmentOxygen: string;
  equipmentParamedic: string;

  // Communications
  callDriverButton: string;
  callDriverSubtitle: string;

  // Expandable Preparation Guide
  guideHeaderTitle: string;
  guideHeaderSubtitle: string;
  guideExpandLabel: string;
  guideCollapseLabel: string;
  guidesBySymptom: {
    chest_pain: SymptomGuide;
    severe_bleeding: SymptomGuide;
    breathing_difficulty: SymptomGuide;
    unconscious: SymptomGuide;
    default: SymptomGuide;
  };

  // Emergency Fallback
  fallback108Button: string;
  calling108Notice: string;
}

export const trackingStrings: Record<SupportedLanguage, TrackingTranslation> = {
  en: {
    screenTitle: "Live Mission Tracking",
    missionIdLabel: (id: string) => `Mission ID: ${id}`,
    centrifugoLiveBadge: "Live tracking",
    trackingConnectingBadge: "Connecting to live tracking...",
    trackingPausedBadge: "Live tracking paused - last position shown",
    etaOnlyLabel: (mins: number) => `${mins} MINS`,
    centrifugoConnectingBadge: "Centrifugo WS: Connecting...",
    languageToggleLabel: "Language Switch",
    englishLabel: "EN",
    hindiLabel: "हिन्दी",

    pickupPinTitle: "Pickup Location",
    pickupPinSubtitle: "AIIMS New Delhi Emergency Ward",
    ambulanceMarkerLabel: "Live Ambulance",
    trafficEtaLabel: (mins: number, km: number) => `${mins} MINS (${km.toFixed(1)} km)`,
    liveGpsBadge: "LIVE GPS",
    trafficCorridorNotice: "Green Corridor Active • Moderate Traffic on Ring Road",
    speedIndicator: (kmh: number) => `${kmh} km/h`,

    stateStepAssigned: "Driver Assigned",
    stateStepEnRoute: "En Route to Patient",
    stateStepArrived: "Arrived on Scene",
    activeStatusBanner: "Ambulance is actively navigating towards your pickup point with siren & GPS telemetry.",

    driverSectionTitle: "CERTIFIED PARAMEDIC DRIVER",
    driverName: "Rajesh Kumar",
    driverRoleBadge: "Govt. Certified ALS Paramedic",
    driverRatingText: (rating: number, count: number) => `${rating.toFixed(2)} (${count}+ emergency missions)`,
    verifiedDriverBadge: "Verified & Background Checked",
    verifiedBadgeShort: "VERIFIED",

    vehicleSectionTitle: "AMBULANCE SPECIFICATION",
    crewSize: (count) => `Crew on board: ${count}`,
    licensePlateLabel: "HSRP REGISTRATION",
    licensePlateNumber: "DL 1E AM 4092",
    careTierBadge: "Type D - Advanced Life Support (ALS)",
    equipmentVentilator: "Transport Ventilator",
    equipmentDefibrillator: "Biphasic Defibrillator",
    equipmentOxygen: "2,000L Medical Oxygen",
    equipmentParamedic: "Onboard Certified EMT",

    callDriverButton: "Call Driver (Masked)",
    callDriverSubtitle: "Private telecom relay • No PII shared",

    guideHeaderTitle: "Pre-Arrival Preparation Guide",
    guideHeaderSubtitle: "Critical first-aid actions while ambulance is en route",
    guideExpandLabel: "View Critical Steps",
    guideCollapseLabel: "Collapse Guide",
    guidesBySymptom: {
      chest_pain: {
        symptomName: "Cardiac / Chest Pain Emergency",
        badge: "CARDIOVASCULAR TRIAGE",
        instructions: [
          {
            stepNumber: 1,
            icon: { set: "mci", name: "chair-rolling" },
            title: "Maintain Complete Physical Rest",
            description:
              "Keep the patient seated in a comfortable upright or semi-reclined 'W-position' (knees slightly bent). Do not allow walking or exertion.",
          },
          {
            stepNumber: 2,
            icon: { set: "mci", name: "tie" },
            title: "Loosen Restrictive Clothing",
            description:
              "Unbutton tight collars, neckties, chest garments, and loosen belts to assist breathing and reduce thoracic stress.",
          },
          {
            stepNumber: 3,
            icon: { set: "mci", name: "pill" },
            title: "Physician-Prescribed Medication Ready",
            description:
              "If the patient has known heart disease and a physician previously prescribed Sorbitrate/Aspirin, have it immediately accessible for EMT guidance.",
          },
          {
            stepNumber: 4,
            icon: { set: "mci", name: "door" },
            title: "Clear Entry Corridor for Stretcher",
            description:
              "Ensure the main entrance door is unlocked, pets are secured, and hallways are cleared for swift wheeled stretcher entry.",
          },
        ],
        warningText:
          "DO NOT leave patient unattended. DO NOT give water or heavy food.",
      },
      severe_bleeding: {
        symptomName: "Severe Bleeding / Trauma Emergency",
        badge: "TRAUMA FIRST AID",
        instructions: [
          {
            stepNumber: 1,
            icon: { set: "ion", name: "bandage" },
            title: "Apply Continuous Firm Direct Pressure",
            description:
              "Press a sterile dressing or clean cloth firmly over the bleeding wound. If cloth becomes soaked, DO NOT remove it; place fresh cloth directly on top.",
          },
          {
            stepNumber: 2,
            icon: { set: "ion", name: "arrow-up" },
            title: "Elevate Injured Extremity",
            description:
              "If no bone fracture is suspected, elevate the bleeding wound above the level of the patient's heart to reduce arterial flow.",
          },
          {
            stepNumber: 3,
            icon: { set: "mci", name: "coat-rack" },
            title: "Prevent Clinical Shock & Hypothermia",
            description:
              "Cover the patient with a light warm blanket or jacket. Keep the patient lying flat with legs slightly elevated if conscious.",
          },
          {
            stepNumber: 4,
            icon: { set: "ion", name: "clipboard" },
            title: "Ready Identity & Blood Group Details",
            description:
              "Keep Government ID (Aadhaar), known blood group, and emergency contact ready for instant handover to the paramedic.",
          },
        ],
        warningText:
          "DO NOT remove deeply impaled objects from wounds. Wrap dressings around the object.",
      },
      breathing_difficulty: {
        symptomName: "Severe Breathing Distress",
        badge: "RESPIRATORY TRIAGE",
        instructions: [
          {
            stepNumber: 1,
            icon: { set: "mci", name: "chair-rolling" },
            title: "Sit Upright in High-Fowler's Position",
            description:
              "Sit patient fully upright (75-90 degrees). Do not let patient lie flat, as this significantly worsens lung expansion.",
          },
          {
            stepNumber: 2,
            icon: { set: "mci", name: "weather-windy" },
            title: "Maximize Airflow",
            description:
              "Open nearby windows, turn on ceiling fan, and ask non-essential bystanders to leave the room to maximize oxygen circulation.",
          },
          {
            stepNumber: 3,
            icon: { set: "mci", name: "weather-windy" },
            title: "Rescue Inhaler Assistance",
            description:
              "If the patient has asthma or COPD and carries a prescribed rescue bronchodilator (e.g. Salbutamol inhaler/spacer), assist them in taking it.",
          },
          {
            stepNumber: 4,
            icon: { set: "mci", name: "meditation" },
            title: "Encourage Slow Pursed-Lip Breathing",
            description:
              "Instruct the patient to breathe in slowly through the nose and exhale gently through pursed lips to reduce panic and bronchial collapse.",
          },
        ],
        warningText:
          "DO NOT force patient to lie down. Oxygen equipment will be provided immediately upon arrival.",
      },
      unconscious: {
        symptomName: "Unconscious / Altered Mental Status",
        badge: "NEUROLOGICAL EMERGENCY",
        instructions: [
          {
            stepNumber: 1,
            icon: { set: "ion", name: "refresh" },
            title: "Turn into Lateral Recovery Position",
            description:
              "Gently roll patient onto their left side with top knee bent forward to keep airway open and prevent choking on vomit or saliva.",
          },
          {
            stepNumber: 2,
            icon: { set: "ion", name: "ban" },
            title: "STRICTLY NO Fluids or Food",
            description:
              "Never attempt to pour water, glucose, or medicines into the mouth of an unconscious or semi-conscious individual.",
          },
          {
            stepNumber: 3,
            icon: { set: "mci", name: "lungs" },
            title: "Monitor Chest Rise and Breathing",
            description:
              "Continuously watch the chest rise and fall every 15-30 seconds. If breathing ceases completely, begin hands-only CPR compressions.",
          },
          {
            stepNumber: 4,
            icon: { set: "mci", name: "road-variant" },
            title: "Designate Guide at Roadway",
            description:
              "Send a family member or neighbor to the street or apartment gate to guide the ambulance directly to the patient's unit.",
          },
        ],
        warningText:
          "DO NOT shake or vigorously shake the patient. Keep neck and spine supported.",
      },
      default: {
        symptomName: "Emergency First-Aid Protocol",
        badge: "GENERAL FIRST AID",
        instructions: [
          {
            stepNumber: 1,
            icon: { set: "mci", name: "sofa" },
            title: "Keep Patient Calm and Supported",
            description:
              "Have the patient rest in the most comfortable posture possible. Reassure them that specialized medical assistance is en route.",
          },
          {
            stepNumber: 2,
            icon: { set: "ion", name: "bulb" },
            title: "Turn on External Lighting",
            description:
              "Turn on exterior porch and hallway lights so the ambulance crew can immediately locate your building entrance.",
          },
          {
            stepNumber: 3,
            icon: { set: "ion", name: "folder-open" },
            title: "Assemble Medical History & ID",
            description:
              "Gather the patient's recent discharge summaries, list of daily medications, insurance papers, and Government ID.",
          },
          {
            stepNumber: 4,
            icon: { set: "ion", name: "car" },
            title: "Clear Driveway and Parking",
            description:
              "Move parked cars or obstacles from the driveway to allow the ambulance to park as close to the entrance as possible.",
          },
        ],
        warningText:
          "If condition rapidly deteriorates, use the Emergency 108 dialer immediately.",
      },
    },

    fallback108Button: "Call 108 Emergency Fallback",
    calling108Notice: "Dialing 108 Emergency Helpline...",
  },
  hi: {
    screenTitle: "लाइव मिशन ट्रैकिंग",
    missionIdLabel: (id: string) => `मिशन आईडी: ${id}`,
    centrifugoLiveBadge: "लाइव ट्रैकिंग",
    trackingConnectingBadge: "लाइव ट्रैकिंग से जुड़ रहा है...",
    trackingPausedBadge: "लाइव ट्रैकिंग रुकी है - आख़िरी स्थिति दिखाई गई",
    etaOnlyLabel: (mins: number) => `${mins} मिनट`,
    centrifugoConnectingBadge: "सेंट्रीफ्यूगो WS: संपर्क स्थापित हो रहा है...",
    languageToggleLabel: "भाषा चयन",
    englishLabel: "EN",
    hindiLabel: "हिन्दी",

    pickupPinTitle: "पिकअप स्थान",
    pickupPinSubtitle: "एम्स नई दिल्ली आपातकालीन वार्ड",
    ambulanceMarkerLabel: "लाइव एंबुलेंस",
    trafficEtaLabel: (mins: number, km: number) => `${mins} मिनट (${km.toFixed(1)} किमी)`,
    liveGpsBadge: "लाइव GPS",
    trafficCorridorNotice: "ग्रीन कॉरिडोर सक्रिय • रिंग रोड पर सामान्य यातायात",
    speedIndicator: (kmh: number) => `${kmh} किमी/घंटा`,

    stateStepAssigned: "चालक आवंटित",
    stateStepEnRoute: "मरीज की ओर अग्रसर",
    stateStepArrived: "घटनास्थल पर पहुंची",
    activeStatusBanner: "एंबुलेंस सायरन व लाइव जीपीएस टेलीमेट्री के साथ आपके पिकअप स्थल की ओर तेजी से आ रही है।",

    driverSectionTitle: "प्रमाणित पैरामेडिक चालक",
    driverName: "राजेश कुमार",
    driverRoleBadge: "शासकीय प्रमाणित ALS पैरामेडिक",
    driverRatingText: (rating: number, count: number) => `${rating.toFixed(2)} (${count}+ आपातकालीन मिशन)`,
    verifiedDriverBadge: "सत्यापित एवं पृष्ठभूमि प्रमाणित",
    verifiedBadgeShort: "सत्यापित",

    vehicleSectionTitle: "एंबुलेंस विशिष्टता",
    crewSize: (count) => `टीम में लोग: ${count}`,
    licensePlateLabel: "HSRP नंबर प्लेट",
    licensePlateNumber: "DL 1E AM 4092",
    careTierBadge: "टाइप D - एडवांस्ड लाइफ सपोर्ट (ALS)",
    equipmentVentilator: "ट्रांसपोर्ट वेंटिलेटर",
    equipmentDefibrillator: "बाईफेसिक डिफाइब्रिलेटर",
    equipmentOxygen: "2,000 लीटर मेडिकल ऑक्सीजन",
    equipmentParamedic: "ऑनबोर्ड प्रमाणित पैरामेडिक",

    callDriverButton: "चालक को कॉल करें (मास्क्ड)",
    callDriverSubtitle: "सुरक्षित टेलीकॉम रिले • निजी नंबर गुप्त",

    guideHeaderTitle: "आगमन पूर्व तैयारी निर्देश",
    guideHeaderSubtitle: "एंबुलेंस आने तक अत्यंत महत्वपूर्ण प्राथमिक उपचार कदम",
    guideExpandLabel: "महत्वपूर्ण कदम देखें",
    guideCollapseLabel: "निर्देश संक्षिप्त करें",
    guidesBySymptom: {
      chest_pain: {
        symptomName: "हृदय / सीने में दर्द आपातकाल",
        badge: "कार्डियोवैस्कुलर ट्राइएज",
        instructions: [
          {
            stepNumber: 1,
            icon: { set: "mci", name: "chair-rolling" },
            title: "मरीज को पूर्ण विश्राम में रखें",
            description:
              "मरीज को आरामदायक स्थिति में पीठ टिकाकर बैठाएं (घुटने थोड़े मुड़े हुए)। मरीज को चलने या कोई श्रम न करने दें।",
          },
          {
            stepNumber: 2,
            icon: { set: "mci", name: "tie" },
            title: "तंग कपड़े ढीले करें",
            description:
              "कमीज के बटन, कॉलर, टाई या बेल्ट को ढीला करें ताकि सांस लेने में आसानी हो और सीने पर दबाव कम पड़े।",
          },
          {
            stepNumber: 3,
            icon: { set: "mci", name: "pill" },
            title: "डॉक्टर द्वारा सुझाई दवा तैयार रखें",
            description:
              "यदि मरीज को पूर्व में हृदय रोग रहा है और डॉक्टर ने सॉर्बिट्रेट/एस्पिरिन लिखी थी, तो उसे पैरामेडिक के परामर्श हेतु तैयार रखें।",
          },
          {
            stepNumber: 4,
            icon: { set: "mci", name: "door" },
            title: "स्ट्रेचर हेतु रास्ता साफ रखें",
            description:
              "मुख्य दरवाजा खुला रखें, पालतू जानवरों को बांधें और कमरों व सीढ़ियों से सामान हटा लें ताकि स्ट्रेचर तुरंत अंदर आ सके।",
          },
        ],
        warningText:
          "मरीज को अकेला न छोड़ें। मरीज को पानी या भोजन बिल्कुल न दें।",
      },
      severe_bleeding: {
        symptomName: "अत्यधिक रक्तस्राव / गंभीर चोट",
        badge: "ट्रॉमा प्राथमिक उपचार",
        instructions: [
          {
            stepNumber: 1,
            icon: { set: "ion", name: "bandage" },
            title: "घाव पर सीधा मजबूत दबाव बनाएं",
            description:
              "साफ सूती कपड़े या पट्टी से घाव पर सीधा दबाव बनाएं। यदि कपड़ा भीग जाए, तो उसे हटाएं नहीं; उसके ऊपर दूसरा कपड़ा रखकर दबाएं।",
          },
          {
            stepNumber: 2,
            icon: { set: "ion", name: "arrow-up" },
            title: "घायल अंग को ऊपर उठाएं",
            description:
              "यदि हड्डी टूटने की संभावना न हो, तो घायल अंग को हृदय के स्तर से ऊपर उठाएं ताकि रक्तस्राव की गति कम हो सके।",
          },
          {
            stepNumber: 3,
            icon: { set: "mci", name: "coat-rack" },
            title: "मरीज को ठंड व शॉक से बचाएं",
            description:
              "मरीज को चादर या कंबल से ढकें ताकि शरीर का तापमान सामान्य रहे। मरीज को सीधा लिटाएं।",
          },
          {
            stepNumber: 4,
            icon: { set: "ion", name: "clipboard" },
            title: "पहचान पत्र व ब्लड ग्रुप विवरण तैयार रखें",
            description:
              "आधार कार्ड, ज्ञात ब्लड ग्रुप और आपातकालीन फोन नंबर एंबुलेंस दल को तुरंत सौंपने हेतु तैयार रखें।",
          },
        ],
        warningText:
          "घाव में धंसी हुई किसी भी वस्तु को बाहर न निकालें। उसके चारों ओर कपड़ा लपेटें।",
      },
      breathing_difficulty: {
        symptomName: "सांस लेने में अत्यधिक कठिनाई",
        badge: "श्वसन ट्राइएज",
        instructions: [
          {
            stepNumber: 1,
            icon: { set: "mci", name: "chair-rolling" },
            title: "मरीज को सीधा बैठाएं",
            description:
              "मरीज को 75-90 डिग्री कोण पर सीधा बैठाएं। मरीज को कभी भी सीधा न लिटाएं, इससे फेफड़ों पर दबाव बढ़ता है।",
          },
          {
            stepNumber: 2,
            icon: { set: "mci", name: "weather-windy" },
            title: "शुद्ध हवा का प्रवाह सुनिश्चित करें",
            description:
              "खिड़कियां खोलें, पंखा चालू करें और अनावश्यक भीड़ को कमरे से बाहर करें ताकि पर्याप्त ऑक्सीजन मिल सके।",
          },
          {
            stepNumber: 3,
            icon: { set: "mci", name: "weather-windy" },
            title: "इन्हेलर सहायता प्रदान करें",
            description:
              "यदि मरीज को दमा/अस्थमा है और डॉक्टर द्वारा इनहेलर दिया गया है, तो उसे लेने में सहायता करें।",
          },
          {
            stepNumber: 4,
            icon: { set: "mci", name: "meditation" },
            title: "धीमी गति से सांस लेने को कहें",
            description:
              "मरीज को नाक से धीमी सांस लेने और होठों को सिकोड़कर मुंह से बाहर छोड़ने के लिए कहें ताकि घबराहट कम हो।",
          },
        ],
        warningText:
          "मरीज को जबरन न लिटाएं। एंबुलेंस में ऑक्सीजन सिलेंडर व मास्क तुरंत उपलब्ध कराया जाएगा।",
      },
      unconscious: {
        symptomName: "अचेत / बेहोशी की स्थिति",
        badge: "न्यूरोलॉजिकल आपातकाल",
        instructions: [
          {
            stepNumber: 1,
            icon: { set: "ion", name: "refresh" },
            title: "मरीज को करवट देकर लिटाएं (रिकवरी पोजीशन)",
            description:
              "मरीज को धीरे से बाईं करवट लिटाएं और ऊपर वाले पैर को घुटने से मोड़ें ताकि सांस की नली खुली रहे और लार अंदर न जाए।",
          },
          {
            stepNumber: 2,
            icon: { set: "ion", name: "ban" },
            title: "मुंह में कुछ भी न डालें",
            description:
              "बेहोश व्यक्ति के मुंह में पानी, चाय, ग्लूकोज या कोई दवा भूलकर भी न डालें। इससे दम घुट सकता है।",
          },
          {
            stepNumber: 3,
            icon: { set: "mci", name: "lungs" },
            title: "सांस पर निरंतर नजर रखें",
            description:
              "हर 15-30 सेकंड में सीने के उठने-गिरने की जांच करें। यदि सांस बंद हो जाए तो तुरंत सीपीआर (चेस्ट कंप्रेशन) शुरू करें।",
          },
          {
            stepNumber: 4,
            icon: { set: "mci", name: "road-variant" },
            title: "सड़क पर रास्ता दिखाने हेतु व्यक्ति भेजें",
            description:
              "परिवार के किसी सदस्य को मुख्य सड़क या गेट पर भेजें ताकि एंबुलेंस को बिना समय गंवाए सीधा घर तक लाया जा सके।",
          },
        ],
        warningText:
          "मरीज को जोर से न हिलाएं। गर्दन व रीढ़ की हड्डी को स्थिर रखें।",
      },
      default: {
        symptomName: "आपातकालीन प्राथमिक उपचार प्रोटोकॉल",
        badge: "सामान्य प्राथमिक उपचार",
        instructions: [
          {
            stepNumber: 1,
            icon: { set: "mci", name: "sofa" },
            title: "मरीज को शांत रखें",
            description:
              "मरीज को आरामदायक स्थिति में रखें और भरोसा दिलाएं कि आपातकालीन चिकित्सा दल शीघ्र पहुंच रहा है।",
          },
          {
            stepNumber: 2,
            icon: { set: "ion", name: "bulb" },
            title: "घर के बाहर की बत्ती चालू करें",
            description:
              "गेट या बरामदे की बत्ती जला दें ताकि एंबुलेंस चालक रात या अंधेरे में आपके मकान को तुरंत पहचान सके।",
          },
          {
            stepNumber: 3,
            icon: { set: "ion", name: "folder-open" },
            title: "चिकित्सीय पर्चे व दवाइयां निकालें",
            description:
              "मरीज की पुरानी बीमारी के पर्चे, नियमित दवाइयों के नाम व पहचान पत्र एक जगह तैयार रखें।",
          },
          {
            stepNumber: 4,
            icon: { set: "ion", name: "car" },
            title: "रास्ता खाली रखें",
            description:
              "गेट के आगे खड़े वाहनों को हटा लें ताकि एंबुलेंस को दरवाजे तक आने में कोई बाधा न हो।",
          },
        ],
        warningText:
          "यदि मरीज की स्थिति तेजी से बिगड़े तो तुरंत 108 आपातकालीन हेल्पलाइन पर संपर्क करें।",
      },
    },

    fallback108Button: "108 आपातकालीन हेल्पलाइन",
    calling108Notice: "108 आपातकालीन हेल्पलाइन पर संपर्क किया जा रहा है...",
  },
};
