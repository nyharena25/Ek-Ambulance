import type { useRouter } from "expo-router";

/** Reset the machine and collapse the whole booking stack so hardware Back from Home exits the app. */
export function returnHome(router: ReturnType<typeof useRouter>, resetLifecycle: () => void) {
  resetLifecycle();
  router.dismissAll();
  router.replace("/(tabs)/home");
}
