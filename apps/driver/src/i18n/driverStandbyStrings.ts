import { AIS125VehicleType } from "@sahayak/domain";
import { SupportedLanguage } from "./driverOnboardingStrings";

export interface DriverStandbyTranslation {
  // Navigation & Header
  appTitle: string;
  driverBadge: string;
  driverName: string;
  vehiclePlate: string;
  pilotStatusOnline: string;
  pilotStatusOffline: string;

  // Ambient Battery & GPS Monitor
  batteryLabel: string;
  batteryCharging: string;
  batteryDischarging: string;
  batteryTempNormal: string;
  batteryWarningCritical: string;
  batteryWarningAction: string;
  gpsSignalLabel: string;
  gpsSignalExcellent: string;
  gpsSignalGood: string;
  gpsSignalPoor: string;
  gpsSatellitesLocked: (count: number) => string;
  gpsNavicSync: string;
  gpsAccuracyMeters: (meters: number) => string;

  // Prominent 'Go Online' / 'Go Offline' Toggle
  btnGoOnline: string;
  btnGoOnlineSubtitle: string;
  btnGoOffline: string;
  btnGoOfflineSubtitle: string;
  onlineBannerStatus: string;
  offlineBannerStatus: string;
  radarScanningNotice: string;
  redisGeoaddActive: string;
  redisGeoaddInactive: string;
  redisKeyLabel: string;
  redisTtlSync: (ttl: number, ping: number) => string;

  // Active Service Area Map
  mapSectionTitle: string;
  mapDispatchRadius: (km: number) => string;
  landmarkPinNorth: string;
  landmarkPinWest: string;
  liveCoordinatesHeader: string;
  latLabel: string;
  lonLabel: string;
  speedLabel: string;
  headingLabel: string;
  precisionLabel: string;
  altitudeLabel: string;
  btnRecenterGps: string;
  landmarksInZone: string;

  // Current Registered Jurisdiction
  jurisdictionSectionTitle: string;
  jurisdictionChangeHint: string;
  jurisdictionNoidaName: string;
  jurisdictionNoidaDistrict: string;
  jurisdictionNoidaStatutory: string;
  jurisdictionSouthDelhiName: string;
  jurisdictionSouthDelhiDistrict: string;
  jurisdictionSouthDelhiStatutory: string;

  // Registered AIS-125 Tier Badge
  ais125TierTitle: string;
  ais125TierBadge: Record<AIS125VehicleType, {
    title: string;
    subtitle: string;
    badge: string;
    equipmentReady: string;
  }>;
  equipmentReadinessHeading: string;
  equipmentReadyStatus: string;

  // Daily Completed Missions & Shift Statistics
  dailyStatsTitle: string;
  statMissionsCompleted: string;
  statMissionsCompletedSubtitle: string;
  statShiftDuration: string;
  statShiftDurationSubtitle: string;
  statDistanceTraveled: string;
  statDistanceTraveledSubtitle: string;
  statGrossTariff: string;
  statGrossTariffSubtitle: string;
  recentMissionTitle: string;
  recentMissionCareBadge: string;
  recentMissionDetails: string;
  recentMissionFare: (fare: number) => string;

  // Offline Confirmation Modal
  offlineModalTitle: string;
  offlineModalSubtitle: string;
  offlineModalReasonShiftEnd: string;
  offlineModalReasonBreak: string;
  offlineModalReasonFuel: string;
  offlineModalConfirmBtn: string;
  offlineModalCancelBtn: string;
}

export const driverStandbyStrings: Record<SupportedLanguage, DriverStandbyTranslation> = {
  en: {
    // Header
    appTitle: "Ek-Ambulance Dispatch Radar",
    driverBadge: "Certified Ambulance Pilot",
    driverName: "Pilot Rajesh Sharma",
    vehiclePlate: "DL 01 AB 7890",
    pilotStatusOnline: "ONLINE • STANDBY FOR DISPATCH",
    pilotStatusOffline: "OFFLINE • SHIFT PAUSED",

    // Ambient Battery & GPS Monitor
    batteryLabel: "Ambulance MDT Battery",
    batteryCharging: "Charging (12V Dash Dock)",
    batteryDischarging: "On Internal Battery",
    batteryTempNormal: "Normal (28°C)",
    batteryWarningCritical: "Warning: Battery below 20%! Connect vehicle 12V charger to ensure uninterrupted emergency dispatch telemetry.",
    batteryWarningAction: "Connect 12V Charger",
    gpsSignalLabel: "GPS / NavIC Satellite Signal",
    gpsSignalExcellent: "EXCELLENT LOCK",
    gpsSignalGood: "GOOD SIGNAL",
    gpsSignalPoor: "DEGRADED SIGNAL",
    gpsSatellitesLocked: (count) => `${count} Satellites Locked (NavIC + GLONASS)`,
    gpsNavicSync: "IRNSS / NavIC Dual-Band Synchronized",
    gpsAccuracyMeters: (meters) => `± ${meters.toFixed(1)}m Accuracy`,

    // Toggle
    btnGoOnline: "GO ONLINE • START DISPATCH SHIFT",
    btnGoOnlineSubtitle: "Broadcasts live coordinates to Redis GEOADD (ambulances:geo) & connects to dispatch engine",
    btnGoOffline: "GO OFFLINE • PAUSE DISPATCH",
    btnGoOfflineSubtitle: "Removes vehicle from dispatch queue and stops real-time geospatial broadcasts",
    onlineBannerStatus: "Ready for High-Acuity Dispatch Offers",
    offlineBannerStatus: "Shift Offline • Dispatch Offers Suspended",
    radarScanningNotice: "Continuous 360° triage radar active. Emergency offers within 15 km will appear instantly.",
    redisGeoaddActive: "Redis GEOADD: ACTIVE",
    redisGeoaddInactive: "Redis GEOADD: INACTIVE",
    redisKeyLabel: "ambulances:geo:tier_d",
    redisTtlSync: (ttl, ping) => `TTL: ${ttl}s • Ping: ${ping}ms • Sync: Every 3s`,

    // Service Area Map
    mapSectionTitle: "Active Dispatch Service Area",
    landmarkPinNorth: "Jaypee / AIIMS",
    landmarkPinWest: "Fortis / Max",
    mapDispatchRadius: (km) => `${km} km Dynamic Response Geofence`,
    liveCoordinatesHeader: "Live Telemetry & Geolocation HUD",
    latLabel: "Latitude",
    lonLabel: "Longitude",
    speedLabel: "Vehicle Speed",
    headingLabel: "Heading",
    precisionLabel: "Precision",
    altitudeLabel: "Elevation",
    btnRecenterGps: "Recenter GPS",
    landmarksInZone: "Key Hospitals in Dispatch Geofence",

    // Jurisdiction
    jurisdictionSectionTitle: "Registered Dispatch Jurisdiction",
    jurisdictionChangeHint: "Tap below to test jurisdictional boundary resolution",
    jurisdictionNoidaName: "Gautam Buddha Nagar, UP",
    jurisdictionNoidaDistrict: "Noida Sector 62 & Greater Noida Zone",
    jurisdictionNoidaStatutory: "UP Motor Vehicles Rules 1998 & AIS-125 Schedule",
    jurisdictionSouthDelhiName: "South Delhi, DL",
    jurisdictionSouthDelhiDistrict: "AIIMS, Saket & Hauz Khas Zone",
    jurisdictionSouthDelhiStatutory: "Delhi Transport Dept. Ambulance Statutory Tariff 2024",

    // AIS-125 Tier Badge
    ais125TierTitle: "Approved AIS-125 Ambulance Classification",
    ais125TierBadge: {
      TYPE_D_ALS: {
        title: "Type D: Advanced Life Support (ALS)",
        subtitle: "Mobile Intensive Care Unit (ICU on Wheels)",
        badge: "CAT 1 • ICU FLEET",
        equipmentReady: "Ventilator: Ready • Multiparameter Monitor: Active • Dual O2: 100% Full • Paramedic: Present",
      },
      TYPE_C_BLS: {
        title: "Type C: Basic Life Support (BLS)",
        subtitle: "Urgent Trauma & Stabilization Ambulance",
        badge: "CAT 2 • URGENT CARE",
        equipmentReady: "AED Defibrillator: Ready • Dual O2: 95% Full • Suction: Active • EMT Crew: Present",
      },
      TYPE_B_PTA: {
        title: "Type B: Patient Transport Ambulance (PTA)",
        subtitle: "Non-Emergency & Dialysis Transit",
        badge: "CAT 3 • PATIENT TRANSIT",
        equipmentReady: "Auto-Stretcher: Inspected • Portable O2: 100% Full • First Aid: Verified",
      },
      TYPE_A_MFR: {
        title: "Type A: Medical First Responder (MFR)",
        subtitle: "Rapid First Response & Urban Interceptor",
        badge: "CAT 4 • RAPID RESPONSE",
        equipmentReady: "AED: Ready • Tactical Bleeding Pack: Sealed • BVM: Calibrated",
      },
    },
    equipmentReadinessHeading: "Statutory Onboard Equipment Readiness",
    equipmentReadyStatus: "100% AIS-125 Compliant",

    // Daily Metrics
    dailyStatsTitle: "Today's Shift Performance",
    statMissionsCompleted: "Missions Done",
    statMissionsCompletedSubtitle: "Triage dispatches",
    statShiftDuration: "Shift Hours",
    statShiftDurationSubtitle: "Online duty time",
    statDistanceTraveled: "Distance Run",
    statDistanceTraveledSubtitle: "GPS tracked",
    statGrossTariff: "Regulated Earnings",
    statGrossTariffSubtitle: "Statutory tariff total",
    recentMissionTitle: "Most Recent Completed Mission",
    recentMissionCareBadge: "ALS CRITICAL CARE",
    recentMissionDetails: "Jaypee Hospital Noida Sector 128 → Max Super Speciality Saket (19.4 km)",
    recentMissionFare: (fare) => `₹ ${fare} (Receipt Verified)`,

    // Offline Modal
    offlineModalTitle: "Confirm Going Offline?",
    offlineModalSubtitle: "Your ambulance will be immediately de-indexed from Redis GEOADD (ambulances:geo). You will no longer receive emergency dispatch alerts.",
    offlineModalReasonShiftEnd: "End of Shift / Relief Pilot Arrived",
    offlineModalReasonBreak: "Meal / Rest Break (30 mins)",
    offlineModalReasonFuel: "Fuel / Vehicle Maintenance / Oxygen Refill",
    offlineModalConfirmBtn: "Yes, Go Offline Now",
    offlineModalCancelBtn: "Remain Online",
  },

  hi: {
    // Header
    appTitle: "Ek-Ambulance डिस्पैच रडार",
    driverBadge: "प्रमाणित एंबुलेंस पायलट",
    driverName: "पायलट राजेश शर्मा",
    vehiclePlate: "DL 01 AB 7890",
    pilotStatusOnline: "ऑनलाइन • डिस्पैच हेतु स्टैंडबाय",
    pilotStatusOffline: "ऑफलाइन • शिफ्ट रुकी हुई",

    // Ambient Battery & GPS Monitor
    batteryLabel: "एंबुलेंस MDT बैटरी स्थिति",
    batteryCharging: "चार्जिंग सक्रिय (12V डैश डॉक)",
    batteryDischarging: "आंतरिक बैटरी पर संचालित",
    batteryTempNormal: "सामान्य तापमान (28°C)",
    batteryWarningCritical: "चेतावनी: बैटरी 20% से कम है! निर्बाध आपातकालीन डिस्पैच टेलीमेट्री हेतु 12V वाहन चार्जर कनेक्ट करें।",
    batteryWarningAction: "12V चार्जर जोड़ें",
    gpsSignalLabel: "GPS / NavIC सैटेलाइट सिग्नल",
    gpsSignalExcellent: "उत्कृष्ट सैटेलाइट लॉक",
    gpsSignalGood: "अच्छा सिग्नल",
    gpsSignalPoor: "कमजोर सैटेलाइट सिग्नल",
    gpsSatellitesLocked: (count) => `${count} सैटेलाइट लॉक (NavIC + GLONASS)`,
    gpsNavicSync: "IRNSS / NavIC दोहरी-बैंड सिंक्रोनाइज़्ड",
    gpsAccuracyMeters: (meters) => `± ${meters.toFixed(1)} मीटर सटीकता`,

    // Toggle
    btnGoOnline: "ऑनलाइन आएं • डिस्पैच शिफ्ट शुरू करें",
    btnGoOnlineSubtitle: "Redis GEOADD (ambulances:geo) में लाइव लोकेशन प्रसारित करता है एवं डिस्पैच इंजन से जोड़ता है",
    btnGoOffline: "ऑफलाइन जाएं • डिस्पैच रोकें",
    btnGoOfflineSubtitle: "वाहन को डिस्पैच कतार से हटाता है और रियल-टाइम लोकेशन प्रसारण बंद करता है",
    onlineBannerStatus: "गंभीर आपातकालीन डिस्पैच कॉल हेतु पूर्णतः तैयार",
    offlineBannerStatus: "शिफ्ट ऑफलाइन • डिस्पैच कॉल्स निलंबित",
    radarScanningNotice: "सक्रिय 360° ट्रायज रडार चालू है। 15 किमी के दायरे में आने वाले आपातकालीन मामले तत्काल प्रदर्शित होंगे।",
    redisGeoaddActive: "Redis GEOADD: सक्रिय",
    redisGeoaddInactive: "Redis GEOADD: निष्क्रिय",
    redisKeyLabel: "ambulances:geo:tier_d",
    redisTtlSync: (ttl, ping) => `TTL: ${ttl}s • पिंग: ${ping}ms • सिंक: प्रत्येक 3s`,

    // Service Area Map
    mapSectionTitle: "सक्रिय डिस्पैच सेवा क्षेत्र",
    landmarkPinNorth: "जेपी / एम्स",
    landmarkPinWest: "फोर्टिस / मैक्स",
    mapDispatchRadius: (km) => `${km} किमी डायनामिक रिस्पॉन्स जियोफेंस`,
    liveCoordinatesHeader: "लाइव टेलीमेट्री एवं जीपीएस HUD",
    latLabel: "अक्षांश (Latitude)",
    lonLabel: "देशांतर (Longitude)",
    speedLabel: "वाहन गति",
    headingLabel: "दिशा (Heading)",
    precisionLabel: "यथार्थता",
    altitudeLabel: "ऊंचाई (Altitude)",
    btnRecenterGps: "GPS रीसेंटर करें",
    landmarksInZone: "जियोफेंस में प्रमुख अस्पताल",

    // Jurisdiction
    jurisdictionSectionTitle: "पंजीकृत डिस्पैच अधिकार क्षेत्र",
    jurisdictionChangeHint: "अधिकार क्षेत्र सीमा परीक्षण हेतु नीचे टैप करें",
    jurisdictionNoidaName: "गौतम बुद्ध नगर, उत्तर प्रदेश",
    jurisdictionNoidaDistrict: "नोएडा सेक्टर 62 एवं ग्रेटर नोएडा क्षेत्र",
    jurisdictionNoidaStatutory: "यूपी मोटर वाहन नियमावली 1998 एवं AIS-125 अनुसूची",
    jurisdictionSouthDelhiName: "दक्षिण दिल्ली, दिल्ली (DL)",
    jurisdictionSouthDelhiDistrict: "एम्स, साकेत एवं हौज खास क्षेत्र",
    jurisdictionSouthDelhiStatutory: "दिल्ली परिवहन विभाग एंबुलेंस वैधानिक दर आदेश 2024",

    // AIS-125 Tier Badge
    ais125TierTitle: "स्वीकृत AIS-125 एंबुलेंस वर्गीकरण",
    ais125TierBadge: {
      TYPE_D_ALS: {
        title: "टाइप D: एडवांस्ड लाइफ सपोर्ट (ALS)",
        subtitle: "मोबाइल गहन चिकित्सा इकाई (पहियों पर ICU)",
        badge: "श्रेणी 1 • मोबाइल ICU",
        equipmentReady: "वेंटिलेटर: तैयार • मल्टीपैरामीटर मॉनिटर: सक्रिय • दोहरा O2: 100% भरा • पैरामेडिक: उपस्थित",
      },
      TYPE_C_BLS: {
        title: "टाइप C: बेसिक लाइफ सपोर्ट (BLS)",
        subtitle: "आपातकालीन आघात एवं स्थिरीकरण एंबुलेंस",
        badge: "श्रेणी 2 • गंभीर चिकित्सा",
        equipmentReady: "AED डिफिब्रिलेटर: तैयार • दोहरा O2: 95% भरा • सक्शन: सक्रिय • EMT क्रू: उपस्थित",
      },
      TYPE_B_PTA: {
        title: "टाइप B: पेशेंट ट्रांसपोर्ट एंबुलेंस (PTA)",
        subtitle: "सामान्य रोगी एवं डायलिसिस स्थानांतरण",
        badge: "श्रेणी 3 • रोगी परिवहन",
        equipmentReady: "स्ट्रेचर: प्रमाणित • पोर्टेबल O2: 100% भरा • फर्स्ट एड: सत्यापित",
      },
      TYPE_A_MFR: {
        title: "टाइप A: मेडिकल फर्स्ट रिस्पॉन्डर (MFR)",
        subtitle: "त्वरित प्राथमिक चिकित्सा एवं ट्रैफिक इंटरसेप्टर",
        badge: "श्रेणी 4 • त्वरित रिस्पॉन्स",
        equipmentReady: "AED: तैयार • टैक्टिकल ब्लीडिंग पैक: सीलबंद • BVM: कैलिब्रेटेड",
      },
    },
    equipmentReadinessHeading: "अनिवार्य ऑनबोर्ड चिकित्सा उपकरणों की स्थिति",
    equipmentReadyStatus: "100% AIS-125 अनुपालन",

    // Daily Metrics
    dailyStatsTitle: "आज की शिफ्ट का प्रदर्शन",
    statMissionsCompleted: "पूर्ण मिशन",
    statMissionsCompletedSubtitle: "सफलतापूर्वक संपन्न",
    statShiftDuration: "शिफ्ट घंटे",
    statShiftDurationSubtitle: "ऑनलाइन ड्यूटी समय",
    statDistanceTraveled: "तय दूरी",
    statDistanceTraveledSubtitle: "जीपीएस ट्रैक किया गया",
    statGrossTariff: "वैधानिक आय",
    statGrossTariffSubtitle: "सरकारी दर के अनुसार",
    recentMissionTitle: "हाल ही में पूर्ण किया गया मिशन",
    recentMissionCareBadge: "ALS गहन चिकित्सा",
    recentMissionDetails: "जेपी अस्पताल नोएडा सेक्टर 128 → मैक्स सुपर स्पेशियलिटी साकेत (19.4 किमी)",
    recentMissionFare: (fare) => `₹ ${fare} (रसीद सत्यापित)`,

    // Offline Modal
    offlineModalTitle: "क्या आप सचमुच ऑफलाइन जाना चाहते हैं?",
    offlineModalSubtitle: "आपकी एंबुलेंस Redis GEOADD (ambulances:geo) से तुरंत हटा दी जाएगी। आपको कोई भी आपातकालीन डिस्पैच ऑफर प्राप्त नहीं होगा।",
    offlineModalReasonShiftEnd: "शिफ्ट समाप्त / रिलीवर पायलट उपस्थित",
    offlineModalReasonBreak: "भोजन / विश्राम अवकाश (30 मिनट)",
    offlineModalReasonFuel: "ईंधन / वाहन सर्विस / ऑक्सीजन रीफिल",
    offlineModalConfirmBtn: "हां, अभी ऑफलाइन जाएं",
    offlineModalCancelBtn: "ऑनलाइन बने रहें",
  },
};
