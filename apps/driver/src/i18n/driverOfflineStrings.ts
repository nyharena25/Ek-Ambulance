import type { SupportedLanguage } from "./driverOnboardingStrings.ts";

export interface DriverOfflineTranslation {
  // Persistent Non-Blocking Banner
  bannerTitle: string;
  statusDisconnected: string;
  statusReconnecting: string;
  /** The server refused the session: retrying the network alone will not help. */
  statusAuthRequired: string;
  bannerTitleAuthRequired: string;
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
  smsDestinationDesk: string;
  smsUnavailableNotice: string;
  smsFailedNotice: string;

  // Manual Controls & Reconnection
  btnForceSync: string;
  btnForceSyncActive: string;
  btnCloseDrawer: string;
  /** Refreshes the session and restarts the realtime connection (not a queue flush). */
  btnReconnect: string;
  btnReconnectActive: string;
  a11yDismiss: string;
  restoredBannerNotice: (count: number) => string;

  // Accessibility / Screen Reader Announcements
  a11yBannerHint: string;
  a11ySmsSentConfirmation: string;
}

export const driverOfflineStrings: Record<SupportedLanguage, DriverOfflineTranslation> = {
  en: {
    bannerTitle: "Low Connectivity: Operating in SMS/Store-and-Forward Fallback",
    statusDisconnected: "Live connection offline",
    statusReconnecting: "Reconnecting to Grid...",
    statusAuthRequired: "Session not accepted by dispatch",
    bannerTitleAuthRequired: "Dispatch link paused: session could not be verified. Updates are stored on this device.",
    pingsQueuedBadge: (count: number) => `${count} Pings Saved`,

    drawerTitle: "Connectivity Diagnostics",
    drawerSubtitle: "Autonomous Store-and-Forward & SMS Fallback Protocol",
    upGridNoticeTitle: "Store-and-Forward Active",
    upGridNoticeBody:
      "The live dispatch link is down. Location updates are kept on this device and sent automatically when it is back. Critical milestones can be relayed by SMS to 108.",
    queueStatusTitle: "Saved location updates",
    queueStatusCount: (count: number) => `${count} location updates waiting to send`,
    lastSyncLabel: "Last Central Sync",
    lastSyncNever: "None during this mission",
    lastSyncMinutesAgo: (mins: number) => (mins < 1 ? "Less than a minute ago" : `${mins} min ago`),

    smsFallbackSectionTitle: "SMS fallback",
    smsFallbackDescription:
      "When GPRS/4G drops completely in rural tehsils, send your mission id and last known location to 108 by carrier SMS. Your SMS app opens with the message; you press Send.",
    btnSendSmsPing: "Send Emergency SMS Ping",
    smsDestinationDesk: "Sent to: 108 (emergency dispatch)",
    smsUnavailableNotice: "No SMS-capable app found on this device.",
    smsFailedNotice: "Could not open the SMS app. Try again or call the 108 desk directly.",

    btnForceSync: "Retry Network Sync Now",
    btnForceSyncActive: "Syncing Queued Pings...",
    btnCloseDrawer: "Keep Non-Blocking Banner Visible",
    btnReconnect: "Reconnect Now",
    btnReconnectActive: "Reconnecting...",
    a11yDismiss: "Dismiss",
    restoredBannerNotice: (count: number) => `Connectivity Restored: Synced ${count} Queued Pings`,

    a11yBannerHint: "Warning: Low connectivity. Store and forward active. Tap for diagnostics drawer.",
    a11ySmsSentConfirmation: "SMS payload generated. Switching to native messaging app.",
  },
  hi: {
    bannerTitle: "कम कनेक्टिविटी: एसएमएस / स्टोर-एंड-फ़ॉरवर्ड फ़ॉलबैक में संचालित",
    statusDisconnected: "लाइव कनेक्शन ऑफ़लाइन",
    statusReconnecting: "ग्रिड से पुनः जुड़ रहा है...",
    statusAuthRequired: "डिस्पैच ने सत्र स्वीकार नहीं किया",
    bannerTitleAuthRequired: "डिस्पैच लिंक रुका: सत्र की पुष्टि नहीं हो सकी। अपडेट इस डिवाइस पर सुरक्षित हैं।",
    pingsQueuedBadge: (count: number) => `${count} पिंग सुरक्षित`,

    drawerTitle: "कनेक्टिविटी डायग्नोस्टिक्स",
    drawerSubtitle: "स्वायत्त स्टोर-एंड-फ़ॉरवर्ड एवं एसएमएस फ़ॉलबैक प्रोटोकॉल",
    upGridNoticeTitle: "स्टोर-एंड-फ़ॉरवर्ड सक्रिय",
    upGridNoticeBody:
      "लाइव डिस्पैच लिंक बंद है। लोकेशन अपडेट इस डिवाइस पर सुरक्षित हैं और लिंक लौटते ही स्वतः भेजे जाएंगे। महत्वपूर्ण अपडेट एसएमएस द्वारा 108 पर भेजे जा सकते हैं।",
    queueStatusTitle: "सहेजे गए लोकेशन अपडेट",
    queueStatusCount: (count: number) => `${count} लोकेशन अपडेट भेजे जाने बाकी`,
    lastSyncLabel: "अंतिम केंद्रीय सिंक",
    lastSyncNever: "इस मिशन के दौरान अभी तक नहीं",
    lastSyncMinutesAgo: (mins: number) => (mins < 1 ? "एक मिनट से कम पहले" : `${mins} मिनट पहले`),

    smsFallbackSectionTitle: "SMS विकल्प",
    smsFallbackDescription:
      "जब ग्रामीण तहसीलों में जीपीआरएस/4G पूरी तरह बंद हो जाए, तब कैरियर एसएमएस द्वारा 108 को मिशन आईडी व अंतिम ज्ञात स्थान भेजें। एसएमएस ऐप संदेश के साथ खुलेगा; भेजें आप दबाएंगे।",
    btnSendSmsPing: "आपातकालीन एसएमएस पिंग भेजें",
    smsDestinationDesk: "प्राप्तकर्ता: 108 (आपातकालीन डिस्पैच)",
    smsUnavailableNotice: "इस डिवाइस पर कोई एसएमएस-सक्षम ऐप नहीं मिला।",
    smsFailedNotice: "एसएमएस ऐप नहीं खुल सका। पुनः प्रयास करें या सीधे 108 डेस्क को कॉल करें।",

    btnForceSync: "अभी नेटवर्क सिंक पुनः प्रयास करें",
    btnForceSyncActive: "कतारबद्ध पिंग सिंक हो रहे हैं...",
    btnCloseDrawer: "नॉन-ब्लॉकिंग बैनर खुला रखें",
    btnReconnect: "अभी फिर से जोड़ें",
    btnReconnectActive: "फिर से जोड़ रहा है...",
    a11yDismiss: "बंद करें",
    restoredBannerNotice: (count: number) => `कनेक्टिविटी बहाल: ${count} कतारबद्ध पिंग सिंक हो गए`,

    a11yBannerHint: "चेतावनी: कम कनेक्टिविटी। स्टोर-एंड-फ़ॉरवर्ड सक्रिय। विवरण के लिए टैप करें।",
    a11ySmsSentConfirmation: "एसएमएस संदेश तैयार किया गया। मैसेजिंग ऐप खोला जा रहा है।",
  },
};
