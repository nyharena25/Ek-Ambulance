import type { GeoPoint, Jurisdiction } from "../types/index.ts";

export interface JurisdictionResolution {
  isSupported: boolean;
  jurisdiction: Jurisdiction | null;
  displayName: string;
  hindiDisplayName: string;
  stateCode: "DL" | "UP" | "OUT_OF_BOUNDS";
  district?: string;
  hindiDistrict?: string;
  statutoryFramework: string;
  warningMessage?: string;
  hindiWarningMessage?: string;
}

interface DistrictZone {
  name: string;
  hindiName: string;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

// Uttar Pradesh Key Urban & NCR Districts
const UP_DISTRICTS: DistrictZone[] = [
  {
    name: "Gautam Buddha Nagar (Noida)",
    hindiName: "गौतम बुद्ध नगर (नोएडा)",
    minLat: 28.25,
    maxLat: 28.65,
    minLon: 77.30,
    maxLon: 77.65,
  },
  {
    name: "Ghaziabad",
    hindiName: "गाजियाबाद",
    minLat: 28.60,
    maxLat: 28.85,
    minLon: 77.35,
    maxLon: 77.65,
  },
  {
    name: "Meerut",
    hindiName: "मेरठ",
    minLat: 28.85,
    maxLat: 29.20,
    minLon: 77.50,
    maxLon: 77.90,
  },
  {
    name: "Lucknow",
    hindiName: "लखनऊ",
    minLat: 26.65,
    maxLat: 27.10,
    minLon: 80.75,
    maxLon: 81.20,
  },
  {
    name: "Kanpur",
    hindiName: "कानपुर",
    minLat: 26.30,
    maxLat: 26.65,
    minLon: 80.15,
    maxLon: 80.55,
  },
  {
    name: "Agra",
    hindiName: "आगरा",
    minLat: 27.05,
    maxLat: 27.35,
    minLon: 77.85,
    maxLon: 78.20,
  },
  {
    name: "Varanasi",
    hindiName: "वाराणसी",
    minLat: 25.15,
    maxLat: 25.50,
    minLon: 82.80,
    maxLon: 83.20,
  },
  {
    name: "Prayagraj",
    hindiName: "प्रयागराज",
    minLat: 25.30,
    maxLat: 25.65,
    minLon: 81.70,
    maxLon: 82.05,
  },
];

/**
 * Resolves GPS coordinates into regulatory dispatch jurisdictions:
 * - NCT of Delhi (DL)
 * - Uttar Pradesh (UP, with district classification)
 * - Out of Operating Zone (Unsupported)
 */
export function resolveJurisdiction(point: GeoPoint): JurisdictionResolution {
  const { latitude, longitude } = point;

  // 1. National Capital Territory (NCT) of Delhi Bounding Polygon
  // Delhi roughly spans Lat: 28.404 to 28.883, Lon: 76.838 to 77.348
  const isDelhi =
    latitude >= 28.404 &&
    latitude <= 28.883 &&
    longitude >= 76.838 &&
    longitude <= 77.348;

  if (isDelhi) {
    return {
      isSupported: true,
      jurisdiction: "DL",
      displayName: "NCT of Delhi",
      hindiDisplayName: "राष्ट्रीय राजधानी क्षेत्र दिल्ली",
      stateCode: "DL",
      district: "Delhi NCR",
      hindiDistrict: "दिल्ली एनसीआर",
      statutoryFramework: "Delhi Ambulance Statutory Tariff Order 2024",
    };
  }

  // 2. Uttar Pradesh Bounding Box
  // UP roughly spans Lat: 23.85 to 30.42, Lon: 77.05 to 84.65
  const isWithinUPBounds =
    latitude >= 23.85 &&
    latitude <= 30.42 &&
    longitude >= 77.05 &&
    longitude <= 84.65;

  if (isWithinUPBounds) {
    // Identify specific UP district if coordinate matches urban zones
    const detectedDistrict = UP_DISTRICTS.find(
      (d) =>
        latitude >= d.minLat &&
        latitude <= d.maxLat &&
        longitude >= d.minLon &&
        longitude <= d.maxLon
    );

    const districtName = detectedDistrict ? detectedDistrict.name : "UP District";
    const hindiDistrictName = detectedDistrict
      ? detectedDistrict.hindiName
      : "उत्तर प्रदेश जिला";

    return {
      isSupported: true,
      jurisdiction: "UP",
      displayName: `Uttar Pradesh (${districtName})`,
      hindiDisplayName: `उत्तर प्रदेश (${hindiDistrictName})`,
      stateCode: "UP",
      district: districtName,
      hindiDistrict: hindiDistrictName,
      statutoryFramework: "Uttar Pradesh Motor Vehicles Rules & AIS-125 Schedule",
    };
  }

  // 3. Coordinate is outside both operating zones
  return {
    isSupported: false,
    jurisdiction: null,
    displayName: "Outside Operating Zone",
    hindiDisplayName: "संचालन क्षेत्र से बाहर",
    stateCode: "OUT_OF_BOUNDS",
    statutoryFramework: "National Highway Emergency Response (108 / 102)",
    warningMessage:
      "Ek-Ambulance on-demand dispatch is currently restricted to the NCT of Delhi and Uttar Pradesh. Direct dispatch is unavailable for this location.",
    hindiWarningMessage:
      "एक-एंबुलेंस ऑन-डिमांड सेवा वर्तमान में केवल दिल्ली (NCT) एवं उत्तर प्रदेश में उपलब्ध है। इस स्थान के लिए सीधी सेवा उपलब्ध नहीं है।",
  };
}
