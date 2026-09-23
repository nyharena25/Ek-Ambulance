export type CareLevel = "ALS" | "BLS" | "PTA";

export type AIS125VehicleType =
  | "TYPE_D_ALS"
  | "TYPE_C_BLS"
  | "TYPE_B_PTA"
  | "TYPE_A_MFR";

export type Jurisdiction = "DL" | "UP";

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export type TriageSymptomFlag =
  | "chest_pain"
  | "severe_bleeding"
  | "unconscious"
  | "breathing_difficulty"
  | "stroke_symptoms"
  | "severe_burns"
  | "trauma"
  | "seizure"
  | "cardiac_arrest"
  | "poisoning"
  | "choking"
  | "allergic_reaction"
  | "head_injury"
  | "pregnancy_emergency"
  | "pediatric_emergency"
  | "fracture"
  | "other";
