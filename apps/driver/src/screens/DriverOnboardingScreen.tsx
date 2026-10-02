import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Platform,
  StatusBar,
  Modal,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, typography, spacing, radii, shadows } from "@sahayak/ui";
import { AIS125VehicleType } from "@sahayak/domain";
import {
  driverOnboardingStrings,
  SupportedLanguage,
  AIS125TypeDetails,
} from "../i18n/driverOnboardingStrings";
import {
  useDriverOnboardingStore,
  DocumentSlotKey,
  EMTLevel,
} from "../state/driverOnboarding.store";
import { getServerAdapter } from "../state/driverLifecycle.store";
import { documentUploadErrorMessage } from "../lib/kycSubmission.core";
import { useDriverProfileStore } from "../state/driverProfile.store";

import { AppIcon } from "../components";
export interface DriverOnboardingScreenProps {
  initialLanguage?: SupportedLanguage;
  onFinishOnboarding?: (result: {
    trackingId: string;
    vehicleType: AIS125VehicleType;
  }) => void;
  onBackToAuth?: () => void;
}

export default function DriverOnboardingScreen({
  initialLanguage,
  onFinishOnboarding,
  onBackToAuth,
}: DriverOnboardingScreenProps) {
  const {
    currentStep,
    language,
    formData,
    documents,
    stepErrors,
    isSubmitting,
    submissionResult,
    setStep,
    setLanguage,
    toggleLanguage,
    updateField,
    setAIS125VehicleType,
    removeDocument,
    uploadRealDocument,
    validateCurrentStep,
    clearStepErrors,
    submitApplication,
    initForRealSession,
  } = useDriverOnboardingStore();

  // If initialLanguage passed and differs from store, set it once
  React.useEffect(() => {
    if (initialLanguage && initialLanguage !== language) {
      setLanguage(initialLanguage);
    }
  }, [initialLanguage]);

  // Real session: start the wizard empty (never the __DEV__ pre-filled DL/plate/5-already-uploaded seed).
  // A no-op once the driver has real input, so this can't fire again and wipe an in-progress edit.
  React.useEffect(() => {
    if (getServerAdapter()) initForRealSession();
  }, []);

  // A real application already submitted/approved is a status to show, not a wizard pre-loaded with fake
  // data to re-submit over it - kycStatus comes from the real get_driver_profile load (useServerSync).
  const realKycStatus = useDriverProfileStore((s) => s.profile?.kycStatus);
  const kycRejectReason = useDriverProfileStore((s) => (s.profile?.kycStatus === "rejected" ? s.profile.kycRejectReason : null));
  const profileLoading = useDriverProfileStore((s) => s.status === "loading");
  const showSubmittedStatus = Boolean(getServerAdapter()) && (realKycStatus === "pending_verification" || realKycStatus === "approved");

  const strings = driverOnboardingStrings[language];
  const activeErrors = stepErrors[currentStep] || [];

  // Modal state for the document-source action sheet (Camera/Gallery/PDF all route to the real picker)
  const [activeUploadSlot, setActiveUploadSlot] = useState<{
    key: DocumentSlotKey;
    label: string;
  } | null>(null);

  // Quick suggestion vehicles
  const vehicleSuggestions = [
    "Force Traveller 3350",
    "Tata Winger Ambulance",
    "Mahindra Bolero Maxi",
    "Maruti Suzuki Eeco",
  ];

  const handleNextStep = () => {
    const isValid = validateCurrentStep();
    if (isValid) {
      clearStepErrors(currentStep);
      setStep(currentStep + 1);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      clearStepErrors(currentStep);
      setStep(currentStep - 1);
    } else if (onBackToAuth) {
      onBackToAuth();
    }
  };

  const handleSubmit = async () => {
    const isValid = validateCurrentStep();
    if (!isValid) return;

    const success = await submitApplication();
    // Read fresh from the store, not the render-time destructure above: submitApplication just mutated it,
    // and this closure's own submissionResult/submissionError locals are the pre-await (stale) values - using
    // them here silently skips onFinishOnboarding on a real success and skips the Alert on a real failure.
    const { submissionResult: freshResult, submissionError: freshError } = useDriverOnboardingStore.getState();
    if (success && onFinishOnboarding && freshResult) {
      onFinishOnboarding({
        trackingId: freshResult.trackingId,
        vehicleType: freshResult.vehicleType,
      });
    } else if (!success && freshError) {
      // The real path's server error code (documents_missing, dl_expired, vehicle_missing, ...) - not
      // translated per-code yet, but never silently swallowed either.
      const message =
        freshError === "documents_invalid"
          ? language === "en"
            ? "A required document was not accepted. Upload a replacement for each rejected document, then submit again."
            : "एक आवश्यक दस्तावेज़ स्वीकार नहीं हुआ। हर अस्वीकृत दस्तावेज़ की जगह नया अपलोड करें, फिर से जमा करें।"
          : freshError;
      Alert.alert(language === "en" ? "Submission not recorded" : "जमा दर्ज नहीं हुआ", message);
    }
  };

  const handlePickDocument = async (_sourceType: string) => {
    if (!activeUploadSlot) return;
    const { key } = activeUploadSlot;
    setActiveUploadSlot(null);
    // Real OS document picker (Files, which on most devices also surfaces Photos/cloud storage), then the
    // real upload path. uploadRealDocument no-ops without a real server session.
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/jpeg", "image/png"],
      copyToCacheDirectory: true,
    });
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset) return;
    await uploadRealDocument(key, { uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? null });
  };

  // A failed upload says why on its own slot (never only a silent "error" status).
  const renderUploadError = (key: DocumentSlotKey) => {
    const doc = documents[key];
    if (doc?.status !== "error") return null;
    return (
      <Text style={styles.uploadErrorText} accessibilityRole="alert">
        {documentUploadErrorMessage(doc.errorCode ?? "", doc.errorDetail)}
      </Text>
    );
  };

  // Render Step 1: Commercial Driver's License
  const renderStep1 = () => (
    <View style={styles.stepContentContainer}>
      <View style={styles.sectionHeaderCard}>
        <View style={styles.sectionHeaderIconBox}>
          <AppIcon icon={{ set: "mci", name: "card-account-details" }} size={22} color={colors.slate700} style={styles.sectionHeaderIcon} />
        </View>
        <View style={styles.sectionHeaderTextWrap}>
          <Text style={styles.sectionHeaderTitle}>{strings.step1Header}</Text>
          <Text style={styles.sectionHeaderDesc}>{strings.step1Description}</Text>
        </View>
      </View>

      {/* CDL Number */}
      <View style={styles.formGroup}>
        <Text style={styles.fieldLabel}>
          {strings.dlNumberLabel} <Text style={styles.requiredStar}>*</Text>
        </Text>
        <TextInput
          style={styles.textInput}
          value={formData.commercialDlNumber}
          onChangeText={(val) => updateField("commercialDlNumber", val.toUpperCase())}
          placeholder={strings.dlNumberPlaceholder}
          placeholderTextColor={colors.slate400}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Text style={styles.fieldHelper}>{strings.dlNumberHelp}</Text>
      </View>

      {/* Row: Expiry & State */}
      <View style={styles.formRow}>
        <View style={[styles.formGroup, styles.flex1]}>
          <Text style={styles.fieldLabel}>
            {strings.dlExpiryLabel} <Text style={styles.requiredStar}>*</Text>
          </Text>
          <TextInput
            style={styles.textInput}
            value={formData.dlExpiry}
            onChangeText={(val) => updateField("dlExpiry", val)}
            placeholder={strings.dlExpiryPlaceholder}
            placeholderTextColor={colors.slate400}
          />
        </View>
        <View style={[styles.formGroup, styles.flex1]}>
          <Text style={styles.fieldLabel}>
            {strings.dlStateLabel} <Text style={styles.requiredStar}>*</Text>
          </Text>
          <TextInput
            style={styles.textInput}
            value={formData.dlState}
            onChangeText={(val) => updateField("dlState", val)}
            placeholder={strings.dlStatePlaceholder}
            placeholderTextColor={colors.slate400}
          />
        </View>
      </View>

      {/* PSV Badge */}
      <View style={styles.formGroup}>
        <Text style={styles.fieldLabel}>
          {strings.psvBadgeLabel} <Text style={styles.requiredStar}>*</Text>
        </Text>
        <TextInput
          style={styles.textInput}
          value={formData.psvBadgeNumber}
          onChangeText={(val) => updateField("psvBadgeNumber", val.toUpperCase())}
          placeholder={strings.psvBadgePlaceholder}
          placeholderTextColor={colors.slate400}
          autoCapitalize="characters"
        />
        <Text style={styles.fieldHelper}>{strings.psvBadgeHelp}</Text>
      </View>

      {/* AIS-125 CLASSIFICATION SELECTOR */}
      <View style={styles.ais125Section}>
        <View style={styles.ais125HeaderBar}>
          <Text style={styles.ais125MainHeading}>{strings.ais125SelectorTitle}</Text>
          <View style={styles.ais125StandardBadge}>
            <Text style={styles.ais125StandardBadgeText}>{strings.ais125StandardBadge}</Text>
          </View>
        </View>
        <Text style={styles.ais125MainSub}>{strings.ais125SelectorDescription}</Text>

        {/* Categories Cards */}
        {strings.ais125Categories.map((cat: AIS125TypeDetails) => {
          const isSelected = formData.ais125VehicleType === cat.id;
          return (
            <Pressable
              key={cat.id}
              style={[
                styles.ais125Card,
                isSelected && styles.ais125CardSelected,
              ]}
              onPress={() => setAIS125VehicleType(cat.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
            >
              {/* Top Banner */}
              <View style={styles.ais125CardTop}>
                <View style={styles.ais125IconNameRow}>
                  <AppIcon icon={cat.icon} size={28} color={colors.slate700} />
                  <View style={styles.ais125TitleBox}>
                    <Text
                      style={[
                        styles.ais125CardName,
                        isSelected && styles.ais125CardNameSelected,
                      ]}
                    >
                      {cat.name}
                    </Text>
                    <Text style={styles.ais125CardSub}>{cat.subtitle}</Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.radioOuter,
                    isSelected && styles.radioOuterSelected,
                  ]}
                >
                  {isSelected && <View style={styles.radioInner} />}
                </View>
              </View>

              {/* Badge & Standard Tag */}
              <View style={styles.ais125TagRow}>
                <View
                  style={[
                    styles.tierBadge,
                    isSelected ? styles.tierBadgeSelected : styles.tierBadgeDefault,
                  ]}
                >
                  <Text
                    style={[
                      styles.tierBadgeText,
                      isSelected && styles.tierBadgeTextSelected,
                    ]}
                  >
                    {cat.badge}
                  </Text>
                </View>
                <Text style={styles.regulatoryTagText}>{cat.regulatoryStandard}</Text>
              </View>

              <Text style={styles.ais125Desc}>{cat.description}</Text>

              {/* Staffing Requirement */}
              <View style={styles.staffingNoticeBox}>
                <Text style={styles.staffingLabel}><AppIcon icon={{ set: "ion", name: "people" }} />{" "}{strings.staffingLabel}:</Text>
                <Text style={styles.staffingValue}>{cat.staffing}</Text>
              </View>

              {/* Mandatory Equipment Checklist */}
              <View style={styles.equipmentContainer}>
                <Text style={styles.equipmentHeading}>
                  <AppIcon icon={{ set: "ion", name: "settings" }} />{" "}{strings.equipmentLabel}:
                </Text>
                <View style={styles.equipmentPillsWrap}>
                  {cat.mandatoryEquipment.map((eq, i) => (
                    <View key={i} style={styles.equipmentPill}>
                      <Text style={styles.equipmentPillDot}>•</Text>
                      <Text style={styles.equipmentPillText}>{eq}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Selection Confirmation Bar */}
              {isSelected && (
                <View style={styles.selectedConfirmedBar}>
                  <Text style={styles.selectedConfirmedText}>
                    <AppIcon icon={{ set: "ion", name: "checkmark" }} />{" "}{strings.selectedAIS125Summary(cat.code)}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* DL Upload Card Preview */}
      <View style={styles.docUploadCard}>
        <View style={styles.docUploadCardHeader}>
          <Text style={styles.docUploadTitle}><AppIcon icon={{ set: "ion", name: "document-text" }} />{" "}{strings.cdlUploadHeading}</Text>
          <View
            style={[
              styles.statusChip,
              documents.commercial_dl?.status === "uploaded"
                ? styles.statusChipUploaded
                : styles.statusChipPending,
            ]}
          >
            <Text
              style={[
                styles.statusChipText,
                documents.commercial_dl?.status === "uploaded"
                  ? styles.statusChipTextUploaded
                  : styles.statusChipTextPending,
              ]}
            >
              {documents.commercial_dl?.status === "uploaded"
                ? <><AppIcon icon={{ set: "ion", name: "checkmark" }} size={11} />{" "}{strings.statusUploaded}</>
                : strings.statusNotUploaded}
            </Text>
          </View>
        </View>
        <Text style={styles.docUploadSub}>{strings.cdlUploadNotice}</Text>
        {renderUploadError("commercial_dl")}
        {documents.commercial_dl?.status === "uploaded" ? (
          <View style={styles.uploadedFileRow}>
            <View style={styles.fileIconBox}>
              <AppIcon icon={{ set: "ion", name: "document-text" }} size={18} color={colors.slate700} style={styles.fileIcon} />
            </View>
            <View style={styles.fileDetails}>
              <Text style={styles.fileName} numberOfLines={1}>
                {documents.commercial_dl.fileName}
              </Text>
              <Text style={styles.fileMeta}>
                {documents.commercial_dl.fileSize} • {documents.commercial_dl.uploadedAt}
              </Text>
            </View>
            <Pressable
              onPress={() => removeDocument("commercial_dl")}
              style={styles.fileRemoveBtn}
            >
              <Text style={styles.fileRemoveBtnText}>{strings.removeButtonText}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={styles.uploadActionBtn}
            onPress={() =>
              setActiveUploadSlot({
                key: "commercial_dl",
                label: "COMMERCIAL_DL",
              })
            }
          >
            <Text style={styles.uploadActionBtnText}><AppIcon icon={{ set: "ion", name: "arrow-up" }} />{" "}{strings.uploadButtonText}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  // Render Step 2: EMT Certification
  const renderStep2 = () => (
    <View style={styles.stepContentContainer}>
      <View style={styles.sectionHeaderCard}>
        <View style={styles.sectionHeaderIconBox}>
          <AppIcon icon={{ set: "mci", name: "stethoscope" }} size={22} color={colors.slate700} style={styles.sectionHeaderIcon} />
        </View>
        <View style={styles.sectionHeaderTextWrap}>
          <Text style={styles.sectionHeaderTitle}>{strings.step2Header}</Text>
          <Text style={styles.sectionHeaderDesc}>{strings.step2Description}</Text>
        </View>
      </View>

      {/* EMT Level Selector */}
      <Text style={styles.fieldLabel}>
        {strings.emtLevelLabel} <Text style={styles.requiredStar}>*</Text>
      </Text>
      <View style={styles.emtLevelsGrid}>
        {strings.emtLevels.map((lvl) => {
          const isSelected = formData.emtLevel === lvl.id;
          return (
            <Pressable
              key={lvl.id}
              style={[
                styles.emtLevelCard,
                isSelected && styles.emtLevelCardSelected,
              ]}
              onPress={() => updateField("emtLevel", lvl.id as EMTLevel)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
            >
              <View style={styles.emtLevelHeader}>
                <View style={styles.radioOuter}>
                  {isSelected && <View style={styles.radioInner} />}
                </View>
                <Text
                  style={[
                    styles.emtLevelTitle,
                    isSelected && styles.emtLevelTitleSelected,
                  ]}
                >
                  {lvl.title}
                </Text>
              </View>
              <Text style={styles.emtLevelSubtitle}>{lvl.subtitle}</Text>
              <View style={styles.emtTagBox}>
                <Text style={styles.emtTagText}>{lvl.tag}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* EMT Certificate Number */}
      <View style={styles.formGroup}>
        <Text style={styles.fieldLabel}>
          {strings.emtNumberLabel} <Text style={styles.requiredStar}>*</Text>
        </Text>
        <TextInput
          style={styles.textInput}
          value={formData.emtNumber}
          onChangeText={(val) => updateField("emtNumber", val.toUpperCase())}
          placeholder={strings.emtNumberPlaceholder}
          placeholderTextColor={colors.slate400}
          autoCapitalize="characters"
        />
      </View>

      {/* Issuing Council */}
      <View style={styles.formGroup}>
        <Text style={styles.fieldLabel}>
          {strings.emtCouncilLabel} <Text style={styles.requiredStar}>*</Text>
        </Text>
        <TextInput
          style={styles.textInput}
          value={formData.emtCouncil}
          onChangeText={(val) => updateField("emtCouncil", val)}
          placeholder={strings.emtCouncilPlaceholder}
          placeholderTextColor={colors.slate400}
        />
      </View>

      {/* Expiry Date */}
      <View style={styles.formGroup}>
        <Text style={styles.fieldLabel}>
          {strings.emtExpiryLabel} <Text style={styles.requiredStar}>*</Text>
        </Text>
        <TextInput
          style={styles.textInput}
          value={formData.emtExpiry}
          onChangeText={(val) => updateField("emtExpiry", val)}
          placeholder={strings.emtExpiryPlaceholder}
          placeholderTextColor={colors.slate400}
        />
      </View>

      {/* Checkbox toggles for ACLS & BLS */}
      <View style={styles.certCheckRow}>
        <Pressable
          style={styles.checkboxContainer}
          onPress={() => updateField("isAclsCertified", !formData.isAclsCertified)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: formData.isAclsCertified }}
        >
          <View
            style={[
              styles.checkboxBox,
              formData.isAclsCertified && styles.checkboxBoxChecked,
            ]}
          >
            {formData.isAclsCertified && <AppIcon icon={{ set: "ion", name: "checkmark" }} size={14} style={styles.checkboxTick} />}
          </View>
          <View style={styles.checkboxTextWrap}>
            <Text style={styles.checkboxTitle}>{strings.aclsCertifiedLabel}</Text>
            <Text style={styles.checkboxSub}>{strings.aclsCertifiedSub}</Text>
          </View>
        </Pressable>

        <Pressable
          style={styles.checkboxContainer}
          onPress={() => updateField("isBlsCertified", !formData.isBlsCertified)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: formData.isBlsCertified }}
        >
          <View
            style={[
              styles.checkboxBox,
              formData.isBlsCertified && styles.checkboxBoxChecked,
            ]}
          >
            {formData.isBlsCertified && <AppIcon icon={{ set: "ion", name: "checkmark" }} size={14} style={styles.checkboxTick} />}
          </View>
          <View style={styles.checkboxTextWrap}>
            <Text style={styles.checkboxTitle}>{strings.blsCertifiedLabel}</Text>
            <Text style={styles.checkboxSub}>{strings.blsCertifiedSub}</Text>
          </View>
        </Pressable>
      </View>

      {/* EMT Certificate Upload Slot */}
      <View style={styles.docUploadCard}>
        <View style={styles.docUploadCardHeader}>
          <Text style={styles.docUploadTitle}><AppIcon icon={{ set: "mci", name: "script-text" }} />{" "}{strings.emtUploadHeading}</Text>
          <View
            style={[
              styles.statusChip,
              documents.emt_certificate?.status === "uploaded"
                ? styles.statusChipUploaded
                : styles.statusChipPending,
            ]}
          >
            <Text
              style={[
                styles.statusChipText,
                documents.emt_certificate?.status === "uploaded"
                  ? styles.statusChipTextUploaded
                  : styles.statusChipTextPending,
              ]}
            >
              {documents.emt_certificate?.status === "uploaded"
                ? <><AppIcon icon={{ set: "ion", name: "checkmark" }} size={11} />{" "}{strings.statusUploaded}</>
                : strings.statusNotUploaded}
            </Text>
          </View>
        </View>
        {renderUploadError("emt_certificate")}
        {documents.emt_certificate?.status === "uploaded" ? (
          <View style={styles.uploadedFileRow}>
            <View style={styles.fileIconBox}>
              <AppIcon icon={{ set: "ion", name: "document-text" }} size={18} color={colors.slate700} style={styles.fileIcon} />
            </View>
            <View style={styles.fileDetails}>
              <Text style={styles.fileName} numberOfLines={1}>
                {documents.emt_certificate.fileName}
              </Text>
              <Text style={styles.fileMeta}>
                {documents.emt_certificate.fileSize} • {documents.emt_certificate.uploadedAt}
              </Text>
            </View>
            <Pressable
              onPress={() => removeDocument("emt_certificate")}
              style={styles.fileRemoveBtn}
            >
              <Text style={styles.fileRemoveBtnText}>{strings.removeButtonText}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={styles.uploadActionBtn}
            onPress={() =>
              setActiveUploadSlot({
                key: "emt_certificate",
                label: "EMT_CERTIFICATE",
              })
            }
          >
            <Text style={styles.uploadActionBtnText}><AppIcon icon={{ set: "ion", name: "arrow-up" }} />{" "}{strings.uploadButtonText}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  // Render Step 3: Vehicle Registration & AIS-125 Classification
  const renderStep3 = () => (
    <View style={styles.stepContentContainer}>
      <View style={styles.sectionHeaderCard}>
        <View style={styles.sectionHeaderIconBox}>
          <AppIcon icon={{ set: "mci", name: "ambulance" }} size={22} color={colors.slate700} style={styles.sectionHeaderIcon} />
        </View>
        <View style={styles.sectionHeaderTextWrap}>
          <Text style={styles.sectionHeaderTitle}>{strings.step3Header}</Text>
          <Text style={styles.sectionHeaderDesc}>{strings.step3Description}</Text>
        </View>
      </View>

      {/* License Plate Input with Indian Number Plate Graphic */}
      <View style={styles.formGroup}>
        <Text style={styles.fieldLabel}>
          {strings.vehicleRegLabel} <Text style={styles.requiredStar}>*</Text>
        </Text>
        <View style={styles.plateInputContainer}>
          <View style={styles.plateIndBadge}>
            <Text style={styles.plateIndText}>IND</Text>
            <AppIcon icon={{ set: "ion", name: "ellipse-outline" }} size={8} color={colors.slate700} style={styles.plateChakra} />
          </View>
          <TextInput
            style={styles.plateTextInput}
            value={formData.vehicleRegistrationNumber}
            onChangeText={(val) =>
              updateField("vehicleRegistrationNumber", val.toUpperCase())
            }
            placeholder={strings.vehicleRegPlaceholder}
            placeholderTextColor={colors.slate400}
            autoCapitalize="characters"
          />
        </View>
        <Text style={styles.fieldHelper}>{strings.vehicleRegHelp}</Text>
      </View>

      {/* Make & Model */}
      <View style={styles.formGroup}>
        <Text style={styles.fieldLabel}>
          {strings.makeModelLabel} <Text style={styles.requiredStar}>*</Text>
        </Text>
        <TextInput
          style={styles.textInput}
          value={formData.makeModel}
          onChangeText={(val) => updateField("makeModel", val)}
          placeholder={strings.makeModelPlaceholder}
          placeholderTextColor={colors.slate400}
        />
        {/* Suggestion Chips */}
        <View style={styles.suggestionChipsRow}>
          {vehicleSuggestions.map((sug) => (
            <Pressable
              key={sug}
              style={styles.suggestionChip}
              onPress={() => updateField("makeModel", sug)}
            >
              <Text style={styles.suggestionChipText}>{sug}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Row: Year & VIN */}
      <View style={styles.formRow}>
        <View style={[styles.formGroup, { width: "38%" }]}>
          <Text style={styles.fieldLabel}>
            {strings.manufactureYearLabel} <Text style={styles.requiredStar}>*</Text>
          </Text>
          <TextInput
            style={styles.textInput}
            value={formData.manufactureYear}
            onChangeText={(val) => updateField("manufactureYear", val)}
            placeholder={strings.manufactureYearPlaceholder}
            placeholderTextColor={colors.slate400}
            keyboardType="numeric"
            maxLength={4}
          />
        </View>
        <View style={[styles.formGroup, { flex: 1 }]}>
          <Text style={styles.fieldLabel}>
            {strings.vinChassisLabel} <Text style={styles.requiredStar}>*</Text>
          </Text>
          <TextInput
            style={styles.textInput}
            value={formData.vinChassisNumber}
            onChangeText={(val) => updateField("vinChassisNumber", val.toUpperCase())}
            placeholder={strings.vinChassisPlaceholder}
            placeholderTextColor={colors.slate400}
            autoCapitalize="characters"
          />
        </View>
      </View>

      {/* RC Document Upload */}
      <View style={styles.docUploadCard}>
        <View style={styles.docUploadCardHeader}>
          <Text style={styles.docUploadTitle}><AppIcon icon={{ set: "ion", name: "clipboard" }} />{" "}{strings.rcUploadHeading}</Text>
          <View
            style={[
              styles.statusChip,
              documents.vehicle_rc?.status === "uploaded"
                ? styles.statusChipUploaded
                : styles.statusChipPending,
            ]}
          >
            <Text
              style={[
                styles.statusChipText,
                documents.vehicle_rc?.status === "uploaded"
                  ? styles.statusChipTextUploaded
                  : styles.statusChipTextPending,
              ]}
            >
              {documents.vehicle_rc?.status === "uploaded"
                ? <><AppIcon icon={{ set: "ion", name: "checkmark" }} size={11} />{" "}{strings.statusUploaded}</>
                : strings.statusNotUploaded}
            </Text>
          </View>
        </View>
        {renderUploadError("vehicle_rc")}
        {documents.vehicle_rc?.status === "uploaded" ? (
          <View style={styles.uploadedFileRow}>
            <View style={styles.fileIconBox}>
              <AppIcon icon={{ set: "ion", name: "document-text" }} size={18} color={colors.slate700} style={styles.fileIcon} />
            </View>
            <View style={styles.fileDetails}>
              <Text style={styles.fileName} numberOfLines={1}>
                {documents.vehicle_rc.fileName}
              </Text>
              <Text style={styles.fileMeta}>
                {documents.vehicle_rc.fileSize} • {documents.vehicle_rc.uploadedAt}
              </Text>
            </View>
            <Pressable
              onPress={() => removeDocument("vehicle_rc")}
              style={styles.fileRemoveBtn}
            >
              <Text style={styles.fileRemoveBtnText}>{strings.removeButtonText}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={styles.uploadActionBtn}
            onPress={() =>
              setActiveUploadSlot({
                key: "vehicle_rc",
                label: "VEHICLE_RC",
              })
            }
          >
            <Text style={styles.uploadActionBtnText}><AppIcon icon={{ set: "ion", name: "arrow-up" }} />{" "}{strings.uploadButtonText}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  // Render Step 4: Statutory Document Uploads (ARAI & Fitness Permits)
  const renderStep4 = () => (
    <View style={styles.stepContentContainer}>
      <View style={styles.sectionHeaderCard}>
        <View style={styles.sectionHeaderIconBox}>
          <AppIcon icon={{ set: "ion", name: "shield-checkmark" }} size={22} color={colors.slate700} style={styles.sectionHeaderIcon} />
        </View>
        <View style={styles.sectionHeaderTextWrap}>
          <Text style={styles.sectionHeaderTitle}>{strings.step4Header}</Text>
          <Text style={styles.sectionHeaderDesc}>{strings.step4Description}</Text>
        </View>
      </View>

      {/* Mandatory Statutory Highlight Banners */}
      {/* 1. ARAI Banner */}
      <View style={styles.statutoryHighlightCard}>
        <View style={styles.statutoryBadgeRow}>
          <View style={styles.statutoryAlertBadge}>
            <Text style={styles.statutoryAlertBadgeText}>{strings.statutoryMandatoryBadge}</Text>
          </View>
          <Text style={styles.statutoryRefText}>{strings.araiStatutoryRef}</Text>
        </View>
        <Text style={styles.statutoryCardTitle}>{strings.araiHighlightBoxTitle}</Text>
        <Text style={styles.statutoryCardDesc}>{strings.araiHighlightBoxDescription}</Text>
      </View>

      {/* 2. Fitness Permit Banner */}
      <View style={styles.statutoryHighlightCard}>
        <View style={styles.statutoryBadgeRow}>
          <View style={styles.statutoryAlertBadge}>
            <Text style={styles.statutoryAlertBadgeText}>{strings.statutoryMandatoryBadge}</Text>
          </View>
          <Text style={styles.statutoryRefText}>{strings.fitnessStatutoryRef}</Text>
        </View>
        <Text style={styles.statutoryCardTitle}>{strings.fitnessHighlightBoxTitle}</Text>
        <Text style={styles.statutoryCardDesc}>{strings.fitnessHighlightBoxDescription}</Text>
      </View>

      {/* List of Document Slots */}
      <Text style={styles.docSectionHeading}>{strings.mandatoryDocsTitle}</Text>

      {strings.documentSlots.map((slot) => {
        const docState = documents[slot.key];
        const isUploaded = docState?.status === "uploaded";
        const isUploading = docState?.status === "uploading";

        return (
          <View
            key={slot.id}
            style={[
              styles.statutoryDocSlotCard,
              slot.mandatory && styles.statutoryDocSlotMandatory,
              isUploaded && styles.statutoryDocSlotUploaded,
            ]}
          >
            <View style={styles.slotHeaderRow}>
              <View style={styles.slotTitleBox}>
                <View style={styles.slotTitleBadgeRow}>
                  <Text style={styles.slotTitleText}>{slot.title}</Text>
                  {slot.mandatory && (
                    <View style={styles.requiredBadge}>
                      <Text style={styles.requiredBadgeText}>{strings.requiredBadgeLabel}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.slotSubtitleText}>{slot.subtitle}</Text>
                <Text style={styles.slotRefText}><AppIcon icon={{ set: "ion", name: "scale" }} size={11} />{" "}{slot.regulatoryReference}</Text>
              </View>

              {/* Status Chip */}
              <View
                style={[
                  styles.statusChip,
                  isUploaded
                    ? styles.statusChipUploaded
                    : isUploading
                    ? styles.statusChipUploading
                    : styles.statusChipPending,
                ]}
              >
                <Text
                  style={[
                    styles.statusChipText,
                    isUploaded
                      ? styles.statusChipTextUploaded
                      : isUploading
                      ? styles.statusChipTextUploading
                      : styles.statusChipTextPending,
                  ]}
                >
                  {isUploaded
                    ? <><AppIcon icon={{ set: "ion", name: "checkmark" }} size={11} />{" "}{strings.statusUploaded}</>
                    : isUploading
                    ? strings.statusUploading
                    : strings.statusNotUploaded}
                </Text>
              </View>
            </View>

            {renderUploadError(slot.key)}
            {/* Uploaded state details or upload trigger */}
            {isUploaded ? (
              <View style={styles.uploadedFileRow}>
                <View style={styles.fileIconBox}>
                  <AppIcon icon={{ set: "ion", name: "document-text" }} size={18} color={colors.slate700} style={styles.fileIcon} />
                </View>
                <View style={styles.fileDetails}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {docState.fileName}
                  </Text>
                  <Text style={styles.fileMeta}>
                    {docState.fileSize} • {docState.uploadedAt}
                  </Text>
                </View>
                <View style={styles.docActionBtnsRow}>
                  <Pressable
                    onPress={() =>
                      setActiveUploadSlot({
                        key: slot.key,
                        label: slot.key,
                      })
                    }
                    style={styles.fileReuploadBtn}
                  >
                    <Text style={styles.fileReuploadBtnText}>
                      {strings.reuploadButtonText}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => removeDocument(slot.key)}
                    style={styles.fileRemoveBtn}
                  >
                    <Text style={styles.fileRemoveBtnText}>{strings.removeButtonText}</Text>
                  </Pressable>
                </View>
              </View>
            ) : isUploading ? (
              <View style={styles.uploadingProgressRow}>
                <ActivityIndicator size="small" color={colors.emergency} />
                <Text style={styles.uploadingText}>{strings.statusUploading}</Text>
              </View>
            ) : (
              <Pressable
                style={styles.slotUploadActionBtn}
                onPress={() =>
                  setActiveUploadSlot({
                    key: slot.key,
                    label: slot.key,
                  })
                }
              >
                <Text style={styles.slotUploadActionBtnText}>
                  <AppIcon icon={{ set: "ion", name: "share" }} />{" "}{strings.uploadButtonText} ({slot.acceptedFormats})
                </Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );

  if (showSubmittedStatus) {
    const approved = realKycStatus === "approved";
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
        <View style={[styles.stepContentContainer, { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xl }]}>
          <AppIcon
            icon={{ set: "ion", name: approved ? "checkmark-circle" : "time" }}
            size={48}
            color={approved ? colors.success : colors.slate600}
          />
          <Text style={{ fontSize: typography.fontSizes.lg, fontWeight: typography.fontWeights.bold, color: colors.slate900, marginTop: spacing.md, textAlign: "center" }}>
            {approved
              ? (language === "en" ? "KYC Approved" : "KYC स्वीकृत")
              : (language === "en" ? "Application Under Review" : "आवेदन समीक्षाधीन है")}
          </Text>
          <Text style={{ fontSize: typography.fontSizes.sm, color: colors.slate600, marginTop: spacing.sm, textAlign: "center" }}>
            {approved
              ? (language === "en" ? "You're verified and can go online from the standby screen." : "आप सत्यापित हैं और स्टैंडबाय स्क्रीन से ऑनलाइन जा सकते हैं।")
              : (language === "en" ? "Your documents are being reviewed. Tap \"Check status\" to see if a decision has been made." : "आपके दस्तावेज़ों की समीक्षा की जा रही है। निर्णय देखने के लिए \"स्थिति जांचें\" दबाएं।")}
          </Text>
          {!approved && (
            <Pressable
              accessibilityRole="button"
              disabled={profileLoading}
              onPress={() => void useDriverProfileStore.getState().load()}
              style={{ marginTop: spacing.lg, minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.lg, borderRadius: 8, borderWidth: 1, borderColor: colors.slate600, opacity: profileLoading ? 0.5 : 1 }}
            >
              <Text style={{ color: colors.slate900, fontWeight: typography.fontWeights.semibold }}>
                {language === "en" ? "Check status" : "स्थिति जांचें"}
              </Text>
            </Pressable>
          )}
          {onBackToAuth && (
            <Pressable accessibilityRole="button" onPress={onBackToAuth} style={{ marginTop: spacing.xl, minHeight: 44, justifyContent: "center" }}>
              <Text style={{ color: colors.slate600, fontWeight: typography.fontWeights.semibold, textDecorationLine: "underline" }}>
                {language === "en" ? "Back" : "वापस"}
              </Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* TOP NAVBAR & STATUTORY HEADER */}
      <View style={styles.topHeader}>
        <View style={styles.brandRow}>
          <View style={styles.emblemBadge}>
            <AppIcon icon={{ set: "mci", name: "ambulance" }} size={22} color={colors.slate700} style={styles.emblemIcon} />
          </View>
          <View style={styles.brandTextWrap}>
            <Text style={styles.brandTitle}>{strings.screenTitle}</Text>
            <Text style={styles.brandSubtitle}>{strings.screenSubtitle}</Text>
          </View>
        </View>

        {/* Bilingual Switcher Toggle */}
        <Pressable
          style={styles.langToggleBtn}
          onPress={toggleLanguage}
          accessibilityRole="button"
          accessibilityLabel="Switch language between English and Hindi"
        >
          <View
            style={[
              styles.langPill,
              language === "en" && styles.langPillActive,
            ]}
          >
            <Text
              style={[
                styles.langPillText,
                language === "en" && styles.langPillTextActive,
              ]}
            >
              EN
            </Text>
          </View>
          <View
            style={[
              styles.langPill,
              language === "hi" && styles.langPillActive,
            ]}
          >
            <Text
              style={[
                styles.langPillText,
                language === "hi" && styles.langPillTextActive,
              ]}
            >
              हिन्दी
            </Text>
          </View>
        </Pressable>
      </View>

      {/* STATUTORY REGULATION NOTICE BANNER */}
      <View style={styles.statutoryBanner}>
        <Text style={styles.statutoryBadgeText}>{strings.appBadge}</Text>
        <Text style={styles.statutoryNoticeText} numberOfLines={1}>
          {strings.morthComplianceNotice}
        </Text>
      </View>

      {/* Staff rejected the application (reject_kyc): say why, so the driver knows what to fix before resubmitting. */}
      {realKycStatus === "rejected" && (
        <View accessibilityRole="alert" style={{ margin: spacing.md, padding: spacing.md, borderRadius: 8, borderWidth: 1, borderColor: colors.triageRed, backgroundColor: colors.triageRedSurface }}>
          <Text style={{ fontWeight: typography.fontWeights.bold, color: colors.triageRedText }}>
            {language === "en" ? "Application not approved" : "आवेदन स्वीकृत नहीं हुआ"}
          </Text>
          {kycRejectReason ? <Text style={{ color: colors.slate900, marginTop: spacing.xs }}>{kycRejectReason}</Text> : null}
          <Text style={{ color: colors.slate600, marginTop: spacing.xs }}>
            {language === "en" ? "Fix the details or documents below and submit again." : "नीचे विवरण या दस्तावेज़ ठीक करें और फिर से जमा करें।"}
          </Text>
        </View>
      )}

      {/* 4-STEP WIZARD PROGRESS TRACKER */}
      <View style={styles.stepperContainer}>
        {[1, 2, 3, 4].map((stepNum) => {
          const isActive = currentStep === stepNum;
          const isCompleted = currentStep > stepNum;
          const stepTitle =
            stepNum === 1
              ? strings.step1Title
              : stepNum === 2
              ? strings.step2Title
              : stepNum === 3
              ? strings.step3Title
              : strings.step4Title;

          return (
            <Pressable
              key={stepNum}
              style={styles.stepItem}
              onPress={() => {
                if (stepNum < currentStep) setStep(stepNum);
              }}
              disabled={stepNum > currentStep}
            >
              <View
                style={[
                  styles.stepBubble,
                  isActive && styles.stepBubbleActive,
                  isCompleted && styles.stepBubbleCompleted,
                ]}
              >
                <Text
                  style={[
                    styles.stepBubbleText,
                    isActive && styles.stepBubbleTextActive,
                    isCompleted && styles.stepBubbleTextCompleted,
                  ]}
                >
                  {isCompleted ? (
                    <AppIcon icon={{ set: "ion", name: "checkmark" }} size={13} />
                  ) : (
                    stepNum
                  )}
                </Text>
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  isActive && styles.stepLabelActive,
                  isCompleted && styles.stepLabelCompleted,
                ]}
                numberOfLines={1}
              >
                {stepTitle}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ERROR BANNER IF CURRENT STEP HAS VALIDATION FAILURES */}
      {activeErrors.length > 0 && (
        <View style={styles.errorAlertBanner}>
          <AppIcon icon={{ set: "ion", name: "warning" }} size={18} color={colors.slate700} style={styles.errorAlertIcon} />
          <View style={styles.errorAlertTextWrap}>
            <Text style={styles.errorAlertTitle}>
              {language === "en"
                ? "Please correct the following before continuing:"
                : "कृपया आगे बढ़ने से पूर्व निम्न त्रुटियों को सुधारें:"}
            </Text>
            {activeErrors.map((errKey, idx) => {
              let msg = strings.errorMissingRequired;
              if (errKey === "VALIDATION_INVALID_DL") msg = strings.errorInvalidDL;
              if (errKey === "VALIDATION_EXPIRED_DL") msg = strings.errorExpiredDL;
              if (errKey === "VALIDATION_MISSING_PSV") msg = strings.errorMissingPSV;
              if (errKey === "VALIDATION_MISSING_EMT") msg = strings.errorMissingEMT;
              if (errKey === "VALIDATION_INVALID_VEHICLE_REG")
                msg = strings.errorInvalidVehicleReg;
              if (errKey === "VALIDATION_MISSING_AIS125") msg = strings.errorMissingAIS125;
              if (errKey === "VALIDATION_MISSING_ARAI") msg = strings.errorMissingARAI;
              if (errKey === "VALIDATION_MISSING_FITNESS") msg = strings.errorMissingFitness;
              if (errKey === "VALIDATION_MISSING_RC") msg = strings.errorMissingRC;

              return (
                <Text key={idx} style={styles.errorAlertDetail}>
                  • {msg}
                </Text>
              );
            })}
          </View>
        </View>
      )}

      {/* SCROLLABLE FORM BODY */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
        {currentStep === 4 && renderStep4()}
      </ScrollView>

      {/* STICKY BOTTOM ACTION BAR */}
      <View style={styles.bottomBar}>
        <Pressable
          hitSlop={10}
          style={styles.backButton}
          onPress={handlePrevStep}
          disabled={isSubmitting}
        >
          <Text style={styles.backButtonText}><AppIcon icon={{ set: "ion", name: "arrow-back" }} />{" "}{strings.buttonBack}</Text>
        </Pressable>

        {currentStep < 4 ? (
          <Pressable style={styles.continueButton} onPress={handleNextStep}>
            <Text style={styles.continueButtonText}>{strings.buttonNext}{" "}<AppIcon icon={{ set: "ion", name: "arrow-forward" }} /></Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <View style={styles.submittingRow}>
                <ActivityIndicator size="small" color={colors.white} />
                <Text style={styles.submitButtonText}>{strings.submittingText}</Text>
              </View>
            ) : (
              <Text style={styles.submitButtonText}><AppIcon icon={{ set: "ion", name: "checkmark" }} />{" "}{strings.buttonSubmit}</Text>
            )}
          </Pressable>
        )}
      </View>

      {/* DOCUMENT UPLOAD ACTION SHEET MODAL */}
      <Modal
        visible={activeUploadSlot !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveUploadSlot(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.actionSheetCard}>
            <Text style={styles.actionSheetTitle}>
              {language === "en" ? "Upload Document" : "दस्तावेज अपलोड करें"}
            </Text>
            <Text style={styles.actionSheetSub}>
              {activeUploadSlot?.key === "arai_certificate"
                ? strings.araiHighlightBoxTitle
                : activeUploadSlot?.key === "fitness_permit"
                ? strings.fitnessHighlightBoxTitle
                : activeUploadSlot?.label}
            </Text>

            <Pressable
              style={styles.actionSheetOption}
              onPress={() => handlePickDocument("CAMERA")}
            >
              <AppIcon icon={{ set: "ion", name: "camera" }} size={22} color={colors.slate700} style={styles.actionSheetOptionIcon} />
              <Text style={styles.actionSheetOptionText}>{strings.filePickerCamera}</Text>
            </Pressable>

            <Pressable
              style={styles.actionSheetOption}
              onPress={() => handlePickDocument("GALLERY")}
            >
              <AppIcon icon={{ set: "ion", name: "image" }} size={22} color={colors.slate700} style={styles.actionSheetOptionIcon} />
              <Text style={styles.actionSheetOptionText}>{strings.filePickerGallery}</Text>
            </Pressable>

            <Pressable
              style={styles.actionSheetOption}
              onPress={() => handlePickDocument("PDF")}
            >
              <AppIcon icon={{ set: "ion", name: "document-text" }} size={22} color={colors.slate700} style={styles.actionSheetOptionIcon} />
              <Text style={styles.actionSheetOptionText}>{strings.filePickerPdf}</Text>
            </Pressable>

            <Pressable
              style={styles.actionSheetCancelBtn}
              onPress={() => setActiveUploadSlot(null)}
            >
              <Text style={styles.actionSheetCancelText}>{strings.cancelText}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* SUBMISSION SUCCESS MODAL */}
      <Modal
        visible={submissionResult !== null}
        transparent
        animationType="slide"
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.successModalCard}>
            <View style={styles.successBadgeCircle}>
              <AppIcon icon={{ set: "ion", name: "checkmark" }} size={32} style={styles.successBadgeCheck} />
            </View>

            <Text style={styles.successTitle}>{strings.successTitle}</Text>
            <Text style={styles.successSubtitle}>{strings.successSubtitle}</Text>

            {/* Verification Details Box */}
            <View style={styles.successDetailsBox}>
              <View style={styles.successDetailRow}>
                <Text style={styles.successDetailLabel}>
                  {strings.applicationIdLabel}:
                </Text>
                <Text style={styles.successDetailValue}>
                  {submissionResult?.trackingId}
                </Text>
              </View>

              <View style={styles.successDetailRow}>
                <Text style={styles.successDetailLabel}>
                  {strings.categoryRegisteredLabel}:
                </Text>
                <View style={styles.successCategoryPill}>
                  <Text style={styles.successCategoryPillText}>
                    {submissionResult?.careLevelCode}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={styles.successReviewNotice}>{strings.reviewTimeNotice}</Text>
            <Text style={styles.successHelplineNotice}>{strings.helplineNotice}</Text>

            <Pressable
              style={styles.successContinueBtn}
              onPress={() => {
                if (onFinishOnboarding && submissionResult) {
                  onFinishOnboarding({
                    trackingId: submissionResult.trackingId,
                    vehicleType: submissionResult.vehicleType,
                  });
                }
              }}
            >
              <Text style={styles.successContinueBtnText}>
                {strings.goToDashboardButton}{" "}
                <AppIcon icon={{ set: "ion", name: "arrow-forward" }} size={15} />
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.white,
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate200,
    backgroundColor: colors.white,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  emblemBadge: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: colors.emergencyLight,
    borderWidth: 1,
    borderColor: colors.emergencyBorder,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  emblemIcon: {
    fontSize: 22,
  },
  brandTextWrap: {
    flex: 1,
  },
  brandTitle: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    lineHeight: typography.lineHeights.base,
  },
  brandSubtitle: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    lineHeight: typography.lineHeights.xs,
  },
  langToggleBtn: {
    flexDirection: "row",
    backgroundColor: colors.slate100,
    borderRadius: radii.full,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.slate300,
  },
  langPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.full,
  },
  langPillActive: {
    backgroundColor: colors.emergency,
  },
  langPillText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate700,
  },
  langPillTextActive: {
    color: colors.white,
    fontWeight: typography.fontWeights.bold,
  },
  statutoryBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.infoLight,
    paddingHorizontal: spacing.base,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate200,
  },
  statutoryBadgeText: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.info,
    backgroundColor: colors.white,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.info,
    marginRight: spacing.sm,
  },
  statutoryNoticeText: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate700,
    flex: 1,
  },

  // Stepper
  stepperContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.slate50,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate200,
  },
  stepItem: {
    flex: 1,
    alignItems: "center",
  },
  stepBubble: {
    width: 28,
    height: 28,
    borderRadius: radii.full,
    backgroundColor: colors.slate200,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  stepBubbleActive: {
    backgroundColor: colors.emergency,
    borderWidth: 2,
    borderColor: colors.emergencyDark,
  },
  stepBubbleCompleted: {
    backgroundColor: colors.success,
  },
  stepBubbleText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate600,
  },
  stepBubbleTextActive: {
    color: colors.white,
  },
  stepBubbleTextCompleted: {
    color: colors.white,
  },
  stepLabel: {
    fontSize: 11,
    color: colors.slate600,
    textAlign: "center",
    lineHeight: 14,
  },
  stepLabelActive: {
    color: colors.emergencyDark,
    fontWeight: typography.fontWeights.bold,
  },
  stepLabelCompleted: {
    color: colors.slate800,
    fontWeight: typography.fontWeights.medium,
  },

  // Error Alert
  errorAlertBanner: {
    flexDirection: "row",
    backgroundColor: colors.emergencyLight,
    borderWidth: 1,
    borderColor: colors.emergencyBorder,
    padding: spacing.md,
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    borderRadius: radii.md,
  },
  errorAlertIcon: {
    fontSize: 18,
    marginRight: spacing.sm,
  },
  errorAlertTextWrap: {
    flex: 1,
  },
  errorAlertTitle: {
    flexShrink: 1,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.emergencyDark,
    marginBottom: 4,
  },
  errorAlertDetail: {
    flexShrink: 1,
    fontSize: typography.fontSizes.xs,
    color: colors.slate900,
    lineHeight: typography.lineHeights.xs,
    marginBottom: 2,
  },

  // Scroll Body
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
    paddingBottom: 40,
  },
  stepContentContainer: {
    gap: spacing.base,
  },

  // Section Header Card
  sectionHeaderCard: {
    flexDirection: "row",
    backgroundColor: colors.slate50,
    padding: spacing.base,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.slate200,
    marginBottom: spacing.xs,
  },
  sectionHeaderIconBox: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.slate300,
    marginRight: spacing.md,
  },
  sectionHeaderIcon: {
    fontSize: 22,
  },
  sectionHeaderTextWrap: {
    flex: 1,
  },
  sectionHeaderTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    lineHeight: typography.lineHeights.lg,
    marginBottom: 4,
  },
  sectionHeaderDesc: {
    fontSize: typography.fontSizes.sm,
    color: colors.slate700,
    lineHeight: typography.lineHeights.sm,
  },

  // Form Fields
  formGroup: {
    marginBottom: spacing.sm,
  },
  formRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  flex1: {
    flex: 1,
  },
  fieldLabel: {
    flexShrink: 1,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate900,
    marginBottom: 6,
    lineHeight: typography.lineHeights.sm,
  },
  requiredStar: {
    color: colors.emergency,
    fontWeight: typography.fontWeights.bold,
  },
  fieldHelper: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    marginTop: 4,
    lineHeight: typography.lineHeights.xs,
  },
  textInput: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    borderRadius: radii.md,
    paddingHorizontal: spacing.base,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    fontSize: typography.fontSizes.base,
    color: colors.slate900,
    minHeight: 48,
  },

  // Indian Plate Graphic Input
  plateInputContainer: {
    flexDirection: "row",
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.slate900,
    borderRadius: radii.md,
    overflow: "hidden",
    minHeight: 52,
    alignItems: "center",
  },
  plateIndBadge: {
    backgroundColor: colors.info, // nearest existing token; Indigo/Blue IND badge
    paddingHorizontal: 8,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: colors.slate300,
  },
  plateIndText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: typography.fontWeights.extrabold,
    letterSpacing: 0.5,
  },
  plateChakra: {
    fontSize: 8,
    marginTop: 2,
  },
  plateTextInput: {
    flex: 1,
    paddingHorizontal: spacing.base,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    letterSpacing: 2,
  },

  // Suggestion Chips
  suggestionChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  suggestionChip: {
    backgroundColor: colors.slate100,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.slate300,
  },
  suggestionChipText: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate800,
    fontWeight: typography.fontWeights.medium,
  },

  // EMT Levels Grid
  emtLevelsGrid: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  emtLevelCard: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  emtLevelCardSelected: {
    borderColor: colors.emergency,
    backgroundColor: colors.emergencyLight,
  },
  emtLevelHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: radii.full,
    borderWidth: 2,
    borderColor: colors.slate400,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  radioOuterSelected: {
    borderColor: colors.emergency,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: radii.full,
    backgroundColor: colors.emergency,
  },
  emtLevelTitle: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    flex: 1,
  },
  emtLevelTitleSelected: {
    color: colors.emergencyDark,
  },
  emtLevelSubtitle: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate700,
    marginLeft: 30,
    marginBottom: 6,
    lineHeight: typography.lineHeights.xs,
  },
  emtTagBox: {
    alignSelf: "flex-start",
    backgroundColor: colors.slate100,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.sm,
    marginLeft: 30,
  },
  emtTagText: {
    fontSize: 11,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate800,
  },

  // Checkbox Container
  certCheckRow: {
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.slate50,
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.slate400,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
    marginRight: 12,
    marginTop: 2,
  },
  checkboxBoxChecked: {
    backgroundColor: colors.emergency,
    borderColor: colors.emergency,
  },
  checkboxTick: {
    color: colors.white,
    fontSize: 14,
    fontWeight: typography.fontWeights.bold,
  },
  checkboxTextWrap: {
    flex: 1,
  },
  checkboxTitle: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    lineHeight: typography.lineHeights.sm,
  },
  checkboxSub: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    lineHeight: typography.lineHeights.xs,
    marginTop: 2,
  },

  // AIS-125 CLASSIFICATION SECTION
  ais125Section: {
    marginTop: spacing.md,
    marginBottom: spacing.base,
    gap: spacing.md,
  },
  ais125HeaderBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  ais125MainHeading: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    lineHeight: typography.lineHeights.lg,
  },
  ais125StandardBadge: {
    backgroundColor: colors.infoLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.info,
  },
  ais125StandardBadgeText: {
    fontSize: 10,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.info,
  },
  ais125MainSub: {
    fontSize: typography.fontSizes.sm,
    color: colors.slate700,
    lineHeight: typography.lineHeights.sm,
  },
  ais125Card: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    borderRadius: radii.lg,
    padding: spacing.base,
    gap: 10,
    ...shadows.sm,
  },
  ais125CardSelected: {
    borderColor: colors.emergency,
    borderWidth: 2.5,
    backgroundColor: colors.emergencyLight, // nearest existing token
    ...shadows.emergency,
  },
  ais125CardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  ais125IconNameRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
    gap: 10,
  },
  ais125Icon: {
    fontSize: 28,
  },
  ais125TitleBox: {
    flex: 1,
  },
  ais125CardName: {
    flexShrink: 1,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    lineHeight: typography.lineHeights.base,
  },
  ais125CardNameSelected: {
    color: colors.emergencyDark,
  },
  ais125CardSub: {
    flexShrink: 1,
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    lineHeight: typography.lineHeights.xs,
    marginTop: 2,
  },
  ais125TagRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  tierBadgeDefault: {
    backgroundColor: colors.slate100,
  },
  tierBadgeSelected: {
    backgroundColor: colors.emergencyDark,
  },
  tierBadgeText: {
    fontSize: 10,
    fontWeight: typography.fontWeights.extrabold,
    color: colors.slate700,
    letterSpacing: 0.5,
  },
  tierBadgeTextSelected: {
    color: colors.white,
  },
  regulatoryTagText: {
    fontSize: 10,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate600,
  },
  ais125Desc: {
    fontSize: typography.fontSizes.sm,
    color: colors.slate700,
    lineHeight: typography.lineHeights.sm,
  },
  staffingNoticeBox: {
    flexDirection: "row",
    backgroundColor: colors.slate100,
    padding: spacing.sm,
    borderRadius: radii.md,
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  staffingLabel: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
  },
  staffingValue: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate800,
    flex: 1,
  },
  equipmentContainer: {
    backgroundColor: colors.slate50,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: 6,
  },
  equipmentHeading: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate800,
  },
  equipmentPillsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  equipmentPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate300,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  equipmentPillDot: {
    color: colors.emergency,
    marginRight: 4,
    fontSize: 12,
  },
  equipmentPillText: {
    fontSize: 11,
    color: colors.slate800,
    lineHeight: 14,
  },
  selectedConfirmedBar: {
    backgroundColor: colors.emergencyLight,
    borderWidth: 1,
    borderColor: colors.emergencyBorder,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    alignItems: "center",
    marginTop: 4,
  },
  selectedConfirmedText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.emergencyDark,
  },

  // Document Upload Cards
  docUploadCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: radii.lg,
    padding: spacing.base,
    gap: spacing.sm,
  },
  docUploadCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  docUploadTitle: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    flex: 1,
  },
  docUploadSub: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    lineHeight: typography.lineHeights.xs,
  },
  uploadErrorText: {
    marginTop: 6,
    fontSize: typography.fontSizes.xs,
    color: colors.emergencyDark,
    lineHeight: typography.lineHeights.xs,
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  statusChipPending: {
    backgroundColor: colors.slate100,
    borderWidth: 1,
    borderColor: colors.slate300,
  },
  statusChipUploading: {
    backgroundColor: colors.warningLight,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  statusChipUploaded: {
    backgroundColor: colors.successLight,
    borderWidth: 1,
    borderColor: colors.success,
  },
  statusChipText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: typography.fontWeights.bold,
  },
  statusChipTextPending: {
    color: colors.slate700,
  },
  statusChipTextUploading: {
    color: colors.warning,
  },
  statusChipTextUploaded: {
    color: colors.success,
  },
  uploadActionBtn: {
    backgroundColor: colors.slate100,
    borderWidth: 1.5,
    borderColor: colors.slate400,
    borderStyle: "dashed",
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    minHeight: 48,
  },
  uploadActionBtnText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate800,
  },
  uploadedFileRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.slate50,
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginTop: 4,
  },
  fileIconBox: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.slate200,
    marginRight: spacing.sm,
  },
  fileIcon: {
    fontSize: 18,
  },
  fileDetails: {
    flex: 1,
  },
  fileName: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate900,
  },
  fileMeta: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    marginTop: 2,
  },
  fileRemoveBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.sm,
    backgroundColor: colors.emergencyLight,
    borderWidth: 1,
    borderColor: colors.emergencyBorder,
    minHeight: 36,
    justifyContent: "center",
  },
  fileRemoveBtnText: {
    flexShrink: 1,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.emergencyDark,
  },
  fileReuploadBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radii.sm,
    backgroundColor: colors.slate100,
    borderWidth: 1,
    borderColor: colors.slate300,
    marginRight: 6,
    minHeight: 36,
    justifyContent: "center",
  },
  fileReuploadBtnText: {
    flexShrink: 1,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate800,
  },
  docActionBtnsRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  // Step 4: Statutory Document Section
  statutoryHighlightCard: {
    backgroundColor: colors.warningLight,
    borderWidth: 1.5,
    borderColor: colors.warning,
    borderRadius: radii.lg,
    padding: spacing.base,
    gap: 6,
  },
  statutoryBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statutoryAlertBadge: {
    backgroundColor: colors.warning,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  statutoryAlertBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: typography.fontWeights.extrabold,
    letterSpacing: 0.5,
  },
  statutoryRefText: {
    fontSize: 11,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate800,
  },
  statutoryCardTitle: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    lineHeight: typography.lineHeights.base,
  },
  statutoryCardDesc: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate800,
    lineHeight: typography.lineHeights.xs,
  },
  docSectionHeading: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    marginTop: spacing.sm,
  },
  statutoryDocSlotCard: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    borderRadius: radii.lg,
    padding: spacing.base,
    gap: spacing.sm,
  },
  statutoryDocSlotMandatory: {
    borderLeftWidth: 4,
    borderLeftColor: colors.emergency,
  },
  statutoryDocSlotUploaded: {
    borderLeftColor: colors.success,
  },
  slotHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  slotTitleBox: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  slotTitleBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 2,
  },
  slotTitleText: {
    flexShrink: 1,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    lineHeight: typography.lineHeights.base,
  },
  requiredBadge: {
    backgroundColor: colors.emergencyLight,
    borderWidth: 1,
    borderColor: colors.emergencyBorder,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.sm,
  },
  requiredBadgeText: {
    flexShrink: 1,
    color: colors.emergencyDark,
    fontSize: 9,
    fontWeight: typography.fontWeights.extrabold,
  },
  slotSubtitleText: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    lineHeight: typography.lineHeights.xs,
    marginBottom: 4,
  },
  slotRefText: {
    fontSize: 11,
    color: colors.slate700,
    fontWeight: typography.fontWeights.medium,
  },
  slotUploadActionBtn: {
    backgroundColor: colors.slate50,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    borderStyle: "dashed",
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  slotUploadActionBtnText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate800,
  },
  uploadingProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.warningLight,
    paddingVertical: 12,
    borderRadius: radii.md,
    gap: 10,
  },
  uploadingText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    color: colors.warning,
  },

  // Sticky Bottom Action Bar
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.slate200,
    gap: spacing.md,
    ...shadows.md,
  },
  backButton: {
    paddingHorizontal: spacing.base,
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: colors.slate100,
    borderWidth: 1,
    borderColor: colors.slate300,
    minHeight: 52,
    justifyContent: "center",
    alignItems: "center",
  },
  backButtonText: {
    flexShrink: 1,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate800,
  },
  continueButton: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: colors.slate900,
    minHeight: 52,
    justifyContent: "center",
    alignItems: "center",
  },
  continueButtonText: {
    flexShrink: 1,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
  },
  submitButton: {
    flex: 1,
    paddingHorizontal: spacing.base,
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: colors.emergency,
    minHeight: 52,
    justifyContent: "center",
    alignItems: "center",
    ...shadows.emergency,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    flexShrink: 1,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
  },
  submittingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  // Modals & Action Sheets
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.base,
  },
  actionSheetCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadows.md,
  },
  actionSheetTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    textAlign: "center",
  },
  actionSheetSub: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  actionSheetOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.slate50,
    borderWidth: 1.5,
    borderColor: colors.slate200,
    borderRadius: radii.md,
    padding: spacing.base,
    gap: 12,
    minHeight: 52,
  },
  actionSheetOptionIcon: {
    fontSize: 22,
  },
  actionSheetOptionText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    color: colors.slate900,
  },
  actionSheetCancelBtn: {
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
    minHeight: 48,
    justifyContent: "center",
  },
  actionSheetCancelText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.slate600,
  },

  // Success Modal
  successModalCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: colors.white,
    borderRadius: radii["2xl"],
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
    ...shadows.md,
  },
  successBadgeCircle: {
    width: 64,
    height: 64,
    borderRadius: radii.full,
    backgroundColor: colors.successLight,
    borderWidth: 2,
    borderColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  successBadgeCheck: {
    fontSize: 32,
    color: colors.success,
    fontWeight: typography.fontWeights.extrabold,
  },
  successTitle: {
    fontSize: typography.fontSizes["2xl"],
    fontWeight: typography.fontWeights.bold,
    color: colors.slate900,
    textAlign: "center",
    lineHeight: typography.lineHeights["2xl"],
  },
  successSubtitle: {
    fontSize: typography.fontSizes.sm,
    color: colors.slate700,
    textAlign: "center",
    lineHeight: typography.lineHeights.sm,
  },
  successDetailsBox: {
    width: "100%",
    backgroundColor: colors.slate50,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radii.lg,
    padding: spacing.base,
    gap: spacing.sm,
  },
  successDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  successDetailLabel: {
    flexShrink: 1,
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    fontWeight: typography.fontWeights.medium,
  },
  successDetailValue: {
    flexShrink: 1,
    fontSize: typography.fontSizes.sm,
    color: colors.slate900,
    fontWeight: typography.fontWeights.bold,
    letterSpacing: 0.5,
  },
  successCategoryPill: {
    backgroundColor: colors.emergencyLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.emergencyBorder,
  },
  successCategoryPillText: {
    flexShrink: 1,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.emergencyDark,
  },
  successReviewNotice: {
    fontSize: typography.fontSizes.xs,
    color: colors.slate600,
    textAlign: "center",
    lineHeight: typography.lineHeights.xs,
  },
  successHelplineNotice: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: colors.info,
    textAlign: "center",
    backgroundColor: colors.infoLight,
    padding: spacing.sm,
    borderRadius: radii.md,
    width: "100%",
  },
  successContinueBtn: {
    width: "100%",
    backgroundColor: colors.emergency,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
    minHeight: 52,
    ...shadows.emergency,
  },
  successContinueBtnText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    color: colors.white,
  },
});
