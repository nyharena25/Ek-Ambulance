import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, shadows, spacing, typography } from "@sahayak/ui";
import type { DriverAuthTranslation } from "../i18n/driverAuthStrings";
import { AppIcon } from "./AppIcon";

/**
 * The DPDP Act 2023 notice (purposes, rights). Informational on phone entry; with `consent`, the per-purpose checkboxes
 * of the consent step. Checkboxes start unticked: only the driver's own tap is an affirmative grant.
 */
export function DpdpNoticeCard({
  strings,
  consent,
}: {
  strings: DriverAuthTranslation;
  consent?: { location: boolean; credential: boolean; onToggle: (purpose: "location" | "credential") => void };
}) {
  return (
    <View style={styles.dpdpCard}>
      <View style={styles.dpdpCardHeader}>
        <View style={styles.dpdpBadge}>
          <Text style={styles.dpdpBadgeText}>{strings.dpdpActTag}</Text>
        </View>
        <Text style={styles.dpdpCardTitle}>{strings.dpdpNoticeTitle}</Text>
      </View>
      <Text style={styles.dpdpPreambleText}>{strings.dpdpPreamble}</Text>

      <View style={styles.purposesContainer}>
        {strings.dpdpPurposes.map((p, idx) => (
          <View key={idx} style={styles.purposeItem}>
            <Text style={styles.purposeBullet}>•</Text>
            <View style={styles.purposeTextGroup}>
              <Text style={styles.purposeTitle}>{p.title}: </Text>
              <Text style={styles.purposeDescription}>{p.description}</Text>
            </View>
          </View>
        ))}
      </View>

      {consent && (
        <>
          <View style={styles.dpdpDivider} />
          <View style={styles.checkboxGroup}>
            {(
              [
                ["location", consent.location, strings.consentLocationLabel],
                ["credential", consent.credential, strings.consentCredentialLabel],
              ] as const
            ).map(([purpose, checked, label]) => (
              <Pressable
                key={purpose}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                accessibilityLabel={label}
                style={styles.checkboxRow}
                onPress={() => consent.onToggle(purpose)}
              >
                <View style={[styles.checkboxBox, checked && styles.checkboxBoxChecked]}>
                  {checked && <AppIcon icon={{ set: "ion", name: "checkmark" }} size={14} style={styles.checkboxCheckmark} />}
                </View>
                <Text style={styles.checkboxLabel}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <Text style={styles.dpdpRightsFootnote}>{strings.dpdpRightsNotice}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dpdpCard: {
    backgroundColor: colors.slate50,
    borderRadius: radii.xl,
    padding: spacing.base,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    ...shadows.sm,
  },
  dpdpCardHeader: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
  dpdpBadge: { backgroundColor: colors.slate200, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.sm, marginRight: spacing.sm },
  dpdpBadgeText: { fontSize: 10, fontWeight: typography.fontWeights.extrabold, color: colors.slate800, textTransform: "uppercase" },
  dpdpCardTitle: { flex: 1, fontSize: typography.fontSizes.sm, fontWeight: typography.fontWeights.bold, color: colors.slate900 },
  dpdpPreambleText: { fontSize: typography.fontSizes.xs, lineHeight: 18, color: colors.slate700, marginBottom: spacing.sm },
  purposesContainer: { gap: 6, marginBottom: spacing.md },
  purposeItem: { flexDirection: "row", alignItems: "flex-start" },
  purposeBullet: { fontSize: 14, color: colors.emergency, marginRight: 6, lineHeight: 18 },
  purposeTextGroup: { flex: 1, flexDirection: "row", flexWrap: "wrap" },
  purposeTitle: { fontSize: typography.fontSizes.xs, fontWeight: typography.fontWeights.bold, color: colors.slate900, lineHeight: 18 },
  purposeDescription: { fontSize: typography.fontSizes.xs, color: colors.slate700, lineHeight: 18 },
  dpdpDivider: { height: 1, backgroundColor: colors.slate300, marginVertical: spacing.md },
  checkboxGroup: { gap: spacing.md, marginBottom: spacing.md },
  checkboxRow: { flexDirection: "row", alignItems: "flex-start", minHeight: 44 },
  checkboxBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.slate700,
    backgroundColor: colors.white,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
    marginTop: 2,
  },
  checkboxBoxChecked: { backgroundColor: colors.emergency, borderColor: colors.emergencyDark },
  checkboxCheckmark: { color: colors.white, fontSize: 14, fontWeight: "800" },
  checkboxLabel: { flex: 1, fontSize: typography.fontSizes.xs, lineHeight: 18, color: colors.slate900, fontWeight: typography.fontWeights.medium },
  dpdpRightsFootnote: { fontSize: 11, lineHeight: 16, color: colors.slate600, fontStyle: "italic" },
});
