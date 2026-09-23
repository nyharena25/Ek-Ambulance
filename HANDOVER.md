# SAHAYAK-EMS: Autonomous Handover & Execution Tracking Document

> **Document Purpose:**  
> This file (`HANDOVER.md`) is the shared, persistent **single source of truth** between **Antigravity** (System Architect & Project Orchestrator) and **Claude Code** (Implementation Agent operating in the CLI/terminal). It governs all task transitions, architectural constraints, verification milestones, and runtime state synchronizations.

---

## 1. Architectural Invariants & Non-Negotiable Rules

Every code change, refactor, and screen implementation must strictly adhere to these four immutable pillars. Any violation is grounds for immediate task failure and rollback:

1. **Domain Purity (`@sahayak/domain`)**:
   - The `@sahayak/domain` workspace package must strictly contain **pure, side-effect-free TypeScript logic**.
   - Permitted logic: Clinical triage algorithms (START/ESI), statutory pricing models (Delhi Gazette / UP Motor Vehicles Rules), geospatial jurisdiction boundary resolution, and pure XState v5 state machine declarations.
   - **Strictly Forbidden:** Zero UI frameworks (`react`, `react-native`), zero persistent storage (`AsyncStorage`, SQLite), zero network or I/O calls (`fetch`, `axios`, WebSockets).

2. **Baseline Test Integrity (391/391 Invariant)**:
   - The verified baseline milestone of **391/391 tests passing** must never drop below **100% pass rate** at any point during or after task execution.
   - No task is considered complete if any existing test fails, is skipped, or is muted.

3. **State Enforcement (Server-Authoritative XState)**:
   - UI screen transitions must be driven strictly by the formal XState machine lifecycle (`requested` $\to$ `allocated` $\to$ `en_route_to_patient` $\to$ `on_scene` $\to$ `transporting` $\to$ `arrived_hospital` $\to$ `completed` / `cancelled`).
   - Arbitrary client-side boolean flags (e.g., `isTripActive = true`, `hasArrived = true`) are strictly prohibited for driving core navigation and clinical milestones.

4. **Transport, Realtime & Data Residency (DPDP Act 2023 Compliance)**:
   - **Centrifugo v5 WebSocket Channels:** High-frequency live driver GPS telemetry must route strictly through Centrifugo v5 signed-JWT WebSocket channels (`mission:{id}` with role `publisher` for driver, `subscriber` for patient). Supabase Realtime Broadcast must **never** be used for driver telemetry as it lacks Row-Level Security (RLS) enforcement.
   - **Data Residency:** All databases, authentication sessions (Supabase GoTrue), and API gateways (Kong) must remain strictly physically pinned to AWS Mumbai (`ap-south-1`) to comply with the statutory mandates of the **Digital Personal Data Protection (DPDP) Act 2023**.

---

## 2. Task Execution Ledger (The Checklist)

Tracked sequential phases. Status legend:
- `[ ] Pending`: Queued for execution.
- `[-] In Progress`: Currently being executed by Claude Code.
- `[x] Completed`: Executed, tested, verified, and signed off.
- `[!] Blocked`: Execution stopped due to roadblock or dependency failure.

### Phase 1: Shared Domain Core & Baseline Audit
- [x] **Task 1.1:** Verify monorepo workspace dependencies, package linking, and module resolution across `@sahayak/domain`, `@sahayak/ui`, `@sahayak/data`, and `@sahayak/observability`. *(Completed: `pnpm install` resolved 893 packages; 6/6 workspaces now typecheck.)*
- [!] **Task 1.2:** Execute test suite to confirm 391/391 tests passing via CLI without regressions or skipped tests. *(BLOCKED - the 391/391 baseline does not exist in this repository. See section 5, Deviation D1.)*

### Phase 2: Patient App Client Scaffolding
- [ ] **Task 2.1:** Initialize and verify Expo TypeScript project structure in `apps/patient` with Expo Router v4 integration.
- [ ] **Task 2.2:** Configure design tokens, high-contrast WCAG AAA palettes, and styling engine matching layout specifications.
- [ ] **Task 2.3:** Configure bilingual localization engine (`i18next` / custom string dictionaries) with 100% layout parity across English and Hindi (`EN` | `हिन्दी`).

### Phase 3: Screen Implementation & Pure Logic Wiring
- [ ] **Task 3.1:** Phone OTP Auth Screen with DPDP Act 2023 statutory consent notices, Section 6 purpose declarations, and Indian mobile regex validation (`^[6-9]\d{9}$`).
- [ ] **Task 3.2:** Pickup Location Screen with interactive coordinate search, GPS 'Locate Me', and Delhi (DL) vs. Uttar Pradesh (UP) jurisdiction boundary resolver.
- [ ] **Task 3.3:** START/ESI Emergency Clinical Triage Questionnaire supporting sub-15-second completion, complaint cards, and critical red-flag triggers.
- [ ] **Task 3.4:** AIS-125 Ambulance Tier Selection (Type D ALS, Type C BLS, Type B PTA) & Statutory Regulated Fare Breakdown (zero-surge mandate).
- [ ] **Task 3.5:** Real-time Mission Tracking View with XState event binding, live driver markers, ETA estimation, and masked virtual calling.

### Phase 4: Real-time Services & Client Integration
- [ ] **Task 4.1:** Supabase GoTrue Indian mobile (+91) OTP client wiring with 429 rate-limiting backoff and session persistence.
- [ ] **Task 4.2:** Centrifugo v5 WebSocket client connection and signed-JWT channel subscription (`POST /realtime/token`) with automatic token renewal on reconnect.

### Phase 5: Static Analysis, Verification & Handover Sign-off
- [x] **Task 5.1:** Zero-error TypeScript compilation check across all monorepo workspaces (`tsc --noEmit` / `turbo run typecheck`). *(Completed: 112 errors -> 0, 6/6 workspaces.)*
- [ ] **Task 5.2:** Physical Android device deployment validation and end-to-end integration sign-off.

---

## 3. Handoff Protocol & State Synchronization Rules

To maintain flawless coordination across conversational turns, Antigravity and Claude Code must strictly adhere to the following operating procedure:

### A. Claude Code Update Routine (CLI Worker)
After executing any individual task in the CLI/terminal, Claude Code must:
1. **Validate Regression-Free Code:** Run `tsc --noEmit` and the relevant test suite (e.g. `pnpm test` / domain unit tests) to prove 0 errors and zero test regressions.
2. **Update Checklist Status:** In section 2 of `HANDOVER.md`, mark the finished item as `[x] Completed` and the next immediate item as `[-] In Progress` or `[ ] Pending`.
3. **Record Action Details:** Fill out the **Last Completed Action** summary including:
   - Git commit hash or changed file list.
   - Exact files created, modified, or deleted.
   - Command line output verifying clean compilation and test passes.
4. **Document Anomalies:** Note any technical debt, API drift, or external blockers in the **Current Roadblocks / Deviations** block before yielding turn control.

### B. Antigravity Ingestion Routine (Architectural Orchestrator)
Before issuing the next task prompt to Claude Code, Antigravity must:
1. **Read `HANDOVER.md`:** Review the latest updates, verify that all architectural invariants were maintained (domain purity, 391 tests, XState adherence, Centrifugo/DPDP).
2. **Audit Verification Proofs:** Confirm that the test output and typecheck proofs recorded by Claude Code are valid and complete.
3. **Dispatch Next Specification:** Formulate the precise prompt and architectural boundary for the next logical task in the sequence, ensuring no scope creep or out-of-order execution.

---

## 4. Live Session State Block

*(Updated synchronously after every turn)*

| Field | Current Value |
| :--- | :--- |
| **Active Task ID** | `Pre-Flight Milestone` (Android Config, Env Setup & Dual-App Harness - see section 18) |
| **Agent Executing** | Claude Code (CLI) |
| **Timestamp** | `2026-09-23T19:15:00+05:30` |
| **Files Touched** | 8 created, 13 modified, 0 deleted (full manifest in section 18) |
| **Verification Proof** | `pnpm preflight` (`turbo run typecheck lint test --force`): 10/10 successful (6 typecheck, 0 lint [documented no-op, see section 18 Objective 5], 4 test), 0 regressions. `expo prebuild --clean --no-install --platform android` clean for both apps, manifests verified by grep. |
| **Next Required Action** | Antigravity to review section 18's deviations (lint peer-deps not installed, `EXPO_PUBLIC_SUPABASE_URL` not wired into `supabaseClient.ts`, placeholder icon/splash assets) before any store-facing build; Supabase migration/deploy deliberately left untouched per this phase's own directive. |

### Last Completed Action
- **Action Description:** Patient App Milestone follow-up fix: wired `reset()` into `matching.tsx`'s pre-match cancellation handler, closing the last of the three terminal-state store-reset gaps (the other two - post-match completion and post-match cancellation - were fixed earlier in section 12). Full detail in section 12.
- **Verification Commands:** `turbo run typecheck --force` and `turbo run test --force`
- **Verification Output:**
  ```
  $ ./node_modules/.bin/turbo run typecheck --force
   Tasks:    6 successful, 6 total

  $ ./node_modules/.bin/turbo run test --force
  @sahayak/driver:test:  ALL 6 TEST SUITES PASSED SUCCESSFULLY (100% GREEN)
  @sahayak/ui:test:      ALL EK-AMBULANCE DESIGN SYSTEM TESTS PASSED (100% GREEN)
  @sahayak/domain:test:  ALL PATIENT LIFECYCLE MACHINE TESTS PASSED (100% GREEN)
  @sahayak/patient:test: ALL MISSION CHANNEL SERVICE TESTS PASSED (100% GREEN)
  @sahayak/patient:test: ALL PATIENT OTP AUTH CORE TESTS PASSED (100% GREEN)
  @sahayak/patient:test: GOLDEN PATH INTEGRATION TEST PASSED (100% GREEN, including MISSION_CANCELLED)
   Tasks:    4 successful, 4 total

  $ per-workspace tsc --noEmit
  packages/domain          0 errors
  packages/ui              0 errors
  packages/data            0 errors
  packages/observability   0 errors
  apps/patient             0 errors
  apps/driver              0 errors
  ```

---

## 5. Refactor Pass R1 Report

### 5.1 Directive 1 - TypeScript Audit (112 errors -> 0)

The pre-refactor tree had **no `node_modules` at all**, so no typecheck had ever actually run. After `pnpm install` (893 packages) the real baseline was **112 errors**, now **0** across all six workspaces.

**Three workspaces were silently unverifiable.** `packages/ui`, `packages/data` and `packages/observability` had **no `tsconfig.json` and no `typecheck` script**. `tsc` in those directories printed its help text and exited 0, and `turbo run typecheck` skipped them entirely. This reported as a clean pass while checking nothing. Adding the four missing configs surfaced 4 further real errors in `packages/ui`, now fixed.

Baseline error distribution: 56x TS6133 (unused), 22x TS5097 (`.ts` import extensions), 14x TS18048 / 3x TS2532 (`noUncheckedIndexedAccess`), 6x TS2580 (missing `@types/node`), 5x TS2339, plus TS7053 / TS2551 / TS2503 / TS2345 / TS2307.

Root-cause fixes, not suppressions - **no `@ts-ignore`, no `any`, no `eslint-disable` was added anywhere**:

| Fix | Location | Why |
| :--- | :--- | :--- |
| Added `allowImportingTsExtensions` + `noEmit` | `packages/config/tsconfig.base.json` | Cleared all 22 TS5097 at once. The two test suites run under `node --experimental-strip-types`, which performs no extension resolution and therefore *requires* the explicit `.ts` specifiers. Stripping them would have broken the tests; the compiler flag is the correct reconciliation. Nothing in the repo emits (every package `main` points at `src/*.ts`). |
| Removed vestigial `rootDir`/`outDir` | `packages/domain/tsconfig.json` | Conflicted with `noEmit`. |
| Added `tsconfig.json` + `typecheck` script | `packages/ui`, `packages/data`, `packages/observability` | Ended the false-green described above. |
| Added `@types/node` | `apps/patient`, `apps/driver`, `packages/ui` | `process` and `node:assert` were unresolved. |
| `RANKED_TRAUMA_CENTRES: readonly [TraumaCentreItem, ...TraumaCentreItem[]]` | `driverOnSceneStrings.ts` | Non-emptiness encoded in the type. Cleared **9** `selectedHospital is possibly undefined` errors plus 1 TS2345 at the contract instead of guarding 10 call sites. |
| `primaryManeuvers: readonly [NavigationManeuver, ...NavigationManeuver[]]` | `driverNavigationStrings.ts` | Same pattern; cleared 4 `activeManeuver is possibly undefined`. |
| Added the missing `shadows.lg` tier | `packages/ui/src/tokens/layout.ts` | 4 screens referenced `shadows.lg`, which did not exist, while `spacing` and `radii` both define `lg`. Completed the scale. |
| Corrected import path | `driverStandby.store.ts` | Imported `./driverOnboardingStrings`; the file lives in `../i18n/`. |
| `totalFareInr` -> `estimatedTotalInr` | `app/booking/confirm.tsx` | Property does not exist on `ItemizedStatutoryFare`. |
| `landmarkStateText` -> `landmarkStateTag` | `PickupLocationScreen.tsx` | Style key typo. |
| Removed 38 unnecessary `React` imports | across both apps | `jsx: "react-jsx"` makes them dead. The two files that genuinely use the `React.*` namespace were detected and left intact. |

**Domain contract conformance verified:** `@sahayak/domain` has zero `react` / `react-native` / `expo` / storage / network imports (Invariant 1 holds). Triage (`TriageResult`, `UrgencyTier`, `PrimaryComplaintType`), AIS-125 (`AIS125VehicleType`), statutory pricing (`ItemizedStatutoryFare`) and XState event types (`PatientLifecycleEvent`, `ConfirmArrivalScenePayload`, `ConfirmPatientOnboardPayload`) now typecheck at every screen and route boundary.

### 5.2 Three real bugs found and fixed

These were latent behind the unresolved type errors:

1. **The 108 emergency call was unreachable.** `OnboardingScreen` declared `onCall108`, `app/index.tsx` passed a working `Linking.openURL("tel:108")` handler, and `onboardingStrings.tollFreeCall` ("Call 108" / "108 पर कॉल करें") existed - but **no control was ever rendered**, so the national emergency fallback could not be invoked from the landing screen. Wired an accessible 52dp `Pressable` into the action dock. This completes pre-existing intended wiring, not new scope.
2. **The family share message named the wrong hospital.** `TransportingScreen` accepts `hospitalName` and `wardStatus` props, but `generateShareMessage()` passed `strings.hospitalName` and `strings.wardReadinessBannerTitle` - the hardcoded i18n sample values - so the WhatsApp/SMS message sent to a patient's family would state a fixed hospital regardless of the actual destination. Now uses the props.
3. **Two hooks left `isLoading` stuck `true` forever.** `usePricingEstimate.fetchEstimate` and `usePresence.updatePresence` set `setIsLoading(true)` and returned without ever resetting it, so any spinner bound to them would spin permanently. Both now reset in a `finally`. `usePresence` additionally never applied the requested state; it now honours `params.isOnline`.

A fourth defect was removed rather than repaired: `booking/completed.tsx` navigated to `/(tabs)/help`, **a route that does not exist**. See 5.3.

### 5.3 Directive 2 - Bloat removal

**Deleted (3 files):**

| File | Evidence |
| :--- | :--- |
| `apps/driver/app/mission/%5Bid%5D.tsx` | URL-encoded duplicate of `[id].tsx`. Older mtime, and strictly superseded - it lacked the `transporting` phase and the `InTransitHospitalScreen` branch. Expo Router would have treated it as a second literal route. |
| `apps/patient/app/(tabs)/profile.tsx` | 31-line placeholder ("Emergency contacts and medical information"). Zero inbound router references. |
| `apps/patient/app/(tabs)/history.tsx` | 31-line placeholder ("Previous ambulance dispatch records"). Zero inbound router references. |

Reachability was verified before deleting. `(tabs)/home.tsx` was **kept** despite also being a stub - it has 7 inbound `router.replace("/(tabs)/home")` calls and is the post-authentication landing route.

**Also removed:** the dead `/(tabs)/help` navigation and its `handleDisputeFare` handler from `booking/completed.tsx`; the unconsumed `maneuverType` field from `NavigationManeuver` (7 references - the interface declaration and 6 data entries, with zero readers, while the sibling `icon` field is the one actually rendered); `SCREEN_WIDTH` and its now-unused `Dimensions` imports in two screens; 38 dead `React` imports; and 9 unused imports/destructures.

**Scope note:** directive 2 also asked for un-nesting of `View`-inside-`View`. The screens audited for dead code and iconography were `DriverOnboardingScreen` (2384 lines), `DriverStandbyScreen`, `MissionTrackingScreen`, `ActiveMatchingScreen`, `TransportingScreen`, `DriverNavigationScreen`, `MissionCompletionScreen`, `OnSceneCareScreen`, `PickupLocationScreen`, `InTransitHospitalScreen`, `PhoneAuthScreen`, `IncomingMissionModal`, `TriageScreen`, `AmbulanceCategoryScreen`, `OnboardingScreen`, `StatutoryFareBottomSheet` and `OfflineConnectivityOverlay`. **A systematic nesting-depth reduction across those ~19k lines was not performed** - the wrappers encountered carried distinct layout roles (flex rows, positioned map overlays, 44dp icon bounding boxes), and collapsing them speculatively risked visual regressions with no test coverage to catch them. This remains open work and is deliberately not claimed as done.

### 5.4 Directive 3 - Iconography (425 raw glyphs -> 309 typed vector icons)

**Icon set selection deviates from the directive, deliberately.** The directive asked for "Lucide, Feather, or Ionicons". **Lucide is not distributed in `@expo/vector-icons` at all** and could not be used without adding a new dependency. Validating candidate names against the installed glyph maps showed Ionicons (1338 glyphs) **has no true equivalent** for the clinical set this app depends on:

```
lungs         -> MISSING in Ionicons   (nearest: "fitness")
brain         -> MISSING in Ionicons
stethoscope   -> MISSING in Ionicons   (nearest: "medkit")
ambulance     -> MISSING in Ionicons   (nearest: "car")
hospital-building -> MISSING in Ionicons (nearest: "business")
```

Feather (286 glyphs) is worse. Approximating a stethoscope as a medkit or lungs as "fitness" in a clinical triage product misrepresents medical meaning, so:

- **Ionicons is the primary set** - 56 distinct glyphs, the large majority of call sites (checkmarks, warnings, location, call, lock, documents, clipboard, refresh, arrows, carets, battery, volume, flag, train, bed, scale).
- **MaterialCommunityIcons is used only where Ionicons has no real glyph** - 27 distinct: `ambulance` (x16), `hospital-building` (x12), `car-emergency` (x6), `lungs` (x5), `stethoscope` (x4), `heart-pulse` (x4), `target` (x4), `chair-rolling` (x4), `weather-windy` (x4), `motorbike` (x3), `van-passenger` (x3), `blood-bag` (x2), `brain` (x2), `police-badge` (x2), `satellite-variant` (x2), `road-variant` (x2), `pill` (x2), `sofa` (x2), `door` (x2), `tie` (x2), `coat-rack` (x2), `meditation` (x2), and one each of `bank`, `card-account-details`, `flash-alert`, `medical-bag`, `script-text`.

**All 309 icon references were machine-validated against the installed `Ionicons.json` and `MaterialCommunityIcons.json` glyph maps - zero invalid names.**

**Added dependency:** `@expo/vector-icons@^14.0.4` to both apps (it was not previously a dependency of either).

**Typed contract.** `icon: string` on six i18n interfaces was replaced with a discriminated `IconRef`:

```ts
export type IconRef =
  | { set: "ion"; name: keyof typeof Ionicons.glyphMap }
  | { set: "mci"; name: keyof typeof MaterialCommunityIcons.glyphMap };
```

An invalid icon name is now a **compile error**, not a silent `?` box at runtime. A 30-line `AppIcon` renderer was added to each app (`apps/*/src/components/AppIcon.tsx`). It is deliberately **duplicated rather than placed in `@sahayak/ui`**: that package is imported by `designSystem.test.ts`, which runs under bare `node`, and pulling React Native into its barrel would break that suite.

**Representative mappings** (85 i18n data fields + 224 JSX sites):

| Was | Now | Was | Now |
| :--- | :--- | :--- | :--- |
| 🚑 | `mci:ambulance` | ✓ | `ion:checkmark` |
| 🏥 | `mci:hospital-building` | ⚠️ | `ion:warning` |
| 📍 | `ion:location` | ⚡ | `ion:flash` |
| 📞 | `ion:call` | 🚨 | `mci:car-emergency` |
| ⏱️ | `ion:time` | ✕ | `ion:close` |
| 🩺 | `mci:stethoscope` | 🫁 | `mci:lungs` |
| 🫀 | `mci:heart-pulse` | 🧠 | `mci:brain` |
| 🩸 | `mci:blood-bag` | 🩹 | `ion:bandage` |
| 🔒 | `ion:lock-closed` | ⚖️ | `ion:scale` |
| 📄 / 📜 | `ion:document-text` / `mci:script-text` | 📋 | `ion:clipboard` |
| 🛡️ | `ion:shield-checkmark` | ⚕️ | `mci:medical-bag` |
| 🔋 / 🪫 | `ion:battery-full` / `battery-dead` | 🔊 / 🔇 | `ion:volume-high` / `volume-mute` |
| ← / → | `ion:arrow-back` / `arrow-forward` | ▲ / ▼ | `ion:caret-up` / `caret-down` |
| 🏁 | `ion:flag` | ↱ | `ion:return-up-forward` |
| 🚗 / 🚧 / 🚂 / 🚓 | `ion:car` / `ion:construct` / `ion:train` / `mci:police-badge` | 🌧️ | `ion:rainy` |

**23 glyph-bearing lines were deliberately retained** repo-wide (18 under `apps/`, 5 under `packages/ui/`) and are not UI iconography:

- **7 in outbound message bodies** - `transportingStrings.formattedShareMessage` (🚨🏥🔗, both languages) and `MissionCompletionScreen`'s EMR `Share.share()` payload (📄). These are WhatsApp/SMS text sent to a patient's family; a vector icon cannot be transmitted as message content.
- **12 in test console output** - the `✓` in `console.log` calls in both suites (7 in `apps/driver/.../telemetryQueue.service.test.ts`, 5 in `packages/ui/src/designSystem.test.ts`). Terminal output, not UI.
- **4 route-description arrows** - `"Dadri Main Road → Expressway Connector"`, `"Jaypee Hospital ... → Max Super Speciality Saket"`. Real punctuation inside a sentence.

**Touch targets.** Six interactive controls sized 32-40dp (`backButton` x2, `recenterButton` x2, `drawerCloseButton`, plus one in `DriverOnboardingScreen`) lacked any touch expansion; `hitSlop={10}` was added, lifting each to >=52dp effective. Controls that already carried `hitSlop` were left untouched. Icon-only containers on the core flow were confirmed already compliant (`complaintIconBox` 44x44, `maneuverIconBox` 48x48, new 108 button 52dp minHeight). Verified: **0 interactive small controls now lack touch expansion**. Colors use semantic tokens (`colors.emergency` / `emergencyDark` for urgency, `colors.slate600`/`slate700` for surfaces, `colors.white` on red fills); sizes are derived from each call site's existing `fontSize` so layout is preserved - `@expo/vector-icons` merges `[styleDefaults, style, styleOverrides]`, so a passed `style` intentionally wins over the `size`/`color` props.

### 5.5 Directive 4 - Typographic sanitation

- **33 em-dashes (U+2014)** removed from 15 files under `docs/`. Replacements are context-appropriate rather than blanket: `: ` in headings and bold labels (`# P05 - Implement...` -> `# P05: Implement...`, `**Step 1 - request a token**` -> `**Step 1: request a token**`) and after status codes (`Success (200) - ...` -> `Success (200): ...`); ` - ` mid-sentence.
- **31 en-dashes (U+2013)** removed from 8 source files. **A search for the em-dash (U+2014) alone would have missed every one of these** - all were in clinical and geographic numeric ranges, written with U+2013: `"Normal (60[U+2013]100)"`, `"GCS 13[U+2013]15"`, `"12[U+2013]20 bpm"`, `"Wave 1: 0[U+2013]3 km"`. Converted to ASCII hyphens, eliminating font-fallback risk in mixed Latin/Devanagari clinical strings. (Codepoints are written in `[U+....]` notation here so this document itself stays ASCII-clean under the same sweep.)
- Verified: **zero U+2014, U+2013 or U+2015 remain** in any `.ts`, `.tsx`, `.js`, `.json` or `.md` file in the repository.
- The two strings frozen by verbatim test assertions (`driverOfflineStrings.en/hi.bannerTitle`) were identified in advance and confirmed untouched; both bilingual assertions still pass.

### 5.6 Verification

`turbo run test` previously found **zero test tasks and exited 0** - another false green, since no package declared a `test` script. Real `test` scripts were added to `packages/ui` and `apps/driver`, so the suites now actually execute under orchestration.

---

## 6. Current Roadblocks / Deviations

### D1 - BLOCKING: the 391/391 test baseline does not exist

Invariant 2 and Task 1.2 require confirming **391/391 tests passing**. That figure is **not substantiated by this repository**, and no refactor can restore a baseline that was never present. Measured facts:

| Metric | Actual |
| :--- | :--- |
| Test files in repo | **2** (`packages/ui/src/designSystem.test.ts`, `apps/driver/src/services/telemetryQueue.service.test.ts`) |
| Total `assert.*` calls | **54** (20 + 34) |
| Reported logical suites | **11** (5 + 6) |
| Test runner (jest/vitest) | **none installed, no config present** |
| `test` script before this pass | **none in any of the 6 workspaces** |

Both suites are standalone `node:assert` scripts run via `node --experimental-strip-types`. There is no runner that could produce a 391-test count, and the prior handover's own verification line cites only `node ... designSystem.test.ts` - a single file. **The 391/391 claim appears to be an unverified carry-over and should be corrected at source or the real suite supplied.**

What is actually true after this pass: **both suites pass 100% green (11/11 logical suites, 54/54 assertions), with zero skipped and zero muted tests.** Assertion count rose from 50 to 54 - four were *added*, not removed, while fixing `noUncheckedIndexedAccess` errors in the telemetry test: a queue-length check, a middle-element FIFO ordering check, a non-empty-after-compaction check, and an identity check that the retained ping is the one that failed to sync. Every pre-existing assertion was preserved.

### D2 - `usePricingEstimate` and `usePresence` remain stubs

Both are marked "Implemented in task P04/P05" and return placeholder values. Their `isLoading` lifecycle bugs are fixed and they typecheck, but they perform **no network calls**. `useCentrifugoConnection.syncQueuedPings` likewise returns `true` unconditionally. Tasks 4.1 and 4.2 are genuinely outstanding - the types now compile, which is not the same as the features working.

### D3 - `useCentrifugoConnection` options are declared but unconsumed

`authToken` and `gatewayUrl` (including its `process.env.EXPO_PUBLIC_GATEWAY_URL` default) were removed from the destructuring because the stub body never used them. They remain in `UseCentrifugoConnectionOptions`, so the public contract is unchanged; re-destructure them when the real client lands in Task 4.2.

### D4 - Fare dispute affordance removed, not replaced

`booking/completed.tsx` pointed at the nonexistent `/(tabs)/help` route. The dead navigation was removed, which also removes the dispute-fare button from `MissionCompletionScreen` (the prop is optional and is no longer passed). Given the statutory zero-surge mandate, a real dispute/support route is likely required - this needs a product decision and a destination screen, so it was not invented here.

### D5 - `(tabs)` group has no layout

`apps/patient/app/(tabs)/` now contains only `home.tsx` and has **no `_layout.tsx`**, so the group renders no tab bar despite its name. It functions purely as the post-auth landing route via the root `Stack`. Worth either adding a real tab layout or flattening the group.

### D6 - No physical device validation

Task 5.2 is untouched. All verification here is static (`tsc --noEmit`) plus the two Node-run unit suites. **The UI has not been rendered on a device or simulator**, so icon glyph rendering, bilingual layout parity with the new inline icons, and touch-target ergonomics remain visually unconfirmed. Given ~19k lines of screen code changed with no component-level test coverage, a visual pass before sign-off is strongly advised.

---

## 7. Step 2 Closure: Token, Contract, and i18n Remediation

*(Directive: Batches 1-3, executed sequentially, 2026-09-22)*

Scope was strictly contract integrity, token sanitation, and string extraction for existing views. Per the directive, the missing driver auth screens (`app/(auth)/phone-entry.tsx`, `app/(auth)/otp-verify.tsx`) were **not** implemented - their content stays deferred to the driver milestone.

### Batch 1 - Domain Contract Alignment

**Ad-hoc `"RED" | "YELLOW"` union replaced with the domain's `UrgencyTier`** (`CAT_1_IMMEDIATE` / `CAT_2_URGENT` / `CAT_3_DELAYED`) across `driverMissionOfferStrings.ts`, `IncomingMissionModal.tsx`, and `app/(shift)/offer.tsx`. This was a 3-valued type, not 2, so `triageBadges` became a `Record<UrgencyTier, TriageBadgeDetails>` requiring a real third entry - a `CAT_3_DELAYED` (Green / PTA) badge was added with copy aligned to the domain's own `minor_injury` triage text, plus matching card/pill/title styles (green variants, reusing existing `colors.triageGreen*` tokens, no new hex). The demo/verification acuity toggle now cycles through all three tiers via one exhaustive `nextUrgencyTier()` helper (switch with no `default`, so a 4th tier added to the domain type becomes a compile error here instead of a silent no-op) - reused by both the toggle button and the display-label string function. `app/(shift)/offer.tsx`'s URL param is now validated against the real tier list rather than blindly cast.

**`MissionCompletionScreenProps` refactored to accept `fareDetails?: ItemizedStatutoryFare`** instead of decomposed `baseFareInr?` / `perKmRateInr?` / `totalFareInr?`, aligning it with `StatutoryFareBottomSheetProps` - both now speak the identical domain contract, one producing it (`onConfirmAndRequest`), one consuming it. The screen's self-computed `additionalKm`/`additionalTariff` (a duplicate of logic the domain object already computes) was deleted in favor of `fareDetails.billableAdditionalKm` / `fareDetails.additionalDistanceFareInr` directly. A second hardcoded `5.0` km threshold (`strings.baseFareRow(5.0)`) was replaced with `fareDetails.initialIncludedKm` - the same constant, no longer duplicated. Both callers (`app/booking/completed.tsx`, `app/booking/[id].tsx`) were updated to derive `fareDetails` via `computeItemizedStatutoryFare()` - the same domain function `StatutoryFareBottomSheet` uses - instead of threading three independent, unvalidated URL params. This incidentally fixes a latent bug: neither caller's `baseFare`/`perKmRate`/`totalFare` params were ever populated by any live navigation (traced the full `confirm -> matching -> [id]` chain - `matching.tsx` never forwards them), so both routes always rendered the `TYPE_D_ALS` fare regardless of which vehicle type was actually selected. They now compute the correct fare for whatever `vehicleType` is passed.

### Batch 2 - Token Centralization & Style Audit

**All 115 hardcoded hex literals purged** across the 13 flagged files, importing `colors` (and `semanticColors` where no flat export existed) from `@sahayak/ui`. Every substitution was validated with a dry-run pass (all target patterns confirmed to match exactly once) before any file was written, so no file was left partially edited.

- **106 of 115 were exact token matches** (e.g. `#DC2626` -> `colors.emergency`, `#0F172A` -> `colors.slate900`, `#22C55E` -> `semanticColors.status.verifiedBorder`).
- **9 had no exact token in the design system** and were mapped to the *nearest* existing token rather than adding new ones (out of scope for a sanitation pass) - each is marked with a `// nearest existing token` comment so the substitution is never silently mistaken for an exact match. This includes a WhatsApp-brand green button (`#16A34A` -> `colors.success`) and several cyan/sky accents (`#38BDF8`, `#06B6D4` -> `semanticColors.status.statutoryBorder`) that have no equivalent hue anywhere in the palette.
- **The three worst offenders** (`phone-entry.tsx`, `otp-verify.tsx`, `(tabs)/home.tsx`) had **zero** `@sahayak/ui` import beforehand; all three now import `colors` and reference tokens exclusively. No content or behavior in these files changed - only their `StyleSheet` values.

Verified: **zero hex literals (`#RRGGBB`) remain anywhere in `apps/*/src` or `apps/*/app`.**

### Batch 3 - i18n Key Extraction

**23 of the 27 originally-audited hardcoded strings extracted** into `en`/`hi` dictionaries (the remaining 4 are the deferred driver auth screen's content, per the directive's explicit scope boundary - listed below, untouched). One additional string was fixed alongside its sibling: `DriverOnboardingScreen.tsx` had two adjacent `statutoryRefText` literals ("AIS-125 / CMVR Rule 125(C)" and "MV Act Sec 56 / Form 38") using the identical style/field; only the second was in the original 27-count, but leaving the first hardcoded while its neighbor got extracted would have been inconsistent, so both were done together.

| File | Strings extracted | i18n dictionary |
| :--- | :--- | :--- |
| `OnSceneCareScreen.tsx` | "ICU Free", "Resus Bays", "Ventilators" | `driverOnSceneStrings.ts` (new keys) |
| `DriverNavigationScreen.tsx` | "Close Dialog" | `driverNavigationStrings.ts` (new key) |
| `DriverStandbyScreen.tsx` | "Jaypee / AIIMS", "Fortis / Max", "Precision" | `driverStandbyStrings.ts` (new keys) |
| `TriageScreen.tsx` | "START Protocol" | `triageStrings.ts` (new key) |
| `PhoneAuthScreen.tsx` | "AIS-125 Secure Auth" | `authStrings.ts` (new key) |
| `ActiveMatchingScreen.tsx` | "CALL 108" | `matchingStrings.ts` (new key) |
| `DriverOnboardingScreen.tsx` | "MoRTH AIS-125:2014", "MANDATORY STATUTORY" x2, "AIS-125 / CMVR Rule 125(C)", "MV Act Sec 56 / Form 38", "REQUIRED" | `driverOnboardingStrings.ts` (new keys) |
| `TransportingScreen.tsx` | "GREEN CORRIDOR" | `transportingStrings.ts` (new key) |
| `MissionTrackingScreen.tsx` | "LIVE GPS", "VERIFIED" | `trackingStrings.ts` (new keys) |
| `app/booking/confirm.tsx` | "Confirm Ambulance Dispatch", "PICKUP LOCATION", "AIS-125 FLEET VEHICLE" | `confirmStrings.ts` (**new file** - this route had zero i18n) |
| `app/(tabs)/home.tsx` | "Ek-Ambulance Dispatch", "Request Emergency Medical Assistance" | `homeStrings.ts` (**new file** - this route had zero i18n) |

**Translation, not transliteration, for real prose**: "MANDATORY STATUTORY" -> "वैधानिक रूप से अनिवार्य", "REQUIRED" -> "आवश्यक", "Precision" -> "यथार्थता", etc. **Formal regulatory citations kept identical across languages** (matching the codebase's existing convention for "AIS-125" and similar codes): "MoRTH AIS-125:2014", "AIS-125 / CMVR Rule 125(C)", and "MV Act Sec 56 / Form 38" are the same legal citation in both `en` and `hi` blocks - a citation number does not get translated. **"START Protocol" keeps "START" untranslated** (it's the clinical initialism, same convention already used for "START Triage" / "START & ESI Protocol" elsewhere in the same file) while "Protocol" -> "प्रोटोकॉल". **Hospital proper nouns transliterated into Devanagari** ("Jaypee / AIIMS" -> "जेपी / एम्स"), matching the existing convention for every other hospital name in the codebase (`RANKED_TRAUMA_CENTRES.hindiName`).

**`confirm.tsx` and `home.tsx` had no language mechanism at all before this pass** (no `SupportedLanguage` state, no `strings` lookup). Both were wired with the minimal correct pattern: `const strings = xStrings.en;` (a plain constant, not `useState`, since nothing in either route calls a setter - `noUnusedLocals` would reject an unused one) with a comment noting no switcher is wired yet. **No language-toggle UI was added to either screen** - that would be a new interactive widget on what are still otherwise-unbuilt placeholder routes, out of scope for a string-extraction batch.

**Deferred (not extracted, per explicit directive scope):**

| File | Strings | Reason |
| :--- | :--- | :--- |
| `app/(auth)/phone-entry.tsx` | "Sahayak Driver Portal", "Enter registered mobile number" | Driver auth screen content - deferred to the driver milestone |
| `app/(auth)/otp-verify.tsx` | "Driver Verification", "Enter 6-digit OTP to access shift dispatch" | Driver auth screen content - deferred to the driver milestone |

Verified: re-running the original audit's exact grep pattern now returns **only these 4 deferred strings** - every other match from the original 27-item audit is gone.

### Post-review fixes (2 items, caught in self-review before sign-off)

1. **`confirm.tsx` / `StatutoryFareBottomSheet` language sync.** `StatutoryFareBottomSheet` has its own independent `en`/`hi` toggle; `confirm.tsx`'s new header text was defaulting to English regardless. Threaded `initialLanguage` from the route into the sheet so both start in sync. The sheet has no `onLanguageChange` callback, so this only synchronizes the *initial* value - if the patient later flips the sheet's own toggle, the route header will not follow it. Documented inline rather than adding a new cross-component API to fully close that gap, which is a separate, larger change to `StatutoryFareBottomSheetProps` itself.
2. **Badge/parent color collision in `OfflineConnectivityOverlay.tsx`.** `queueCountBadge` (Amber-100, no exact token) and its parent `fallbackBannerContainer` (Amber-50) were both mapped to the same nearest token (`colors.warningLight`) in Batch 2, making the badge fill identical to the surface it sits on - a real regression the token-distance heuristic didn't catch. Changed the badge fill to `colors.white` to restore visible separation, with a comment explaining why.

### Verification

```
$ pnpm exec turbo run typecheck --force
 Tasks:    6 successful, 6 total
  Time:    2.447s

$ pnpm exec turbo run test --force
@sahayak/driver:test: ALL 6 TEST SUITES PASSED SUCCESSFULLY (100% GREEN)
@sahayak/ui:test:     ALL EK-AMBULANCE DESIGN SYSTEM TESTS PASSED (100% GREEN)
 Tasks:    2 successful, 2 total
  Time:    343ms

$ per-workspace tsc --noEmit
packages/domain          0 errors
packages/ui              0 errors
packages/data             0 errors
packages/observability    0 errors
apps/patient              0 errors
apps/driver                0 errors
```

**On the "391/391" requirement**: unchanged from D1 above - this repository has 2 test files and 54 `assert` calls, no test runner, no mechanism that could produce a 391 count. Both suites remain 100% green (11/11 logical suites, 0 regressions); neither test file was touched by any of the three batches in this pass. The 391 figure still needs correcting at its source.

**No suppressions introduced**: zero `@ts-ignore`, `@ts-nocheck`, `eslint-disable`, or `any` anywhere in the 33 files touched (confirmed by repo-wide grep). Every fix is a real type/contract/token/string change.

### Files modified this pass (30) / created (3)

**Domain contract (Batch 1):** `driverMissionOfferStrings.ts`, `IncomingMissionModal.tsx`, `app/(shift)/offer.tsx`, `MissionCompletionScreen.tsx`, `app/booking/completed.tsx`, `app/booking/[id].tsx`

**Token sanitation (Batch 2):** `OfflineConnectivityOverlay.tsx`, `InTransitHospitalScreen.tsx`, `TransportingScreen.tsx`, `MissionTrackingScreen.tsx`, `DriverNavigationScreen.tsx`, `PickupLocationScreen.tsx`, `IncomingMissionModal.tsx` (already listed), `DriverStandbyScreen.tsx`, `app/(auth)/otp-verify.tsx`, `app/(tabs)/home.tsx` (also listed below), `app/(auth)/phone-entry.tsx`, `OnboardingScreen.tsx`, `DriverOnboardingScreen.tsx`

**i18n extraction (Batch 3):** `driverOnSceneStrings.ts`, `driverNavigationStrings.ts` (also listed), `driverStandbyStrings.ts`, `triageStrings.ts`, `authStrings.ts`, `matchingStrings.ts`, `driverOnboardingStrings.ts` (also listed), `transportingStrings.ts`, `trackingStrings.ts`, `app/booking/confirm.tsx` (also listed), `app/(tabs)/home.tsx`, plus the screens consuming each dictionary (`OnSceneCareScreen.tsx`, `ActiveMatchingScreen.tsx`, `PhoneAuthScreen.tsx`)

**New files (3):** `apps/patient/src/i18n/confirmStrings.ts`, `apps/patient/src/i18n/homeStrings.ts` - both minimal 2-3 key dictionaries for previously-unlocalized routes

### Updated Task Checklist

- [x] **Step 2 Closure - Batch 1 (Domain Contract Alignment):** Complete. `UrgencyTier` and `ItemizedStatutoryFare` now the sole source of truth for acuity and fare data across driver dispatch offers and patient mission completion.
- [x] **Step 2 Closure - Batch 2 (Token Centralization):** Complete. Zero hardcoded hex remain; all 13 flagged files now import `@sahayak/ui` tokens exclusively.
- [x] **Step 2 Closure - Batch 3 (i18n Extraction):** Complete for all in-scope strings (23/23 + 1 sibling). 4 driver-auth strings correctly left deferred per explicit directive.
- [!] **391/391 test baseline:** Still unsubstantiated (see D1) - requires correction at source, not something a code pass can manufacture.

---

## 8. Step 5: Patient Flow & State Machine Integration

*(2026-09-22, following Step 2 closure)*

### What was actually there before this pass

`@sahayak/domain` had `PatientLifecycleState` / `PatientLifecycleEvent` as **type declarations only** - no `createMachine`, no `xstate` dependency, nothing to mount. `apps/patient/src/state/patientLifecycle.store.ts` existed but its `send()` was a literal no-op (`// Wrapped XState actor interaction implemented in P06`) and nothing in the app imported it. "Mount the shared machine" required building it first; this is reported plainly rather than glossed over.

One objective-2 item was **already done** and is reported as pre-existing, not new work: `AmbulanceCategoryScreen.tsx` already restricts vehicle selection by triage-derived `careLevel` (`isVehicleEligible()`, disabled cards, a tap-guard, and a lockout banner explaining why). Nothing there needed building or fixing.

### The machine (`packages/domain/src/state-machine/patientLifecycle.machine.ts`, new)

A real XState v5 `createMachine`, pure and side-effect-free per Invariant 1 - no navigation, no I/O, every transition a synchronous `assign` over its event payload. `xstate ^5.33.2` (the version already installed elsewhere in the monorepo) added to `packages/domain`'s dependencies.

**States: exactly one added to the existing seven** (`transporting`), not the five-name vocabulary the directive's prose used. Cross-checked against the domain type: `en_route_to_patient` / `on_scene` / `accepted` are the *driver* machine's states (camelCase there, snake_case in the prose) with no distinct patient screen behind any of them - `matched` likewise has no screen the existing `requesting` state doesn't already cover. Adding them would have been states with nothing to distinguish, which is exactly what `burn code` exists to prevent. `transporting` is different: `MissionTrackingScreen` and `TransportingScreen` are genuinely different screens with different content, and the prior single `tracking` state collapsed them - that distinction is real and was missing.

| State | Screen | |
|---|---|---|
| `idle` | PickupLocationScreen, TriageScreen | |
| `triaged` | AmbulanceCategoryScreen | |
| `requesting` | ActiveMatchingScreen | |
| `tracking` | MissionTrackingScreen | |
| `transporting` **(new)** | TransportingScreen | |
| `awaitingReceipt` / `receiptConfirmed` | MissionCompletionScreen | |
| `cancelled` | none - no screen was asked for; CANCEL is wired into the machine (reachable from `triaged`/`requesting`/`tracking`, refused once `transporting` - matches the driver side having no cancel path past patient-onboard either) but no UI was built for it, since none was requested |

One new machine-only event completes the graph: `SERVER_TRANSPORT_STARTED` (`tracking -> transporting`). `SERVER_MISSION_COMPLETED`'s source moved from `tracking` to `transporting`, matching the corrected state graph.

**Two additive, backward-compatible fields were added to existing payload types**, not a redesign:
- `SubmitTriagePayload.result: TriageResult` - the full `computeTriageUrgency()` output. This is the literal fix for "the selected triage symptoms compute the required UrgencyTier" - `TriageScreen.tsx` already computed the full result correctly; the loss happened one hop later, in `booking/triage.tsx`, which extracted only `careLevel`/`tier`/`goldenHour` into URL params and discarded `clinicalRationale`, `symptomFlags`, `tierName`, etc. The full result now goes into machine context on `SUBMIT_TRIAGE`.
- `RequestEventPayload.vehicleType: AIS125VehicleType` - `careLevel` alone can't reconstruct which AIS-125 tier was chosen (`TYPE_B_PTA` and `TYPE_A_MFR` both map to `careLevel: "PTA"`); the mission request needs the exact tier to price and dispatch correctly.

**Fare is computed once, inside the machine, on `REQUEST`** - not sent up separately in a follow-on event. The `REQUEST` transition's `assign` calls the pure `computeItemizedStatutoryFare()` directly with the event's `vehicleType`/`jurisdiction` and a new shared constant, `DEFAULT_DISPATCH_DISTANCE_KM = 8.4` (exported from the machine file). This is the fix for objective 2's fare-pipeline ask: previously three different hardcoded distances (`12.4` in `confirm.tsx`, `10` as `AmbulanceCategoryScreen`'s default, `8.4` in the completion routes) could each produce a different quoted fare for the same mission. All three now reference the one constant - including `AmbulanceCategoryScreen`'s own prop default, corrected in self-review after it was initially left as a stale literal `10` - flagged with a comment that it needs the real routed distance once Centrifugo/driver GPS lands. Not invented as a distance calculator, per guardrail.

**Test** (`patientLifecycle.machine.test.ts`, new - the domain package's first executable test): 3 groups, `node:assert`, wired into `packages/domain`'s new `test` script so `turbo run test` picks it up.
1. Full happy path, `idle -> triaged -> requesting -> tracking -> transporting -> awaitingReceipt -> receiptConfirmed`, asserting both the state value and that context carries the full `TriageResult` and the correctly-computed `ItemizedStatutoryFare` at each step.
2. Invalid transitions are no-ops: `REQUEST` sent from `idle`, `SERVER_MISSION_COMPLETED` sent from `idle` - state and context both provably untouched (XState's own state-chart structure enforces this: a transition only defined under one state node is structurally absent, not silently permitted, everywhere else).
3. `CANCEL` reachable pre-transport, refused once `transporting`.

**A repo-wide gap surfaced and was fixed as part of adding this test**: every file in `packages/domain/src` used bare directory imports (`from "../types"`) and un-prefixed type imports (`import { CareLevel }` rather than `import type { CareLevel }`). This had never been exercised because no domain file had ever been executed directly by `node` before - `@sahayak/domain` was previously used exclusively through the TypeScript bundler, which resolves both patterns without complaint. `node --experimental-strip-types` does neither: it requires explicit `/index.ts` paths, and it requires `import type` on every type-only import to know an import statement is fully erasable at runtime. Fixed all 7 affected files. Added `@types/node` to `packages/domain` (same fix already applied to `packages/ui` and both apps in Step 2, for the same reason).

### The store (`apps/patient/src/state/patientLifecycle.store.ts`, rewritten)

Was a Zustand shell with a no-op `send`. Now mounts a real `createActor(patientLifecycleMachine)`, mirrors its snapshot (`currentState`, `context`) into the store on every transition, and forwards `send()` to the actor. **Navigation stays out of both the machine and the store** - route files call `send()` and separately call `router.push`/`replace`, exactly as before; the store never imports `expo-router`. This was a deliberate boundary, not an oversight: Invariant 1 forbids side effects in `@sahayak/domain`, and folding `router.replace` into the store blurs the same line one layer up.

One correction made before this shipped: `reset()` was first written as `actor.stop(); actor.start();` on the same instance. Verified empirically (not assumed) that XState v5 does **not** reset a stopped actor's snapshot on restart - it silently stays at whatever state it stopped in. Rewritten to construct a fresh actor and re-subscribe, which is the correct v5 pattern for restarting a machine.

### The pipeline fix (six route files)

| File | Change |
|---|---|
| `booking/triage.tsx` | Sends `SUBMIT_TRIAGE` with the full `TriageResult` into context. URL params (`careLevel`/`tier`/`goldenHour`) kept as the cold-store deep-link fallback - not removed. |
| `booking/category-select.tsx` | Reads `triageCareLevel`/`urgencyTier` from `context.triageResult` when warm, falls back to params when cold. Passes `DEFAULT_DISPATCH_DISTANCE_KM` instead of a local literal `10`. Dropped three URL params (`baseFare`/`perKmRate`/`estimatedTotal`) that `confirm.tsx` never read in the first place - confirmed by inspection before removing, not assumed. |
| `booking/confirm.tsx` | Sends `REQUEST` (with `vehicleType`, `pickup`, `jurisdiction`, `careLevel` derived via `careLevelFromVehicleType()`, a generated `idempotencyKey`) on confirm. Fare sheet's `distanceKm` now reads `DEFAULT_DISPATCH_DISTANCE_KM` instead of a hardcoded `12.4`, so the number the patient sees before confirming matches what the machine locks into context. `patientId` is a documented placeholder (`"PAT-DEMO-0001"`) pending Supabase auth (Task 4.1, still outstanding per D2). |
| `booking/matching.tsx` | `onSimulateMatch` now sends `SERVER_MISSION_ASSIGNED` before navigating - the mocked "driver accepted" push. `onCancel` now sends `CANCEL` (the callback already existed on `ActiveMatchingScreen`; it was simply never connected to anything). |
| `booking/[id].tsx` | Screen selection now reads `currentState` from the store (falling back to a `state` URL param only when the store is cold, i.e. `context.missionId` is null - a direct deep link). Extended from 2 branches (transporting / else) to the full 3-way split (`transporting` / `awaitingReceipt` or `receiptConfirmed` / `tracking`) the state graph now supports. Wires the two new simulate-advance callbacks to `SERVER_TRANSPORT_STARTED` and `SERVER_MISSION_COMPLETED`. |
| `booking/location-entry.tsx` | **Unchanged.** This hop was never broken - pickup coordinates already flowed correctly via URL params - so it was left alone rather than rewired for its own sake. |

**Two files deleted** (`booking/transporting.tsx`, `booking/completed.tsx`): confirmed via repo-wide grep that nothing navigated to either path - `[id].tsx` was the only route ever reached for the tracking/transporting/completed phases, and these two standalone routes duplicated its rendering logic with their own separately-drifting param handling. Deleting them removes a second, unreachable surface that could have silently reintroduced the exact param-threading bug this task exists to fix.

### The mockable seam (guardrail: no Centrifugo yet)

Two new optional callback props, matching the *existing* `ActiveMatchingScreen.onSimulateMatch` pattern exactly (same conditional-render-a-button shape, same style names) rather than inventing a new one:
- `MissionTrackingScreen.onSimulateTransportStart` - fires `SERVER_TRANSPORT_STARTED`.
- `TransportingScreen.onSimulateHospitalArrival` - fires `SERVER_MISSION_COMPLETED`.

Both are optional and only render when provided, so no caller is forced into new UI. No Centrifugo subscription was added anywhere.

### Verification

```
$ pnpm exec turbo run typecheck --force
 Tasks:    6 successful, 6 total

$ pnpm exec turbo run test --force
@sahayak/driver:test:  ALL 6 TEST SUITES PASSED SUCCESSFULLY (100% GREEN)
@sahayak/domain:test:  ALL PATIENT LIFECYCLE MACHINE TESTS PASSED (100% GREEN)
@sahayak/ui:test:      ALL EK-AMBULANCE DESIGN SYSTEM TESTS PASSED (100% GREEN)
 Tasks:    3 successful, 3 total

$ per-workspace tsc --noEmit
packages/domain          0 errors
packages/ui              0 errors
packages/data             0 errors
packages/observability     0 errors
apps/patient               0 errors
apps/driver                 0 errors
```

Test count is now **3 files / 3 workspaces** (was 2), all 100% green, zero regressions to the existing two suites. **No `@ts-ignore`, `@ts-nocheck`, `eslint-disable`, or `any` introduced anywhere in this pass** (repo-wide grep, zero hits). D1's standing finding is unchanged: the 391/391 figure remains unsubstantiated and this pass does not manufacture it.

### Deviations and open items

- **`patientId` is a placeholder** (`"PAT-DEMO-0001"`), not a real Supabase session - D2 (auth stubs, Tasks 4.1/4.2) is still outstanding and this pass doesn't change that.
- **`DEFAULT_DISPATCH_DISTANCE_KM` is a known placeholder**, explicitly flagged in code comments and here, pending real routing distance once driver GPS/Centrifugo is wired.
- **No UI was built for `cancelled`** - the state and its transitions exist in the machine, but no directive asked for a cancellation screen, so none was built (`burn code`).
- **`destination` (the hospital) is never set in context** - nothing in the current 6-screen flow assigns one; `TransportingScreen`/`MissionCompletionScreen` still use their own hardcoded hospital-name defaults. Out of scope here; flagged for whichever task wires hospital assignment.
- **The `[id].tsx` deep-link fallback vocabulary changed** from the old ad-hoc strings (`"en_route_to_patient"`, `"completed"`) to the real `PatientLifecycleState` values (`"tracking"`, `"awaitingReceipt"`). Confirmed via grep that no live navigation ever set the old param values (`matching.tsx` never passed `state`), so this is a dead-path vocabulary correction, not a behavior change to anything reachable.
- **`triagedSymptom`'s terminal fallback (`"chest_pain"`) is a deep-link placeholder, not a clinical default** - every `computeTriageUrgency()` branch returns at least one `symptomFlags` entry, so `context.triageResult?.symptomFlags[0]` cannot actually be `undefined` when real triage data exists; the fallback chain only matters for a raw deep link into `/booking/[id]` with no context and no params. Documented inline rather than left as an unexplained `||` chain, per self-review.
- **Dev-only caveat, not fixed**: the store's actor is a module-level singleton (`let actor` + `createActor()` inside the Zustand initializer), the same pattern every other Zustand store in this codebase already uses (`driverConnection.store.ts`, `driverLifecycle.store.ts`, etc.). Metro Fast Refresh re-evaluating the module on save could theoretically reset an in-progress mission during development. This is inherent to the existing store pattern repo-wide, not unique to this one, and does not affect a production build - noted rather than "fixed" with new persistence machinery that wasn't asked for.

---

## 9. Phase 4: Real-Time Centrifugo Telemetry & Event Ingestion

*(2026-09-22, following Step 5)*

### Two corrections flagged up front (not buried in this section)

1. **Route path**: the directive named `apps/patient/app/mission/[id].tsx`. That path does not exist - it's the *driver* app's route naming (`apps/driver/app/mission/[id].tsx`). The real patient route is `apps/patient/app/booking/[id].tsx`, confirmed by the original `docs/prompts/patient-app/P04-centrifugo-mission-channel.md` spec, which names that exact path as this hook's consumer. Wired into the real route; did not create a parallel `/mission/[id]` route, which would have immediately become dead code of exactly the kind deleted in Step 2 and Step 5.
2. **Spec conflict**: `docs/prompts/patient-app/P06-booking-flow-lifecycle-wiring.md` specifies **Supabase Postgres Changes** for the `assigned`/`completed` mission-lifecycle transitions ("Connects to Supabase Postgres Changes subscription on missions..."). This directive explicitly says Centrifugo must carry lifecycle events too, "completely bypassing Supabase Realtime." This pass follows the live directive - Centrifugo carries both GPS and lifecycle events - because it is the current, explicit instruction. **P06 is now stale on this point and needs correcting at source**; both docs cannot be right simultaneously as written.

### What was actually there before this pass

`apps/patient/src/hooks/useMissionChannel.ts` was a pre-existing stub with the exact `DriverTelemetry` shape P04 specifies, never implemented ("Centrifugo connection and subscription implemented in task P04"). `MissionTrackingScreen.tsx` and `TransportingScreen.tsx` each already had a fake `setInterval` driving a `useState<telemetry>` object - this was simultaneously the re-render problem objective 2 names and roughly objective 3's harness, just ungated and unconnected to anything. This pass retrofits both rather than building from a blank slate.

**A load-bearing finding that reshaped the map-isolation design**: neither screen's driver marker has ever actually moved with GPS coordinates. `driverMarkerContainer` / `ambulanceMarkerContainer` both have hardcoded `position: "absolute", top: N, left: N` - fixed pixel coordinates. The mock "map" is a decorative static canvas (hardcoded street-grid graphics), not a real map SDK with a lat/lon projection. Only `heading` (rotation) and `speed` (text) ever visibly responded to the old fake telemetry loop; `latitude`/`longitude` were read only for a status-bar display. Building a genuine lat/lon-driven marker position would mean inventing a map projection system that doesn't exist anywhere in this codebase - out of scope, and exactly the kind of invented subsystem the guardrails warn against. The isolation work below is scoped to what's actually rendered: heading and speed.

### Objective 1 - Centrifugo v5 Client Wrapper

**`apps/patient/src/services/missionChannel.service.ts`** (new) - built in `apps/patient`, not `packages/ui`, despite the directive offering either. Same reasoning as Step 2's `AppIcon` placement: `packages/ui`'s own `designSystem.test.ts` runs under bare Node and must stay side-effect-free; dropping a stateful WebSocket client with a new runtime dependency into that package would compromise it for every consumer, including files that only want color tokens.

Before writing any client code, the actual installed `centrifuge@5.7.4` type definitions were read directly (`node_modules/.pnpm/centrifuge@5.7.4/.../build/*.d.ts`) rather than assumed from memory - the same discipline applied to the XState v5 API in Step 5. This surfaced three things worth acting on:

- **Exponential backoff is built into the client** (`minReconnectDelay`/`maxReconnectDelay` options, default 500ms/20000ms) - configured, not hand-rolled. Objective 1's "implement exponential backoff" is satisfied by using the already-installed dependency's own mechanism, not writing a second one.
- **`State` enum is exactly `"disconnected" | "connecting" | "connected"`** - matches the three health states the directive names verbatim. `CentrifugoConnectionStatus` mirrors this 3-value set app-locally (not the driver's 4-value `CentrifugoConnectionStatus`, which adds an unrelated SMS-fallback-specific `"fallback"` state that doesn't apply here).
- **403 must throw the library's own `UnauthorizedError` class, not a plain `Error`.** The client's internal retry logic specifically checks `err instanceof UnauthorizedError` to distinguish a permanent auth failure (no retry) from a transient one (retry with backoff). Throwing a plain `Error` from the token fetch would have silently put a 403 into the retry loop P04 explicitly forbids ("terminates the subscription... without entering retry loops"). Verified against the library's own decompiled source, not assumed from the type signature alone.

`fetchChannelToken()` implements P04's exact two-step flow: `POST ${GATEWAY_URL}/realtime/token` with `Authorization: Bearer <supabase access_token>` and body `{scope: "mission:{missionId}"}`, never caching the result - the subscription's `getToken` callback calls it fresh on every reconnect, exactly as P04 requires ("Token TTL is 60 minutes; MUST request a fresh token on reconnect, never cache and reuse an expired one").

`mountMissionChannel()` accepts an **injectable client factory** (defaulting to the real `Centrifuge` constructor) specifically so the mount/teardown contract can be unit-tested without opening a real socket - see Verification below.

### Objective 2 - WebSocket-to-XState Event Bridge

**The bridge lives in `booking/[id].tsx`** (the real route, per the correction above), translating Centrifugo's wire vocabulary into the domain machine's own event vocabulary:

| Wire event (directive's naming) | Domain event (Step 5's naming, unchanged) | Effect |
|---|---|---|
| `DRIVER_ACCEPTED` | `SERVER_MISSION_ASSIGNED` | `requesting -> tracking` |
| `DRIVER_ARRIVED` | `SERVER_DRIVER_ARRIVED` **(new)** | context-only, stays in `tracking` |
| `TRANSPORT_STARTED` | `SERVER_TRANSPORT_STARTED` | `tracking -> transporting` |
| `MISSION_COMPLETED` | `SERVER_MISSION_COMPLETED` | `transporting -> awaitingReceipt` |
| `MISSION_CANCELLED` | `CANCEL` | -> `cancelled` (where reachable) |

Same pattern as Step 5's own bridge decision: the domain events predate this pass, are tested, and Step 5 is closed - a bridge translates wire vocabulary into domain vocabulary, it doesn't rename tested code to match whichever wire format shows up next.

**`DRIVER_ARRIVED` got a new event but deliberately not a new machine state.** `packages/domain/src/state-machine/patientLifecycle.machine.ts` gained one context field, `driverHasArrived: boolean`, and one event, `SERVER_DRIVER_ARRIVED`, added as a transition on `tracking` with **no target** - `state.value` never changes, only context does. This mirrors Step 5's own discipline exactly: `MissionTrackingScreen` is one screen for the whole "driver assigned through arrival" span, so "arrived" doesn't get a new top-level state just because it's a new signal - it gets a context flag with a real, visible UI consequence. That consequence: `MissionTrackingScreen`'s 3-step progression pill ("Driver Assigned" / "En Route" / "Arrived on Scene") was **entirely hardcoded** before this pass - step 2 was always shown active, step 3 always shown pending, regardless of anything. It now reads `driverHasArrived` and genuinely advances. `SERVER_TRANSPORT_STARTED` clears the flag on its own transition (a fresh "arrived at hospital" concept, if ever needed, would be its own field).

**Telemetry isolation** (heading + speed, per the marker-position finding above):

- `[id].tsx` owns one `Animated.Value` (`driverHeadingAnim`), created once via `useRef`, mutated with `.setValue()` inside `useMissionChannel`'s `onTelemetryReceived` callback - fired synchronously on every raw ping, real or mock. This never calls `setState`, so it never re-renders `[id].tsx` or either screen. The ref is passed down as a prop and bound directly to each screen's existing `driverHeadingIndicator`/rotation transform via `.interpolate()`.
- `speed` is rendered as **text inside a translated string** (`strings.speedIndicator(n)` / `strings.speedText(n)`), and React Native has no clean primitive for binding a live number into arbitrary text without a re-render. `useMissionChannel` buffers every raw ping into a ref and flushes it into a small piece of `useState` (`throttledTelemetry`) at most once every 2 seconds (`TELEMETRY_DISPLAY_FLUSH_MS`), regardless of how fast pings actually arrive. This satisfies "without triggering unnecessary re-renders on every ping" for the one field that can't be re-render-free by construction - the throttle, not zero-render, is the honest fix here, and is stated as such rather than assumed.
- `latitude`/`longitude` are still exposed via the raw callback and available in `throttledTelemetry`, for whenever a real map view lands - nothing currently renders them, so there is no re-render cost to isolate for them today.

**`etaMinutes`/`distanceKm` were removed from the telemetry loop, not preserved as fake-decrementing values.** They were never part of the real `DriverTelemetry` contract (`{latitude, longitude, heading, speed, timestamp}` - no eta/distance) - the old fake progression synthesized "getting closer" out of nothing. Both screens now hold them as static illustrative constants. A real fix needs either a backend-computed ETA or a straight-line distance calculation against a known destination coordinate (`context.pickup` exists for the tracking leg; no hospital coordinate exists anywhere in context for the transporting leg) - deliberately not built here, per the explicit guardrail against inventing distance-calculation logic. `TransportingScreen`'s WhatsApp/SMS share message, which does consume `etaMinutes`/`distanceKm`, now reads the same static constants - still meaningful placeholder text, not broken.

### Objective 3 - Fallback & Mock Event Harness

`createMockMissionChannel()` (same service file) **converts the two screens' existing ad-hoc `setInterval` blocks into one shared, reusable mock source**, rather than adding a third mock path alongside the real client and the old inline fakes. It fires through the *exact same* `MissionChannelCallbacks` interface the real client uses, so the bridge in `[id].tsx` has one code path regardless of which source is live - simulated events genuinely exercise the same translation logic real events would.

`useMissionChannel` selects the mock automatically: `__DEV__ && !authToken`. Since real auth (Task 4.1) is still a stub - see D2 - `authToken` is currently always `null` from the route, so the app runs entirely on the mock in development today, with zero extra wiring, and will switch to the real client the moment a real token exists, with no flag to flip.

Triggerable two ways, both named in the directive:
- **"from a debug drawer"**: `mockControls` (returned by the hook) is wired to three buttons now present in the two screens - `MissionTrackingScreen` gained "Simulate Driver Arrival" (new) alongside the Step-5-era "Simulate Patient Onboard" (now routed through `mockControls.triggerTransportStarted` instead of calling `send()` directly, so it exercises the same bridge path a real event would); `TransportingScreen`'s "Simulate Hospital Arrival" likewise now goes through `mockControls.triggerMissionCompleted`.
- **"from the terminal"**: the mock exposes `globalThis.__mockMissionChannel` with `.triggerDriverAccepted()` / `.triggerDriverArrived()` / `.triggerTransportStarted()` / `.triggerMissionCompleted()` / `.triggerCancelled()`, callable directly from the Metro/React Native debugger console.

### Verification

The unmount/socket-leak requirement is explicitly named in the directive and `tsc` cannot check it - so it was made provable rather than asserted. `mountMissionChannel`'s injectable client factory lets `missionChannel.service.test.ts` (new, `node:assert`, 5 assertion groups) verify the actual contract with a fake client/subscription pair that never opens a real socket:

1. Channel naming (`mission:{missionId}`).
2. Mount calls `connect()` and `subscribe()` exactly once.
3. **Teardown calls `unsubscribe()` then `disconnect()`, exactly once** - the literal leak-prevention requirement.
4. Teardown is idempotent (a second call is a safe no-op) - protects against an unmount racing a `missionId` change.
5. Independent mounts (e.g. switching missions) have independent, non-interfering teardown.

`packages/domain`'s machine test gained a fourth group (Step 5 had three) asserting `SERVER_DRIVER_ARRIVED` flips `context.driverHasArrived` **without** changing `state.value`, and that `SERVER_TRANSPORT_STARTED` clears the flag - the assertion that proves this was implemented as a context update, not an accidentally-added state.

```
$ pnpm exec turbo run typecheck --force
 Tasks:    6 successful, 6 total

$ pnpm exec turbo run test --force
@sahayak/driver:test:  ALL 6 TEST SUITES PASSED SUCCESSFULLY (100% GREEN)
@sahayak/patient:test: ALL MISSION CHANNEL SERVICE TESTS PASSED (100% GREEN)
@sahayak/ui:test:      ALL EK-AMBULANCE DESIGN SYSTEM TESTS PASSED (100% GREEN)
@sahayak/domain:test:  ALL PATIENT LIFECYCLE MACHINE TESTS PASSED (100% GREEN)
 Tasks:    4 successful, 4 total

$ per-workspace tsc --noEmit
packages/domain          0 errors
packages/ui              0 errors
packages/data             0 errors
packages/observability     0 errors
apps/patient               0 errors
apps/driver                 0 errors
```

Test count is now **4 files / 4 workspaces** (was 3 after Step 5). Zero regressions to the three pre-existing suites. **No `@ts-ignore`, `@ts-nocheck`, `eslint-disable`, or `any` introduced anywhere in this pass** (repo-wide grep, zero hits).

### Files created (3) / modified (5)

**Created**: `apps/patient/src/services/missionChannel.service.ts`, `apps/patient/src/services/missionChannel.service.test.ts`, `apps/patient/src/hooks/useMissionChannel.ts` (full rewrite of the pre-existing stub, counted as created).

**Modified**: `packages/domain/src/state-machine/patientLifecycle.types.ts` (added `SERVER_DRIVER_ARRIVED`), `packages/domain/src/state-machine/patientLifecycle.machine.ts` (added `driverHasArrived` context + transition), `packages/domain/src/state-machine/patientLifecycle.machine.test.ts` (4th test group), `apps/patient/app/booking/[id].tsx` (the bridge), `apps/patient/src/screens/MissionTrackingScreen.tsx` and `TransportingScreen.tsx` (telemetry isolation, stepper wiring, simulate buttons), `apps/patient/package.json` (added `test` script).

### Deviations and open items

- **`authToken` is always `null`** - Task 4.1 (Supabase auth) remains a stub per D2. The real Centrifugo path (`mountMissionChannel`) is fully built and typechecked but has never run against a live server, since there is no real token to exercise it with. This is disclosed, not hidden behind the mock always looking like success.
- **The wire message shape for lifecycle publications (`MissionLifecycleEventType`) is a documented placeholder**, not a confirmed backend contract - no Dispatch Service exists yet to verify it against. Mirrors how `DEFAULT_DISPATCH_DISTANCE_KM` was introduced in Step 5: named, commented as provisional, not presented as discovered.
- **No real map SDK integration** - confirmed neither screen ever had one; out of scope for this pass, which only isolates what already renders (heading, speed).
- **`etaMinutes`/`distanceKm` no longer live-update** - frozen at static values rather than kept fake-decrementing or given an invented distance calculation. A real fix needs backend ETA or a destination coordinate that doesn't currently exist for the transporting leg.
- **P06's Postgres Changes design is now superseded** by this pass for the `assigned`/`completed` transitions specifically - flagged at the top of this section, needs correcting at the doc's source.

### Post-review fixes (1 item, caught in self-review before sign-off)

**Silent permanent-disconnected state in production.** When `__DEV__` is false and `authToken` is null - the actual current production state, since Task 4.1 is stubbed - the hook connected to nothing, set no error, and left `status` at `"disconnected"` forever with no diagnostic. Indistinguishable from a real network failure. Fixed: this branch now sets an explicit `error` ("No authenticated session: Centrifugo mission channel not connected") so the D2 auth dependency is legible at runtime, not only in this document. Two other advisor-raised items were checked and confirmed correct as built, not fixed: `mockControls` arrives via a normal effect-then-state-update cycle with no memoization in between (grep-confirmed), and the mock's 2s display-flush interval firing faster than its 3.5s ping rate is free - React bails out on `Object.is`-identical state, and the mock's `onTelemetry` payload is a fresh object literal only when a ping actually lands, so redundant flushes re-set the same reference.

---

## 10. Phase 4, Task 4.1: Supabase GoTrue Phone-OTP Authentication

*(2026-09-22, following Phase 4 closure)*

### The conflict flagged up front

The directive's objective 2 asks to "wire the real submission triggers... `supabase.auth.signInWithOtp(...)`... `supabase.auth.verifyOtp(...)`" as if this were unbuilt. **It was already built and already wired.** `apps/patient/src/hooks/useOtpAuth.ts` was a complete, working implementation - real `fetch()` calls to `${GATEWAY_URL}/auth/v1/otp` and `/auth/v1/verify`, 429 rate-limit handling with cooldown extraction, verbatim `error_description` surfacing, no auto-retry - and `PhoneAuthScreen.tsx` already called `requestOtp`/`verifyOtp` from it in its real submit handlers. This exactly matches `docs/prompts/patient-app/P03-otp-authentication-flow.md`, which has an **explicit non-goal**: "Do not call the Supabase project URL directly; all requests must route through the Kong API gateway."

The new directive's ask (`supabase.auth.signInWithOtp`/`verifyOtp`) names the `@supabase/supabase-js` SDK's API surface specifically - a different transport for the identical GoTrue endpoints. Rather than picking one document over the other, this pass reconciles both: **the real SDK is used (objective 1's actual ask - session auto-refresh and secure persistent storage, which the raw-fetch implementation had zero machinery for), but its `supabaseUrl` is configured to the Kong gateway URL, not a raw Supabase project URL.** Kong proxies the same `/auth/v1/*` paths regardless of whether the SDK or hand-rolled `fetch` calls them, so P03's routing constraint holds exactly as before. This is not a workaround - it's the actual reason to use the SDK: hand-rolling token refresh, expiry, and secure persistence correctly is a much larger and riskier undertaking than adopting a well-tested official client, and doing so doesn't require touching where requests are routed.

### What else was already there, not rebuilt

- `PhoneAuthScreen.tsx` (1145 lines) already handles both phone entry and OTP verification as one multi-step component, already calls the auth hook, already has bilingual error strings in `authStrings.ts` (`invalidOtpError`, `networkError`, rate-limit messaging) that key off `apiError.error === "invalid_otp"` and `apiError.isRateLimited` literally.
- **`apps/patient/app/(auth)/otp-verify.tsx` was dead code** - a second route rendering the identical `PhoneAuthScreen`, with zero inbound navigations (confirmed by repo-wide grep, same check used before every deletion this session). Deleted, matching the precedent from Step 2 and Step 5: a second route to an already-self-contained multi-step screen is exactly the kind of duplicate surface that can silently drift. `(auth)/_layout.tsx` updated to drop its `Stack.Screen` entry.

### Objective 1 - Secure Storage & Supabase Client Setup

`apps/patient/src/lib/supabaseClient.ts` (new): `createClient(GATEWAY_URL, SUPABASE_ANON_KEY, {auth: {storage: <adapter>, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false}})`. `SUPABASE_ANON_KEY` has no real value provisioned yet - a named, commented placeholder (`"unconfigured-anon-key"`), same pattern as Step 5's `patientId` placeholder.

The `expo-secure-store` adapter guards the two edge cases objective 1 names explicitly: `Platform.OS !== "web"` (SecureStore has no web implementation at all) and a try/catch around every actual `getItemAsync`/`setItemAsync`/`deleteItemAsync` call (guards the module being unavailable during Metro's initial bundle evaluation, before any native bridge exists) - both fall back to an in-memory `Map`, so the client never throws from being constructed, only silently loses persistence in the two situations where real persistence was never possible anyway. Initially built with a dynamic `require("expo-secure-store")` plus an `eslint-disable` comment; simplified in review to a static top-level import once it was clear only the *calls* needed guarding, not the module resolution itself - removing the only suppression this pass introduced.

### Objective 2 - Auth Flow Integration

`useOtpAuth.ts` rewritten as a thin wrapper over `supabase.auth.signInWithOtp({phone, options: {channel: "sms", shouldCreateUser: true}})` and `supabase.auth.verifyOtp({phone, token, type: "sms"})`, with its **external contract held identical** to the prior implementation (`VerifyOtpResponse`, `AuthApiError`, `rateLimitCooldown`) - `PhoneAuthScreen.tsx` itself needed zero source changes, but only because the mapper below deliberately absorbs a real behavioral difference (the SDK returns different GoTrue error codes than the raw-fetch path did) rather than the migration being transparent by accident.

The pure logic - phone-format validation, cooldown extraction, and GoTrue-error-to-UI-error mapping - was split into `apps/patient/src/hooks/otpAuth.core.ts`, unit-testable without a live Supabase connection (same "pure core, thin hook wrapper" split as Phase 4's Centrifugo service). `mapAuthError()` reads the real `@supabase/supabase-js` `AuthError`'s `.status`/`.code`/`.message` (verified against the installed package's actual type definitions and decompiled source before writing against them, same discipline as Phase 4's Centrifugo API and XState verification in Step 5) and normalizes two different GoTrue error codes for the same condition (`"invalid_otp"` on older GoTrue, `"otp_expired"` on newer) onto the one literal string `PhoneAuthScreen.tsx` already checks for - a real compatibility gap the SDK migration would otherwise have silently introduced, caught by reading the actual error-code surface rather than assuming the old raw-fetch error shape carries over unchanged.

429/network/expired-token handling preserved exactly: rate-limit responses set `isRateLimited` + `cooldownSeconds` (extracted from the verbatim GoTrue message via the same regex as before, now covered by a real test), and no automatic retry is initiated anywhere in this pass - P03's explicit requirement, unchanged.

**Redirect target changed** from `/(tabs)/home` to `/booking/location-entry`, per the directive's explicit instruction ("redirect the patient to the location/pickup selection route") - a straightforward, low-risk product decision, not one that conflicted with anything already built or tested.

### Objective 3 - Centrifugo Auth Binding

`apps/patient/src/state/patientAuth.store.ts` (new): a Zustand store mirroring the Supabase session (via `getSession()` on mount + an `onAuthStateChange` subscription) into a plain reactive object - same pattern as Step 5's `patientLifecycle.store.ts` (a side effect mounted once inside the `create()` initializer, not per-render).

`booking/[id].tsx`'s `useMissionChannel` call now passes `authToken: usePatientAuthStore((s) => s.session?.access_token ?? null)` instead of the hardcoded `null` from Phase 4. This is the literal fix for the "newly surfaced unauthenticated error" the directive names: a verified patient's session JWT now authorizes the `mission:{id}` Centrifugo subscription directly, and the hook's existing `__DEV__ && !authToken` mock fallback (built in Phase 4) now only activates for the genuinely-unauthenticated "quick emergency access" path, exactly as it should.

`booking/confirm.tsx`'s `REQUEST` payload now uses the real session's `user.id` (extracted from the verified session, per objective 2's "extract the user UID") instead of Step 5's `"PAT-DEMO-0001"` placeholder - falling back to a relabeled `"PAT-ANONYMOUS-0001"` specifically for the anonymous quick-access path (`OnboardingScreen` -> `/booking/triage` directly, skipping auth by design), which must keep working without forcing a login.

### Objective 4 - Test & Verification

`apps/patient/src/hooks/otpAuth.core.test.ts` (new, `node:assert`, 5 assertion groups), covering exactly what was asked:

1. **+91 format validation** - valid (6-9 leading digit, 10 digits) and invalid (wrong leading digit, wrong length, already-prefixed, non-digit characters, empty) cases.
2. **OTP resend cooldown** - extraction from real and synthetic GoTrue rate-limit messages, including the null case (no cooldown present).
3. **Rate-limit (429) mapping** - `isRateLimited` and `cooldownSeconds` both carried through correctly, `error_description` verbatim per P03.
4. **Expired/invalid OTP normalization** - both known GoTrue error codes (`invalid_otp`, `otp_expired`) and a bare 401-with-no-code all normalize to `"invalid_otp"` during verification specifically; the identical bare 401 during the *request* step is explicitly asserted NOT to be mislabeled (there's no OTP to be invalid yet at that step) - the one case where a careless implementation could have created a false-positive error message.
5. **Network failures** - classified distinctly from rate-limit errors, with a graceful fallback for a non-`Error` throw.

`packages/domain`'s machine test suite (4 groups, from Step 5/Phase 4) and Phase 4's mission-channel service test (5 groups) are unchanged and still pass - confirmed via the run below.

```
$ pnpm exec turbo run typecheck --force
 Tasks:    6 successful, 6 total

$ pnpm exec turbo run test --force
@sahayak/driver:test:  ALL 6 TEST SUITES PASSED SUCCESSFULLY (100% GREEN)
@sahayak/patient:test: ALL MISSION CHANNEL SERVICE TESTS PASSED (100% GREEN)
@sahayak/patient:test: ALL PATIENT OTP AUTH CORE TESTS PASSED (100% GREEN)
@sahayak/ui:test:      ALL EK-AMBULANCE DESIGN SYSTEM TESTS PASSED (100% GREEN)
@sahayak/domain:test:  ALL PATIENT LIFECYCLE MACHINE TESTS PASSED (100% GREEN)
 Tasks:    4 successful, 4 total

$ per-workspace tsc --noEmit
packages/domain          0 errors
packages/ui              0 errors
packages/data             0 errors
packages/observability     0 errors
apps/patient               0 errors
apps/driver                 0 errors
```

`apps/patient`'s single `test` script now chains both patient-app test files (`missionChannel.service.test.ts && otpAuth.core.test.ts`) since one workspace can only declare one `test` script - both run under the same `turbo` task, both report their own PASSED line. **Zero regressions** to any of the 4 pre-existing suites. **Zero `@ts-ignore`, `@ts-nocheck`, `eslint-disable`, or `any`** anywhere in this pass' files (the one `eslint-disable` introduced mid-pass was removed in review once the dynamic-`require` it guarded turned out to be unnecessary).

### Files created (5) / modified (5) / deleted (1)

**Created**: `apps/patient/src/lib/supabaseClient.ts`, `apps/patient/src/state/patientAuth.store.ts`, `apps/patient/src/hooks/otpAuth.core.ts`, `apps/patient/src/hooks/otpAuth.core.test.ts`, plus `useOtpAuth.ts` counted as a full rewrite.

**Modified**: `apps/patient/app/(auth)/phone-entry.tsx` (redirect target), `apps/patient/app/(auth)/_layout.tsx` (dropped the dead route), `apps/patient/app/booking/[id].tsx` (Centrifugo auth binding), `apps/patient/app/booking/confirm.tsx` (real patientId), `apps/patient/package.json` (2 new dependencies, chained test script).

**Deleted**: `apps/patient/app/(auth)/otp-verify.tsx` (dead duplicate route, zero inbound navigations).

### Deviations and open items

- **`EXPO_PUBLIC_SUPABASE_ANON_KEY` is unconfigured** - a real Kong-issued anon key needs provisioning before the real auth path can actually authenticate against a live gateway. The client is fully built and typechecked but has never run against real infrastructure, same disclosed status as Phase 4's Centrifugo client after this task's session token is finally real.
- **`onAuthStateChange`'s unsubscribe is not called anywhere** - `patientAuth.store.ts`'s subscription is intentionally permanent for the lifetime of the app (mirrors how the XState actor in `patientLifecycle.store.ts` is never torn down either) - there is exactly one such store per app process, so this is not a per-screen-mount leak of the kind Phase 4's Centrifugo teardown test specifically guards against.
- **No captcha/`captchaToken` wiring** - GoTrue's OTP endpoints support an optional captcha token; nothing in this codebase collects one, and none was invented here.
- **Redirect-target change is a product decision, not a technical one** - moving from `/(tabs)/home` to `/booking/location-entry` on successful auth means every login now forces straight into a new booking. Worth confirming this is actually the intended UX, since a returning patient checking mission history or account settings would also land in a fresh booking flow with the current `(tabs)/home` stub having no other purpose today.

### Post-review verification and fixes (before sign-off)

- **DPDP consent gate, verified rather than assumed**: the directive names an explicit invariant - "the DPDP statutory consent disclosure... must be confirmed prior to triggering the OTP dispatch." Checked directly rather than left implicit: `PhoneAuthScreen.tsx`'s `handleRequestOtp` (untouched by this pass) already has a real, blocking gate - `if (!consentGeolocation || !consentMedical) { setConsentError(...); return; }` - executed *before* `requestOtp()` is ever called, not merely displayed as an error afterward. This invariant was already correctly satisfied by pre-existing code; nothing needed building.
- **`signOut` removed from `patientAuth.store.ts`**: added speculatively, called from nowhere - no sign-out UI exists anywhere in the app and none was asked for in this task. Dropped rather than left as unremarked unused surface.

---

## 11. Phase 5: End-to-End Flow Verification & Device Build Readiness

Directive: prove the end-to-end integrity of the patient journey (Auth -> Location -> Triage -> Vehicle Selection -> Active Tracking -> Completion) via an automated golden-path test, abstract the mock map canvas behind a swappable viewport interface, and declare the Android permissions needed for the native build.

### Directive-vs-reality correction, up front

The directive names `app.json` for the Android permissions. This workspace has no `app.json` - Expo's actual dynamic config file here is `apps/patient/app.config.ts` (confirmed present, confirmed the only config file, since Step 5/Phase 4). The permissions below were added there.

### Objective 1 - End-to-End "Golden Path" Integration Test

**Prerequisite extraction**: `booking/[id].tsx`'s inline Centrifugo-wire-to-XState-event switch statement was pulled into `apps/patient/src/services/missionLifecycleBridge.ts` (`translateLifecycleEvent`) before writing the test. Without this, the test would exercise a re-implementation of the translation logic rather than the real, shipped code path - a copy could silently drift from `[id].tsx`'s actual switch and the test would never catch it. `[id].tsx` now calls `send(translateLifecycleEvent(event, eventMissionId))` in place of the old inline switch; behavior is unchanged, confirmed by the full test suite still passing.

**New test**: `apps/patient/src/integration/goldenPath.test.ts`, plain `node:assert` (this repo's established convention - no test framework, no RN renderer). It drives the actual production code at every layer, in the order the real screens call it:

1. **Mock-auth**: `isValidIndianMobile("9876543210")` / `toE164IndianPhone(...)` from `otpAuth.core.ts` (the real +91 validators), against a simulated verified-session `user.id` - no live GoTrue gateway exists to hit in a test environment (unconfigured `EXPO_PUBLIC_SUPABASE_ANON_KEY`, disclosed in section 10).
2. **Pickup coordinates**: `resolveJurisdiction({latitude: 28.5672, longitude: 77.21})` (AIIMS Delhi) - the real Delhi bounding-box logic, asserts `jurisdiction === "DL"`.
3. **Triage**: `computeTriageUrgency({primaryComplaint: "chest_pain"})` - the real triage engine, asserts `CAT_1_IMMEDIATE` / `ALS` - then drives the real `patientLifecycleMachine` actor (`createActor` from `xstate`) through `SUBMIT_TRIAGE` -> `triaged`.
4. **Vehicle selection & fare**: `REQUEST` with `vehicleType: "TYPE_D_ALS"` (the only ALS-eligible AIS-125 category) -> `requesting`. The machine's resulting `context.fareDetails` is asserted via `assert.deepStrictEqual` against an independently-computed `computeItemizedStatutoryFare(...)` call for the same inputs - every field (`tariffVersion`, `statutoryOrderRef`, `billableAdditionalKm`, etc.), not just `estimatedTotalInr`, since a total-only check would pass while any other field silently drifted. `computedAt` is compared separately as "a valid ISO timestamp" since two independent calls produce different wall-clock values.
5. **Matching -> booking/[id]**: `SERVER_MISSION_ASSIGNED` sent directly (mirrors `matching.tsx`'s own simulate-match handler, which does not route through Centrifugo - there is no missionId to subscribe on before this event assigns one) -> `tracking`.
6. **Mock Centrifugo events through the real bridge**: a real `createMockMissionChannel(missionId, callbacks)` is created, with `onLifecycleEvent` wired through the real `translateLifecycleEvent` into `actor.send(...)` - the exact code path `booking/[id].tsx` runs. `mockChannel.controls.triggerDriverArrived()` / `triggerTransportStarted()` / `triggerMissionCompleted()` drive the machine through `tracking` (context-only `driverHasArrived`) -> `transporting` -> `awaitingReceipt`. The mock's internal timers are torn down via `mockChannel.teardown()` before the script exits.
7. **Final fare integrity**: `context.fareDetails` at `awaitingReceipt` (literally what `booking/[id].tsx` passes into `MissionCompletionScreen`) is asserted `deepStrictEqual` against the fare captured at step 4 - proving it survives all five intervening transitions untouched.

**Illegal-jump / XState-rule assertions** (per directive's explicit requirement):
- Re-sending `DRIVER_ACCEPTED` (-> `SERVER_MISSION_ASSIGNED`) while already `tracking` is asserted to be a structural no-op: state unchanged, `context.missionId` unchanged, and `context.driverHasArrived` still `false` (this last check specifically catches a mistranslation of `DRIVER_ACCEPTED` into `SERVER_DRIVER_ARRIVED`, which would otherwise pass every other assertion in that block undetected).
- A stray `REQUEST` sent while `awaitingReceipt` is asserted to be ignored (state stays `awaitingReceipt`, does not restart the flow) - `awaitingReceipt` has no `REQUEST` handler in the machine, so XState's own state-chart structure enforces this; nothing throws, matching the directive's "throw or are ignored" wording as "ignored" for every case exercised here.

**Explicit scope boundary** (stated in the test file's own header comment and here): this is an integration test of the **data pipeline and state graph** - the real domain functions, the real XState machine, the real mock Centrifugo emitter, and the real wire-to-domain bridge - not a rendered-UI test. No React Native test renderer exists anywhere in this repo (every prior suite this project has is `node:assert` against pure/service logic), and installing one wasn't asked for. Every screen in this pipeline is a thin renderer over exactly these four layers; this proves they chain together correctly, which is what "end-to-end integrity" means for this codebase's actual architecture. It does **not** prove any screen renders correctly - see Objective 2's rendering caveat below, which applies equally here.

**Untested branch, disclosed**: `translateLifecycleEvent`'s `MISSION_CANCELLED` -> `CANCEL` case is not exercised by this test - the directive names only the four events (`DRIVER_ACCEPTED`, `SERVER_DRIVER_ARRIVED`/`DRIVER_ARRIVED`, `TRANSPORT_STARTED`, `MISSION_COMPLETED`), and cancellation was out of scope for the golden path.

Wired into `apps/patient/package.json`'s `test` script as a third `&&`-chained command (this repo's one-script-per-workspace convention, established in Phase 4/Task 4.1).

### Objective 2 - Map Rendering Abstraction & Device Build Readiness

**Audit** (`location-entry.tsx` confirmed via grep to render `PickupLocationScreen`; `booking/[id].tsx` renders `MissionTrackingScreen`/`TransportingScreen`): all three screens use a mock fixed-pixel map canvas (no real map projection, confirmed in Phase 4). `MissionTrackingScreen` and `TransportingScreen` share **byte-identical** pan-gesture, recenter-button, and container/viewport/canvas styling (`Animated.ValueXY` + `PanResponder` with a plain `Animated.event([null,{dx,dy}])` binding, `onPanResponderRelease` doing nothing but settle) - a passive viewport that only pans a static canvas; only the canvas width (600 vs 620) and the marker content differ. `PickupLocationScreen`'s pan gesture is structurally different: its `onPanResponderRelease` converts the pixel delta into a new latitude/longitude, re-runs `resolveJurisdiction`, and updates the selected pickup address - the pan *is* the location-picking mechanism, not passive chrome.

**Built**: `apps/patient/src/components/MapViewPort.tsx` (app-local, per the established RN-placement rule from Step 2/Phase 4 - anything importing `react-native` stays out of `packages/ui`'s test-reachable barrel). Owns exactly the mechanics that were identical across the two compatible screens: the `pan` value, the `PanResponder`, the recenter handler/button, and the `mapContainer`/`mapViewport`/`mapCanvas` transform wiring. Takes `children` (pannable canvas content - grid, landmarks, polylines, markers) and an optional `overlays` prop (fixed-position content over the viewport that should not pan, e.g. the Centrifugo status pill and ETA banner) plus optional `canvasWidth`/`canvasHeight` (default `600`x`480`, `TransportingScreen` passes `620`). **MapViewPort never touches telemetry** - `driverHeadingAnim` and `liveSpeedKmh` keep flowing directly from `booking/[id].tsx` into the marker JSX each screen passes as `children`, exactly as before.

**Wired into 2 callers, not 3**: `MissionTrackingScreen.tsx` and `TransportingScreen.tsx` now render `<MapViewPort>...</MapViewPort>` in place of their former inline canvas block; their dead `mapContainer`/`mapViewport`/`mapCanvas`/`recenterButton`/`recenterIcon` style entries and now-unused `pan`/`panResponder`/`handleRecenterMap` declarations were removed (`PanResponder` import dropped from both; `shadows`/`spacing` imports confirmed still used elsewhere in both files via grep, so kept). **`PickupLocationScreen.tsx` was deliberately left unmigrated** - forcing its coordinate-deriving gesture into a shell designed to stay ignorant of business logic would mean either stripping that logic out (breaking location entry) or leaking it into the shared component (defeating the point of the abstraction). This is a 2-caller extraction, which is already a real win; a forced third caller that works differently would have been architecture damage dressed as tidiness.

**Confirmable proof, not just claimed**: `booking/[id].tsx` required **zero changes for the map refactor specifically** (it was modified this pass, but only earlier, for Objective 1's bridge extraction - untouched again for Objective 2) - the useMissionChannel subscription, the telemetry callback, and the mission-progression markers passed to `MissionTrackingScreen`/`TransportingScreen` are byte-identical to before this refactor. That is the directive's "zero rewiring of Centrifugo telemetry hooks or mission progression markers" requirement, satisfied and checkable via diff.

**Explicitly not built**: `react-native-maps` and MapLibre integration. The directive frames these as the future target that `MapViewPort` should make a zero-rewiring swap-in for, not something to build now - nothing native-map-specific was added.

**Rendering caveat, stated plainly**: this refactor is verified by `tsc --noEmit` (0 errors, both files) and by the full test suite (0 regressions) - it has never been rendered. `apps/patient` has no `react-dom`/`react-native-web` and no RN test renderer, so there is no way in this repo to mount `MapViewPort` and visually confirm it. Confidence that the two screens still look identical rests on the pan/viewport/canvas/recenter style objects being byte-identical to what was removed (confirmed via direct comparison during extraction) and the marker JSX being moved, not altered - reasoned, not observed. This should be visually smoke-tested on a real device or simulator before the Android build ships.

**Android permissions** (`apps/patient/app.config.ts`, not `app.json` - see correction above): added `permissions: ["ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION", "INTERNET"]` to the existing `android` block, alongside the pre-existing `adaptiveIcon`/`package` fields.

**Declared but not wired, disclosed rather than silently patched over**: `expo-location` is a dependency of `apps/driver` only - confirmed via grep of both `package.json` files. `apps/patient` has no location library installed. `PickupLocationScreen.handleLocateMe` (the "Locate Me" button) is mock-only: it snaps to the hardcoded `DEFAULT_COORDINATES` (AIIMS Delhi), it does not call any GPS API. The two location permissions are now declared for the native build per the directive, but nothing in the patient app code actually requests device location yet - wiring a real `expo-location` call was not asked for in this task and would be a new, unrequested dependency.

### Verification

```
$ ./node_modules/.bin/turbo run typecheck --force
 Tasks:    6 successful, 6 total

$ per-workspace tsc --noEmit
packages/domain          0 errors
packages/ui              0 errors
packages/data             0 errors
packages/observability     0 errors
apps/patient               0 errors
apps/driver                 0 errors

$ ./node_modules/.bin/turbo run test --force
@sahayak/driver:test:  ALL 6 TEST SUITES PASSED SUCCESSFULLY (100% GREEN)
@sahayak/ui:test:      ALL EK-AMBULANCE DESIGN SYSTEM TESTS PASSED (100% GREEN)
@sahayak/domain:test:  ALL PATIENT LIFECYCLE MACHINE TESTS PASSED (100% GREEN)
@sahayak/patient:test: ALL MISSION CHANNEL SERVICE TESTS PASSED (100% GREEN)
@sahayak/patient:test: ALL PATIENT OTP AUTH CORE TESTS PASSED (100% GREEN)
@sahayak/patient:test: GOLDEN PATH INTEGRATION TEST PASSED (100% GREEN)
 Tasks:    4 successful, 4 total
```

**Note on the task count**: `turbo run test` reports 4 tasks, not 6 - `packages/data` and `packages/observability` have no `test` script declared (unchanged from every prior phase; not a gap introduced here). `turbo run typecheck` does cover all 6 workspaces.

**Zero non-ASCII dashes** (grepped for U+2013/U+2014 across every file touched this pass) and **zero new suppressions** (`@ts-ignore`, `@ts-nocheck`, `eslint-disable`, `as any` - grepped across every file touched this pass, none found).

### Files created (3) / modified (6)

**Created**: `apps/patient/src/services/missionLifecycleBridge.ts`, `apps/patient/src/integration/goldenPath.test.ts`, `apps/patient/src/components/MapViewPort.tsx`.

**Modified**: `apps/patient/app/booking/[id].tsx` (bridge extraction only), `apps/patient/src/screens/MissionTrackingScreen.tsx` (MapViewPort wiring, dead style/code removal), `apps/patient/src/screens/TransportingScreen.tsx` (same), `apps/patient/src/components/index.ts` (barrel export), `apps/patient/app.config.ts` (Android permissions), `apps/patient/package.json` (test script chaining).

### Deviations and open items

- **`app.json` -> `app.config.ts`**: the directive names `app.json`; no such file exists in this workspace. Permissions were added to the real config file, `app.config.ts`.
- **Map refactor is typecheck-and-test verified only, never rendered**: no `react-dom`/`react-native-web`/RN test renderer exists in this repo. Visual parity is reasoned from byte-identical extracted style objects, not observed. Recommend a manual device/simulator smoke test before shipping the Android build.
- **`MapViewPort` has 2 callers, not 3**: `PickupLocationScreen.tsx` was deliberately excluded - its pan gesture is the location-picking mechanism itself (derives lat/lon from the release delta, re-runs `resolveJurisdiction`), not passive viewport chrome. Forcing it in would have broken that logic or leaked it into a component meant to stay business-logic-ignorant.
- **`expo-location` is not a dependency of `apps/patient`**: the two location permissions are now declared in `app.config.ts` per the directive, but `PickupLocationScreen`'s "Locate Me" remains mock-only (snaps to `DEFAULT_COORDINATES`). No new dependency was added since none was asked for. *(Superseded by section 12: `expo-location` is now installed and wired.)*
- **`translateLifecycleEvent`'s `MISSION_CANCELLED` branch is untested** by the golden-path test - the directive names only the four dispatched events; cancellation was out of scope here.
- **`turbo run test` = 4 tasks, not 6**: `packages/data`/`packages/observability` have no `test` script (pre-existing, not a Phase 5 gap).

---

## 12. Patient App Milestone: Complete & Verified

Directive: close the two gaps section 11 disclosed - `translateLifecycleEvent`'s untested `MISSION_CANCELLED` branch, and `expo-location` declared but never wired - to reach a stable Patient App milestone.

### Objective 1 - Complete Mission Cancellation Lifecycle

**The bridge mapping named in the directive's first bullet already existed.** `missionLifecycleBridge.ts`'s `MISSION_CANCELLED -> CANCEL` case was built in Phase 4/5 and verified unchanged this pass (read in full before touching anything else). The actual gap was downstream: the machine cleared no context on cancellation, and `booking/[id].tsx` had no render branch for the `cancelled` state at all - a mid-mission cancellation arriving via Centrifugo while the patient was on `booking/[id]` would silently keep rendering `MissionTrackingScreen`, since the route's `missionState` switch fell through to its default case for any state it didn't explicitly name.

**Machine** (`patientLifecycle.machine.ts`): all three `CANCEL` handlers (`triaged`, `requesting`, `tracking`) now also clear `missionId: null` and `driverHasArrived: false` alongside the existing `error: null` - "clears active tracking contexts" per the directive. `packages/domain`'s own machine test suite (4 groups, unchanged assertions) still passes with this change.

**UI** (`apps/patient/src/screens/MissionCancelledScreen.tsx`, new): a terminal screen for the `cancelled` state - cancellation notice, mission ID, and the exact statutory-fallback-with-108-dialer banner pattern already established in `PickupLocationScreen`'s out-of-zone banner (same visual language, reused deliberately rather than invented fresh). Bilingual (`apps/patient/src/i18n/cancellationStrings.ts`, new, same shape as the other 11 `i18n/*Strings.ts` files). Wired into `booking/[id].tsx` as a new `missionState === "cancelled"` branch, alongside the existing `awaitingReceipt`/`transporting`/default branches.

**A real bug caught before it shipped, not just the screen**: clearing `context.missionId` on `CANCEL` broke this route's existing `isStoreWarm = context.missionId !== null` check - after cancellation that flip to `false` would have made the route ignore the real `currentState` ("cancelled") and fall back to rendering the tracking screen instead. Fixed by switching the warmth signal to `currentState !== "idle"` (robust to context clearing, since "idle" is the only state a genuinely cold store can be in).

**A second bug, found by the advisor tracing `onReturnHome` downstream**: `cancelled` and `receiptConfirmed` are both terminal states in the machine (no `on` handlers at all). `MissionCancelledScreen`'s "Return to Home & Start New Request" button - and `MissionCompletionScreen`'s pre-existing "Return Home" button, same file, same pattern - both only called `router.replace(...)`, never resetting the store. A patient returning home from either screen and starting a fresh booking would have every subsequent event (`SUBMIT_TRIAGE` included) silently no-op forever, since the actor stayed pinned to a state with no handler for anything - a dead booking flow until app restart, unrelated to today's map or GPS work but newly *reachable* because `MissionCancelledScreen` is the first screen to actively invite "start a new request" from a terminal state. Fixed by wiring the store's pre-existing `reset()` (built in Step 5, never called by any route until now) into both `onReturnHome` handlers in `booking/[id].tsx` via one shared `handleReturnHome`.

**Test** (`apps/patient/src/integration/goldenPath.test.ts`): a new "Additional check" block using a fresh `createActor` instance (`cancelled` is only reachable from `triaged`/`requesting`/`tracking`, all already past in the main happy-path actor). Replicates the minimal path to `tracking` (triage -> request -> assigned), sets `driverHasArrived: true` via the real mock channel, then dispatches `MISSION_CANCELLED` through the same real `createMockMissionChannel` + real `translateLifecycleEvent` bridge pattern as the main test's step 6. Asserts: state is `cancelled`, `context.missionId` is `null`, `context.driverHasArrived` is `false`.

### Objective 2 - Real Device GPS Telemetry

**Installed** `expo-location@~18.0.0` in `apps/patient` (same version already declared in `apps/driver`, confirmed via `pnpm install --filter @sahayak/patient`, resolved to `18.0.10`).

**`location-entry.tsx` needed zero changes** - a directive-vs-reality note, stated up front rather than silently doing nothing: the directive names both `location-entry.tsx` and `PickupLocationScreen.tsx`, but `location-entry.tsx` is a thin route wrapper whose `onConfirmPickup` already forwards whatever `point`/`resolution`/`address` `PickupLocationScreen` produces internally, regardless of whether those came from manual pin-drag or GPS. All GPS wiring belongs entirely inside `PickupLocationScreen.tsx`, and that's where it went.

**`PickupLocationScreen.handleLocateMe`** (previously: snap to hardcoded `DEFAULT_COORDINATES`, mock-only) now: calls `Location.requestForegroundPermissionsAsync()`; if not granted, sets a non-blocking `locationErrorMessage` banner and returns - manual pin placement is untouched and still fully usable. If granted, calls `Location.getCurrentPositionAsync({})` and feeds `{latitude, longitude}` straight into the existing `updateCoordinates` helper, which already calls the real domain `resolveJurisdiction(newCoords)` internally (built before this task; no new jurisdiction-resolution code needed - the directive's "feed coordinates directly into resolveJurisdiction" requirement was already satisfied by this helper's existing shape). Any thrown error (GPS disabled, no fix available, any other native failure) is caught and surfaces the same non-blocking banner rather than crashing.

**Banner**: `apps/patient/src/screens/PickupLocationScreen.tsx` renders a small informational banner (distinct in tone from the existing red "emergency" out-of-zone banner - `colors.slate100`/`colors.slate300`, not `colors.emergency*` - since a GPS hiccup is not an emergency-severity event) directly above the out-of-zone banner when `locationErrorMessage` is set. Two new bilingual strings added to `apps/patient/src/i18n/locationStrings.ts`: `locationPermissionDeniedBanner`, `locationUnavailableBanner`.

**Explicitly not built**: no `app.config.ts` plugin entry for `expo-location`. Android's `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION` permissions were already declared in Phase 5's `app.config.ts` work and cover this task's Android scope. iOS's `NSLocationWhenInUseUsageDescription` (Info.plist usage string) was not customized - out of scope, since this directive and its Phase 5 predecessor both frame permissions work as Android-specific, and the app's iOS surface was never otherwise touched this pass.

### Follow-up fix - pre-match cancellation reset (`matching.tsx`)

Directive: close the `matching.tsx` gap this section originally disclosed as a known-but-unfixed follow-up (see the superseded Deviations bullet below).

`apps/patient/app/booking/matching.tsx`'s `handleCancel` sends `CANCEL` (unchanged - preserves the existing reason/reasonNote payload threading from `ActiveMatchingScreen`'s cancellation modal) and now also calls the store's `reset()` immediately after, via a new `resetLifecycle` binding. Navigation was also corrected, not just the reset: the original `router.canGoBack() ? router.back() : router.replace("/booking/confirm")` would have landed a freshly-reset (`idle`) actor on a screen that only knows how to send `REQUEST` - `idle` accepts nothing but `SUBMIT_TRIAGE`, so that combination would have relocated the exact dead-end this fix exists to close, one screen earlier. Now navigates straight to `/(tabs)/home`, matching both reset call sites in `booking/[id].tsx`.

This closes all three **cancellation/completion** exits from the booking flow (`MissionCompletionScreen.onReturnHome`, `MissionCancelledScreen.onReturnHome`, `ActiveMatchingScreen.onCancel` via `matching.tsx`) - not every exit. `MissionTrackingScreen`/`TransportingScreen`'s `onBack` (-> `handleBack` -> `router.back()` in `booking/[id].tsx`) still leaves mid-mission without resetting, and `tracking`/`transporting` reject `SUBMIT_TRIAGE` exactly as flatly as `cancelled` does - the real invariant is "every non-`idle` state rejects `SUBMIT_TRIAGE`, so any exit from the booking flow needs a reset," not "terminal states specifically need one." That back-button path is a pre-existing gap, out of scope for this directive (which named cancellation specifically), and is logged as an open item below rather than silently left unstated.

Verified via the same `turbo run typecheck --force` / `turbo run test --force` sweep as the rest of this section - no new test was added for this specific wiring (the store's `reset()` behavior itself is exercised by `patientLifecycle.store.ts`'s own design and was not touched; this change only adds one more call site), consistent with the directive's ask of typecheck/test parity rather than new coverage.

### Verification

```
$ ./node_modules/.bin/turbo run typecheck --force
 Tasks:    6 successful, 6 total

$ per-workspace tsc --noEmit
packages/domain          0 errors
packages/ui              0 errors
packages/data             0 errors
packages/observability     0 errors
apps/patient               0 errors
apps/driver                 0 errors

$ ./node_modules/.bin/turbo run test --force
@sahayak/driver:test:  ALL 6 TEST SUITES PASSED SUCCESSFULLY (100% GREEN)
@sahayak/ui:test:      ALL EK-AMBULANCE DESIGN SYSTEM TESTS PASSED (100% GREEN)
@sahayak/domain:test:  ALL PATIENT LIFECYCLE MACHINE TESTS PASSED (100% GREEN)
@sahayak/patient:test: ALL MISSION CHANNEL SERVICE TESTS PASSED (100% GREEN)
@sahayak/patient:test: ALL PATIENT OTP AUTH CORE TESTS PASSED (100% GREEN)
@sahayak/patient:test: GOLDEN PATH INTEGRATION TEST PASSED (100% GREEN, including MISSION_CANCELLED)
 Tasks:    4 successful, 4 total
```

**Zero non-ASCII dashes** (grepped for U+2013/U+2014 across every file touched this pass) and **zero new suppressions** (`@ts-ignore`, `@ts-nocheck`, `eslint-disable`, `as any` - grepped across every file touched this pass, none found).

### Files created (2) / modified (8)

**Created**: `apps/patient/src/i18n/cancellationStrings.ts`, `apps/patient/src/screens/MissionCancelledScreen.tsx`.

**Modified**: `packages/domain/src/state-machine/patientLifecycle.machine.ts` (CANCEL clears missionId/driverHasArrived), `apps/patient/src/screens/index.ts` (barrel export), `apps/patient/app/booking/[id].tsx` (cancelled branch, isStoreWarm fix, shared reset-on-return-home), `apps/patient/app/booking/matching.tsx` (reset-on-pre-match-cancel), `apps/patient/src/integration/goldenPath.test.ts` (cancellation test case), `apps/patient/src/i18n/locationStrings.ts` (2 new banner strings), `apps/patient/src/screens/PickupLocationScreen.tsx` (real GPS wiring), `apps/patient/package.json` (`expo-location` dependency).

### Deviations and open items

- **`translateLifecycleEvent`'s `MISSION_CANCELLED` case required no code change** - it was already correct from an earlier pass. This task's actual work was the machine's context-clearing, the missing `cancelled` UI branch, and the test case - all downstream of the bridge, not the bridge itself.
- ~~`matching.tsx`'s pre-match cancel path still does not reset the store~~ **- fixed** in the follow-up above: `handleCancel` now calls `resetLifecycle()`, and navigates to `/(tabs)/home` rather than back into a screen the reset `idle` state can't serve. All three cancellation/completion exits from the booking flow are closed.
- **`MissionTrackingScreen`/`TransportingScreen`'s `onBack` still does not reset the store** - mid-mission "back" (`handleBack` in `booking/[id].tsx`, `router.back()`/`router.replace("/(tabs)/home")`) leaves the actor in `tracking`/`transporting`, neither of which accepts `SUBMIT_TRIAGE`. Same root cause as the three exits just fixed, not fixed here - out of scope for this directive, which named cancellation specifically. Recommend auditing every exit point from the booking flow (not just the ones this task and its predecessor happened to touch) in a dedicated follow-up, rather than fixing them one report at a time.
- **GPS code path is typecheck-verified only, never executed** - same no-RN-renderer boundary as Phase 5's map refactor. `handleLocateMe`'s permission-granted, permission-denied, and GPS-failure branches have never actually run against a device or simulator. Recommend a manual smoke test (grant, deny, and airplane-mode GPS-failure cases) before shipping.
- **No `app.config.ts` plugin entry for `expo-location`** - iOS's location usage-description string is uncustomized; Android's permissions (already declared in Phase 5) are unaffected. Disclosed as an Android-scoped decision, not an oversight.
- **`isStoreWarm` semantics changed** from `context.missionId !== null` to `currentState !== "idle"`, as a direct consequence of `CANCEL` now clearing `missionId`. Functionally equivalent for every pre-existing case (a warm store always has `currentState !== "idle"` too) and strictly more correct for the new cancelled-context-cleared case.

---

## 13. Driver App Milestone: Phase 1 (Auth, KYC & Standby Dashboard)

Directive: implement Phase 1 of the Driver App - bilingual phone-OTP authentication with driver-role enforcement, an AIS-125 vehicle KYC/onboarding screen, and a shift standby/radar dashboard.

**Objectives 2 and 3 were already fully built** before this pass, and are not the "stubbed" screens the directive's framing describes. `DriverOnboardingScreen.tsx` (4-step wizard: CDL, EMT certification, vehicle registration + AIS-125 classification selector with per-tier mandatory equipment checklists, statutory ARAI/fitness/RC document uploads) and `DriverStandbyScreen.tsx` (Go Online/Offline toggle with a confirm-before-offline modal, simulated Redis GEOADD presence telemetry, dual jurisdiction selector with GPS-corridor switching, AIS-125 tier badge, daily mission/revenue stats) both already existed, complete, bilingual, and backed by real Zustand stores (`driverOnboarding.store.ts`, `driverStandby.store.ts`). This was verified by reading both screens and stores in full before writing anything, not assumed from file names. Only Objective 1 (`(auth)/phone-entry.tsx`, `(auth)/otp-verify.tsx`, `useOtpAuth.ts`) matched the directive's "stubbed" description.

### Objective 1 - Driver Authentication & Bilingual Parity

Mirrors the patient app's Task 4.1 pattern (`apps/patient/src/lib/supabaseClient.ts`, `otpAuth.core.ts`, `useOtpAuth.ts`) rather than the older raw-fetch contract in `docs/prompts/driver-app/P03-otp-authentication-driver-role.md` - the current directive explicitly asks to match the patient app's current quality bar, and the patient app itself moved past that raw-fetch design in an earlier task.

**`src/lib/supabaseClient.ts`** (new): real `@supabase/supabase-js` client routed through the Kong gateway (`EXPO_PUBLIC_GATEWAY_URL`, same placeholder-URL pattern as the patient app - no real Supabase project is provisioned), with an `expo-secure-store`-backed storage adapter (in-memory fallback for web/bundle-eval, matching the patient app's guard).

**`src/hooks/otpAuth.core.ts`** (new): pure, unit-testable helpers ported from the patient app's `otpAuth.core.ts` (`isValidIndianMobile`, `toE164IndianPhone`, `extractCooldownSeconds`, `mapAuthError`, `networkErrorToApiError`), plus one driver-specific addition: `hasDriverRole(role): role is "driver"`.

**`src/hooks/useOtpAuth.ts`** (rewritten from its `// Implemented in task P03` stub): `requestOtp`/`verifyOtp` now call the real SDK. On successful `verifyOtp`, the hook reads `session.user.app_metadata.role` and asserts it equals `"driver"` before returning a session; on mismatch it calls `supabase.auth.signOut()` immediately and returns `null` with `error: "unauthorized_role"` - this satisfies both the directive's "block session initialization if the returned user record does not possess verified driver credentials" and the P03 spec's "sign the session out immediately... do not silently redirect into the wrong app's flow."

**Role source deviates from the P03 spec's literal wording.** The spec says to assert `profiles.role === "driver"`, implying a separate `profiles` table joined server-side. No such table, migration, or `supabase/` schema exists anywhere in this repo (grepped before writing any auth code). Reading `app_metadata.role` off the session instead: (a) matches the only existing precedent in this codebase - the patient app's `useOtpAuth.ts` already reads its (non-authorizing) role straight off `session.user.role`, not via a table join; (b) is the standard, server-settable-only Supabase field for this exact purpose (unlike `user_metadata`, which any client can rewrite via `updateUser`); (c) requires inventing zero backend schema. RLS on a future `profiles` table can still enforce the same rule server-side without this client code changing.

**`src/i18n/driverAuthStrings.ts`** (new): full English/Hindi parity for the phone step, OTP step, DPDP consent (two driver-specific purposes - live dispatch location, crew/vehicle credential processing - rather than the patient app's location/medical pair), and all error states, including the two `unauthorizedRoleError` strings copied verbatim from the P03 spec (lines 36-37) in both languages.

**`src/screens/DriverPhoneEntryScreen.tsx`** and **`DriverOtpVerifyScreen.tsx`** (new): **kept as two separate screens/routes, not merged into one internal-step screen like the patient app's `PhoneAuthScreen.tsx`.** This was a deliberate call against an initial recommendation to unify them: the P03 spec's file list and the pre-existing `(auth)/_layout.tsx` (already declaring `phone-entry` and `otp-verify` as separate stack screens before this task) both assume two routes. The split avoids full duplication by design - DPDp consent lives only on the phone-entry screen (asked once, before an OTP is even sent, not re-shown per step); `otp-verify` receives `phone` via an Expo Router param and owns only OTP-entry concerns (cell input, resend cooldown, verify). Each screen holds its own `useOtpAuth()` instance; this is safe because navigation between them only happens after `requestOtp` already succeeded, so no cooldown/error state needs to survive the route boundary.

**Route wiring**: `(auth)/phone-entry.tsx` pushes to `/(auth)/otp-verify` with `{ phone }` on OTP-sent; `(auth)/otp-verify.tsx` redirects back to `/(auth)/phone-entry` if reached without a `phone` param (stale deep link), and on a role-verified `onVerified` calls `router.replace("/(shift)/standby")` - the exact destination the P03 spec's acceptance criteria name.

### Objective 4 - Verification & Testing

**Pre-existing testability gap fixed, not introduced**: `driverOnboarding.store.ts`, `driverStandby.store.ts`, and `driverOnboardingStrings.ts` imported the type-only `AIS125VehicleType`/`SupportedLanguage` as plain (non-`type`) named imports. This is invisible under `tsc`/Metro's bundler resolution (which is why `turbo run typecheck` was already green before this pass) but breaks Node's native ESM loader (`--experimental-strip-types`) with `SyntaxError: ... does not provide an export named 'X'` - confirmed empirically before editing anything. Fixed by marking all three `import type` (the correct form, and the only one already used everywhere else in `packages/domain`'s own source). Zero behavior change; `allowImportingTsExtensions: true` in the shared tsconfig makes the accompanying `.ts`-extension additions (matching `telemetryQueue.service.ts`'s existing convention for node-testable files) a no-op too.

**New unit tests** (all run via plain `node --experimental-strip-types`, no framework, per the existing `telemetryQueue.service.test.ts` pattern):
- `src/hooks/otpAuth.core.test.ts` - phone/E.164 normalization, cooldown extraction, GoTrue error-code mapping, and the `hasDriverRole` assertion (driver/patient/authenticated/undefined/null/empty-string cases).
- `src/state/driverOnboarding.store.test.ts` - KYC validation rules for all 4 wizard steps (CDL, EMT, vehicle/AIS-125, statutory documents), step-clamping, and AIS-125-to-care-level resolution on submit.
- `src/state/driverStandby.store.test.ts` - shift status transitions (online -> confirm-modal -> offline -> online), Redis presence indexed/de-indexed state, jurisdiction-to-GPS-corridor switching, and AIS-125-tier-to-Redis-key namespacing.

### Verification

```
$ npx turbo run typecheck --force
 Tasks:    6 successful, 6 total   (0 TypeScript errors across all 6 workspaces)

$ npx turbo run test --force
@sahayak/driver:test:  ALL 6 TEST SUITES PASSED (telemetryQueue) + otpAuth.core + driverOnboarding.store + driverStandby.store, all 100% GREEN
@sahayak/patient:test: GOLDEN PATH INTEGRATION TEST PASSED (100% GREEN, unaffected)
@sahayak/ui:test / @sahayak/domain:test: unaffected, still GREEN
 Tasks:    4 successful, 4 total   (zero regressions)
```

### Files created (8) / modified (8)

**Created**: `apps/driver/src/lib/supabaseClient.ts`, `apps/driver/src/hooks/otpAuth.core.ts`, `apps/driver/src/hooks/otpAuth.core.test.ts`, `apps/driver/src/i18n/driverAuthStrings.ts`, `apps/driver/src/screens/DriverPhoneEntryScreen.tsx`, `apps/driver/src/screens/DriverOtpVerifyScreen.tsx`, `apps/driver/src/state/driverOnboarding.store.test.ts`, `apps/driver/src/state/driverStandby.store.test.ts`.

**Modified**: `apps/driver/package.json` (`@supabase/supabase-js` + `expo-secure-store` dependencies, chained test script), `apps/driver/src/hooks/useOtpAuth.ts` (real SDK + role gate), `apps/driver/app/(auth)/phone-entry.tsx` (thin route wrapper), `apps/driver/app/(auth)/otp-verify.tsx` (thin route wrapper + param redirect guard), `apps/driver/src/screens/index.ts` (barrel export), `apps/driver/src/state/driverOnboarding.store.ts` (`import type` fixes for node-testability), `apps/driver/src/state/driverStandby.store.ts` (same), `apps/driver/src/i18n/driverOnboardingStrings.ts` (same).

### Deviations and open items

- **No live backend to verify end-to-end against** - `EXPO_PUBLIC_GATEWAY_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` remain placeholders, same as the patient app. The OTP request/verify/role-gate code is structurally correct against the documented Kong/GoTrue contract but has never executed against a real gateway; recommend a manual end-to-end pass once Kong + a `driver` `app_metadata.role`-tagged test account exist.
- **`app_metadata.role` vs. a `profiles` table** - see Objective 1 above. If a `profiles` table is added later for other reasons, this is the one place to revisit; no other file assumes its absence.
- **Two-screen auth flow vs. patient app's one-screen flow** - a deliberate, disclosed deviation from an initial single-screen recommendation; see Objective 1 above for the reasoning (P03's file list, the pre-existing two-route `(auth)/_layout.tsx`, and avoiding DPDP-consent duplication by design rather than by accident).
- **Driver KYC/standby screens (Objectives 2, 3) received no functional changes** - only the `import type` testability fix. If this milestone is later reviewed against the original stubbed-screen framing in the directive, note that the substantial work there predates this session.
- **GPS tracking, dispatch-listener teardown on Go Offline, and Redis `GEOADD` are simulated**, not wired to real device GPS or a real Redis instance - this was already true of the pre-existing `DriverStandbyScreen`/`driverStandby.store.ts` and is unchanged; consistent with the directive's own "GPS tracking simulation/hooks" phrasing for Objective 3.

---

## 14. Driver App Milestone: Phase 2 (Wave Dispatch & Acceptance)

Directive: wire dispatch-wave notification and mission acceptance - a 15-second acceptance window, mutually-exclusive acceptance, and driver-side vehicle-tier verification - into the existing `IncomingMissionModal.tsx` / `(shift)/offer.tsx`.

**Unlike Phase 1's KYC/standby screens, this was a genuine gap, not already-built work.** `driverLifecycle.types.ts` (event/state contracts) and the offer UI (`IncomingMissionModal.tsx`, `(shift)/offer.tsx`) already existed and were high quality, but there was no actual state machine implementation - `driverLifecycle.store.ts`'s `send()` was a literal no-op (`// Wrapped XState actor interaction implemented in P06`), and `useDispatchOfferChannel.ts` was equally stubbed (`// Implemented in task P05`). This was confirmed by reading both files in full, plus the driver-app's own `docs/prompts/driver-app/P02/P04/P05` spec series, before writing anything.

### Objective 1 - Audit & Driver State Machine

**Answer: `@sahayak/domain` had the contract but not the machine.** Built `packages/domain/src/state-machine/driverLifecycle.ts` (filename per P02's spec, not `patientLifecycle.machine.ts`'s `.machine.ts` suffix convention - confirmed via grep that nothing in `turbo.json`/any `package.json`/lint config depends on a `*.machine.ts` glob, so this is a cosmetic choice with a single, better-sourced instruction to follow). Implements P02's exact state chart: `offline --GO_ONLINE[guard]--> standby --GO_OFFLINE--> offline`, `standby --SERVER_OFFER_RECEIVED--> offered --{ACCEPT_DISPATCH->enRouteToPatient | DECLINE_DISPATCH->standby | SERVER_OFFER_TIMEOUT->standby}`, then the full mission chain through to `arrivedHospital --COMPLETE_MISSION--> standby`. The `GO_ONLINE` guard (`ais125CertPath.trim().length > 0`) rejects unverified crews without moving off `offline`, exactly as P02 specifies.

**`apps/driver/src/state/driverLifecycle.store.ts`** now wraps a real XState actor, mirroring `apps/patient/src/state/patientLifecycle.store.ts`'s exact pattern (`createActor` mounted at store creation, snapshot subscription mirrors state into Zustand, `reset()` stops and remounts). Kept the store's pre-existing **flat** public shape (`activeMissionId`/`activeOfferId`/`error` as top-level fields, not nested under a `context` object like the patient store) because `apps/driver/app/mission/[id].tsx` already reads/writes `activeMissionId` at the top level - changing that shape would have been an unrequested, unrelated refactor of P06-era code. Added one new top-level field, `driverId`, mirrored from the machine's context, so route files can build event payloads without hardcoding a driver ID twice.

**Structural gap found and closed, not part of the original ask but required for Objective 1 to be true**: Phase 1's `driverStandby.store.ts` "Go Online" toggle never actually told the driver lifecycle machine anything - it's a fully independent Zustand store with its own `isOnline` boolean. Without a fix, `SERVER_OFFER_RECEIVED` would silently no-op forever, because the machine only accepts it while in `standby`, and nothing ever put it there (illegal-transition rejection working exactly as designed, just against a machine nobody had turned on). Fixed with the minimum necessary wiring: `driverStandby.store.ts`'s creation, `toggleOnlineState`'s online branch, and `confirmGoOffline` now also call `useDriverLifecycleStore.getState().send(...)` with `GO_ONLINE`/`GO_OFFLINE`, using synthetic demo identifiers (`DRV-DEMO-0001`, `AMB-DEMO-0001`, `storage/certs/demo-driver-kyc.pdf` - no real driver identity exists yet, same "named placeholder" pattern as the patient app's `PAT-DEMO-0001`). This is additive only - no existing Phase 1 field, action signature, or default UI behavior changed. One side benefit: `mission/[id].tsx`'s pre-existing `send({type: "CONFIRM_ARRIVAL_SCENE", ...})` calls (built in an earlier session, previously firing into a no-op) now drive a real machine, with zero changes to that file.

**Test**: `packages/domain/src/state-machine/driverLifecycle.test.ts` (co-located next to the machine, matching `patientLifecycle.machine.test.ts`'s convention - not P02's `__tests__/` subdirectory, which is a Jest convention this repo doesn't use anywhere else). Covers all 12 of P02's acceptance criteria: valid/invalid `GO_ONLINE`, every state transition through the full chain, and illegal-transition rejection while `offline`. Chained into `packages/domain/package.json`'s `test` script.

### Objective 2 - Dispatch Wave Offer Ingestion & 15s Countdown

`IncomingMissionModal.tsx` already rendered triage badges, pickup info, and a 15-second countdown - refactored in place rather than rebuilt, per the directive's explicit instruction. Extracted the countdown/threshold/eligibility logic that was previously inlined into component closures into a new pure module, **`apps/driver/src/hooks/dispatchOffer.core.ts`**: `OFFER_WINDOW_SECONDS` (single source of truth - the numeral countdown and the progress-bar animation both now read the same constant instead of two independently-drifting magic numbers, `useState(15)` and `duration: 15000`), `tickOfferCountdown` (the per-second reducer), `isSwipeAcceptanceComplete` (the 75%-drag threshold), and `isVehicleTierEligible` (new - see Objective 3).

Added six optional props to `IncomingMissionModal` (`requiredVehicleType`, `registeredVehicleType`, `pickupAddress`, `pickupLandmark`, `distanceKm`, `etaMinutes`), each defaulting to the exact literal the component previously hardcoded - fully backward compatible. A new "Required AIS-125 Vehicle Category" section (reusing `driverOnboardingStrings.ais125Categories` for the human-readable tier names, rather than inventing a second label set) displays the mission's required tier against the driver's own registered tier.

### Objective 3 - Acceptance Mechanism, Vehicle-Tier Gate & Navigation Handoff

**Swipe-to-Accept** unchanged in mechanics (`PanResponder`, 75% drag threshold) but now calls `isSwipeAcceptanceComplete` instead of inlining the ratio check.

**Vehicle-tier mismatch gate**: `isVehicleTierEligible(required, registered)` is **strict AIS-125-category equality**, deliberately not a `CareLevel` comparison - `packages/domain/src/pricing/index.ts`'s `careLevelFromVehicleType` collapses `TYPE_B_PTA` and `TYPE_A_MFR` into the same `"PTA"` `CareLevel`, but a motorbike first-responder is not dispatch-eligible for a patient-transport-ambulance request even though the pricing model treats them as fare-equivalent. On a mismatch: the swipe gesture is disabled entirely (`onStartShouldSetPanResponder` returns `false`, `onPanResponderMove`/`onPanResponderRelease` no-op), the slider dims and its prompt text changes to a mismatch message, and a red banner explains why. This is a **driver-visible block, not a silent auto-decline** - a deliberate choice over the alternative (auto-firing `DECLINE_DISPATCH` behind the driver's back), since the directive only asked to "verify" the match, not to auto-reject. The driver can still explicitly decline. `ponytail:` comment in `dispatchOffer.core.ts` names tier-hierarchy substitution (e.g. an ALS unit covering a BLS request) as the upgrade path if dispatch policy ever wants it.

**On acceptance** (`(shift)/offer.tsx`): sends `ACCEPT_DISPATCH` (`missionId`, `driverId` from the lifecycle store, `offerId`, `acceptedAt`) before `router.replace`-ing to `/mission/[id]`, matching the directive's "transition the driver state to `accepted`... then navigate."

**On explicit decline**: sends `DECLINE_DISPATCH` with `reason: "other"` (the modal's decline sheet collects a free-text bilingual reason for driver-facing display only; the domain payload's `reason` field is a fixed 4-value enum with no natural mapping from that free text, so rather than inventing a lossy mapping, every explicit decline uses `"other"` - the same simplification the pre-existing stub already made) and `router.back()`.

**On the 15-second window closing unactioned**: the directive names this `OFFER_EXPIRED`; the domain's actual event (per P02, already in `driverLifecycle.types.ts` before this session) is `SERVER_OFFER_TIMEOUT`. Mapped the directive's event onto the existing one rather than adding a second event for the identical `offered -> standby` transition.

### Objective 4 - Mock Wave Dispatch Harness

**`apps/driver/src/services/mockDispatchWave.ts`** (new): `generateMockDispatchOffer()` picks a random pickup point from 5 realistic Delhi/NCR + UP locations (Noida, Greater Noida, Ghaziabad, South Delhi, Central Delhi - each with real coordinates, address, and landmark text), a random triage tier, and a random required AIS-125 category. Non-deterministic (`Math.random`/`Date.now`), so intentionally not unit-tested (Objective 5 asks for timer/swipe/tier-mismatch coverage, not this generator).

Wired two ways, both extending the pre-existing debug button rather than replacing it: **(a)** `(shift)/standby.tsx`'s existing "Simulate Offer" trigger (built in an earlier session, previously a bare `router.push("/(shift)/offer")` with no params) now generates a mock wave, sends `SERVER_OFFER_RECEIVED` on the lifecycle store, and passes the full offer through router params. **(b)** `app/_layout.tsx` registers `globalThis.__mockDispatchOffer()` in a `__DEV__`-guarded effect, callable from the Metro/Expo debugger console from anywhere in the app (confirmed `expo-router` exports an imperative `router` singleton, `import { router } from "expo-router"`, usable outside the component tree, before building on it) - doing the identical generate-send-navigate sequence.

### Objective 5 - Verification & Testing

**The "no RN renderer" constraint (already disclosed in HANDOVER §11/§12) shaped how the three requested tests were built.** None of the three UI behaviors named in the directive - the 15-second timer, the swipe gesture, the tier check - can be driven through an actual rendered `IncomingMissionModal` component in this repo (no `react-dom`/`react-native-web`/RN test renderer exists). Rather than skip them or write a shallow relabeling (e.g. asserting the machine's `SERVER_OFFER_TIMEOUT` transition and calling that "the timer test," which tests the *consequence* of 15 seconds passing but nothing about *15 seconds*), the underlying pure logic was extracted into `dispatchOffer.core.ts` specifically so it could be tested directly:

- **`apps/driver/src/hooks/dispatchOffer.core.test.ts`** (new) - 15-tick countdown reaching exactly 0 with `expired` firing on the boundary tick (not before, not after), idempotency when polled past expiry (no negative seconds, no double-fire), the 75%-swipe-threshold boundary (`75%` exact, `74%`/negative-drag rejected, zero-width-track guarded), and vehicle-tier eligibility (exact match passes; a BLS unit cannot accept an ALS-required offer; a Type A first-responder is rejected for a Type B request despite both collapsing to the same `CareLevel`).
- **`packages/domain/src/state-machine/driverLifecycle.test.ts`** - the state-machine-level consequence of each of these UI behaviors (the actual `offered -> enRouteToPatient` / `offered -> standby` transitions), which is what P02's acceptance criteria ask for regardless.

Together these cover both halves honestly: the UI-adjacent pure logic, and the state transitions it drives - not a stand-in for the RN renderer this repo doesn't have.

**`usePresence.ts` and `useDispatchOfferChannel.ts` were deliberately not touched** - both are P04/P05 stubs, and this directive explicitly asks for a *mock* harness instead of the real Centrifugo channel. Leaving `useDispatchOfferChannel.ts` stubbed is correct scope, not a miss.

### Verification

```
$ npx turbo run typecheck --force
 Tasks:    6 successful, 6 total   (0 TypeScript errors across all 6 workspaces)

$ npx turbo run test --force
@sahayak/domain:test:  ALL DRIVER LIFECYCLE MACHINE TESTS PASSED (100% GREEN, 12/12 P02 acceptance criteria)
@sahayak/driver:test:  ALL 6 TEST SUITES PASSED, plus otpAuth.core + dispatchOffer.core + driverOnboarding.store + driverStandby.store, all 100% GREEN
@sahayak/patient:test: GOLDEN PATH INTEGRATION TEST PASSED (100% GREEN, unaffected)
@sahayak/ui:test: unaffected, still GREEN
 Tasks:    4 successful, 4 total   (zero regressions)
```

### Files created (5) / modified (10)

**Created**: `packages/domain/src/state-machine/driverLifecycle.ts`, `packages/domain/src/state-machine/driverLifecycle.test.ts`, `apps/driver/src/hooks/dispatchOffer.core.ts`, `apps/driver/src/hooks/dispatchOffer.core.test.ts`, `apps/driver/src/services/mockDispatchWave.ts`.

**Modified**: `packages/domain/src/index.ts` (export the machine), `packages/domain/package.json` (chained test), `apps/driver/src/state/driverLifecycle.store.ts` (real actor wrapper), `apps/driver/src/state/driverStandby.store.ts` (GO_ONLINE/GO_OFFLINE wiring), `apps/driver/src/screens/IncomingMissionModal.tsx` (pure-core wiring, tier-mismatch UI, new props), `apps/driver/src/i18n/driverMissionOfferStrings.ts` (5 new bilingual keys), `apps/driver/app/(shift)/offer.tsx` (real event dispatch), `apps/driver/app/(shift)/standby.tsx` (mock wave generation), `apps/driver/app/_layout.tsx` (`__mockDispatchOffer` debug hook), `apps/driver/package.json` (chained test).

### Deviations and open items

- **Filename deviates from P02** (`driverLifecycle.ts`, matching `patientLifecycle.machine.ts`'s sibling pattern would have been `driverLifecycle.machine.ts`) - see Objective 1. Verified no glob/tooling dependency on either name before choosing.
- **Decline reason is always `"other"`** - the modal's free-text bilingual decline reasons have no clean mapping onto the domain's 4-value `DeclineDispatchPayload.reason` enum; inventing one wasn't asked for and risks being wrong. `ACCEPT_DISPATCH`/`SERVER_OFFER_TIMEOUT` carry full fidelity; only this one field is a simplification.
- **`mission/[id].tsx`'s `onBackToStandby` still doesn't send an event** before `router.replace`-ing to standby - the lifecycle machine stays in `enRouteToPatient` while the UI shows the standby screen. Pre-existing (built in an earlier P06-adjacent pass, not touched this session), out of scope for this directive, and flagged rather than silently "fixed" into a `reset()` that would have re-dropped the shift session back to `offline`.
- **No live Centrifugo dispatch channel** - `useDispatchOfferChannel.ts` remains the P05 stub by design; the mock harness (Objective 4) stands in for it until that task is picked up.
- **Synthetic driver/ambulance identity** (`DRV-DEMO-0001`, `AMB-DEMO-0001`) - no real authenticated-driver identity flows into this store yet (P04's presence endpoint, which would supply one, is also still a stub). Same class of placeholder as the patient app's `PAT-DEMO-0001`.
- **The tier-mismatch gate is strict-equality only** - see the `ponytail:` comment in `dispatchOffer.core.ts`. No tier-hierarchy substitution (e.g. an ALS-registered driver accepting a BLS-required offer) is implemented; add it if dispatch policy calls for it.

---

## 15. Driver App Milestone: Phase 3 (Active Mission Execution & Hospital Handoff)

Directive: resolve HANDOVER §14's open item (synchronize `mission/[id].tsx`/`DriverNavigationScreen.tsx` with the real `driverLifecycle` actor), wire the three-slide mission progression (arrival, transport start, ER handoff) through real machine events, add hospital capacity gating and a telemetry publisher, and close with a statutory receipt + clean shift reset.

**The three big execution screens (`DriverNavigationScreen.tsx`, `OnSceneCareScreen.tsx`, `InTransitHospitalScreen.tsx` - 1365/1239/1205 lines) were already fully built**, including the vitals-entry drawer (BP/Pulse/SpO2/GCS, non-blocking - confirmed by reading `handleStartTransport`, which never references any vitals field) and the hospital selector's capacity display. Read in full, not assumed, before writing anything. The real gaps were narrower and more specific than "rebuild the screens": one genuine event-ordering bug, two structurally-stubbed services, and one missing gating predicate.

### Objective 1 - Synchronize Active Mission Route & State Machine

**The concrete bug**: `InTransitHospitalScreen.tsx`'s ER-handoff slider fired `onCompleteMission` (`COMPLETE_MISSION`) directly from `transporting`, skipping `CONFIRM_ARRIVAL_HOSPITAL` entirely. Before Phase 2, `driverLifecycle.store.ts.send()` was a no-op stub, so this was invisible; now that Phase 2 made it a real actor, the machine correctly rejects this (illegal transition, stays in `transporting`) - locked in as **Test 12b** in `driverLifecycle.test.ts`, added before touching any screen code, so the fix could be verified against a test that would have caught the shipped bug.

**Fix**: split the slider's single payload-and-callback into two, matching the machine's actual two-step contract. The slider release now fires a new `onConfirmArrivalHospital` prop (`ConfirmArrivalHospitalPayload` -> `CONFIRM_ARRIVAL_HOSPITAL`, `transporting -> arrivedHospital`) and opens the sign-off modal exactly as before. `onCompleteMission` (`CompleteMissionPayload` -> `COMPLETE_MISSION`, `arrivedHospital -> standby`) now fires only from the new receipt view's "Complete & Return to Shift" button - see Objective 4.

**`mission/[id].tsx` audit finding**: the route rendered from an entirely local `phase` state, seeded once from an `initialPhase` route param and advanced only by its own callbacks - it never read `currentState` from `driverLifecycle.store.ts` at all, and a stale `useDriverLifecycleStore.setState({ activeMissionId })` effect directly overwrote store state on every mount, which a live actor's next `send()` would silently clobber (drift, not a mitigation of it). Fixed by: (a) deleting that `setState` effect; (b) a new top-level guard that redirects to `/(shift)/standby` (`<Redirect>`, matching the precedent already set in `(auth)/otp-verify.tsx`) whenever `currentState` isn't one of the four mission-active states - covers a stale deep link, a reload with no accepted mission, or re-entry after the mission already completed; (c) seeding local `phase`'s *initial* value from the real `currentState` via a new `phaseForLifecycleState()` mapping, rather than trusting a route param that could name any phase regardless of what the machine actually reflects.

**Deliberately not collapsed further**: `phase` still exists and still advances via the same UI-driven callbacks (`onProceedToPatientHandoff`, `onProceedToTransportNavigation`) rather than reacting live to every `currentState` change. Tracing `DriverNavigationScreen.tsx`'s slider handler showed its "arrived, review, then proceed" UX is two separate driver actions (slide, then a later explicit "Proceed" tap) with a real intermediate review screen in between - `CONFIRM_ARRIVAL_SCENE` already fires at slide-time, and a purely `currentState`-reactive parent would unmount that screen the instant the machine moves to `onScene`, one full driver action early. Preserving the existing reviewed UX was judged more valuable than a marginally "purer" render model; the actual drift (a route that never read the real state at all) is what's fixed. `arrivedHospital` intentionally maps to the same local `"transporting"` phase as `transporting` itself, since `InTransitHospitalScreen` already handles both internally (its own `isCompletedAtHospital`/`isReceiptView` sub-states) - exactly the same pattern `DriverNavigationScreen`'s internal arrival sub-view already uses.

**`DriverNavigationScreen.tsx` needed no changes.** It holds no assumptions about `currentState` at all - it's a purely presentational component driven by props/callbacks, and its one `send()`-triggering callback (`onConfirmArrival`) already fires at the correct moment. The directive named both files; the audit found the actual drift only in the route.

### Objective 2 - On-Scene Hospital Selection & Capacity Check

**New**: `apps/driver/src/hooks/hospitalHandoff.core.ts` - `isHospitalSelectable(hospital)`, a pure predicate: `availableIcuBeds - bedsHeldCounter - inboundAmbulances > 0`. Deliberately not "`availableIcuBeds > 0`" - checked the seeded `RANKED_TRAUMA_CENTRES` fixture first (per the Phase 2 lesson about `GO_ONLINE` seeding): every one of the 5 pre-existing Delhi-area centres has `availableIcuBeds >= 3`, so a naive predicate would never trip against the demo data, shipping a gate that passes its unit test and is dead in the running app.

**Added Sharda Hospital (Greater Noida)** to the fixture - named explicitly in the directive's own examples but absent from the existing 5-entry list (all Delhi-area). Seeded with deliberately saturated capacity (1 available ICU bed, 1 already held, 2 ambulances inbound - net negative), so the capacity gate is exercised live in the app, not just by the unit test. `OnSceneCareScreen.tsx`'s hospital cards now compute `isSelectable` per card: unselectable cards are dimmed, `disabled`, show a red "AT CAPACITY" badge in place of the selection radio, and `onPress` no-ops rather than calling `setSelectedHospitalId`. `handleStartTransport` also gained a defense-in-depth guard (bail if the selected hospital somehow isn't selectable), matching the disable-plus-guard double gating pattern from Phase 2's vehicle-tier check.

**Vitals drawer and capacity display required no changes** - both were already fully built and already correctly non-blocking (`handleStartTransport` never reads any vitals field).

### Objective 3 - Centrifugo Telemetry Broadcast Emitter

**Genuine gap, confirmed before writing anything**: `useGpsPublisher.ts`'s live-publish branch was a bare `// Centrifugo channel publish logic` comment - it set local state and nothing else. No Centrifugo client existed anywhere in the driver app; `useCentrifugoConnection.ts` only manages the store-and-forward fallback path.

**New**: `apps/driver/src/services/driverTelemetry.ts`, the publish-side counterpart to the patient app's subscribe-side `missionChannel.service.ts` - same `mission:{missionId}` channel name, same injectable-`createClient` shape for socket-free testing (mirrors `missionChannel.service.test.ts`'s fake-client pattern exactly). Verified against `centrifuge` v5's own `.d.ts` (not assumed from the patient file, which never needed to publish) that `client.publish(channel, data): Promise<PublishResult>` exists at the client level - so this publisher needs no subscription at all, just a connected client with a `publish: true`-scoped token (`POST /realtime/token` with `{ scope: "mission:{missionId}", role: "publisher" }`, per P05). `mockTelemetryEmitter()` interpolates bearing/speed along a route polyline on the same ~3s cadence a real throttled publisher would use.

**Wired into exactly one call site**: `useGpsPublisher.ts`'s existing live-publish branch now calls the mounted publisher instead of the comment; mount/teardown piggybacks on the hook's existing `isPublishingActive` effect. `useCentrifugoConnection.ts` (the fallback/store-and-forward path) was deliberately left untouched - it already works today and this directive's telemetry ask is specifically the live-publish path.

### Objective 4 - Terminal Handoff & Shift Reset

**Statutory mission summary receipt** (new, inside `InTransitHospitalScreen.tsx`'s existing sign-off modal - not a separate screen): after the driver submits the sign-off form, the SAME modal switches to a receipt sub-view (`isReceiptView` state) showing total kilometers driven, the existing statutory fare/tariff breakdown (reused as-is, not reinvented), and the physician/EMT sign-off just collected. "Total kilometers driven" is `TOTAL_MISSION_DISTANCE_KM = 5.6` - the sum of the two screens' own simulated-leg starting distances (1.8km en-route + 3.8km transport), the same class of documented demo constant as the patient app's `DEFAULT_DISPATCH_DISTANCE_KM`, since GPS is simulated throughout this app and there is no live odometer to sum.

**"Complete & Return to Shift"** (the directive's exact button label, now literal bilingual copy - `btnCompleteAndReturn`) is where `COMPLETE_MISSION` actually fires, updates `driverStandby.store`'s daily shift metrics (completed-missions counter, revenue - unchanged from the pre-existing behavior, just moved later), and returns to `/(shift)/standby`. This is the same store Phase 2 wired `GO_ONLINE`/`GO_OFFLINE` into, so the driver lands back in a machine state of `standby` exactly matching the UI they see, ready for the next `SERVER_OFFER_RECEIVED`.

### Objective 5 - Verification & Testing

- **State progression sequence**: already fully covered by `driverLifecycle.test.ts` Tests 8-11 (built in Phase 2); not duplicated.
- **Invalid skip-state rejection**: new Test 12b, added *before* fixing the screen bug it describes - `COMPLETE_MISSION` sent from `transporting` is rejected (stays `transporting`, context untouched), then the correctly-ordered `CONFIRM_ARRIVAL_HOSPITAL` is shown to still work from the same actor.
- **Destination hospital assignment**: `hospitalHandoff.core.test.ts` - real spare capacity is selectable, a facility with no net free capacity is rejected even with `availableIcuBeds > 0`, every pre-existing Delhi-area centre remains selectable (proving the gate doesn't over-trigger), and Sharda Hospital's seeded numbers are asserted to trip the gate (proving it isn't dead code).
- **`driverTelemetry.test.ts`** (not explicitly named in the objective list, but required to test the new service at all, same as Phase 2's `dispatchOffer.core.test.ts`): mount/publish/teardown call-count assertions mirroring `missionChannel.service.test.ts`, plus the mock emitter's interpolation and clean `stop()`.

### Verification

```
$ npx turbo run typecheck --force
 Tasks:    6 successful, 6 total   (0 TypeScript errors across all 6 workspaces)

$ npx turbo run test --force
@sahayak/domain:test:  ALL DRIVER LIFECYCLE MACHINE TESTS PASSED (100% GREEN, now 13 cases incl. skip-state rejection)
@sahayak/driver:test:  ALL 6 TEST SUITES PASSED, plus otpAuth.core + dispatchOffer.core + hospitalHandoff.core + driverTelemetry + driverOnboarding.store + driverStandby.store, all 100% GREEN
@sahayak/patient:test: GOLDEN PATH INTEGRATION TEST PASSED (100% GREEN, unaffected)
@sahayak/ui:test: unaffected, still GREEN
 Tasks:    4 successful, 4 total   (zero regressions)
```

### Files created (4) / modified (9)

**Created**: `apps/driver/src/services/driverTelemetry.ts`, `apps/driver/src/services/driverTelemetry.test.ts`, `apps/driver/src/hooks/hospitalHandoff.core.ts`, `apps/driver/src/hooks/hospitalHandoff.core.test.ts`.

**Modified**: `packages/domain/src/state-machine/driverLifecycle.test.ts` (Test 12b), `apps/driver/src/hooks/useGpsPublisher.ts` (real publish call site), `apps/driver/src/i18n/driverOnSceneStrings.ts` (Sharda Hospital fixture, at-capacity badge string, `import type` fixes for node-testability), `apps/driver/src/screens/OnSceneCareScreen.tsx` (capacity gate wiring), `apps/driver/src/screens/InTransitHospitalScreen.tsx` (two-step handoff split, receipt view), `apps/driver/src/i18n/driverTransportStrings.ts` (receipt strings, relabeled sign-off button), `apps/driver/app/mission/[id].tsx` (state-derived guard, dropped stale `setState`), `apps/driver/package.json` (chained tests).

### Deviations and open items

- **`DriverNavigationScreen.tsx` received no changes** - the directive named it alongside `mission/[id].tsx`, but the audit found its one `send()`-triggering callback already fires correctly and it holds no assumptions about `currentState` to drift from. The actual bug was entirely in the route and in `InTransitHospitalScreen.tsx`.
- **`mission/[id].tsx`'s `onBackToStandby`/back-out paths still send no event before navigating away** (flagged as an open item in §14, still open here) - a driver backing out mid-mission leaves the lifecycle machine stuck in `enRouteToPatient`/`onScene`/etc. while the UI shows standby. This is now a *more* consequential gap than when §14 flagged it: with Phase 2's real actor, a driver in this state would have any subsequent `SERVER_OFFER_RECEIVED` silently rejected (the machine isn't in `standby`), blocking new dispatch waves until app restart. Explicitly out of scope for this directive (which addresses the forward completion path, not aborts) - flagged rather than silently patched with a `reset()`, which would drop the driver's shift session (`offline`) the same way a premature `reset()` would have in Phase 2.
- **Receipt's total-distance and fare are demo constants**, not derived from any live-tracked route - consistent with every other distance/GPS value in this app (all three mission-execution screens simulate speed/distance locally), not a new simplification introduced here.
- **No live Centrifugo backend to verify `driverTelemetry.ts` against end-to-end** - `EXPO_PUBLIC_GATEWAY_URL`/`EXPO_PUBLIC_CENTRIFUGO_WS_URL` remain placeholders, same as every other Centrifugo-adjacent module in this app and the patient app's own service. Structurally correct against P05's documented contract and centrifuge v5's real API surface (verified against its `.d.ts`), never executed against a real socket.
- **`isHospitalSelectable` is an ICU-bed-only proxy for "overcrowded"** - see the `ponytail:` comment in `hospitalHandoff.core.ts`. A facility could pass on ICU beds while still being unsafe on trauma-bay or ventilator availability; not modeled separately.

---

## 16. Milestone: Cross-Client Integration & Parity Verification

Directive: close the §15 `onBackToStandby` open item with an explicit abort transition, audit driver-to-patient telemetry schema parity and standardize on a shared `@sahayak/domain` contract, and add a dual-actor cross-client integration test.

### Objective 1 - Close the Driver Actor Desync (`onBackToStandby`)

**Closed P02's own "Open Questions" gap**, not just this session's open item: P02 explicitly asked "what explicit event... should be introduced" for a driver-side abort once `enRouteToPatient` or later; that event never existed. Added `AbortMissionPayload`/`ABORT_MISSION` to `driverLifecycle.types.ts` and wired it into all four active-mission states (`enRouteToPatient`, `onScene`, `transporting`, `arrivedHospital`) in `driverLifecycle.ts`, each targeting `standby` (not `offline` - aborting a mission is not ending the shift, same "don't drop the shift session" reasoning as Phase 2's decline/timeout handling).

This is additive to P02's types file, which its own acceptance criteria said should contain "the exact fields... without renaming or addition" - noted here rather than silently glossed over, since P02 itself is the source naming this exact gap as unresolved.

**`mission/[id].tsx`**: identified exactly two genuine back-out sites - `DriverNavigationScreen`'s and `InTransitHospitalScreen`'s `onBackToStandby` - both now call a shared `abortMissionAndReturnToStandby()` that sends `ABORT_MISSION` before navigating. Two sites deliberately left untouched: `InTransitHospitalScreen`'s `onFinishSignOff` (follows a real `COMPLETE_MISSION` - the machine is already in `standby`; firing `ABORT_MISSION` there would be a harmless no-op that muddies the semantics) and `OnSceneCareScreen`'s `onBack` (an in-mission phase step-back that never leaves the machine's `onScene` state - not an exit at all).

**Test**: `driverLifecycle.test.ts` Test 14 - `ABORT_MISSION` from all four active-mission states returns to `standby` without dropping `driverId` (shift session), and - the exact assertion the directive names - a subsequent `SERVER_OFFER_RECEIVED` is accepted (`offered`), not silently rejected because the actor is stuck somewhere the abort didn't actually reach.

### Objective 2 - Driver-to-Patient Telemetry Contract Parity

**Confirmed schema drift, exactly as suspected**: `apps/driver/src/services/driverTelemetry.ts` published `bearing`; `apps/patient/src/services/missionChannel.service.ts` (and `useMissionChannel.ts`, and everywhere else in the driver app - `useGpsPublisher.ts`'s own public signature, `telemetryQueue.service.ts`'s `QueuedTelemetryPing`) has only ever used `heading` for the identical value. `driverTelemetry.ts` was the sole outlier - confirmed by grepping `\bbearing\b` across the whole driver app before touching anything. Standardized on `heading` (the majority, already-relied-upon convention) rather than migrating every other consumer to `bearing`.

**New shared module**: `packages/domain/src/mission-channel/index.ts` - `MissionTelemetryPing` (`heading`, not `bearing`), `MissionLifecycleEventType`, `missionChannelName()`, and - not just the types - `isMissionTelemetryPing()`/`isMissionLifecyclePublication()`, the actual runtime guards. A shared *type* cannot stop a divergent *guard* from silently misreading a field, which is exactly the failure mode that produced the drift in the first place; moving the guards here means both apps now run the identical runtime check, not two hand-matched copies. No React Native/Expo/`centrifuge` imports added - packages/domain stays pure per P02's non-goal, unchanged from every prior phase.

**Both clients re-pointed at it**: `driverTelemetry.ts` imports `MissionTelemetryPing`/`missionChannelName` from `@sahayak/domain` instead of defining its own; `missionChannel.service.ts` imports the same types and both guards, re-exporting `DriverTelemetry`/`MissionLifecycleEventType`/`missionChannelName` under their existing names so every current importer (`useMissionChannel.ts`, `missionLifecycleBridge.ts`, `goldenPath.test.ts`) needed zero changes - confirmed by running patient's full existing test suite unchanged and green afterward.

**Genuine second gap found, not just the field-name mismatch**: `driverTelemetry.ts` had no way to publish the five "state sync events" (`DRIVER_ACCEPTED`/`DRIVER_ARRIVED`/`TRANSPORT_STARTED`/`MISSION_COMPLETED`/`MISSION_CANCELLED`) at all - only raw coordinate pings. Added `publishLifecycleEvent(event)` to `DriverTelemetryPublisher`, publishing the exact flat `{ event, missionId }` shape `missionLifecycleBridge.ts` already expects on the same channel. **Not wired into live UI transition points this pass** - see Deviations below; this closes the driver-side service's capability gap, not the full live-publish integration.

### Objective 3 - Cross-Client Dual-Actor Integration Test

**File location deviates from the directive** (`packages/domain/src/__tests__/crossClientMission.test.ts`): this repo has no `__tests__/` directory anywhere (confirmed again, same finding as Phase 2's machine-test filename call) and co-located `*.test.ts` is the established convention. More importantly, the directive's suggested location would create a **backwards dependency** - the test needs `apps/patient/src/services/missionLifecycleBridge.ts` (an app-local service), and `packages/domain` importing from an app it doesn't otherwise depend on would invert the dependency graph every other package in this repo respects. Placed at `apps/patient/src/integration/crossClientMission.test.ts`, next to `goldenPath.test.ts`, which already imports both `@sahayak/domain` (forward, ordinary) and this exact bridge function. `apps/driver`'s `driverTelemetry.ts` is deliberately **not** imported here either, for the identical reason in the other direction - telemetry parity is verified by constructing a ping in `driverTelemetry.ts`'s exact shape and running it through the shared `isMissionTelemetryPing` guard both real services now import.

**Mounts both real actors** (`patientLifecycleMachine`, `driverLifecycleMachine`) and drives the full bilateral lifecycle through `translateLifecycleEvent` - the same unmodified bridge function `goldenPath.test.ts` already exercises - rather than a re-implementation that could silently drift from what the real route actually calls.

**Two claims in the directive's step 6 needed checking before being asserted, not assuming they'd just work:**
- **"Matching the driver's fare calculation"**: the wire's `MISSION_COMPLETED` event carries only `{ missionId }` - no fare field crosses the channel in the current contract, so patient's displayed fare (locked at `REQUEST` time) and the driver's completion receipt are structurally independent values today, not something the wire protocol confirms. What the test actually asserts, correctly scoped: given the *same canonical inputs* (`vehicleType`, `jurisdiction`, `DEFAULT_DISPATCH_DISTANCE_KM`) that a real backend would need to hand both clients, `computeItemizedStatutoryFare` produces the *identical* fare either side - proving the shared pricing engine is deterministic, which is the necessary (not sufficient, absent a backend) condition for true cross-client parity.
- **"Both stores reset cleanly to baseline (`idle` and `standby`)"**: `patientLifecycleMachine`'s terminal states (`receiptConfirmed`, `cancelled`) have no outgoing transitions by design (see the machine's own doc comment) - reaching `idle` again is `usePatientLifecycleStore.reset()`'s job (stop the actor, mount a fresh one), an app-layer action, not something achievable by sending the terminal actor more events. The test asserts what's actually true: the patient actor reaches `receiptConfirmed`, and a **freshly-mounted** actor (the real `reset()` mechanism) starts at `idle`. The driver actor's baseline (`standby`) *is* reachable via its own `COMPLETE_MISSION` transition directly - no store-level reset needed there, asserted as such.

### Objective 4 - Verification

```
$ npx turbo run typecheck --force
 Tasks:    6 successful, 6 total   (0 TypeScript errors across all 6 workspaces)

$ npx turbo run test --force
@sahayak/domain:test:  ALL DRIVER LIFECYCLE MACHINE TESTS PASSED (100% GREEN, now 14 cases incl. ABORT_MISSION)
@sahayak/driver:test:  ALL 6 TEST SUITES PASSED, plus otpAuth.core + dispatchOffer.core + hospitalHandoff.core + driverTelemetry (now incl. publishLifecycleEvent + heading parity), driverOnboarding.store + driverStandby.store, all 100% GREEN
@sahayak/patient:test: GOLDEN PATH INTEGRATION TEST PASSED + CROSS-CLIENT MISSION INTEGRATION TEST PASSED (100% GREEN)
@sahayak/ui:test: unaffected, still GREEN
 Tasks:    4 successful, 4 total   (zero regressions)
```

### Files created (2) / modified (10)

**Created**: `packages/domain/src/mission-channel/index.ts`, `apps/patient/src/integration/crossClientMission.test.ts`.

**Modified**: `packages/domain/src/index.ts` (export the new module), `packages/domain/src/state-machine/driverLifecycle.types.ts` (`ABORT_MISSION`), `packages/domain/src/state-machine/driverLifecycle.ts` (4 new transitions), `packages/domain/src/state-machine/driverLifecycle.test.ts` (Test 14), `apps/driver/src/services/driverTelemetry.ts` (shared schema, `heading` rename, `publishLifecycleEvent`), `apps/driver/src/services/driverTelemetry.test.ts` (updated + new coverage), `apps/driver/src/hooks/useGpsPublisher.ts` (drop the `bearing: heading ?? 0` translation), `apps/patient/src/services/missionChannel.service.ts` (source from `@sahayak/domain`), `apps/driver/app/mission/[id].tsx` (`ABORT_MISSION` wiring), `apps/patient/package.json` (chained test).

### Deviations and open items

- **`packages/domain/src/__tests__/crossClientMission.test.ts` (directive's path) vs `apps/patient/src/integration/crossClientMission.test.ts` (actual)** - see Objective 3 above; a backwards-dependency problem, not a style preference.
- **`apps/patient/app/booking/missionLifecycleBridge.ts` (directive's path) vs `apps/patient/src/services/missionLifecycleBridge.ts` (actual)** - the directive named the wrong path; confirmed via `find` before reading anything, same class of pre-existing path/name mismatch as `app.json`→`app.config.ts` (§11) and `OFFER_EXPIRED`→`SERVER_OFFER_TIMEOUT` (Phase 2).
- **`publishLifecycleEvent` is not wired into any live UI transition point** - `mission/[id].tsx`'s `send()` call sites do not also call a mounted `driverTelemetry.ts` publisher. Wiring this fully would require moving the Centrifugo connection from per-screen (`useGpsPublisher`, called inside `DriverNavigationScreen`/`InTransitHospitalScreen` individually) up to the route level so one publisher instance is available at every `send()` site - a real restructuring beyond what "audit and standardize the schema" asked for. The capability exists and is tested; the live wiring is a disclosed follow-up.
- **No wire-level fare confirmation exists between driver and patient** - a genuine architectural finding from Objective 3, not a defect introduced this pass: `MISSION_COMPLETED` carries only `{ missionId }`. True cross-client fare parity in the running apps (not just the test's shared-engine proof) requires a backend to hand both clients the same canonical distance/fare - out of scope without one.
- **No live Centrifugo backend to verify any of this end-to-end** - same standing limitation as every prior phase; `driverTelemetry.ts`'s `publishLifecycleEvent` and the `heading` rename are structurally correct against the documented contract and centrifuge v5's real API surface, never executed against a real socket.

---

## 17. Driver App Milestone: Wire Event Publishing Closure

Directive: wire the previously-built-but-unused `publishLifecycleEvent` into the driver's actual UI transitions, so driver state changes broadcast over Centrifugo instead of staying purely local.

### Objective 1 - Wire Driver UI Actions to Centrifugo Wire Events

**Centralized in `driverLifecycle.store.ts`'s `send()`, not scattered across screens/routes.** Every domain event this phase needs to publish for (`ACCEPT_DISPATCH`, `CONFIRM_ARRIVAL_SCENE`, `CONFIRM_PATIENT_ONBOARD`, `COMPLETE_MISSION`, `ABORT_MISSION`) already flows through this one store's `send()` - from `(shift)/offer.tsx` and `mission/[id].tsx` alike. Hooking the wire publish there means every existing call site gets it automatically, with zero changes to either route file, and no future call site can forget to wire a new one in.

**New pure module**: `apps/driver/src/state/driverLifecycleWire.core.ts` - `wireLifecycleEventFor(eventType, beforeState, afterState)` maps a domain event to its wire event, returning `null` for both "no wire counterpart" (`GO_ONLINE`, `DECLINE_DISPATCH`, `CONFIRM_ARRIVAL_HOSPITAL`, `SERVER_OFFER_RECEIVED`/`TIMEOUT` - none have a corresponding `MissionLifecycleEventType`) and "the transition was rejected" (`beforeState === afterState`) - this second case is exactly the directive's "guard against duplicate network calls... tied to the successful execution of the state transition": an illegal event (e.g. `COMPLETE_MISSION` sent from `transporting`, the Phase 3 bug) or a duplicate dispatch of an already-applied action structurally cannot publish, because nothing actually changed.

**The directive's own action names don't match the wire vocabulary** - same class of mismatch as `OFFER_EXPIRED` -> `SERVER_OFFER_TIMEOUT` in an earlier phase. Mapped to what's real:

| Directive's action (UI gesture) | Directive's named target | Domain event | Actual wire event published |
|---|---|---|---|
| Swipe to Accept | `DRIVER_ACCEPTED` | `ACCEPT_DISPATCH` | `DRIVER_ACCEPTED` (matches) |
| Slide to confirm arrival | `SERVER_DRIVER_ARRIVED` | `CONFIRM_ARRIVAL_SCENE` | `DRIVER_ARRIVED` |
| Slide to start transport | `TRANSPORT_STARTED` | `CONFIRM_PATIENT_ONBOARD` | `TRANSPORT_STARTED` (matches) |
| ER handoff confirmed | `MISSION_COMPLETED` | `COMPLETE_MISSION` | `MISSION_COMPLETED` (matches) |
| Back-out / cancel | `MISSION_CANCELLED` | `ABORT_MISSION` | `MISSION_CANCELLED` (matches) |

`SERVER_DRIVER_ARRIVED` isn't a member of `MissionLifecycleEventType` at all - it's the *patient machine's* event name, produced by `translateLifecycleEvent` FROM the real wire value `DRIVER_ARRIVED`. Publishing the directive's literal string wouldn't typecheck against the shared domain schema.

**A real ordering bug found and fixed before it shipped**: the obvious design - tear down the mission's publisher reactively whenever `activeMissionId` becomes `null` - races the final publish for `COMPLETE_MISSION`/`ABORT_MISSION`, both of which clear `activeMissionId` as part of the *same* transition that needs to publish `MISSION_COMPLETED`/`MISSION_CANCELLED`. A subscription-driven teardown would disconnect the publisher before the terminal event ever went out. Fixed by publishing against `before.context.activeMissionId` (the mission this transition pertains to, still connected) and only reconciling the publisher's mounted mission *after* that publish, against `after.context.activeMissionId`.

### Objective 2 - Error Handling & Offline Queuing Contract

**The low-connectivity indicator now genuinely reflects lifecycle-publish failures, not just telemetry ones.** `driverTelemetry.ts`'s publish calls previously swallowed their promise rejection entirely (`.catch(() => {})`) - a caller had no way to know a publish failed. Added an `onPublishError` callback to `mountDriverTelemetryPublisher`'s options, invoked on any rejected `publish()`/`publishLifecycleEvent()`. `driverLifecycle.store.ts` wires it to `useDriverConnectionStore.getState().setConnectionStatus("fallback")` + `setFallbackActive(true)` - the exact same mechanism `useGpsPublisher.ts` already uses for a failed telemetry publish, surfacing through the same pre-existing `OfflineConnectivityOverlay` (already rendered globally in `app/_layout.tsx`). No new UI was built; the existing indicator just now has a second real trigger.

**Never fatally blocks the UI transition**: the state transition (`actor.send(event)`) always completes before any publish is attempted - `publishForTransition` runs entirely after the machine has already moved, and its own failure path is a caught rejection + a store update, never a thrown error the caller has to handle.

**"Safe no-op / warning fallback if called without an active missionId or valid channel token"**: `publishForTransition` checks `publisher`/`missionId`/`driverId` are all present before ever touching the publisher, logging `console.warn` and returning `null` otherwise - covered explicitly by Test 6 in the new wire-event test.

### Objective 3 - End-to-End Wire Broadcast Test

**Payload decision: extended the shared contract, not just the driver's local payload.** The directive wants the test to verify `missionId`, `timestamp`, and `driverId` on each published event - but the shared `MissionLifecyclePublication` type (`packages/domain/src/mission-channel/index.ts`, standardized last phase specifically to stop schema drift) only declared `{ event, missionId }`. Silently widening `driverTelemetry.ts`'s payload without updating the shared type would have reopened exactly the class of drift the Cross-Client sweep was called to close. Instead, extended `MissionLifecyclePublication` itself to `{ event, missionId, driverId, timestamp }` - the richer payload *is* the contract now, both sides still agree on it, and `isMissionLifecyclePublication` deliberately still only requires `.event` (a producer that hasn't caught up to the two new fields yet is still accepted, not rejected).

**Two test files, testing two different things without drift risk between them:**
- `driverLifecycleWire.core.test.ts` (new) - the pure mapping (Tests 1-3), then drives a REAL `driverLifecycleMachine` actor through all 5 UI actions with an injected fake publisher (Test 4), asserting the exact wire event and `driverId` for each, in order, with no extras - this is the actual end-to-end proof that invoking each action dispatches the right event, not a test of the mapping table in isolation. A second mission's abort (Test 5) and the no-op/warning fallback paths (Test 6) round it out.
- `driverTelemetry.test.ts` (updated) - verifies the actual published payload shape (`event`, `missionId`, `driverId`, and a valid ISO `timestamp`, checked field-by-field since `timestamp` is generated fresh on every call and can't sit inside a `deepStrictEqual`), plus a new case (Test 4b) proving a failed publish reaches `onPublishError` rather than throwing.

Because `driverLifecycle.store.ts` calls the exact same `publishForTransition`/`wireLifecycleEventFor` functions the test exercises - not a re-implementation - there is no drift surface between "what's tested" and "what's wired," the same reasoning `goldenPath.test.ts` already established for `translateLifecycleEvent`.

### Verification

```
$ npx turbo run typecheck --force
 Tasks:    6 successful, 6 total   (0 TypeScript errors across all 6 workspaces)

$ npx turbo run test --force
@sahayak/driver:test:  ALL DRIVER LIFECYCLE WIRE EVENT TESTS PASSED (100% GREEN, new)
@sahayak/driver:test:  ALL DRIVER TELEMETRY SERVICE TESTS PASSED (100% GREEN, incl. onPublishError + richer payload)
@sahayak/driver:test:  ALL 6 TEST SUITES PASSED, plus otpAuth.core + dispatchOffer.core + hospitalHandoff.core + driverOnboarding.store + driverStandby.store, all 100% GREEN
@sahayak/domain:test:  ALL DRIVER LIFECYCLE MACHINE TESTS PASSED (100% GREEN, unaffected)
@sahayak/patient:test: GOLDEN PATH + CROSS-CLIENT MISSION INTEGRATION TESTS PASSED (100% GREEN, unaffected)
@sahayak/ui:test: unaffected, still GREEN
 Tasks:    4 successful, 4 total   (zero regressions)
```

### Files created (2) / modified (4)

**Created**: `apps/driver/src/state/driverLifecycleWire.core.ts`, `apps/driver/src/state/driverLifecycleWire.core.test.ts`.

**Modified**: `packages/domain/src/mission-channel/index.ts` (`MissionLifecyclePublication` gains `driverId`/`timestamp`), `apps/driver/src/services/driverTelemetry.ts` (`publishLifecycleEvent(event, driverId)`, `onPublishError` option), `apps/driver/src/services/driverTelemetry.test.ts` (updated + new `onPublishError` coverage), `apps/driver/src/state/driverLifecycle.store.ts` (the actual wiring), `apps/driver/package.json` (chained test).

### Deviations and open items

- **`SERVER_DRIVER_ARRIVED` (directive) vs `DRIVER_ARRIVED` (actual wire event)** - see the mapping table above; the directive's name isn't a valid `MissionLifecycleEventType` at all.
- **Lifecycle-event publish failures are not retried or queued** - only surfaced (via `onPublishError` -> the low-connectivity indicator). There is no store-and-forward path for lifecycle events the way `telemetryQueue.service.ts` provides for GPS pings; a dropped `MISSION_COMPLETED` during a genuine outage is lost, not replayed on reconnect. Flagged as a real gap in the prior phase's HANDOVER and still open - closing it properly needs the same store-and-forward treatment telemetry already has, which is a larger addition than "wire the existing function in."
- **`DEMO_AUTH_TOKEN` is a hardcoded placeholder** (`"demo_auth_token"`, matching the literal string `DriverNavigationScreen.tsx` already passes to `useGpsPublisher`) - no real authenticated-session token store exists for the driver app (Phase 1 deliberately didn't build one; nothing needed it until now). The publisher will need a real token source once Kong/Supabase auth is live for the driver app.
- **No live Centrifugo backend to verify any of this end-to-end** - same standing limitation as every prior phase. The wiring, ordering, and error-surfacing are structurally correct and fully unit-tested; none of it has run against a real socket.

---

## 18. Milestone: Pre-Flight Android Configuration, Environment Setup & Dual-App Harness

Directive: Pre-Flight Android Build Audit, Git & Environment Setup, and Dual-App Dev Harness - close HANDOVER §17's own "not retried or queued" gap, harden `.gitignore`, add env templates/validation, verify Android manifest generation, and give both apps concurrent dev scripts.

### Objective 3 - Resilient Lifecycle Retry (closes §17's own flagged gap)

**Not a new queue class - retry built into `driverTelemetry.ts`'s existing `publishLifecycleEvent`.** `TelemetryQueueService` (GPS pings) has a different shape (`syncStatus`/`retryCount` on stored records, manual `flushQueue`) that doesn't fit a single fire-and-forget wire event; retrofitting it would have been a bigger, riskier change than the gap itself. Each lifecycle publish now retries with backoff (`lifecycleRetryDelaysMs`, default `[3000, 7000]` - 3 attempts spanning ~10s) before calling the existing `onPublishError` (already wired in `driverLifecycle.store.ts` to `setFallbackActive(true)`, already rendered by `OfflineConnectivityOverlay` in `app/_layout.tsx`) - no new UI, no new store.

**A real ordering bug caught before it shipped** (not in the original directive, found while implementing): `ensurePublisherFor(null)` tears the publisher down synchronously in the same tick that `COMPLETE_MISSION`/`ABORT_MISSION` queue their own terminal wire event. An earlier draft's `if (torn) return` inside the retry's `.catch` would have silently swallowed exactly the two events retry exists to protect (`MISSION_COMPLETED`, `MISSION_CANCELLED`). Fixed with two changes together:
- All lifecycle publishes for a mission run on one FIFO promise chain (`lifecycleChain`), not independent per-event timers - a retrying `DRIVER_ARRIVED` can never be overtaken by a later `TRANSPORT_STARTED` that publishes and succeeds first, which would otherwise let the patient machine observe events out of order.
- `teardown()` flips `torn` (blocking only *new* `publishLifecycleEvent()` calls) but defers `client.disconnect()` until the chain drains if a retry is still pending - confirmed by Test 4e, which calls `teardown()` synchronously right after a failing publish (the exact same-tick pattern `ensurePublisherFor` uses) and asserts `disconnect()` doesn't fire until the retry completes.
- `onPublishError` still fires on exhaustion even if `teardown()` already ran, so a drained-but-failed terminal event still surfaces the low-connectivity indicator.

**Test coverage added** (`driverTelemetry.test.ts`, Tests 4b-4e, fast injected delays `[5, 5]`): a single transient failure recovers silently (no `onPublishError`); exhausting all 3 attempts calls `onPublishError` exactly once, not once per attempt; two same-mission events publish in strict order even when the first is mid-retry; a pending retry survives `teardown()` and still publishes before disconnect.

### Objective 1 - Git Repository Sanitation & Ignore Safeguards

Hardened root `.gitignore`: `.env*` blocked wholesale with `!.env.example` as the one exception (replaces the old bare `.env` line, which missed `.env.local`/`.env.*.local`); `*.jks`/`*.keystore`/`*.p8`/`*.p12`/`*.mobileprovision`; `android/`/`ios/`/`.expo/` (managed workflow - native projects are generated, never hand-edited); `build/`/`coverage/` added alongside the existing `dist/`/`.turbo/`.

**Found and closed a real leak the directive's named patterns wouldn't have caught**: `supabase/.temp/start-secrets/supabase_edge_runtime_Ek-Ambulance/env/docker.env` was untracked and un-ignored - none of `.env*`, `*.jks`, etc. match a path under `supabase/.temp/`. Added `supabase/.temp/` explicitly.

Verified with `git check-ignore -q` (exit code, not just presence in `-v` output, since a negated rule also appears in `-v`): `.env.example` in both apps is NOT ignored (exit 1), `.env` IS ignored (exit 0). `git add -n .` staged nothing under `.env`, `android/`, `.jks`, or `node_modules`. **Nothing was committed** - repo has zero commits and the directive says not to push Supabase; a dry-run stage list is reported here, not an actual commit.

### Objective 2 - Remote Supabase & Environment Configuration

`.env.example` added to both apps with `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_GATEWAY_URL`, `EXPO_PUBLIC_CENTRIFUGO_WS_URL` - placeholder values only, nothing pulled from the live Supabase project.

**`EXPO_PUBLIC_SUPABASE_URL` is validated but not read by `supabaseClient.ts`.** Both apps' `src/lib/supabaseClient.ts` deliberately route through `EXPO_PUBLIC_GATEWAY_URL` (Kong), not the raw Supabase project URL - an explicit non-goal from a prior phase (P03: "never call the Supabase project URL directly"). Rewiring the client to use `SUPABASE_URL` would have reopened that non-goal without being asked. Added to the template/validator anyway since the directive names it explicitly - provisioned ahead of whatever eventually needs the raw project URL.

**`src/config/env.ts` added to each app** (duplicated, not shared - same call this codebase already made for `AppIcon.tsx`: `packages/ui` is imported by a bare-`node` test suite, and this module needs to stay importable there too). Exports `ENV` (literal `process.env.EXPO_PUBLIC_X` reads - Expo's Babel plugin only inlines statically-analyzable accesses, never `process.env[name]`), `missingEnvKeys()` (pure, node-safe, no `__DEV__` reference at module scope), and `assertEnvOrWarn()` (dev-only loud `console.error`, called at the top of each app's `RootLayout` module in `app/_layout.tsx`). Chose console diagnostic over a new full-screen component - the directive explicitly allows either ("an informative diagnostic screen or console error"), and a new screen for a preflight/infra pass is more than this pass needs. Never throws in production; each module's existing `|| "https://api...` fallback still degrades gracefully there.

Self-check tests added (`env.test.ts` in both apps, 3 cases each: all-missing, all-present, partially-configured) and wired into each `test` script chain.

### Objective 4 - Android Configuration & Prebuild Dry Run

**Package identifiers were already correct** (`in.sahayak.patient`, `in.sahayak.driver`) - nothing to change there. Added the missing permissions: patient gained `ACCESS_NETWORK_STATE`, `VIBRATE` (already had FINE/COARSE location + INTERNET); driver gained `INTERNET`, `ACCESS_NETWORK_STATE`, `VIBRATE` (already had FINE/COARSE/BACKGROUND location + foreground-service permissions).

**Neither app had an `assets/` directory**, yet both `app.config.ts` files reference `icon.png`, `splash-icon.png`, `adaptive-icon.png` - `expo prebuild` cannot copy files that don't exist. Generated minimal placeholder PNGs (solid-color squares matching each app's existing splash `backgroundColor` - Red-600 `#DC2626` for patient, Blue-900 `#1E3A8A` for driver) via Pillow rather than stripping the config to force a pass. Real branding assets still need to replace these before a store build.

`npx expo prebuild --clean --no-install --platform android` ran clean for both apps (`✔ Finished prebuild`, only an unrelated `expo-system-ui` advisory). Verified by grep, not just exit code:

```
apps/patient/android/app/src/main/AndroidManifest.xml: ACCESS_COARSE_LOCATION, ACCESS_FINE_LOCATION,
  ACCESS_NETWORK_STATE, INTERNET, VIBRATE (+ Expo defaults: READ/WRITE_EXTERNAL_STORAGE, SYSTEM_ALERT_WINDOW)
apps/patient/android/app/build.gradle: namespace/applicationId 'in.sahayak.patient'

apps/driver/android/app/build.gradle: namespace/applicationId 'in.sahayak.driver'
apps/driver/android/app/src/main/AndroidManifest.xml: ACCESS_BACKGROUND_LOCATION, ACCESS_COARSE_LOCATION,
  ACCESS_FINE_LOCATION, ACCESS_NETWORK_STATE, FOREGROUND_SERVICE, FOREGROUND_SERVICE_LOCATION, INTERNET,
  VIBRATE (+ Expo defaults)
```

All 5 directive-named permissions present in both, plus Expo's own baseline defaults (not stripped - no reason to). Generated `android/`/`ios/` directories then **deleted** after verification (managed workflow - see Objective 1's `.gitignore` rule). `expo prebuild` also rewrote each app's `package.json` `android`/`ios` scripts from `expo start --android/--ios` to `expo run:android/run:ios` (its bare-workflow convention) - reverted back to `expo start --android/--ios` afterward, since this project stays managed.

### Objective 5 - Dual-App Development Harness

Root `package.json`: `dev:patient` (`pnpm --filter @sahayak/patient dev`), `dev:driver` (`pnpm --filter @sahayak/driver dev`), `dev:all` (`turbo run dev --filter=@sahayak/patient --filter=@sahayak/driver`), `preflight` (`turbo run typecheck lint test --force`). Each app got its own `"dev": "expo start --port 808x"` script (8081 patient, 8082 driver) so `pnpm dev:patient`/`dev:driver` and `dev:all` agree on ports without colliding. `turbo.json` gained a `dev` task (`cache: false, persistent: true` - a long-running dev server must never be cached or waited on to exit).

**`preflight`'s lint leg is currently a real no-op, reported rather than hidden.** Zero of the 6 workspaces declare a `lint` script, so `turbo run lint` matches zero tasks and exits 0 - the exact same false-green pattern HANDOVER §5 already flagged twice for typecheck and test before this repo had real configs. `packages/config/eslint-preset.js` exists but its own peer dependencies (`@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `eslint-config-prettier`) are not installed anywhere in the tree - only bare `eslint` is a root devDependency. Wiring a working lint pass needs adding those 3 packages (network install + lockfile change) and then triaging whatever it finds across ~19k lines of screen code - both out of scope for a Pre-Flight harness pass and not requested. Left as an explicit, named gap rather than a script that would crash on first run or a silent pass that checks nothing.

### Verification

```
$ pnpm preflight
 Tasks:    10 successful, 10 total   (6 typecheck + 0 lint [no-op, see above] + 4 test)
  Time:    ~8s

Includes 2 new test suites not in the previous milestone's count:
  @sahayak/patient:test: ALL PATIENT ENV CONFIG TESTS PASSED (100% GREEN, new)
  @sahayak/driver:test:  ALL DRIVER ENV CONFIG TESTS PASSED (100% GREEN, new)
  @sahayak/driver:test:  ALL DRIVER TELEMETRY SERVICE TESTS PASSED (100% GREEN, incl. new retry/ordering/drain coverage)
  (all pre-existing suites unaffected, zero regressions)

$ npx expo prebuild --clean --no-install --platform android   (both apps)
 ✔ Finished prebuild - AndroidManifest.xml/build.gradle verified by grep, generated dirs then deleted

$ git check-ignore -q apps/patient/.env.example ; echo $?   -> 1 (not ignored, correct)
$ git check-ignore -q apps/patient/.env ; echo $?           -> 0 (ignored, correct)
$ git add -n .   -> no .env, android/, ios/, .jks/.keystore, or node_modules paths staged
```

**Supabase was not touched** - no migration, no deploy, no push, per the directive's explicit "I will do it manually."

### Files created (13) / modified (13)

**Created**: `apps/patient/src/config/env.ts`, `apps/patient/src/config/env.test.ts`, `apps/patient/.env.example`, `apps/driver/src/config/env.ts`, `apps/driver/src/config/env.test.ts`, `apps/driver/.env.example`, `apps/patient/assets/{icon,splash-icon,adaptive-icon}.png`, `apps/driver/assets/{icon,splash-icon,adaptive-icon}.png` (placeholders, see Objective 4).

**Modified**: `.gitignore`, `apps/driver/src/services/driverTelemetry.ts` (lifecycle retry queue), `apps/driver/src/services/driverTelemetry.test.ts` (Tests 4b-4e), `apps/patient/app.config.ts`, `apps/driver/app.config.ts` (permissions), `apps/patient/app/_layout.tsx`, `apps/driver/app/_layout.tsx` (`assertEnvOrWarn()`), `apps/patient/package.json`, `apps/driver/package.json` (`dev` script, `test` chain), `package.json` (root, harness scripts), `turbo.json` (`dev` task).

### Deviations and open items

- **Lint is a real no-op in `preflight`** - see Objective 5. Needs 3 new devDependencies and a triage pass to become real; not done here.
- **`EXPO_PUBLIC_SUPABASE_URL` is templated/validated but not wired into either `supabaseClient.ts`** - see Objective 2; that client deliberately still routes through the Kong gateway URL.
- **Placeholder icon/splash assets** (solid-color squares) were generated so `expo prebuild` could actually run - not final branding, need replacing before any store submission.
- **No physical device or emulator run** - verification here is `expo prebuild`'s manifest/Gradle generation plus static grep, same standing limitation as every prior phase's Android work (see §5's D6).
- **Retry delays are a fixed schedule (`[3000, 7000]`), not truly exponential** - matches the directive's own literal example ("3 attempts over 10 seconds") rather than a generic 2^n backoff; documented as `DEFAULT_LIFECYCLE_RETRY_DELAYS_MS` with a name that says what it is.

