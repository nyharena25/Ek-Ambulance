import { Stack } from "expo-router";

export default function ShiftLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="standby" />
      <Stack.Screen name="booking" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="offer" options={{ presentation: "modal" }} />
    </Stack>
  );
}
