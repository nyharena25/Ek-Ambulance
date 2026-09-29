import { useRouter } from "expo-router";
import { PickupLocationScreen } from "../../src/screens";
import type { GeoPoint } from "@sahayak/domain";

export default function LocationEntryScreen() {
  const router = useRouter();

  const handleConfirmPickup = (data: {
    point: GeoPoint;
    address: string;
  }) => {
    // Only the coordinates travel on: the server decides the jurisdiction when the mission is created (R-12).
    router.push({
      pathname: "/booking/category-select",
      params: {
        lat: data.point.latitude.toString(),
        lon: data.point.longitude.toString(),
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
