# Ek-Ambulance Driver App: Claude Code Task Specifications

Execution sequence and architectural scopes for developing the `@sahayak/driver` Expo application. Tasks must be executed sequentially by Claude Code.

| Task ID | Specification File | Scope |
| :--- | :--- | :--- |
| **P01** | [`P01-monorepo-scaffold.md`](./P01-monorepo-scaffold.md) | Scaffold `apps/driver/` workspace dependencies, root Turborepo configuration, tsconfig inheritance, and symmetrical ESLint boundaries against sibling apps. |
| **P02** | [`P02-driver-lifecycle-state-machine.md`](./P02-driver-lifecycle-state-machine.md) | Implement the pure TypeScript XState v5 `driverLifecycle` state machine, frozen event-payload contracts, `ais125CertPath` guard on `GO_ONLINE`, and rejection of transitions from `offline`. |
| **P03** | [`P03-otp-authentication-driver-role.md`](./P03-otp-authentication-driver-role.md) | Implement `useOtpAuth.ts`, `phone-entry.tsx`, and `otp-verify.tsx` consuming Kong gateway Supabase GoTrue OTP endpoints with client-side `role === "driver"` assertion and forced sign-out on mismatch. |
| **P04** | [`P04-presence-and-ais125-gate.md`](./P04-presence-and-ais125-gate.md) | Implement `usePresence.ts` and `(shift)/standby.tsx` consuming `PATCH /drivers/me/presence` with domain-to-wire coordinate conversion and `crew_incomplete` error mapping to `driverCrewIncomplete`. |
| **P05** | [`P05-centrifugo-dispatch-and-gps-channels.md`](./P05-centrifugo-dispatch-and-gps-channels.md) | Implement `useDispatchOfferChannel.ts` (subscribe `driver:{id}:offers`) and `useGpsPublisher.ts` (publish `mission:{id}` with ~1/3s throttle) with mandatory token renewal on reconnect. |
| **P06** | [`P06-mission-transitions-and-screen-wiring.md`](./P06-mission-transitions-and-screen-wiring.md) | Implement `useMissionTransition.ts` client-to-server event mapping table, wiring `driverLifecycle.store.ts` to `mission/[id].tsx` and `offer.tsx` with strictly server-authoritative transitions (no optimistic state changes). |
