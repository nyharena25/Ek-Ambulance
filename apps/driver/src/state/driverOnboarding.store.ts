import { create } from "zustand";
import type { AIS125VehicleType } from "@sahayak/domain";
import type { SupportedLanguage } from "../i18n/driverOnboardingStrings.ts";
import { getServerAdapter } from "./driverLifecycle.store.ts";
import { mapFormDataToApplicationFields, mapStep1ToDraftFields, step1ValidationErrors } from "../lib/kycSubmission.core.ts";
import { IS_TEST_RUNNER } from "../config/env.ts";

// A release build must never seed a real driver's onboarding wizard with fake DL/plate/document data just because the real
// session hasn't hydrated yet - see `initialFormData`/`initialDocuments` below (IS_TEST_RUNNER only).

export type EMTLevel = "EMT_P" | "EMT_A" | "EMT_B" | "FMR";

export interface DocumentUploadState {
  status: "idle" | "uploading" | "uploaded" | "error";
  fileName?: string;
  fileSize?: string;
  uploadedAt?: string;
  uri?: string;
  progress?: number;
  /** A failed upload's machine code and the server's short reason, shown on the slot (status "error"). */
  errorCode?: string;
  errorDetail?: string;
}

export type DocumentSlotKey =
  | "arai_certificate"
  | "fitness_permit"
  | "commercial_dl"
  | "emt_certificate"
  | "vehicle_rc"
  | "commercial_insurance"
  | "puc_certificate";

export interface DriverOnboardingFormData {
  // Step 1: Commercial Driver's License
  commercialDlNumber: string;
  dlExpiry: string;
  dlState: string;
  psvBadgeNumber: string;

  // Step 2: EMT Certification
  emtLevel: EMTLevel;
  emtNumber: string;
  emtCouncil: string;
  emtExpiry: string;
  isAclsCertified: boolean;
  isBlsCertified: boolean;

  // Step 3: Vehicle & AIS-125
  vehicleRegistrationNumber: string;
  makeModel: string;
  manufactureYear: string;
  vinChassisNumber: string;
  /** Null until the driver chooses one in Step 1: never a preselected default stored in their application. */
  ais125VehicleType: AIS125VehicleType | null;
}

export interface SubmissionResult {
  trackingId: string;
  submittedAt: string;
  vehicleType: AIS125VehicleType;
  careLevelCode: string;
  status: "PENDING_STA_VERIFICATION" | "APPROVED";
}

export interface DriverOnboardingStoreState {
  currentStep: number;
  language: SupportedLanguage;
  formData: DriverOnboardingFormData;
  documents: Record<DocumentSlotKey, DocumentUploadState>;
  stepErrors: Record<number, string[]>;
  isSubmitting: boolean;
  /** The user id whose draft drivers row upsert_driver_application has created/updated in this app session (null:
   *  not yet). Every KYC write policy (Storage, driver_documents, driver_vehicles) requires that row, so no upload
   *  is attempted before it. Keyed by user so a second account signing in on the same phone gets its own draft. */
  draftReadyFor: string | null;
  submissionResult: SubmissionResult | null;
  /** The real submit_kyc/upsert_driver_application/saveProfile error code on a failed real submission (a
   *  server session exists), or "no_session" if there is no session and this isn't a dev build. Null in the
   *  IS_TEST_RUNNER/no-session local path, which always succeeds locally. */
  submissionError: string | null;

  // Actions
  setStep: (step: number) => void;
  setLanguage: (lang: SupportedLanguage) => void;
  toggleLanguage: () => void;
  updateField: <K extends keyof DriverOnboardingFormData>(
    field: K,
    value: DriverOnboardingFormData[K]
  ) => void;
  setAIS125VehicleType: (type: AIS125VehicleType) => void;

  // Document Upload Actions
  startDocumentUpload: (slot: DocumentSlotKey, fileName: string, fileSize: string) => void;
  finishDocumentUpload: (slot: DocumentSlotKey, uri: string) => void;
  removeDocument: (slot: DocumentSlotKey) => void;
  /** Real upload path: takes an already-picked file (the picker itself lives in the screen, an RN-native
   *  module this node-tested store must not import) and uploads it via the server adapter. No-ops with no
   *  server session. */
  uploadRealDocument: (slot: DocumentSlotKey, asset: { uri: string; name: string; mimeType: string | null | undefined }) => Promise<void>;

  // Validation & Submission
  validateCurrentStep: () => boolean;
  clearStepErrors: (step: number) => void;
  submitApplication: () => Promise<boolean>;
  resetOnboarding: () => void;
  /** Starts the wizard empty for a real session - called once by the screen on mount when a server session
   *  exists, instead of the test-runner seed. A no-op if the form already has real user input, so a
   *  remount (e.g. language toggle) never wipes what the driver already typed. */
  initForRealSession: () => void;
}

const CARE_LEVEL_LABELS: Record<AIS125VehicleType, string> = {
  TYPE_D_ALS: "ALS (Advanced Life Support)",
  TYPE_C_BLS: "BLS (Basic Life Support)",
  TYPE_B_PTA: "PTA (Patient Transport)",
  TYPE_A_MFR: "MFR (Medical First Responder)",
};

// Real-session start state (HANDOVER's named gap): the wizard must never open pre-loaded with someone else's
// DL number, plate, or 5 documents marked "already uploaded" for a real application. A blank tier is a
// deliberate "not chosen yet" - TYPE_A_MFR is simply the lowest, not an assumption about this driver.
export const EMPTY_FORM_DATA: DriverOnboardingFormData = {
  commercialDlNumber: "",
  dlExpiry: "",
  dlState: "",
  psvBadgeNumber: "",
  emtLevel: "FMR",
  emtNumber: "",
  emtCouncil: "",
  emtExpiry: "",
  isAclsCertified: false,
  isBlsCertified: false,
  vehicleRegistrationNumber: "",
  makeModel: "",
  manufactureYear: "",
  vinChassisNumber: "",
  ais125VehicleType: null,
};

const EMPTY_DOCUMENTS: Record<DocumentSlotKey, DocumentUploadState> = {
  arai_certificate: { status: "idle" },
  fitness_permit: { status: "idle" },
  commercial_dl: { status: "idle" },
  emt_certificate: { status: "idle" },
  vehicle_rc: { status: "idle" },
  commercial_insurance: { status: "idle" },
  puc_certificate: { status: "idle" },
};

const initialFormData: DriverOnboardingFormData = {
  commercialDlNumber: "DL-0420180098712",
  dlExpiry: "14/08/2028",
  dlState: "NCT of Delhi (DL)",
  psvBadgeNumber: "PSV-AMB-2023-4109",
  emtLevel: "EMT_P",
  emtNumber: "HSSC/EMT-P/2022/7718",
  emtCouncil: "Healthcare Sector Skill Council (HSSC)",
  emtExpiry: "31/12/2027",
  isAclsCertified: true,
  isBlsCertified: true,
  vehicleRegistrationNumber: "DL 01 AB 7890",
  makeModel: "Force Traveller 3350 Ambulance",
  manufactureYear: "2023",
  vinChassisNumber: "MAT452098P1B76543",
  ais125VehicleType: "TYPE_D_ALS",
};

const initialDocuments: Record<DocumentSlotKey, DocumentUploadState> = {
  arai_certificate: {
    status: "uploaded",
    fileName: "ARAI_AIS125_COMPLIANCE_CERT_2023_882.pdf",
    fileSize: "2.4 MB",
    uploadedAt: "Today, 08:15 AM",
    uri: "file:///documents/arai_cert.pdf",
  },
  fitness_permit: {
    status: "uploaded",
    fileName: "STA_DL_FORM38_FITNESS_PERMIT.pdf",
    fileSize: "1.8 MB",
    uploadedAt: "Today, 08:18 AM",
    uri: "file:///documents/form38_fitness.pdf",
  },
  commercial_dl: {
    status: "uploaded",
    fileName: "COMMERCIAL_DL_FRONT_BACK.jpg",
    fileSize: "3.1 MB",
    uploadedAt: "Today, 08:10 AM",
    uri: "file:///documents/dl_scan.jpg",
  },
  emt_certificate: {
    status: "uploaded",
    fileName: "HSSC_PARAMEDIC_CERTIFICATE.pdf",
    fileSize: "1.2 MB",
    uploadedAt: "Today, 08:12 AM",
    uri: "file:///documents/emt_cert.pdf",
  },
  vehicle_rc: {
    status: "uploaded",
    fileName: "VEHICLE_RC_DL01AB7890.pdf",
    fileSize: "1.5 MB",
    uploadedAt: "Today, 08:14 AM",
    uri: "file:///documents/rc_smartcard.pdf",
  },
  commercial_insurance: {
    status: "idle",
  },
  puc_certificate: {
    status: "idle",
  },
};

export const useDriverOnboardingStore = create<DriverOnboardingStoreState>((set, get) => ({
  currentStep: 1,
  language: "en",
  formData: IS_TEST_RUNNER ? initialFormData : EMPTY_FORM_DATA,
  documents: IS_TEST_RUNNER ? initialDocuments : EMPTY_DOCUMENTS,
  stepErrors: {},
  isSubmitting: false,
  draftReadyFor: null,
  submissionResult: null,
  submissionError: null,

  setStep: (step) => set({ currentStep: Math.min(Math.max(step, 1), 4) }),

  setLanguage: (lang) => set({ language: lang }),

  toggleLanguage: () =>
    set((state) => ({ language: state.language === "en" ? "hi" : "en" })),

  updateField: (field, value) =>
    set((state) => ({
      formData: {
        ...state.formData,
        [field]: value,
      },
    })),

  setAIS125VehicleType: (type) =>
    set((state) => ({
      formData: {
        ...state.formData,
        ais125VehicleType: type,
      },
    })),

  startDocumentUpload: (slot, fileName, fileSize) =>
    set((state) => ({
      documents: {
        ...state.documents,
        [slot]: {
          status: "uploading",
          fileName,
          fileSize,
          progress: 10,
        },
      },
    })),

  finishDocumentUpload: (slot, uri) =>
    set((state) => ({
      documents: {
        ...state.documents,
        [slot]: {
          ...state.documents[slot],
          status: "uploaded",
          uri,
          uploadedAt: "Just now",
          progress: 100,
        },
      },
    })),

  removeDocument: (slot) =>
    set((state) => ({
      documents: {
        ...state.documents,
        [slot]: {
          status: "idle",
          fileName: undefined,
          fileSize: undefined,
          uploadedAt: undefined,
          uri: undefined,
          progress: undefined,
        },
      },
    })),

  uploadRealDocument: async (slot, asset) => {
    const adapter = getServerAdapter();
    if (!adapter) return;
    const { startDocumentUpload, finishDocumentUpload } = get();
    const sizeLabel = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    const failSlot = (errorCode: string, errorDetail?: string) =>
      set((state) => ({ documents: { ...state.documents, [slot]: { status: "error", fileName: asset.name, errorCode, errorDetail } } }));

    // The draft drivers row must exist before any KYC write (see draftReadyFor). Created from the Step 1 values only,
    // through the same upsert_driver_application the final Submit calls again. A draft is never dispatch-eligible:
    // is_verified stays false until KYC approval, and going online requires it.
    if (get().draftReadyFor !== adapter.userId) {
      const draft = mapStep1ToDraftFields(get().formData);
      if (!draft.ok) {
        set((state) => ({ stepErrors: { ...state.stepErrors, 1: draft.errors } }));
        failSlot("step1_incomplete");
        return;
      }
      startDocumentUpload(slot, asset.name, "");
      const draftResult = await adapter.submitApplication(draft.fields);
      if (!draftResult.ok) {
        failSlot(draftResult.error.code, draftResult.error.detail);
        return;
      }
      set({ draftReadyFor: adapter.userId });
    }

    startDocumentUpload(slot, asset.name, "");
    const result = await adapter.uploadDocument(slot, asset);
    if (result.ok) {
      finishDocumentUpload(slot, result.data.storagePath);
      set((state) => ({ documents: { ...state.documents, [slot]: { ...state.documents[slot], fileSize: sizeLabel(result.data.sizeBytes) } } }));
    } else {
      failSlot(result.error.code, result.error.detail);
    }
  },

  clearStepErrors: (step) =>
    set((state) => ({
      stepErrors: {
        ...state.stepErrors,
        [step]: [],
      },
    })),

  validateCurrentStep: () => {
    const { currentStep, formData, documents } = get();
    const errors: string[] = [];

    if (currentStep === 1) {
      errors.push(...step1ValidationErrors(formData));
    } else if (currentStep === 2) {
      if (!formData.emtNumber || formData.emtNumber.trim().length < 4) {
        errors.push("VALIDATION_MISSING_EMT");
      }
      if (!formData.emtCouncil || formData.emtCouncil.trim().length < 2) {
        errors.push("VALIDATION_MISSING_COUNCIL");
      }
    } else if (currentStep === 3) {
      if (
        !formData.vehicleRegistrationNumber ||
        formData.vehicleRegistrationNumber.trim().length < 6
      ) {
        errors.push("VALIDATION_INVALID_VEHICLE_REG");
      }
      if (!formData.makeModel || formData.makeModel.trim().length < 2) {
        errors.push("VALIDATION_MISSING_MAKE_MODEL");
      }
    } else if (currentStep === 4) {
      // Mandatory statutory slots: ARAI and Fitness permit and RC!
      if (documents.arai_certificate?.status !== "uploaded") {
        errors.push("VALIDATION_MISSING_ARAI");
      }
      if (documents.fitness_permit?.status !== "uploaded") {
        errors.push("VALIDATION_MISSING_FITNESS");
      }
      if (documents.vehicle_rc?.status !== "uploaded") {
        errors.push("VALIDATION_MISSING_RC");
      }
    }

    set((state) => ({
      stepErrors: {
        ...state.stepErrors,
        [currentStep]: errors,
      },
    }));

    return errors.length === 0;
  },

  submitApplication: async () => {
    const { formData } = get();
    const vehicleType = formData.ais125VehicleType;
    if (!vehicleType) {
      set({ isSubmitting: false, submissionError: "invalid_ais125Type" });
      return false;
    }
    set({ isSubmitting: true, submissionError: null });

    const adapter = getServerAdapter();
    if (adapter) {
      // Real path (5.4): upsert_driver_application -> vehicle via the existing profile RPC -> submit_kyc.
      // Each step is server-validated on its own; a failure at any step leaves kyc_status exactly where the
      // server left it (draft/rejected), never a client-invented "approved" or "pending".
      const mapped = mapFormDataToApplicationFields(formData);
      if (!mapped.ok) {
        set({ isSubmitting: false, submissionError: `invalid_${mapped.field}` });
        return false;
      }
      const appResult = await adapter.submitApplication(mapped.fields);
      if (!appResult.ok) {
        set({ isSubmitting: false, submissionError: appResult.error.code });
        return false;
      }
      const vehicleResult = await adapter.saveProfile({
        vehicle: {
          registrationNumber: formData.vehicleRegistrationNumber.trim(),
          makeModel: formData.makeModel.trim(),
        },
      });
      if (!vehicleResult.ok) {
        set({ isSubmitting: false, submissionError: vehicleResult.error.code });
        return false;
      }
      const kycResult = await adapter.submitKyc();
      if (!kycResult.ok) {
        set({ isSubmitting: false, submissionError: kycResult.error.code });
        return false;
      }
      set({
        isSubmitting: false,
        submissionResult: {
          trackingId: kycResult.data.kycReference ?? "",
          submittedAt: kycResult.data.submittedAt ?? new Date().toISOString(),
          vehicleType,
          careLevelCode: CARE_LEVEL_LABELS[vehicleType],
          status: "PENDING_STA_VERIFICATION",
        },
      });
      return true;
    }

    if (!IS_TEST_RUNNER) {
      // A release build with no session must refuse rather than fabricate a submission the real backend never saw.
      set({ isSubmitting: false, submissionError: "no_session" });
      return false;
    }

    // IS_TEST_RUNNER/no-session local path, unchanged.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const trackingId = `EK-AMB-DL-${Date.now().toString().slice(-6)}`;
    set({
      isSubmitting: false,
      submissionResult: {
        trackingId,
        submittedAt: new Date().toISOString(),
        vehicleType,
        careLevelCode: CARE_LEVEL_LABELS[vehicleType],
        status: "PENDING_STA_VERIFICATION",
      },
    });
    return true;
  },

  resetOnboarding: () =>
    set({
      currentStep: 1,
      formData: IS_TEST_RUNNER ? initialFormData : EMPTY_FORM_DATA,
      documents: IS_TEST_RUNNER ? initialDocuments : EMPTY_DOCUMENTS,
      stepErrors: {},
      isSubmitting: false,
      draftReadyFor: null,
      submissionResult: null,
      submissionError: null,
    }),

  initForRealSession: () => {
    if (JSON.stringify(get().formData) !== JSON.stringify(initialFormData)) return;
    set({ currentStep: 1, formData: EMPTY_FORM_DATA, documents: EMPTY_DOCUMENTS, stepErrors: {}, submissionError: null });
  },
}));
