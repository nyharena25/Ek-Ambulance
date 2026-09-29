import { createClient } from "@supabase/supabase-js";
import {
  KYC_STATUSES,
  approveApplication,
  canDecide,
  describeError,
  documentUrl,
  getApplication,
  isStaff,
  listApplications,
  missingRequiredSlots,
  rejectApplication,
  type KycApplication,
  type KycStatus,
} from "./kycApi.ts";

// Anon key only (vite.config.ts refuses a secret key). Same phone-OTP sign-in as the apps; staff accounts are
// created and granted app_metadata.role = 'staff' server-side, so sign-in never creates a user here.
const db = createClient(import.meta.env.VITE_SUPABASE_URL ?? "", import.meta.env.VITE_SUPABASE_ANON_KEY ?? "", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

type Child = Node | string | null | undefined | false;
/** Every value from the database goes in as a text node - applicant data is driver-controlled, never HTML. */
function h(tag: string, props: Record<string, unknown> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v as EventListener);
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, String(v));
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

const root = document.getElementById("app")!;
const render = (...nodes: Child[]) => root.replaceChildren(...(nodes.filter(Boolean) as (Node | string)[]));
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");
const orDash = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
const STATUS_LABEL: Record<string, string> = {
  pending_verification: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  draft: "Draft (not submitted)",
};

function header(phone: string | undefined): HTMLElement {
  return h("header", {},
    h("h1", {}, "Sahayak · Driver KYC review"),
    phone ? h("div", {}, h("span", { class: "muted" }, phone, " "), h("button", { onclick: () => db.auth.signOut() }, "Sign out")) : null);
}

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------
// signOut() re-enters route(null) after the fact, so a reason to show survives that second render here.
let pendingMessage: string | undefined;
function signIn(message = pendingMessage) {
  pendingMessage = undefined;
  const phone = h("input", { id: "phone", type: "tel", placeholder: "+919800000000", autocomplete: "tel", required: true }) as HTMLInputElement;
  const status = h("p", { class: "error", role: "alert" }, message ?? "");
  const form = h("form", {
    onsubmit: async (e: Event) => {
      e.preventDefault();
      status.textContent = "";
      const { error } = await db.auth.signInWithOtp({ phone: phone.value.trim(), options: { channel: "sms", shouldCreateUser: false } });
      if (error) status.textContent = error.message;
      else verify(phone.value.trim());
    },
  }, h("label", { for: "phone" }, "Staff phone number"), phone, " ", h("button", { class: "primary", type: "submit" }, "Send code"));
  render(header(undefined), h("main", {}, h("div", { class: "card" }, form, status)));
}

function verify(phone: string) {
  const code = h("input", { id: "otp", inputmode: "numeric", autocomplete: "one-time-code", required: true }) as HTMLInputElement;
  const status = h("p", { class: "error", role: "alert" });
  const form = h("form", {
    onsubmit: async (e: Event) => {
      e.preventDefault();
      const { error } = await db.auth.verifyOtp({ phone, token: code.value.trim(), type: "sms" });
      if (error) status.textContent = error.message;
      // success is picked up by onAuthStateChange
    },
  }, h("label", { for: "otp" }, `Code sent to ${phone}`), code, " ", h("button", { class: "primary", type: "submit" }, "Verify"));
  render(header(undefined), h("main", {}, h("div", { class: "card" }, form, status)));
  code.focus();
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------
let filter: KycStatus | null = "pending_verification";

async function list(phone: string) {
  const select = h("select", { id: "status", onchange: (e: Event) => {
    const v = (e.target as HTMLSelectElement).value;
    filter = v === "all" ? null : (v as KycStatus);
    void list(phone);
  } },
    ...KYC_STATUSES.map((s) => h("option", { value: s, selected: filter === s }, STATUS_LABEL[s])),
    h("option", { value: "all", selected: filter === null }, "All")) as HTMLSelectElement;
  const body = h("div", {}, h("p", { class: "muted" }, "Loading…"));
  render(header(phone), h("main", {},
    h("div", { class: "row-actions" }, h("label", { for: "status" }, "Status"), select, h("button", { onclick: () => list(phone) }, "Refresh")),
    body));

  const res = await listApplications(db, filter);
  if (!res.ok) return body.replaceChildren(h("p", { class: "error", role: "alert" }, describeError(res.error)));
  if (res.data.length === 0) return body.replaceChildren(h("p", { class: "muted" }, "No applications with this status."));
  body.replaceChildren(h("table", {},
    h("thead", {}, h("tr", {}, ...["Applicant", "Phone", "Status", "Submitted", "Required docs", "Vehicle type", "Zone", "Reference"].map((t) => h("th", {}, t)))),
    h("tbody", {}, ...res.data.map((a) => {
      const open = () => detail(phone, a.driverId);
      return h("tr", { class: "row", tabindex: 0, onclick: open, onkeydown: (e: KeyboardEvent) => e.key === "Enter" && open() },
        h("td", {}, a.fullName ?? h("span", { class: "muted" }, "Name not provided")),
        h("td", {}, orDash(a.phone)),
        h("td", {}, STATUS_LABEL[a.kycStatus] ?? a.kycStatus),
        h("td", {}, fmtDate(a.submittedAt)),
        h("td", { class: a.requiredUploaded < a.requiredTotal ? "missing" : "" }, `${a.requiredUploaded} / ${a.requiredTotal}`, a.documentCount > a.requiredUploaded ? ` (+${a.documentCount - a.requiredUploaded} other)` : ""),
        h("td", {}, a.ais125Type),
        h("td", {}, orDash(a.serviceZone)),
        h("td", {}, orDash(a.kycReference)));
    }))));
}

// ---------------------------------------------------------------------------
// Detail + decision
// ---------------------------------------------------------------------------
const fields = (rows: [string, unknown][]) => h("dl", {}, ...rows.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, orDash(v))]));

async function detail(phone: string, driverId: string, notice?: string) {
  const back = h("button", { onclick: () => list(phone) }, "← Back to list");
  render(header(phone), h("main", {}, back, h("p", { class: "muted" }, "Loading…")));
  const res = await getApplication(db, driverId);
  if (!res.ok) return render(header(phone), h("main", {}, back, h("p", { class: "error", role: "alert" }, describeError(res.error))));
  const a: KycApplication = res.data;
  const missing = missingRequiredSlots(a);

  const docs = h("table", {},
    h("thead", {}, h("tr", {}, ...["Slot", "File", "Size", "Type", "Status", "Uploaded", ""].map((t) => h("th", {}, t)))),
    h("tbody", {},
      ...a.documents.map((d) => {
        const err = h("span", { class: "error" });
        return h("tr", {},
          h("td", {}, d.slot, a.requiredSlots.includes(d.slot) ? " *" : ""),
          h("td", {}, orDash(d.fileName)),
          h("td", {}, d.sizeBytes == null ? "—" : d.sizeBytes < 1024 ? `${d.sizeBytes} B` : `${Math.round(d.sizeBytes / 1024)} KB`),
          h("td", {}, orDash(d.mimeType)),
          h("td", {}, d.status, d.rejectionReason ? ` — ${d.rejectionReason}` : ""),
          h("td", {}, fmtDate(d.uploadedAt)),
          h("td", {}, h("button", { onclick: async () => {
            // Open the tab synchronously (popup blockers), then point it at the 60-second signed URL.
            const tab = window.open("", "_blank");
            const url = await documentUrl(db, d.storagePath);
            if (url.ok && tab) { tab.opener = null; tab.location.href = url.data; }
            else { tab?.close(); err.textContent = url.ok ? "Popup blocked." : `Cannot open: ${url.error}`; }
          } }, "Open"), " ", err));
      }),
      ...missing.map((s) => h("tr", {}, h("td", {}, s, " *"), h("td", { class: "missing", colspan: 6 }, "Required document not uploaded")))));

  const reason = h("textarea", { id: "reason", maxlength: 500 }) as HTMLTextAreaElement;
  const status = h("p", { role: "alert", class: notice ? "ok" : "" }, notice ?? "");
  const decide = async (action: "approve" | "reject") => {
    if (action === "approve" && !confirm(`Approve ${a.fullName ?? a.phone ?? a.driverId}? The driver becomes verified and can go online.`)) return;
    status.className = "";
    status.textContent = "Saving…";
    const r = action === "approve" ? await approveApplication(db, a.driverId) : await rejectApplication(db, a.driverId, reason.value);
    if (r.ok) return detail(phone, a.driverId, action === "approve" ? "Application approved." : "Application rejected.");
    status.className = "error";
    status.textContent = describeError(r.error);
  };

  const decision = canDecide(a.kycStatus)
    ? h("div", { class: "card" }, h("h2", {}, "Decision"),
        missing.length ? h("p", { class: "missing" }, `Missing required documents: ${missing.join(", ")}`) : null,
        h("label", { for: "reason" }, "Rejection reason (required to reject; shown to the driver)"), reason,
        h("div", { class: "row-actions" },
          h("button", { class: "approve", onclick: () => decide("approve") }, "Approve"),
          h("button", { class: "reject", onclick: () => decide("reject") }, "Reject")),
        status)
    : h("div", { class: "card" }, h("p", { class: "muted" }, `This application is ${STATUS_LABEL[a.kycStatus] ?? a.kycStatus} and cannot be decided now.`), status);

  render(header(phone), h("main", {}, back,
    h("div", { class: "card" }, h("h2", {}, "Applicant"), fields([
      ["Name", a.fullName ?? "Not provided"], ["Phone", a.phone], ["Status", STATUS_LABEL[a.kycStatus] ?? a.kycStatus],
      ["Verified", a.isVerified ? "Yes" : "No"], ["Reference", a.kycReference], ["Submitted", fmtDate(a.submittedAt)],
      ["Reviewed", fmtDate(a.reviewedAt)], ["Rejection reason", a.kycRejectReason], ["Service zone", a.serviceZone],
    ])),
    h("div", { class: "card" }, h("h2", {}, "Licence & medical"), fields([
      ["Licence number", a.licenseNumber], ["DL expiry", a.dlExpiry], ["DL state", a.dlState], ["PSV badge", a.psvBadgeNumber],
      ["AIS-125 type", a.ais125Type], ["EMT level", a.emtLevel], ["EMT certificate", a.emtCertId], ["EMT council", a.emtCouncil],
      ["EMT expiry", a.emtExpiry], ["ACLS", a.aclsCertified ? "Yes" : "No"], ["BLS", a.blsCertified ? "Yes" : "No"],
    ])),
    h("div", { class: "card" }, h("h2", {}, "Vehicle"), a.vehicle ? fields([
      ["Registration", a.vehicle.registrationNumber], ["Make / model", a.vehicle.makeModel], ["Year", a.vehicle.manufactureYear],
      ["VIN / chassis", a.vehicle.vin], ["AIS-125 type", a.vehicle.ais125Type],
      ["Equipment attested", Array.isArray(a.vehicle.equipmentAttested) ? a.vehicle.equipmentAttested.join(", ") : JSON.stringify(a.vehicle.equipmentAttested)],
    ]) : h("p", { class: "muted" }, "No active vehicle on file.")),
    h("div", { class: "card" }, h("h2", {}, "Documents"), h("p", { class: "muted" }, "* required for submission"), docs),
    decision));
}

// ---------------------------------------------------------------------------
// Session gate. Hiding the UI is convenience only; every RPC and Storage read re-checks staff server-side.
// ---------------------------------------------------------------------------
type Session = Awaited<ReturnType<typeof db.auth.getSession>>["data"]["session"];
let shownFor: string | null = null;
async function route(session: Session) {
  if (!session) {
    shownFor = null;
    return signIn();
  }
  if (shownFor === session.user.id) return; // token refresh, not a new sign-in
  shownFor = session.user.id;
  const staff = await isStaff(db);
  if (!staff.ok || !staff.data) {
    const message = describeError(staff.ok ? "not_staff" : "staff_check_failed");
    pendingMessage = message;
    signIn();
    pendingMessage = message;
    await db.auth.signOut();
    return;
  }
  void list(session.user.phone ? `+${session.user.phone.replace(/^\+/, "")}` : session.user.id);
}

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  render(h("main", {}, h("p", { class: "error" }, "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set (see apps/admin/.env.example).")));
} else {
  // Deferred: calling the client from inside the auth callback can deadlock supabase-js's auth lock.
  db.auth.onAuthStateChange((_event, session) => void setTimeout(() => route(session), 0));
}
