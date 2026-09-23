import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Sahayak Patient",
  slug: "sahayak-patient",
  scheme: "sahayak-patient",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  ios: {
    supportsTablet: false,
    bundleIdentifier: "in.sahayak.patient"
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#DC2626"
    },
    package: "in.sahayak.patient",
    permissions: [
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
      "INTERNET",
      "ACCESS_NETWORK_STATE",
      "VIBRATE"
    ]
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    // Android tiles need a Google Maps SDK key (iOS uses Apple Maps, no key); without it the map falls back to a static panel.
    ["react-native-maps", { androidGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY }],
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#DC2626"
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
      projectId: "ek-ambulance-patient"
    }
  }
});
