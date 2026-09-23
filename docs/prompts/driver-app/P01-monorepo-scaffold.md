# P01: Scaffold Driver App Monorepo Tree, Workspace Dependencies, and Lint Boundaries

## Scope
Scaffold the complete directory tree for `apps/driver/` within the Turborepo monorepo, configure workspace dependencies, and establish symmetrical boundary-enforcing ESLint rules. Wire TypeScript configuration to extend root configs without redeclaring compiler strictness flags. Zero UI screens, business logic, or runtime handlers are implemented in this task.

## Non-Goals
Do not implement screens, authentication flows, state machines, API fetching logic, or Centrifugo subscriptions. Do not touch or modify code in `apps/patient/`, `apps/dispatch-service/`, or any sibling application workspaces.

## Preconditions / Dependencies
None. This is the foundational bootstrap task for the driver mobile application.

## Reference Contracts
Verbatim excerpt from architecture specification (§1):

```json
{
  "name": "@sahayak/driver",
  "dependencies": {
    "@sahayak/domain": "workspace:*",
    "@sahayak/data": "workspace:*",
    "@sahayak/ui": "workspace:*",
    "@sahayak/observability": "workspace:*"
  }
}
```

"`apps/driver` MAY import from `@sahayak/domain`, `@sahayak/data`, `@sahayak/ui`, `@sahayak/observability`. It MUST NOT import from `apps/patient` or `apps/dispatch-service`. Verify the existing ESLint `no-restricted-imports` override in `packages/config/eslint-preset.js` (added when `apps/patient` was scaffolded) already covers `apps/driver` symmetrically - extend the `group` array if it does not."

## Files to Create/Modify
- `apps/driver/package.json`
- `apps/driver/tsconfig.json`
- `apps/driver/app.config.ts`
- `apps/driver/eas.json`
- `packages/config/eslint-preset.js`

## Acceptance Criteria
- `apps/driver/package.json` declares name `"@sahayak/driver"` and includes `"@sahayak/domain": "workspace:*"`, `"@sahayak/data": "workspace:*"`, `"@sahayak/ui": "workspace:*"`, and `"@sahayak/observability": "workspace:*"`.
- `apps/driver/tsconfig.json` extends `packages/config/tsconfig.base.json` (`"extends": "../../packages/config/tsconfig.base.json"`) and contains zero redeclarations of strict compiler flags (`strict`, `noImplicitAny`, `strictNullChecks`).
- `packages/config/eslint-preset.js` enforces that imports from `**/apps/patient/**` and `**/apps/dispatch-service/**` inside `apps/driver/**` trigger an ESLint error with message `"apps/driver must not import from sibling apps."`.
- Symmetrical lint check confirms `apps/patient/**` cannot import from `apps/driver/**` and `apps/driver/**` cannot import from `apps/patient/**`.
- Running `pnpm --filter @sahayak/driver typecheck` succeeds with 0 errors.

## Out of Scope
- Implementation of React Native presentational components or UI screens in `apps/driver/src/screens/`.
- Implementation of route components in `apps/driver/app/`.
- Domain modeling and XState state machines in `packages/domain`.

## Open Questions
- What default EAS project ID and update channel should be populated in `apps/driver/eas.json` for staging builds? (Currently populated with placeholder project id `ek-ambulance-driver`).
