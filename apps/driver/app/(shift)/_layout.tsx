import { Stack } from "expo-router";

export default function ShiftLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="standby" />
      <Stack.Screen name="offer" options={{ presentation: "modal" }} />
    </Stack>
  );
}
