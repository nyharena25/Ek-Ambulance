import { useRouter } from "expo-router";
import { PickupLocationScreen } from "../../src/screens";
import { GeoPoint, JurisdictionResolution } from "@sahayak/domain";

export default function LocationEntryScreen() {
  const router = useRouter();

  const handleConfirmPickup = (data: {
    point: GeoPoint;
    resolution: JurisdictionResolution;
    address: string;
  }) => {
    // Proceed to ambulance category selection with confirmed coordinates & jurisdiction
    router.push({
      pathname: "/booking/category-select",
      params: {
        lat: data.point.latitude.toString(),
        lon: data.point.longitude.toString(),
        jurisdiction: data.resolution.jurisdiction || "DL",
        address: data.address,
      },
    });
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/home");
    }
  };

  return (
    <PickupLocationScreen
      onConfirmPickup={handleConfirmPickup}
      onBack={handleBack}
    />
  );
}
