import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Sahayak Driver",
  slug: "sahayak-driver",
  scheme: "sahayak-driver",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#1E3A8A"
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "in.sahayak.driver",
    infoPlist: {
      UIBackgroundModes: ["location", "fetch"]
    }
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#1E3A8A"
    },
    package: "in.sahayak.driver",
    permissions: [
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION",
      "INTERNET",
      "ACCESS_NETWORK_STATE",
      "VIBRATE"
    ]
  },
  plugins: [
    "expo-router",
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission: "Allow Sahayak Driver to access your location to track ambulance dispatch and calculate ETA."
      }
    ]
  ],
  experiments: {
    typedRoutes: true
  },
  extra: {
    gatewayUrl: process.env.EXPO_PUBLIC_GATEWAY_URL || "https://api.sahayak.in",
    centrifugoWsUrl: process.env.EXPO_PUBLIC_CENTRIFUGO_WS_URL || "wss://realtime.sahayak.in/connection/websocket",
    eas: {
      projectId: "ek-ambulance-driver"
    }
  }
});
