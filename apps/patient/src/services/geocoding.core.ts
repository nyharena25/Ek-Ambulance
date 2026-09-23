export interface ResolvedAddress {
  primary: string;
  secondary: string;
}

const join = (...parts: (string | null | undefined)[]) => {
  const seen = new Set<string>();
  return parts
    .map((p) => p?.trim())
    .filter((p): p is string => !!p && !seen.has(p.toLowerCase()) && !!seen.add(p.toLowerCase()))
    .join(", ");
};

const make = (primary: string, secondary: string): ResolvedAddress | null =>
  primary || secondary ? { primary: primary || secondary, secondary: primary ? secondary : "" } : null;

interface GoogleComponent {
  long_name: string;
  types: string[];
}

export function fromGoogle(json: { status?: string; results?: { address_components?: GoogleComponent[] }[] }): ResolvedAddress | null {
  const comps = json.status === "OK" ? json.results?.[0]?.address_components : undefined;
  if (!comps) return null;
  const pick = (...types: string[]) => types.map((t) => comps.find((c) => c.types.includes(t))?.long_name).find(Boolean);
  return make(
    join(pick("premise", "point_of_interest"), pick("route"), pick("sublocality_level_2", "sublocality_level_1", "neighborhood") ?? pick("locality")),
    join(pick("administrative_area_level_2"), pick("administrative_area_level_1"))
  );
}

export interface PlaceLike {
  name?: string | null;
  street?: string | null;
  district?: string | null;
  subregion?: string | null;
  city?: string | null;
  region?: string | null;
}

export function fromPlace(place: PlaceLike | undefined): ResolvedAddress | null {
  if (!place) return null;
  return make(join(place.name, place.street, place.district), join(place.subregion ?? place.city, place.region));
}

export function fromNominatim(json: { address?: Record<string, string>; name?: string }): ResolvedAddress | null {
  const a = json.address;
  if (!a) return null;
  return make(
    join(json.name, a.road, a.suburb ?? a.neighbourhood ?? a.village),
    join(a.county ?? a.state_district ?? a.city, a.state)
  );
}
