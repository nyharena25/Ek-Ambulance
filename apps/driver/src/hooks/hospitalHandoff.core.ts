import type { TraumaCentreItem } from "../i18n/driverOnSceneStrings";

/**
 * Pure helpers backing the on-scene destination hospital selector
 * (OnSceneCareScreen.tsx), unit-testable without React Native - same
 * "pure core, thin UI wrapper" split as dispatchOffer.core.ts.
 */

/**
 * A trauma centre is selectable only while it has real spare ICU capacity
 * once beds already held for other inbound units are accounted for.
 * `availableIcuBeds` alone overstates true capacity: some of those beds
 * are already promised to ambulances that haven't arrived yet
 * (`bedsHeldCounter`) or are actively inbound (`inboundAmbulances`) - a
 * facility can show "3 available" and still be functionally full.
 * ponytail: ICU-bed-only proxy for "overcrowded"; extend to weigh trauma
 * bays/ventilators separately if a facility can be selectable on ICU beds
 * but still unsafe on ventilator/bay availability.
 */
export function isHospitalSelectable(hospital: TraumaCentreItem): boolean {
  return hospital.availableIcuBeds - hospital.bedsHeldCounter - hospital.inboundAmbulances > 0;
}
