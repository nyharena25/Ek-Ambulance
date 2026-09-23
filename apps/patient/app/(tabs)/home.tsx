import { View, Text, StyleSheet } from "react-native";
import { colors } from "@sahayak/ui";
import { homeStrings } from "../../src/i18n/homeStrings";

export default function HomeScreen() {
  // No language switcher wired into this route yet; fixed to English until one is.
  const strings = homeStrings.en;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{strings.screenTitle}</Text>
      <Text style={styles.subtitle}>{strings.screenSubtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: colors.white
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.emergency,
    marginBottom: 8
  },
  subtitle: {
    fontSize: 16,
    color: colors.slate600 // nearest existing token
  }
});
