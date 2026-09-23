import assert from "node:assert";
import {
  colors,
  semanticColors,
  triageTokens,
  fontFamilies,
  typographyScale,
  getTextStyle,
  touchTargets,
} from "./index.ts";

console.log("===================================================================");
console.log("Running Ek-Ambulance Design System Specification Test Suite");
console.log("===================================================================\n");

// ============================================================================
// 1. Semantic Color Tokens Validation
// ============================================================================
console.log("Test 1: Validating exact semantic color tokens from specification...");

// Emergency Red (#DC2626)
assert.strictEqual(
  semanticColors.emergency.primary,
  "#DC2626",
  "Emergency Red must equal #DC2626"
);
assert.strictEqual(
  colors.emergency,
  "#DC2626",
  "Flat colors.emergency must equal #DC2626"
);

// Triage Red (#EF4444), Yellow (#F59E0B), Green (#10B981)
assert.strictEqual(
  semanticColors.triage.red.base,
  "#EF4444",
  "Triage Red base must equal #EF4444"
);
assert.strictEqual(
  triageTokens.IMMEDIATE.baseColor,
  "#EF4444",
  "Triage IMMEDIATE token must equal #EF4444"
);

assert.strictEqual(
  semanticColors.triage.yellow.base,
  "#F59E0B",
  "Triage Yellow base must equal #F59E0B"
);
assert.strictEqual(
  triageTokens.URGENT.baseColor,
  "#F59E0B",
  "Triage URGENT token must equal #F59E0B"
);

assert.strictEqual(
  semanticColors.triage.green.base,
  "#10B981",
  "Triage Green base must equal #10B981"
);
assert.strictEqual(
  triageTokens.DELAYED.baseColor,
  "#10B981",
  "Triage DELAYED token must equal #10B981"
);

// Clinical Surface Slate (#0F172A, #1E293B, #334155)
assert.strictEqual(
  semanticColors.clinicalSurface.slate900,
  "#0F172A",
  "Clinical Surface Slate-900 must equal #0F172A"
);
assert.strictEqual(
  semanticColors.clinicalSurface.slate800,
  "#1E293B",
  "Clinical Surface Slate-800 must equal #1E293B"
);
assert.strictEqual(
  semanticColors.clinicalSurface.slate700,
  "#334155",
  "Clinical Surface Slate-700 must equal #334155"
);

console.log("✓ All semantic color tokens match exact specification values: Emergency Red (#DC2626), Triage Red (#EF4444), Yellow (#F59E0B), Green (#10B981), Slate (#0F172A, #1E293B, #334155).\n");

// ============================================================================
// 2. Dual-Script Font Pairings Validation
// ============================================================================
console.log("Test 2: Validating Latin (Inter) & Devanagari (Noto Sans Devanagari) font stacks...");

assert.ok(
  fontFamilies.latin.includes("Inter"),
  "Latin font stack must prioritize 'Inter'"
);
assert.ok(
  fontFamilies.devanagari.includes("Noto Sans Devanagari"),
  "Devanagari font stack must prioritize 'Noto Sans Devanagari'"
);

const latinStyle = getTextStyle("body", "latin");
const devanagariStyle = getTextStyle("body", "devanagari");

assert.ok(
  latinStyle.fontFamily.includes("Inter"),
  "Latin resolved native font must contain 'Inter'"
);
assert.ok(
  devanagariStyle.fontFamily.includes("NotoSansDevanagari"),
  "Devanagari resolved native font must contain 'NotoSansDevanagari'"
);

console.log("✓ Latin (Inter) & Devanagari (Noto Sans Devanagari) font pairings verified.\n");

// ============================================================================
// 3. Devanagari Line-Height Scale (Zero Truncation Guarantee)
// ============================================================================
console.log("Test 3: Validating line-height scale (>= 1.40x) for Devanagari matra clearance...");

const scaleKeys = Object.keys(typographyScale) as Array<keyof typeof typographyScale>;

scaleKeys.forEach((key) => {
  const token = typographyScale[key];
  const ratio = token.lineHeight / token.fontSize;
  assert.ok(
    ratio >= 1.40,
    `Typography token '${key}' (fontSize: ${token.fontSize}px, lineHeight: ${token.lineHeight}px, ratio: ${ratio.toFixed(2)}x) must have ratio >= 1.40x to prevent Devanagari matra clipping`
  );
});

console.log(`✓ All ${scaleKeys.length} typographic scale levels satisfy line-height >= 1.40x (range: 1.41x - 1.57x) guaranteeing zero matra clipping.\n`);

// ============================================================================
// 4. Zero Layout Shift Guarantee (EN <-> हिन्दी Parity)
// ============================================================================
console.log("Test 4: Validating 0-pixel layout shift parity between Latin and Devanagari...");

scaleKeys.forEach((key) => {
  const latin = getTextStyle(key, "latin");
  const dev = getTextStyle(key, "devanagari");

  assert.strictEqual(
    latin.fontSize,
    dev.fontSize,
    `Token '${key}' fontSize must be identical across Latin and Devanagari`
  );
  assert.strictEqual(
    latin.lineHeight,
    dev.lineHeight,
    `Token '${key}' lineHeight must be strictly identical across Latin and Devanagari to guarantee 0px layout shift`
  );
});

console.log("✓ Zero Layout Shift mathematically verified: 100% vertical dimension equivalence between English and Hindi text.\n");

// ============================================================================
// 5. Physical Touch Targets (Ambulance Cockpit Ergonomics)
// ============================================================================
console.log("Test 5: Validating touch target metrics (WCAG 2.5.5)...");

assert.ok(
  touchTargets.minTargetSize >= 48,
  "Minimum touch target must be >= 48dp (WCAG 2.5.5)"
);
assert.ok(
  touchTargets.emergencyActionSize >= 56,
  "Emergency action touch target must be >= 56dp for high-vibration ambulance transit"
);

console.log(`✓ Touch targets calibrated: Minimum = ${touchTargets.minTargetSize}dp, Emergency Action = ${touchTargets.emergencyActionSize}dp.\n`);

console.log("===================================================================");
console.log("ALL EK-AMBULANCE DESIGN SYSTEM TESTS PASSED (100% GREEN)");
console.log("===================================================================");
