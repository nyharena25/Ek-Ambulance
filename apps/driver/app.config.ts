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
      "VIBRATE",
      "POST_NOTIFICATIONS"
    ]
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-notifications",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#1E3A8A"
      }
    ],
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission: "Allow Sahayak Driver to access your location to track ambulance dispatch and calculate ETA.",
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true
      }
    ]
  ],
  experiments: {
    typedRoutes: true
  },
  extra: {
    gatewayUrl: process.env.EXPO_PUBLIC_GATEWAY_URL || "http://localhost:8000",
    centrifugoWsUrl: process.env.EXPO_PUBLIC_CENTRIFUGO_WS_URL || "ws://localhost:8001/connection/websocket",
    eas: {
      projectId: "2459b7b1-95bb-45d7-8b5c-74c029fc6ce9"
    }
  }
});
