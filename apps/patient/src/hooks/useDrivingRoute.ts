import { useEffect, useState } from "react";
import { getDrivingRoute, routeToCoordinates, type GeoPoint } from "@sahayak/domain";

export interface MapRoute {
  coordinates: GeoPoint[];
  /** True when OSRM was unreachable: the line is a straight origin -> destination hint, not a road route. */
  isEstimate: boolean;
}

/** Fetched once per origin/destination pair (never per telemetry ping). */
export function useDrivingRoute(origin: GeoPoint, destination: GeoPoint): MapRoute | null {
  const [route, setRoute] = useState<MapRoute | null>(null);
  const { latitude: oLat, longitude: oLng } = origin;
  const { latitude: dLat, longitude: dLng } = destination;

  useEffect(() => {
    let stale = false;
    setRoute(null);
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
