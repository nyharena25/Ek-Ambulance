import { ExpoConfig, ConfigContext } from "expo/config";
import { AndroidConfig, withAndroidManifest, type ConfigPlugin } from "expo/config-plugins";

// The grey gear floating over every screen is expo-dev-menu's debug-only FAB (default on). Turn it off in
// dev builds; the menu stays reachable via shake or `m` in Metro. Expo Go ignores this: toggle it in its dev menu.
const DEV_MENU_FAB = "EXDevMenuShowFloatingActionButton";
const withoutDevMenuFab: ConfigPlugin = (cfg) =>
  withAndroidManifest(cfg, (c) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, DEV_MENU_FAB, "false");
    return c;
  });

export default ({ config }: ConfigContext): ExpoConfig => withoutDevMenuFab({
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
    bundleIdentifier: "in.sahayak.patient",
    infoPlist: { [DEV_MENU_FAB]: false }
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
    // No react-native-maps plugin: the map is a Leaflet WebView now (OsmWebMap.tsx), which needs no
    // Google Maps API key and works in Expo Go - see that file for why react-native-maps was dropped.
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
      projectId: "71ee14f5-6fcd-42e9-8160-b4389f23ddb1"
    }
  }
});
