/**
 * WCAG 2.x contrast audit of the @sahayak/ui text tokens (report Section 4.3.1). Prints measured ratios next to the
 * value each token's source comment claims.
 *
 * Run from the repo root: node report_source/bench/contrast.mjs
 */
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (fg, bg) => {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
};

// [token, foreground, background, ratio claimed in packages/ui/src/tokens/colors.ts or null]
const pairs = [
  ["emergency.dark on white", "#B91C1C", "#FFFFFF", 7.1],
  ["triage.red.textAccessible on red.surface", "#991B1B", "#FEF2F2", 8.9],
  ["triage.red.textOnWhite", "#B91C1C", "#FFFFFF", 7.1],
  ["triage.yellow.textAccessible on yellow.surface", "#78350F", "#FFFBEB", 10.4],
  ["triage.yellow.textOnWhite", "#B45309", "#FFFFFF", 7.0],
  ["triage.green.textAccessible on green.surface", "#065F46", "#ECFDF5", 9.4],
  ["triage.green.textOnWhite", "#047857", "#FFFFFF", 7.2],
  ["white on emergency.primary (button)", "#FFFFFF", "#DC2626", null],
];

for (const [name, fg, bg, claimed] of pairs) {
  const r = ratio(fg, bg);
  const level = r >= 7 ? "AAA" : r >= 4.5 ? "AA" : r >= 3 ? "AA-large" : "fail";
  const note = claimed === null ? "" : `  claimed ${claimed.toFixed(1)}:1${claimed >= 7 && r < 7 ? "  <-- AAA claim not met" : ""}`;
  console.log(`${name.padEnd(48)} ${fg} on ${bg}  ${r.toFixed(2)}:1  ${level}${note}`);
}
