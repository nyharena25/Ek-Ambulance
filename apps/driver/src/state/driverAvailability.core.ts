import type { DriverLifecycleState } from "@sahayak/domain";

/**
 * Whether the driver may act on the Booking board or edit their profile, read from the lifecycle machine's state and
 * never from a separate flag (HANDOVER invariant 3). The server enforces the same rules (`claim_emergency` refuses a
 * second mission, `update_driver_profile` refuses mid-mission); these predicates only decide what the UI offers.
 */

const HOLDING: readonly DriverLifecycleState[] = ["offered", "enRouteToPatient", "onScene", "transporting", "arrivedHospital"];

/** True from the moment an offer is held until the mission ends. */
export const holdsOfferOrMission = (state: DriverLifecycleState): boolean => HOLDING.includes(state);

/** Only a driver on standby can take an emergency: offline is not in the pool, and every other state already holds one. */
export const canAcceptFromBoard = (state: DriverLifecycleState): boolean => state === "standby";

/** Name, phone, password, service area, hospital and vehicle are frozen for the whole emergency. */
export const isProfileLocked = holdsOfferOrMission;
