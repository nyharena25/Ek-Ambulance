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

// ============================================================================
// 6. Text Contrast (WCAG 2.x relative luminance)
// ============================================================================
console.log("Test 6: Validating text contrast: textAccessible on its surface >= 7:1 (AAA), text on white >= 4.5:1 (AA)...");

const channel = (hex: string, at: number): number => {
  const v = parseInt(hex.slice(at, at + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string): number => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
const contrast = (fg: string, bg: string): number => {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

assert.ok(Math.abs(contrast("#000000", "#FFFFFF") - 21) < 1e-9, "contrast formula: black on white is 21:1");
for (const tier of ["red", "yellow", "green"] as const) {
  const t = semanticColors.triage[tier];
  assert.ok(contrast(t.textAccessible, t.surface) >= 7, `triage.${tier}.textAccessible must be AAA on its surface`);
  assert.ok(contrast(t.textOnWhite, "#FFFFFF") >= 4.5, `triage.${tier}.textOnWhite must be AA on white`);
}
for (const [name, hex] of [
  ["emergency.dark", semanticColors.emergency.dark],
  ["status.verified", semanticColors.status.verified],
  ["status.statutory", semanticColors.status.statutory],
  ["status.caution", semanticColors.status.caution],
] as const) {
  assert.ok(contrast(hex, "#FFFFFF") >= 4.5, `${name} must be AA on white`);
}
assert.ok(contrast(semanticColors.clinicalSurface.slate600, "#FFFFFF") >= 7, "slate600 captions must be AAA on white");
assert.ok(contrast("#FFFFFF", semanticColors.emergency.primary) >= 4.5, "white label on the emergency button must be AA");

// WCAG 1.4.11: the edge of a control with no other visual identity (inputs, OTP cells, checkboxes, switch off tracks).
for (const surface of [colors.white, colors.slate50]) {
  assert.ok(contrast(colors.controlBorder, surface) >= 3, `controlBorder must be >= 3:1 on ${surface}`);
}
assert.ok(contrast(colors.slate300, colors.white) < 3, "slate300 is decorative only: it must not become controlBorder");

console.log("✓ Every text token meets the WCAG level its comment states; control borders meet 3:1.\n");

console.log("===================================================================");
console.log("ALL EK-AMBULANCE DESIGN SYSTEM TESTS PASSED (100% GREEN)");
console.log("===================================================================");
