import type { SupportedLanguage } from "./driverOnboardingStrings.ts";

export interface DriverOfflineTranslation {
  // Persistent Non-Blocking Banner
  bannerTitle: string;
  bannerSubtitle: string;
  statusDisconnected: string;
  statusReconnecting: string;
  statusRestored: string;
  pingsQueuedBadge: (count: number) => string;

  // Diagnostics & Control Drawer (Rural UP)
  drawerTitle: string;
  drawerSubtitle: string;
  upGridNoticeTitle: string;
  upGridNoticeBody: string;
  queueStatusTitle: string;
  queueStatusCount: (count: number) => string;
  lastSyncLabel: string;
  lastSyncNever: string;
  lastSyncMinutesAgo: (mins: number) => string;

  // SMS Fallback Actions
  smsFallbackSectionTitle: string;
  smsFallbackDescription: string;
  btnSendSmsPing: string;
  smsPromptConfirm: string;
  smsDestinationDesk: string;
  smsUnavailableNotice: string;
  smsFailedNotice: string;

  // Manual Controls & Reconnection
  btnForceSync: string;
  btnForceSyncActive: string;
  btnCloseDrawer: string;
  restoredBannerNotice: (count: number) => string;

  // Accessibility / Screen Reader Announcements
  a11yBannerHint: string;
  a11ySmsSentConfirmation: string;
}

export const driverOfflineStrings: Record<SupportedLanguage, DriverOfflineTranslation> = {
  en: {
    bannerTitle: "Low Connectivity: Operating in SMS/Store-and-Forward Fallback",
    bannerSubtitle: "Pings are stored safely and will sync automatically once network returns.",
    statusDisconnected: "Centrifugo WebSocket Offline",
    statusReconnecting: "Reconnecting to Grid...",
    statusRestored: "Connectivity Restored",
    pingsQueuedBadge: (count: number) => `${count} Pings Saved`,

    drawerTitle: "UP Rural Connectivity Diagnostics",
    drawerSubtitle: "Autonomous Store-and-Forward & SMS Fallback Protocol",
    upGridNoticeTitle: "Rural Dead Zone Protocol Active",
    upGridNoticeBody:
      "Operating in low/no cellular reception zone (UP Highway / Gramin Belt). Driver navigation, trip logs, and GPS pings are preserved in device storage. Critical milestones can be relayed via SMS carrier fallback.",
    queueStatusTitle: "Local Telemetry Queue",
    queueStatusCount: (count: number) => `${count} telemetry points queued locally`,
    lastSyncLabel: "Last Central Sync",
    lastSyncNever: "None during this mission",
    lastSyncMinutesAgo: (mins: number) => `${mins} min ago`,

    smsFallbackSectionTitle: "Carrier SMS Telemetry Fallback",
    smsFallbackDescription:
      "When GPRS/4G drops completely in rural tehsils, transmit an encrypted location ping directly to the UP 108 Dispatch Control Desk via carrier SMS.",
    btnSendSmsPing: "Send Emergency SMS Ping",
    smsPromptConfirm: "Preparing statutory 108 SMS dispatch ping with current coordinates...",
    smsDestinationDesk: "UP Emergency Dispatch (108 / +91-522-2237515)",
    smsUnavailableNotice: "No SMS-capable app found on this device.",
    smsFailedNotice: "Could not open the SMS app. Try again or call the 108 desk directly.",

    btnForceSync: "Retry Network Sync Now",
    btnForceSyncActive: "Syncing Queued Pings...",
    btnCloseDrawer: "Keep Non-Blocking Banner Visible",
    restoredBannerNotice: (count: number) => `Connectivity Restored: Synced ${count} Queued Pings`,

    a11yBannerHint: "Warning: Low connectivity. Store and forward active. Tap for diagnostics drawer.",
    a11ySmsSentConfirmation: "SMS payload generated. Switching to native messaging app.",
  },
  hi: {
    bannerTitle: "कम कनेक्टिविटी: एसएमएस / स्टोर-एंड-फ़ॉरवर्ड फ़ॉलबैक में संचालित",
    bannerSubtitle: "पिंग स्थानीय रूप से सुरक्षित हैं और नेटवर्क लौटने पर स्वतः सिंक होंगे।",
    statusDisconnected: "सेंट्रीफ्यूगो वेबसॉकेट ऑफलाइन",
    statusReconnecting: "ग्रिड से पुनः जुड़ रहा है...",
    statusRestored: "कनेक्टिविटी बहाल",
    pingsQueuedBadge: (count: number) => `${count} पिंग सुरक्षित`,

    drawerTitle: "यूपी ग्रामीण कनेक्टिविटी डायग्नोस्टिक्स",
    drawerSubtitle: "स्वायत्त स्टोर-एंड-फ़ॉरवर्ड एवं एसएमएस फ़ॉलबैक प्रोटोकॉल",
    upGridNoticeTitle: "ग्रामीण डेड ज़ोन प्रोटोकॉल सक्रिय",
    upGridNoticeBody:
      "कम अथवा शून्य मोबाइल नेटवर्क क्षेत्र (उत्तर प्रदेश राजमार्ग / ग्रामीण क्षेत्र) में संचालन। नेविगेशन, ट्रिप लॉग एवं जीपीएस पिंग डिवाइस स्टोरेज में सुरक्षित हैं। महत्वपूर्ण अपडेट एसएमएस द्वारा भेजे जा सकते हैं।",
    queueStatusTitle: "स्थानीय टेलीमेट्री कतार",
    queueStatusCount: (count: number) => `${count} टेलीमेट्री पॉइंट स्थानीय रूप से कतारबद्ध`,
    lastSyncLabel: "अंतिम केंद्रीय सिंक",
    lastSyncNever: "इस मिशन के दौरान अभी तक नहीं",
    lastSyncMinutesAgo: (mins: number) => `${mins} मिनट पहले`,

    smsFallbackSectionTitle: "कैरियर एसएमएस टेलीमेट्री फ़ॉलबैक",
    smsFallbackDescription:
      "जब ग्रामीण तहसीलों में जीपीआरएस/4G पूरी तरह बंद हो जाए, तब कैरियर एसएमएस द्वारा यूपी 108 नियंत्रण कक्ष को सीधा स्थान पिंग भेजें।",
    btnSendSmsPing: "आपातकालीन एसएमएस पिंग भेजें",
    smsPromptConfirm: "वर्तमान निर्देशांकों के साथ वैधानिक 108 एसएमएस तैयार किया जा रहा है...",
    smsDestinationDesk: "यूपी आपातकालीन नियंत्रण कक्ष (108 / +91-522-2237515)",
    smsUnavailableNotice: "इस डिवाइस पर कोई एसएमएस-सक्षम ऐप नहीं मिला।",
    smsFailedNotice: "एसएमएस ऐप नहीं खुल सका। पुनः प्रयास करें या सीधे 108 डेस्क को कॉल करें।",

    btnForceSync: "अभी नेटवर्क सिंक पुनः प्रयास करें",
    btnForceSyncActive: "कतारबद्ध पिंग सिंक हो रहे हैं...",
    btnCloseDrawer: "नॉन-ब्लॉकिंग बैनर खुला रखें",
    restoredBannerNotice: (count: number) => `कनेक्टिविटी बहाल: ${count} कतारबद्ध पिंग सिंक हो गए`,

    a11yBannerHint: "चेतावनी: कम कनेक्टिविटी। स्टोर-एंड-फ़ॉरवर्ड सक्रिय। विवरण के लिए टैप करें।",
    a11ySmsSentConfirmation: "एसएमएस संदेश तैयार किया गया। मैसेजिंग ऐप खोला जा रहा है।",
  },
};
