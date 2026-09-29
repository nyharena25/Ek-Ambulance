import { create } from "zustand";
import type { DriverAuthStatus } from "../hooks/otpAuth.core";

/** Whether a verified driver session exists. Written only by useServerSync (from Supabase auth events); read by the route gate. */
export const useDriverAuthStore = create<{ status: DriverAuthStatus }>(() => ({ status: "loading" }));
