import type { AIS125VehicleType, CareLevel } from "@sahayak/domain";

/** Which AIS-125 vehicles are clinically safe for a triaged care level. Shared by AmbulanceCategoryScreen (which cards
 *  are locked) and the booking routes (whether the vehicle step has a choice to offer at all). */
export function isVehicleEligible(careLevel: CareLevel, type: AIS125VehicleType): boolean {
  switch (careLevel) {
    case "ALS":
      // Patient requires Advanced Life Support; only Type D is clinically safe
      return type === "TYPE_D_ALS";
    case "BLS":
      // Patient requires BLS; Type C and upgraded Type D are safe
      return type === "TYPE_C_BLS" || type === "TYPE_D_ALS";
    case "PTA":
    default:
      // Patient transport; Type B, C, and D are eligible (Type A lacks stretcher)
      return type !== "TYPE_A_MFR";
  }
}

const ALL_VEHICLES: readonly AIS125VehicleType[] = ["TYPE_D_ALS", "TYPE_C_BLS", "TYPE_B_PTA", "TYPE_A_MFR"];

/** The only eligible vehicle when triage leaves exactly one, else null. When it returns a vehicle the category screen
 *  would show one live card and three locked ones, so the booking flow skips that screen (the most urgent patients
 *  save a whole step). */
export function soleEligibleVehicle(careLevel: CareLevel): AIS125VehicleType | null {
  const eligible = ALL_VEHICLES.filter((t) => isVehicleEligible(careLevel, t));
  return eligible.length === 1 ? eligible[0]! : null;
}

/** Steps in the booking flow (triage, pickup, [vehicle,] review) for the "Step n of n" label on the review screen. */
export function bookingStepCount(careLevel: CareLevel): number {
  return soleEligibleVehicle(careLevel) ? 3 : 4;
}
