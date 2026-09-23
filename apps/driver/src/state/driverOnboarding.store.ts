import { create } from "zustand";
import type { AIS125VehicleType } from "@sahayak/domain";
import type { SupportedLanguage } from "../i18n/driverOnboardingStrings.ts";

export type EMTLevel = "EMT_P" | "EMT_A" | "EMT_B" | "FMR";

export interface DocumentUploadState {
  status: "idle" | "uploading" | "uploaded" | "error";
  fileName?: string;
  fileSize?: string;
  uploadedAt?: string;
  uri?: string;
  progress?: number;
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
  ais125VehicleType: AIS125VehicleType;
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
  submissionResult: SubmissionResult | null;

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
  simulateQuickUpload: (slot: DocumentSlotKey, docTypeLabel: string) => Promise<void>;

  // Validation & Submission
  validateCurrentStep: () => boolean;
  clearStepErrors: (step: number) => void;
  submitApplication: () => Promise<boolean>;
  resetOnboarding: () => void;
}

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
  formData: initialFormData,
  documents: initialDocuments,
  stepErrors: {},
  isSubmitting: false,
  submissionResult: null,

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

  simulateQuickUpload: async (slot, docTypeLabel) => {
    const { startDocumentUpload, finishDocumentUpload } = get();
    const cleanLabel = docTypeLabel.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
    const fileName = `${cleanLabel}_SCAN_${Date.now().toString().slice(-4)}.pdf`;
    const fileSize = "2.1 MB";

    startDocumentUpload(slot, fileName, fileSize);

    // Simulate network upload progression
    await new Promise((resolve) => setTimeout(resolve, 800));
    finishDocumentUpload(slot, `file:///vault/documents/${fileName}`);
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
      if (!formData.commercialDlNumber || formData.commercialDlNumber.trim().length < 8) {
        errors.push("VALIDATION_INVALID_DL");
      }
      if (!formData.dlExpiry || formData.dlExpiry.trim().length === 0) {
        errors.push("VALIDATION_EXPIRED_DL");
      }
      if (!formData.psvBadgeNumber || formData.psvBadgeNumber.trim().length < 4) {
        errors.push("VALIDATION_MISSING_PSV");
      }
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
      if (!formData.ais125VehicleType) {
        errors.push("VALIDATION_MISSING_AIS125");
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
    set({ isSubmitting: true });

    // Simulate API round-trip to Government Transport & MoRTH verification portal
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const trackingId = `EK-AMB-DL-${Date.now().toString().slice(-6)}`;
    const careLevelMap: Record<AIS125VehicleType, string> = {
      TYPE_D_ALS: "ALS (Advanced Life Support)",
      TYPE_C_BLS: "BLS (Basic Life Support)",
      TYPE_B_PTA: "PTA (Patient Transport)",
      TYPE_A_MFR: "MFR (Medical First Responder)",
    };

    const submissionResult: SubmissionResult = {
      trackingId,
      submittedAt: new Date().toISOString(),
      vehicleType: formData.ais125VehicleType,
      careLevelCode: careLevelMap[formData.ais125VehicleType] || "ALS",
      status: "PENDING_STA_VERIFICATION",
    };

    set({
      isSubmitting: false,
      submissionResult,
    });

    return true;
  },

  resetOnboarding: () =>
    set({
      currentStep: 1,
      formData: initialFormData,
      documents: initialDocuments,
      stepErrors: {},
      isSubmitting: false,
      submissionResult: null,
    }),
}));
