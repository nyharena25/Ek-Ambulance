import type { AIS125VehicleType } from "@sahayak/domain";
import type { JurisdictionCode } from "../state/driverStandby.store.ts";

export const DEV_OTP = "123456";

export interface DevDriverProfile {
  phone: string;
  ais125Type: AIS125VehicleType | null;
  isVerified: boolean;
  jurisdiction: JurisdictionCode;
  chipLabel: string;
  chipDot: string;
  crew: string;
}

export const DEV_DRIVER_PROFILES: Record<string, DevDriverProfile> = {
  "+919876543210": {
    phone: "+919876543210",
    ais125Type: "TYPE_D_ALS",
    isVerified: true,
    jurisdiction: "DL_SOUTH",
    chipLabel: "Type D (ALS) - 43210",
    chipDot: "🔵",
    crew: "Paramedic, ICU ventilator, defibrillator - NCT of Delhi",
  },
  "+919876543211": {
    phone: "+919876543211",
    ais125Type: "TYPE_C_BLS",
    isVerified: true,
    jurisdiction: "UP_NOIDA",
    chipLabel: "Type C (BLS) - 43211",
    chipDot: "🟢",
    crew: "EMT, oxygen cylinder, basic airway - Gautam Buddha Nagar",
  },
  "+919876543212": {
    phone: "+919876543212",
    ais125Type: "TYPE_B_PTA",
    isVerified: true,
    jurisdiction: "UP_NOIDA",
    chipLabel: "Type B (PTA) - 43212",
    chipDot: "🟡",
    crew: "Driver, stretcher transport, non-emergency transfer",
  },
  "+919876543213": {
    phone: "+919876543213",
    ais125Type: "TYPE_A_MFR",
    isVerified: true,
    jurisdiction: "DL_SOUTH",
    chipLabel: "Type A (MFR) - 43213",
    chipDot: "🟣",
    crew: "First responder two/three-wheeler, AED, triage kit",
  },
  "+919876543214": {
    phone: "+919876543214",
    ais125Type: null,
    isVerified: false,
    jurisdiction: "UP_NOIDA",
    chipLabel: "Unverified KYC - 43214",
    chipDot: "⚪",
    crew: "Unverified - triggers the 4-step KYC wizard",
  },
};

export const getDevDriverProfile = (phone: string): DevDriverProfile | undefined =>
  DEV_DRIVER_PROFILES[phone] ?? DEV_DRIVER_PROFILES[`+91${phone}`];
