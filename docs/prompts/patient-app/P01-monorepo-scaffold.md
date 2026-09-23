# P01: Scaffold Patient App Monorepo Tree, Workspace Dependencies, and Lint Boundaries

## Scope
Scaffold the complete directory tree for `apps/patient/` within the Turborepo monorepo, configure workspace dependencies, and establish boundary-enforcing ESLint rules. Wire TypeScript configuration to extend root configs without redeclaring compiler strictness flags. Zero UI screens, business logic, or runtime handlers are implemented in this task.

## Non-Goals
Do not implement screens, authentication flows, state machines, API fetching logic, or Centrifugo subscriptions. Do not touch or modify code in `apps/driver/`, `apps/dispatch-service/`, or any sibling application workspaces.

## Preconditions / Dependencies
None. This is the foundational bootstrap task for the patient mobile application.

## Reference Contracts
Verbatim excerpt from architecture specification (§1):

```json
{
  "name": "@sahayak/patient",
  "dependencies": {
    "@sahayak/domain": "workspace:*",
    "@sahayak/data": "workspace:*",
    "@sahayak/ui": "workspace:*",
    "@sahayak/observability": "workspace:*"
  }
}
```

```js
rules: {
  "no-restricted-imports": ["error", {
    patterns: [
      { group: ["**/apps/driver/**", "**/apps/dispatch-service/**"], message: "apps/patient must not import from sibling apps." },
      { group: ["react-native", "expo*"], message: "packages/domain must stay pure TS." }
    ]
  }]
}
```

"The last pattern applies specifically when linting `packages/domain/**` - confirm the override scoping is correct (per-package `.eslintrc` override, not a global ban that would also break `apps/patient` itself)."

## Files to Create/Modify
- `apps/patient/package.json`
- `apps/patient/tsconfig.json`
- `apps/patient/app.config.ts`
- `apps/patient/eas.json`
- `packages/config/eslint-preset.js`

## Acceptance Criteria
- `apps/patient/package.json` declares name `"@sahayak/patient"` and includes `"@sahayak/domain": "workspace:*"`, `"@sahayak/data": "workspace:*"`, `"@sahayak/ui": "workspace:*"`, and `"@sahayak/observability": "workspace:*"`.
- `apps/patient/tsconfig.json` extends `packages/config/tsconfig.base.json` (`"extends": "../../packages/config/tsconfig.base.json"`) and contains zero redeclarations of strict compiler flags (`strict`, `noImplicitAny`, `strictNullChecks`).
- `packages/config/eslint-preset.js` enforces that imports from `**/apps/driver/**` and `**/apps/dispatch-service/**` inside `apps/patient/**` trigger an ESLint error with message `"apps/patient must not import from sibling apps."`.
- `packages/config/eslint-preset.js` scopes the restriction on `react-native` and `expo*` strictly to `packages/domain/**` via an overrides block so that `apps/patient/**` can freely import React Native and Expo.
- Running `pnpm --filter @sahayak/patient typecheck` succeeds with 0 errors.

## Out of Scope
- Implementation of React Native presentational components or UI screens in `apps/patient/src/screens/`.
- Implementation of route components in `apps/patient/app/`.
- Domain modeling and XState state machines in `packages/domain`.

## Open Questions
- What default EAS project ID and update channel should be populated in `apps/patient/eas.json` for staging builds? (Currently populated with placeholder project id `ek-ambulance-patient`).
