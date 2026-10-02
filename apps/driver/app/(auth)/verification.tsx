import { DriverVerificationScreen } from "../../src/screens";

/** Submitted application waiting for staff review. The root route gate sends the driver here (and away again) from the server's KYC state. */
export default function VerificationRoute() {
  return <DriverVerificationScreen />;
}
