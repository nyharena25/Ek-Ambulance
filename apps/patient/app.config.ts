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
  newArchEnabled: true,
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#DC2626"
  },
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
  plugins: ["expo-router"],
  experiments: {
    typedRoutes: true
  },
  extra: {
    gatewayUrl: process.env.EXPO_PUBLIC_GATEWAY_URL || "https://api.sahayak.in",
    centrifugoWsUrl: process.env.EXPO_PUBLIC_CENTRIFUGO_WS_URL || "wss://realtime.sahayak.in/connection/websocket",
    eas: {
      projectId: "ek-ambulance-patient"
    }
  }
});
