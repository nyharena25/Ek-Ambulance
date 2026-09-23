import { Platform } from "react-native";

// react-native-maps is gone from this app (see OsmWebMap.tsx for why: Expo Go can never pick up a
// project's own Android Google Maps key, and testing confirmed Expo Go's own bundled key doesn't
// render tiles either - both mapType="none"+UrlTile and mapType="standard" came back solid black).
// The Leaflet WebView map replaces it on iOS and Android; react-native-webview has no web
// implementation (confirmed: no .web.* entry in the package), so web keeps the static fallback panel.
export const CAN_MOUNT_MAP = Platform.OS !== "web";
// ponytail: volunteer-run OSM mirror, fine for pilots; set EXPO_PUBLIC_MAP_TILE_URL to a keyed
// provider (MapTiler/Stadia) for production load. tile.openstreetmap.org itself is not used here:
// react-native-maps' native UrlTile hit its User-Agent block, though a WebView's own browser-like
// UA likely wouldn't - untested, no reason to switch back off a mirror already proven to work.
export const OSM_TILE_URL = process.env.EXPO_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.de/{z}/{x}/{y}.png";
