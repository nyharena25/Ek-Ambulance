import { View } from "react-native";
import { colors } from "@sahayak/ui";

/** App entry: renders nothing while the session is read; the root layout's auth gate redirects to phone entry or the shift. */
export default function Index() {
  return <View style={{ flex: 1, backgroundColor: colors.white }} />;
}
