# Ek-Ambulance Patient App: Claude Code Task Specifications

Execution sequence and architectural scopes for developing the `@sahayak/patient` Expo application. Tasks must be executed sequentially by Claude Code.

| Task ID | Specification File | Scope |
| :--- | :--- | :--- |
| **P01** | [`P01-monorepo-scaffold.md`](./P01-monorepo-scaffold.md) | Scaffold `apps/patient/` workspace dependencies, root Turborepo configuration, tsconfig inheritance, and boundary-enforcing ESLint rules. |
| **P02** | [`P02-patient-lifecycle-state-machine.md`](./P02-patient-lifecycle-state-machine.md) | Implement the pure TypeScript XState v5 `patientLifecycle` state machine, frozen event-payload contracts, and exhaustive unit tests for legal and illegal transitions. |
| **P03** | [`P03-otp-authentication-flow.md`](./P03-otp-authentication-flow.md) | Implement `useOtpAuth.ts`, `phone-entry.tsx`, and `otp-verify.tsx` consuming the Kong gateway Supabase GoTrue Phone-OTP endpoints with bilingual error surfacing and 429 backoff handling. |
| **P04** | [`P04-centrifugo-mission-channel.md`](./P04-centrifugo-mission-channel.md) | Implement `useMissionChannel.ts` supporting the two-step signed Centrifugo channel token flow, automatic token refresh on reconnect, and unmount lifecycle cleanup. |
| **P05** | [`P05-pricing-estimate-flow.md`](./P05-pricing-estimate-flow.md) | Implement `usePricingEstimate.ts` and `booking/confirm.tsx` consuming statutory pricing estimates with mandatory UI notice that server-side fare at REQUEST time is authoritative. |
| **P06** | [`P06-booking-flow-lifecycle-wiring.md`](./P06-booking-flow-lifecycle-wiring.md) | Wire `patientLifecycle.store.ts` (Zustand wrapper around P02 XState machine) across booking screens with optimistic-then-rollback handling for CANCEL and server-guarded state boundaries. |
