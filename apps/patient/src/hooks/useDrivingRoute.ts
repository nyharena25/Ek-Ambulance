import { useEffect, useState } from "react";
import { getDrivingRoute, routeToCoordinates, type GeoPoint } from "@sahayak/domain";

export interface MapRoute {
  coordinates: GeoPoint[];
  /** True when OSRM was unreachable: the line is a straight origin -> destination hint, not a road route. */
  isEstimate: boolean;
}

/** Fetched once per origin/destination pair (never per telemetry ping). No real endpoint, no route. */
export function useDrivingRoute(origin: GeoPoint | null, destination: GeoPoint | null): MapRoute | null {
  const [route, setRoute] = useState<MapRoute | null>(null);
  const oLat = origin?.latitude ?? NaN;
  const oLng = origin?.longitude ?? NaN;
  const dLat = destination?.latitude ?? NaN;
  const dLng = destination?.longitude ?? NaN;

  useEffect(() => {
    let stale = false;
    setRoute(null);
    if (![oLat, oLng, dLat, dLng].every(Number.isFinite)) return;
    getDrivingRoute({ latitude: oLat, longitude: oLng }, { latitude: dLat, longitude: dLng }).then((r) => {
      if (stale) return;
      const coordinates = routeToCoordinates(r.geometry);
      setRoute(
        coordinates.length > 1
          ? { coordinates, isEstimate: false }
          : { coordinates: [{ latitude: oLat, longitude: oLng }, { latitude: dLat, longitude: dLng }], isEstimate: true }
      );
    });
    return () => {
      stale = true;
    };
  }, [oLat, oLng, dLat, dLng]);

  return route;
}
