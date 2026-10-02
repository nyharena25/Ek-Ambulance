import { SupportedLanguage } from "./onboardingStrings";

export interface HomeTranslation {
  appName: string;
  profileLabel: string;
  signedInAs: string;
  locationTitle: string;
  locationChecking: string;
  locationReady: string;
  locationNeedsConfirmation: string;
  locationOffHint: string;
  allowLocation: string;
  locationConfirmLater: string;
  requestButtonLabel: string;
  requestSupport: string;
  call108Title: string;
  call108Sub: string;
  activeTitle: string;
  activeStatus: Record<"requesting" | "tracking" | "arrived" | "transporting" | "awaitingReceipt", string>;
  vehicleTypeName: Record<string, string>;
  driverLabel: string;
  vehicleLabel: string;
  etaMinutes: (mins: number) => string;
  openActive: string;
}

export const homeStrings: Record<SupportedLanguage, HomeTranslation> = {
  en: {
    appName: "Ek-Ambulance",
    profileLabel: "Profile and account",
    signedInAs: "Signed in as",
    locationTitle: "Your pickup location",
    locationChecking: "Checking your location…",
    locationReady: "Location ready",
    locationNeedsConfirmation: "Location needs confirmation",
    locationOffHint: "Location is off. You can still request help and set the pickup point on the map.",
    allowLocation: "Allow location",
    locationConfirmLater: "You confirm the exact pickup point before anything is sent.",
    requestButtonLabel: "REQUEST AMBULANCE",
    requestSupport: "Nearest eligible ambulance will be matched to your emergency.",
    call108Title: "Call 108",
    call108Sub: "National emergency helpline",
    activeTitle: "ACTIVE AMBULANCE",
    activeStatus: {
      requesting: "Finding an ambulance",
      tracking: "Ambulance on the way",
      arrived: "Ambulance has arrived",
      transporting: "On the way to hospital",
      awaitingReceipt: "Trip complete - review your receipt",
    },
    vehicleTypeName: { TYPE_D_ALS: "Type D · Advanced Life Support", TYPE_C_BLS: "Type C · Basic Life Support", TYPE_B_PTA: "Type B · Patient Transport", TYPE_A_MFR: "Type A · First Responder" },
    driverLabel: "Driver",
    vehicleLabel: "Vehicle",
    etaMinutes: (mins) => `Arriving in ${mins} min`,
    openActive: "Open",
  },
  hi: {
    appName: "एक-एंबुलेंस",
    profileLabel: "प्रोफ़ाइल और खाता",
    signedInAs: "साइन इन:",
    locationTitle: "आपका पिकअप स्थान",
    locationChecking: "आपकी लोकेशन जाँची जा रही है…",
    locationReady: "लोकेशन तैयार",
    locationNeedsConfirmation: "लोकेशन की पुष्टि ज़रूरी है",
    locationOffHint: "लोकेशन बंद है। आप फिर भी मदद माँग सकते हैं और मैप पर पिकअप स्थान चुन सकते हैं।",
    allowLocation: "लोकेशन की अनुमति दें",
    locationConfirmLater: "कुछ भी भेजने से पहले आप सही पिकअप स्थान की पुष्टि करेंगे।",
    requestButtonLabel: "एम्बुलेंस बुलाएँ",
    requestSupport: "आपकी आपात स्थिति के लिए सबसे पास की उपयुक्त एम्बुलेंस भेजी जाएगी।",
    call108Title: "108 पर कॉल करें",
    call108Sub: "राष्ट्रीय आपातकालीन हेल्पलाइन",
    activeTitle: "सक्रिय एम्बुलेंस",
    activeStatus: {
      requesting: "एम्बुलेंस खोजी जा रही है",
      tracking: "एम्बुलेंस रास्ते में है",
      arrived: "एम्बुलेंस पहुँच गई है",
      transporting: "अस्पताल जा रहे हैं",
      awaitingReceipt: "यात्रा पूरी - अपनी रसीद देखें",
    },
    vehicleTypeName: { TYPE_D_ALS: "टाइप D · एडवांस्ड लाइफ़ सपोर्ट", TYPE_C_BLS: "टाइप C · बेसिक लाइफ़ सपोर्ट", TYPE_B_PTA: "टाइप B · मरीज़ परिवहन", TYPE_A_MFR: "टाइप A · फ़र्स्ट रिस्पॉन्डर" },
    driverLabel: "ड्राइवर",
    vehicleLabel: "वाहन",
    etaMinutes: (mins) => `${mins} मिनट में पहुँचेगी`,
    openActive: "खोलें",
  },
};
