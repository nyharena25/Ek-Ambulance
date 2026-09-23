module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ],
  rules: {
    // Sibling boundaries enforced via scoped overrides below
  },
  overrides: [
    {
      // Patient app boundaries
      files: ["apps/patient/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["**/apps/driver/**", "**/apps/dispatch-service/**"],
                message: "apps/patient must not import from sibling apps."
              }
            ]
          }
        ]
      }
    },
    {
      // Driver app boundaries
      files: ["apps/driver/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["**/apps/patient/**", "**/apps/dispatch-service/**"],
                message: "apps/driver must not import from sibling apps."
              }
            ]
          }
        ]
      }
    },
    {
      // packages/domain must stay pure TypeScript with zero React Native / Expo imports
      files: ["packages/domain/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["react-native", "expo*", "expo"],
                message: "packages/domain must stay pure TS."
              },
              {
                group: ["**/apps/driver/**", "**/apps/dispatch-service/**", "**/apps/patient/**"],
                message: "packages/domain cannot import from application workspaces."
              }
            ]
          }
        ]
      }
    }
  ]
};
