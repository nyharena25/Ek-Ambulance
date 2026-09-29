import assert from "node:assert";
import { randomInt, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { approveApplication, documentUrl, getApplication, isStaff, listApplications, rejectApplication, KYC_BUCKET } from "./kycApi.ts";
import { verifiedDriverSession } from "../../driver/src/hooks/otpAuth.core.ts";

/**
 * End-to-end check of staff KYC review over the real HTTP surface (GoTrue JWTs, PostgREST, Storage), using this
 * app's own service layer. LOCAL stack only: the service key is used to create and delete throwaway users and to
 * grant their roles - the same server-side step staff take today - and never for the review calls themselves.
 *
 * Sessions come from email+password because the local stack's phone provider is off; the authorization under test
 * is JWT -> Postgres/Storage, which does not depend on how the JWT was issued.
 *
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   [GATEWAY_URL=http://127.0.0.1:8000] node --experimental-strip-types apps/admin/src/kycAdmin.e2e.ts
 *
 * GATEWAY_URL (G3.2): every user-side call (auth, RPC, table, Storage) goes through Kong started with
 * docker/kong.local.yml; only the service-key setup/cleanup client talks to SUPABASE_URL directly. Both must be
 * loopback hosts - the script refuses to run against anything else, so no test data can reach a hosted project.
 */

const env = (k: string) => process.env[k] ?? assert.fail(`set ${k} (see the header of this file)`);
const URL_ = env("SUPABASE_URL");
const ANON = env("SUPABASE_ANON_KEY");
const CLIENT_URL = process.env.GATEWAY_URL ?? URL_;
for (const u of [URL_, CLIENT_URL]) {
  assert.ok(["127.0.0.1", "localhost"].includes(new URL(u).hostname), `refusing to run against a non-local host: ${u}`);
}
console.log(`users -> ${CLIENT_URL}${process.env.GATEWAY_URL ? " (Kong)" : " (direct)"}; setup/cleanup -> ${URL_}`);
const admin = createClient(URL_, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });

const created: string[] = [];
const uploaded: string[] = [];
const tag = randomUUID().slice(0, 8);

async function user(label: string, role?: "driver" | "staff"): Promise<{ id: string; db: SupabaseClient }> {
  const email = `g3-${label}-${tag}@example.test`;
  const password = randomUUID();
  const phone = `91980${randomInt(1e6, 1e7 - 1)}`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, phone, email_confirm: true, phone_confirm: true, ...(role ? { app_metadata: { role } } : {}),
  });
  assert.ifError(error);
  created.push(data.user!.id);
  const db = createClient(CLIENT_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  // The user exists only in the local stack, so this sign-in also proves the gateway's auth upstream is local.
  assert.ifError((await db.auth.signInWithPassword({ email, password })).error);
  return { id: data.user!.id, db };
}

/** The driver app's real sequence: application RPC, vehicle + documents under RLS, Storage upload, submit_kyc. */
async function apply(d: { id: string; db: SupabaseClient }, plate: string): Promise<string> {
  const fields = { licenseNumber: `G3-${plate}`, ais125Type: "TYPE_C_BLS", dlExpiry: "2031-01-01", emtLevel: "EMT_B" };
  assert.ifError((await d.db.rpc("upsert_driver_application", { p_fields: fields })).error);
  assert.ifError((await d.db.from("driver_vehicles").insert({ driver_id: d.id, registration_number: plate, ais125_type: "TYPE_C_BLS" })).error);
  let rcPath = "";
  for (const slot of ["arai_certificate", "fitness_permit", "vehicle_rc"]) {
    const path = `${d.id}/${slot}/${randomUUID()}.pdf`;
    const bytes = new TextEncoder().encode(`%PDF-1.4 ${slot} ${d.id}`);
    const up = await d.db.storage.from(KYC_BUCKET).upload(path, bytes, { contentType: "application/pdf" });
    assert.ifError(up.error);
    uploaded.push(path);
    // The object really landed in the LOCAL private bucket (checked directly, not through the gateway).
    const listed = await admin.storage.from(KYC_BUCKET).list(`${d.id}/${slot}`);
    assert.ok(listed.data?.some((o) => path.endsWith(o.name)), `${path} exists in the local bucket`);
    assert.ifError((await d.db.from("driver_documents").insert({ driver_id: d.id, slot, storage_path: path, file_name: `${slot}.pdf`, size_bytes: bytes.byteLength, mime_type: "application/pdf" })).error);
    if (slot === "vehicle_rc") rcPath = path;
  }
  const sub = await d.db.rpc("submit_kyc");
  assert.ifError(sub.error);
  assert.strictEqual(sub.data.kycStatus, "pending_verification");
  return rcPath;
}

try {
  const patient = await user("patient");
  const staff = await user("staff", "staff");
  const d1 = await user("driver1", "driver");
  const d2 = await user("driver2", "driver");
  const rc1 = await apply(d1, `G3${tag.slice(0, 4).toUpperCase()}A`);
  await apply(d2, `G3${tag.slice(0, 4).toUpperCase()}B`);

  console.log("Unauthorized: patient");
  assert.deepStrictEqual(await isStaff(patient.db), { ok: true, data: false });
  assert.deepStrictEqual(await isStaff(staff.db), { ok: true, data: true });
  assert.deepStrictEqual(await listApplications(patient.db, "pending_verification"), { ok: false, error: "not_staff" });
  assert.deepStrictEqual(await getApplication(patient.db, d1.id), { ok: false, error: "not_staff" });
  assert.deepStrictEqual(await approveApplication(patient.db, d1.id), { ok: false, error: "not_staff" });
  assert.deepStrictEqual(await rejectApplication(patient.db, d1.id, "x"), { ok: false, error: "not_staff" });
  assert.strictEqual((await documentUrl(patient.db, rc1)).ok, false, "patient cannot sign another driver's document");
  assert.strictEqual((await patient.db.rpc("approve_kyc", { p_driver_id: d1.id })).error?.code, "42501", "approve_kyc not callable");
  assert.strictEqual((await patient.db.from("driver_documents").select("id")).data?.length, 0, "patient sees no document rows");
  // The only thing a client can write about itself is user_metadata; the role stays unset.
  await patient.db.auth.updateUser({ data: { role: "driver" } });
  const refreshed = await patient.db.auth.refreshSession();
  assert.strictEqual(refreshed.data.session?.user.app_metadata.role, undefined, "client cannot set app_metadata.role");
  assert.strictEqual(verifiedDriverSession(refreshed.data.session), null, "patient never passes the driver-role check");
  assert.deepStrictEqual(await approveApplication(patient.db, d1.id), { ok: false, error: "not_staff" }, "and still cannot approve");

  console.log("Unauthorized: driver");
  assert.deepStrictEqual(await listApplications(d2.db, null), { ok: false, error: "not_staff" });
  assert.deepStrictEqual(await getApplication(d2.db, d1.id), { ok: false, error: "not_staff" });
  assert.deepStrictEqual(await approveApplication(d2.db, d2.id), { ok: false, error: "not_staff" }, "cannot approve own application");
  assert.deepStrictEqual(await rejectApplication(d2.db, d1.id, "x"), { ok: false, error: "not_staff" });
  assert.strictEqual((await documentUrl(d2.db, rc1)).ok, false, "driver cannot sign another driver's document");
  assert.strictEqual((await d2.db.from("drivers").update({ kyc_status: "approved" }).eq("id", d2.id)).error?.code, "42501");

  console.log("Storage authorization through the client path");
  const rc1Text = `%PDF-1.4 vehicle_rc ${d1.id}`;
  const own = await d1.db.storage.from(KYC_BUCKET).download(rc1);
  assert.strictEqual(await own.data?.text(), rc1Text, "driver downloads their own document");
  assert.ok((await d2.db.storage.from(KYC_BUCKET).download(rc1)).error, "driver B cannot download driver A's document");
  assert.ok((await patient.db.storage.from(KYC_BUCKET).download(rc1)).error, "patient cannot download a KYC document");
  const anon = createClient(CLIENT_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.ok((await anon.storage.from(KYC_BUCKET).download(rc1)).error, "anonymous cannot download");
  assert.ok((await anon.storage.from(KYC_BUCKET).createSignedUrl(rc1, 60)).error, "anonymous cannot sign");
  assert.ok((await anon.storage.from(KYC_BUCKET).upload(`${d1.id}/vehicle_rc/${randomUUID()}.pdf`, new Uint8Array([37]), { contentType: "application/pdf" })).error, "anonymous cannot upload");
  assert.ok((await d2.db.storage.from(KYC_BUCKET).upload(`${d1.id}/vehicle_rc/${randomUUID()}.pdf`, new Uint8Array([37]), { contentType: "application/pdf" })).error, "driver B cannot upload into driver A's folder");
  for (const path of [`/object/${KYC_BUCKET}/${rc1}`, `/object/authenticated/${KYC_BUCKET}/${rc1}`, `/object/public/${KYC_BUCKET}/${rc1}`]) {
    const r = await fetch(`${CLIENT_URL}/storage/v1${path}`);
    assert.notStrictEqual(r.status, 200, `raw GET ${path} without credentials is refused`);
    assert.notStrictEqual(await r.text(), rc1Text);
  }
  const staffDl = await staff.db.storage.from(KYC_BUCKET).download(rc1);
  assert.strictEqual(await staffDl.data?.text(), rc1Text, "staff downloads any KYC document");

  console.log("Authorized staff: list, inspect, open documents");
  const pending = await listApplications(staff.db, "pending_verification");
  assert.ok(pending.ok);
  const row = pending.data.find((a) => a.driverId === d1.id) ?? assert.fail("d1 listed");
  assert.strictEqual(row.requiredUploaded, 3);
  assert.match(row.phone ?? "", /^\+9198/);
  const app = await getApplication(staff.db, d1.id);
  assert.ok(app.ok);
  assert.strictEqual(app.data.documents.length, 3);
  assert.ok(app.data.vehicle?.registrationNumber.startsWith("G3"));
  const signed = await documentUrl(staff.db, rc1);
  assert.ok(signed.ok, "staff gets a signed URL");
  assert.ok(signed.data.startsWith(`${CLIENT_URL}/storage/v1/object/sign/`), `signed link is served by the client path (${CLIENT_URL})`);
  const fetched = await fetch(signed.data);
  assert.strictEqual(fetched.status, 200);
  assert.strictEqual(await fetched.text(), rc1Text, "signed URL serves the driver's real file");
  const tampered = await fetch(signed.data.replace(/token=[^&]+/, "token=forged"));
  assert.notStrictEqual(tampered.status, 200, "a forged signed-link token is refused");

  console.log("Approval");
  const approved = await approveApplication(staff.db, d1.id);
  assert.ok(approved.ok);
  assert.strictEqual(approved.data.kycStatus, "approved");
  assert.deepStrictEqual(await approveApplication(staff.db, d1.id), { ok: false, error: "not_pending_verification" });
  const profile1 = await d1.db.rpc("get_driver_profile");
  assert.strictEqual(profile1.data.kycStatus, "approved");
  assert.strictEqual(profile1.data.isVerified, true);
  // The approved driver's refreshed session still passes the Driver App's own gate (server-set app_metadata.role).
  const d1Session = (await d1.db.auth.refreshSession()).data.session;
  assert.deepStrictEqual(verifiedDriverSession(d1Session), { accessToken: d1Session!.access_token, userId: d1.id }, "approved driver passes the driver-role check");

  console.log("Rejection");
  assert.deepStrictEqual(await rejectApplication(staff.db, d2.id, "  "), { ok: false, error: "reason_required" });
  assert.ok((await rejectApplication(staff.db, d2.id, "RC photo is illegible")).ok);
  const profile2 = await d2.db.rpc("get_driver_profile");
  assert.strictEqual(profile2.data.kycStatus, "rejected");
  assert.strictEqual(profile2.data.kycRejectReason, "RC photo is illegible");
  assert.strictEqual(profile2.data.regulatedEditable, true, "rejected driver can fix and resubmit");

  console.log("Resubmission needs replaced documents (G3.1)");
  assert.strictEqual((await d2.db.rpc("submit_kyc")).error?.message, "documents_invalid", "resubmitting the rejected documents is refused");
  // The driver app's replace sequence (driverServer.uploadKycDocument): new object, then point the row at it.
  for (const slot of ["arai_certificate", "fitness_permit", "vehicle_rc"]) {
    const path = `${d2.id}/${slot}/${randomUUID()}.pdf`;
    assert.ifError((await d2.db.storage.from(KYC_BUCKET).upload(path, new TextEncoder().encode(`%PDF-1.4 v2 ${slot}`), { contentType: "application/pdf" })).error);
    uploaded.push(path);
    const upd = await d2.db.from("driver_documents").update({ storage_path: path }).eq("driver_id", d2.id).eq("slot", slot).select("status");
    assert.ifError(upd.error);
    assert.strictEqual(upd.data?.[0]?.status, "uploaded", `${slot} replacement resets to uploaded`);
  }
  const resubmit = await d2.db.rpc("submit_kyc");
  assert.ifError(resubmit.error);
  assert.strictEqual(resubmit.data.kycStatus, "pending_verification", "resubmitted after replacement");
  assert.ok((await approveApplication(staff.db, d2.id)).ok, "staff approves the corrected application");
  const docs2 = await getApplication(staff.db, d2.id);
  assert.ok(docs2.ok);
  assert.deepStrictEqual([...new Set(docs2.data.documents.map((d) => d.status))], ["accepted"], "approved with only accepted documents");

  console.log("Revocation");
  await admin.auth.admin.updateUserById(staff.id, { app_metadata: { role: null } });
  assert.deepStrictEqual(await listApplications(staff.db, null), { ok: false, error: "not_staff" }, "revoked at once, same JWT");
  assert.strictEqual((await documentUrl(staff.db, rc1)).ok, false);

  console.log("ALL ADMIN KYC E2E CHECKS PASSED");
} finally {
  if (uploaded.length) await admin.storage.from(KYC_BUCKET).remove(uploaded);
  for (const id of created) await admin.auth.admin.deleteUser(id);
}
