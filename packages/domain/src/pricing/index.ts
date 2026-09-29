import type { AIS125VehicleType, CareLevel, Jurisdiction } from "../types/index.ts";

export interface PricingEstimateParams {
  careLevel: CareLevel;
  jurisdiction: Jurisdiction;
  distanceKm: number;
}

export interface PricingEstimateResponse {
  careLevel: CareLevel;
  jurisdiction: Jurisdiction;
  distanceKm: number;
  baseFareInr: number;
  perKmRateInr: number;
  estimatedTotalInr: number;
  currency: "INR";
  tariffVersion: string;
  computedAt: string;
}

export interface VehiclePricingEstimateParams {
  vehicleType: AIS125VehicleType;
  // null before booking: only the server decides the jurisdiction (R-12). Amounts do not depend on it.
  jurisdiction: Jurisdiction | null;
  distanceKm: number;
}

export interface VehiclePricingEstimateResponse extends Omit<PricingEstimateResponse, "jurisdiction"> {
  vehicleType: AIS125VehicleType;
  jurisdiction: Jurisdiction | null;
}

export interface ItemizedStatutoryFare {
  vehicleType: AIS125VehicleType;
  careLevel: CareLevel;
  jurisdiction: Jurisdiction | null;
  totalDistanceKm: number;
  initialIncludedKm: number;
  baseFareInr: number;
  billableAdditionalKm: number;
  perKmRateInr: number;
  additionalDistanceFareInr: number;
  emtParamedicChargesInr: 0;
  surgeMultiplier: 1.0;
  surgeGougingAmountInr: 0;
  estimatedTotalInr: number;
  currency: "INR";
  tariffVersion: string;
  statutoryOrderRef: string; // "" while the jurisdiction is unknown
  mandateDeclaration: string;
  hindiMandateDeclaration: string;
  computedAt: string;
}

/**
 * Returns mapped CareLevel from AIS-125 vehicle type
 */
export function careLevelFromVehicleType(type: AIS125VehicleType): CareLevel {
  switch (type) {
    case "TYPE_D_ALS":
      return "ALS";
    case "TYPE_C_BLS":
      return "BLS";
    case "TYPE_B_PTA":
    case "TYPE_A_MFR":
    default:
      return "PTA";
  }
}

/**
 * Computes statutory pricing for standard CareLevel
 */
export function computePricingEstimate(
  params: PricingEstimateParams
): PricingEstimateResponse {
  const baseFareInr =
    params.careLevel === "ALS" ? 500 : params.careLevel === "BLS" ? 300 : 200;
  const perKmRateInr =
    params.careLevel === "ALS" ? 25 : params.careLevel === "BLS" ? 15 : 12;
  const estimatedTotalInr =
    baseFareInr + Math.round(params.distanceKm * perKmRateInr);

  return {
    careLevel: params.careLevel,
    jurisdiction: params.jurisdiction,
    distanceKm: params.distanceKm,
    baseFareInr,
    perKmRateInr,
    estimatedTotalInr,
    currency: "INR",
    tariffVersion: "2026-04-01",
    computedAt: new Date().toISOString(),
  };
}

/**
 * Computes statutory pricing for all 4 AIS-125 vehicle categories
 */
export function computeVehiclePricingEstimate(
  params: VehiclePricingEstimateParams
): VehiclePricingEstimateResponse {
  let baseFareInr: number;
  let perKmRateInr: number;

  switch (params.vehicleType) {
    case "TYPE_D_ALS":
      baseFareInr = 500;
      perKmRateInr = 25;
      break;
    case "TYPE_C_BLS":
      baseFareInr = 300;
      perKmRateInr = 15;
      break;
    case "TYPE_B_PTA":
      baseFareInr = 200;
      perKmRateInr = 12;
      break;
    case "TYPE_A_MFR":
    default:
      baseFareInr = 150;
      perKmRateInr = 8;
      break;
  }

  const careLevel = careLevelFromVehicleType(params.vehicleType);
  // G-07: the quote must equal the locked fare (computeItemizedStatutoryFare / SQL compute_statutory_fare): 5 km are included.
  const billableAdditionalKm = Math.max(0, Number((params.distanceKm - 5.0).toFixed(1)));
  const estimatedTotalInr = baseFareInr + Math.round(billableAdditionalKm * perKmRateInr);

  return {
    vehicleType: params.vehicleType,
    careLevel,
    jurisdiction: params.jurisdiction,
    distanceKm: params.distanceKm,
    baseFareInr,
    perKmRateInr,
    estimatedTotalInr,
    currency: "INR",
    tariffVersion: "2026-04-01",
    computedAt: new Date().toISOString(),
  };
}

/**
 * Computes fully itemized statutory fare breakdown under Delhi/UP transport regulations
 * Enforces initial included distance, statutory EMT inclusion (₹0), and zero surge guarantee (1.0x).
 */
export function computeItemizedStatutoryFare(
  params: VehiclePricingEstimateParams
): ItemizedStatutoryFare {
  const initialIncludedKm = 5.0;
  let baseFareInr: number;
  let perKmRateInr: number;

  switch (params.vehicleType) {
    case "TYPE_D_ALS":
      baseFareInr = 500;
      perKmRateInr = 25;
      break;
    case "TYPE_C_BLS":
      baseFareInr = 300;
      perKmRateInr = 15;
      break;
    case "TYPE_B_PTA":
      baseFareInr = 200;
      perKmRateInr = 12;
      break;
    case "TYPE_A_MFR":
    default:
      baseFareInr = 150;
      perKmRateInr = 8;
      break;
  }

  const billableAdditionalKm = Math.max(
    0,
    Number((params.distanceKm - initialIncludedKm).toFixed(1))
  );
  const additionalDistanceFareInr = Math.round(
    billableAdditionalKm * perKmRateInr
  );
  const estimatedTotalInr = baseFareInr + additionalDistanceFareInr;

  const statutoryOrderRef =
    params.jurisdiction === "DL"
      ? "Delhi Transport Dept Gazette Order F.No.19(13)/Tpt/Ops/2021"
      : params.jurisdiction === "UP"
        ? "Uttar Pradesh Motor Vehicles (Ambulance Tariff) Schedule 2024"
        : "";

  return {
    vehicleType: params.vehicleType,
    careLevel: careLevelFromVehicleType(params.vehicleType),
    jurisdiction: params.jurisdiction,
    totalDistanceKm: params.distanceKm,
    initialIncludedKm,
    baseFareInr,
    billableAdditionalKm,
    perKmRateInr,
    additionalDistanceFareInr,
    emtParamedicChargesInr: 0,
    surgeMultiplier: 1.0,
    surgeGougingAmountInr: 0,
    estimatedTotalInr,
    currency: "INR",
    tariffVersion: "2026-04-01",
    statutoryOrderRef,
    mandateDeclaration:
      "Regulated Non-Surge Emergency Pricing under State Mandate",
    hindiMandateDeclaration:
      "शासकीय आदेशानुसार नियंत्रित बिना-सर्ज आपातकालीन दरें",
    computedAt: new Date().toISOString(),
  };
}
