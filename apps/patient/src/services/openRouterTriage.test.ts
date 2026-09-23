import assert from "node:assert";
import { computeTriageUrgency } from "@sahayak/domain";
import { parseTriageExtraction, toTriageInput, extractTriageIndicators } from "./openRouterTriage.ts";

const good = {
  primaryComplaint: "severe_trauma",
  respiratoryDistress: false,
  severeHemorrhage: true,
  alteredMentalStatus: false,
  recommendedTier: "CAT_1_IMMEDIATE",
};
const resp = (status: number, body: unknown = {}) =>
  (async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })) as unknown as typeof fetch;
const wrap = (content: unknown) => ({ choices: [{ message: { content } }] });

console.log("Test 1: schema parsing accepts valid JSON (incl. code fences) and rejects off-schema output...");
assert.deepStrictEqual(parseTriageExtraction(JSON.stringify(good)), good);
assert.deepStrictEqual(parseTriageExtraction("```json\n" + JSON.stringify(good) + "\n```"), good);
assert.strictEqual(parseTriageExtraction("not json"), null);
assert.strictEqual(parseTriageExtraction(undefined), null);
assert.strictEqual(parseTriageExtraction(JSON.stringify({ ...good, primaryComplaint: "headache" })), null);
assert.strictEqual(parseTriageExtraction(JSON.stringify({ ...good, severeHemorrhage: "yes" })), null);
assert.strictEqual(parseTriageExtraction(JSON.stringify({ ...good, recommendedTier: "CAT_9" })), null);
const { alteredMentalStatus: _drop, ...missing } = good;
assert.strictEqual(parseTriageExtraction(JSON.stringify(missing)), null);
console.log("✓ schema\n");

console.log("Test 2: the domain engine decides; AI tier is ignored and red flags cannot be under-triaged...");
const hemorrhage = computeTriageUrgency(toTriageInput(good as never));
assert.strictEqual(hemorrhage.tier, "CAT_1_IMMEDIATE");
assert.strictEqual(hemorrhage.recommendedCareLevel, "ALS");
const aiSaysUrgentButStable = computeTriageUrgency(
  toTriageInput({ ...good, severeHemorrhage: false, recommendedTier: "CAT_1_IMMEDIATE" } as never)
);
assert.strictEqual(aiSaysUrgentButStable.tier, "CAT_2_URGENT", "engine result, not AI's recommendedTier");
const minorWithRedFlag = computeTriageUrgency(
  toTriageInput({ ...good, primaryComplaint: "minor_injury", respiratoryDistress: true, severeHemorrhage: false, recommendedTier: "CAT_3_DELAYED" } as never)
);
assert.strictEqual(minorWithRedFlag.tier, "CAT_1_IMMEDIATE", "minor + respiratory distress escalates");
assert.strictEqual(
  computeTriageUrgency(toTriageInput({ ...good, primaryComplaint: "minor_injury", severeHemorrhage: false, recommendedTier: "CAT_3_DELAYED" } as never)).tier,
  "CAT_3_DELAYED"
);
console.log("✓ engine authority\n");

console.log("Test 3: every failure degrades to a reason, never a throw...");
const run = (fetchImpl: typeof fetch, apiKey = "k", text = "chest pain") =>
  extractTriageIndicators(text, { apiKey, fetchImpl, timeoutMs: 20 });
assert.deepStrictEqual(await run(resp(200, wrap(JSON.stringify(good)))), { ok: true, data: good });
assert.deepStrictEqual(await run(resp(401)), { ok: false, reason: "auth" });
assert.deepStrictEqual(await run(resp(403)), { ok: false, reason: "auth" });
assert.deepStrictEqual(await run(resp(429)), { ok: false, reason: "rate_limit" });
assert.deepStrictEqual(await run(resp(500)), { ok: false, reason: "network" });
assert.deepStrictEqual(await run(resp(200, wrap("sorry, cannot help"))), { ok: false, reason: "invalid_response" });
assert.deepStrictEqual(await run(resp(200, { error: "x" })), { ok: false, reason: "invalid_response" });
assert.deepStrictEqual(await run((async () => { throw new TypeError("Network request failed"); }) as unknown as typeof fetch), { ok: false, reason: "network" });
const hang = ((_u: unknown, init?: { signal?: AbortSignal }) =>
  new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))))) as unknown as typeof fetch;
assert.deepStrictEqual(await run(hang), { ok: false, reason: "timeout" });
assert.deepStrictEqual(await run(resp(200), ""), { ok: false, reason: "no_key" });
assert.deepStrictEqual(await run(resp(200), "k", "   "), { ok: false, reason: "empty_input" });
console.log("✓ degradation\n");

console.log("Test 4: request is OpenRouter JSON-schema shaped and sends the key as a Bearer token...");
let seen: { url?: unknown; init?: { headers?: Record<string, string>; body?: string } } = {};
await extractTriageIndicators("saans nahi aa rahi", {
  apiKey: "sk-test",
  fetchImpl: (async (url: unknown, init: never) => { seen = { url, init }; return { ok: true, status: 200, json: async () => wrap(JSON.stringify(good)) }; }) as unknown as typeof fetch,
});
assert.strictEqual(seen.url, "https://openrouter.ai/api/v1/chat/completions");
assert.strictEqual(seen.init?.headers?.Authorization, "Bearer sk-test");
const sent = JSON.parse(seen.init?.body ?? "{}");
assert.strictEqual(sent.response_format.type, "json_schema");
assert.strictEqual(sent.response_format.json_schema.strict, true);
assert.strictEqual(sent.messages[1].content, "saans nahi aa rahi");
console.log("✓ request\n");

console.log("OPENROUTER TRIAGE TESTS PASSED (100% GREEN)");
