/**
 * Builds report_source/report.md from the section files listed in metadata.json.
 *
 *   - Citations: sections cite with [@key] or [@a; @b]. Cited entries of 09_references.md are numbered in order of first
 *     citation (IEEE) and every citation becomes [n] or [n], [m]. An unknown key fails the build.
 *   - Diagrams: every ```xml block preceded by <!-- drawio:<name> --> is also written to diagrams/<name>.drawio and must
 *     at least contain a balanced <mxfile>.
 *   - A title block and a table of contents (levels 1 and 2) are generated.
 *
 * Run from anywhere: node report_source/assemble.mjs [--out <path>] [--check]
 *   --check  validate citations and diagrams without writing anything (exit 1 on any problem).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const outArg = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;

const meta = JSON.parse(readFileSync(join(here, "metadata.json"), "utf8"));
const read = (f) => readFileSync(join(here, f), "utf8");
const problems = [];

// ---------------------------------------------------------------------------
// Bibliography: "- [@key] entry" lines.
// ---------------------------------------------------------------------------
const bib = new Map();
for (const line of read(meta.references).split("\n")) {
  const m = /^- \[@([\w-]+)\] (.+)$/.exec(line);
  if (!m) continue;
  if (bib.has(m[1])) problems.push(`duplicate bibliography key @${m[1]}`);
  bib.set(m[1], m[2]);
}

// ---------------------------------------------------------------------------
// Citations, numbered by first appearance across the sections in order. Fenced code is left untouched.
// ---------------------------------------------------------------------------
const CITE = /\[(@[\w-]+(?:\s*;\s*@[\w-]+)*)\]/g;
const order = new Map();

/** Applies `fn` to the prose parts of a Markdown document only (outside ``` fences). */
function mapProse(md, fn) {
  return md
    .split(/(^```[\s\S]*?^```)/m)
    .map((part, i) => (i % 2 === 1 ? part : fn(part)))
    .join("");
}

const sections = meta.sections.map((file) => ({ file, text: read(file) }));
for (const s of sections) {
  mapProse(s.text, (prose) => {
    for (const m of prose.matchAll(CITE)) {
      for (const key of m[1].split(";").map((k) => k.trim().slice(1))) {
        if (!bib.has(key)) problems.push(`${s.file}: unknown citation @${key}`);
        else if (!order.has(key)) order.set(key, order.size + 1);
      }
    }
    return prose;
  });
}

const renumber = (prose) =>
  prose.replace(CITE, (_all, keys) =>
    keys
      .split(";")
      .map((k) => order.get(k.trim().slice(1)))
      .filter((n) => n !== undefined)
      .sort((a, b) => a - b)
      .map((n) => `[${n}]`)
      .join(", ")
  );

// ---------------------------------------------------------------------------
// Diagrams
// ---------------------------------------------------------------------------
const diagrams = [];
for (const s of sections) {
  for (const m of s.text.matchAll(/<!-- drawio:([\w-]+) -->\s*```xml\n([\s\S]*?)```/g)) {
    const [, name, xml] = m;
    if (!/^<mxfile[\s>]/.test(xml.trim()) || !/<\/mxfile>\s*$/.test(xml)) problems.push(`${s.file}: diagram ${name} is not a complete <mxfile>`);
    if (!/<mxCell\b/.test(xml)) problems.push(`${s.file}: diagram ${name} has no cells`);
    diagrams.push({ name, xml });
  }
}

if (problems.length) {
  console.error(problems.map((p) => `ERROR ${p}`).join("\n"));
  process.exit(1);
}

const uncited = [...bib.keys()].filter((k) => !order.has(k));
if (checkOnly) {
  console.log(`OK: ${order.size} cited references, ${uncited.length} uncited, ${diagrams.length} diagrams, ${sections.length} sections`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
/** GitHub-style heading anchor. */
const slug = (h) =>
  h
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");

const body = sections
  .map((s) => mapProse(s.text.replace(/<!-- drawio:[\w-]+ -->\n/g, ""), renumber).trim())
  .join("\n\n---\n\n");

const referencesHeading = read(meta.references).split("\n").find((l) => l.startsWith("# ")) ?? "# References";
const toc = [];
for (const line of `${body.replace(/^```[\s\S]*?^```/gm, "")}\n${referencesHeading}`.split("\n")) {
  const m = /^(#{1,2}) (.+)$/.exec(line);
  if (m) toc.push(`${m[1].length === 1 ? "" : "  "}- [${m[2]}](#${slug(m[2])})`);
}

const referenceList = [...order.entries()].map(([key, n]) => `[${n}] ${bib.get(key)}`).join("\n\n");
const furtherReading = uncited.length
  ? `\n\n## Further reading (not cited in the text)\n\n${uncited.map((k) => `- ${bib.get(k)}`).join("\n")}`
  : "";

const authors = meta.authors.map((a) => `**${a.name}**<br>${a.affiliation}`).join("\n\n");
const report = `# ${meta.title}

*${meta.subtitle}* · ${meta.date}

${authors}

<!-- Generated by report_source/assemble.mjs from the files in report_source/. Edit those files, not this one. -->

## Contents

${toc.join("\n")}

---

${body}

---

${referencesHeading}

${referenceList}${furtherReading}
`;

const out = outArg ? resolve(outArg) : join(here, meta.output);
writeFileSync(out, report);
mkdirSync(join(here, meta.diagramsDir), { recursive: true });
for (const d of diagrams) writeFileSync(join(here, meta.diagramsDir, `${d.name}.drawio`), d.xml);

const words = report.replace(/```[\s\S]*?```/g, "").split(/\s+/).filter(Boolean).length;
console.log(`wrote ${out}: ${sections.length} sections, ${order.size} references, ${diagrams.length} draw.io files, ~${words} words of prose`);
if (uncited.length) console.log(`uncited (listed under Further reading): ${uncited.map((k) => "@" + k).join(", ")}`);
