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
import {
  OUTCOMES,
  OUTCOME_LABEL,
  PAGE_SIZE,
  VEHICLE_TYPES,
  fmtDuration,
  fmtInr,
  fmtIst,
  fmtKm,
  getDriverActivity,
  listDriverMissions,
  missionDurations,
  presetRange,
  type ActivityTotals,
  type DriverMission,
  type Outcome,
  type Preset,
} from "./activityApi.ts";

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
    h("h1", {}, "Sahayak · Driver KYC & operations"),
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
      ["Name", a.fullName ?? "Not provided"], ["Phone", a.phone], ["Driver ID", a.driverId], ["Status", STATUS_LABEL[a.kycStatus] ?? a.kycStatus],
      ["Verified", a.isVerified ? "Yes" : "No"], ["Reference", a.kycReference], ["Submitted (latest)", fmtDate(a.submittedAt)],
      ["Reviewed", fmtDate(a.reviewedAt)], ["Approved (latest review)", a.kycStatus === "approved" ? fmtDate(a.reviewedAt) : null],
      ["Rejection reason", a.kycRejectReason], ["Service zone", a.serviceZone],
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
    decision,
    operations(a.driverId)));
}

// ---------------------------------------------------------------------------
// Operations history. Read-only; every figure comes from staff_driver_activity / staff_driver_missions (server-computed).
// ---------------------------------------------------------------------------
const PRESETS: [Preset | "custom", string][] = [["today", "Today"], ["yesterday", "Yesterday"], ["last7", "Last 7 days"], ["last30", "Last 30 days"], ["custom", "Custom range"]];
const table = (head: string[], rows: Node[]) =>
  h("div", { class: "scroll" }, h("table", {}, h("thead", {}, h("tr", {}, ...head.map((t) => h("th", {}, t)))), h("tbody", {}, ...rows)));
const when = (iso: string | null) => (iso ? fmtIst(iso) : "—");
// No completed task is "—"; "Not recorded" is kept for a missing timestamp.
const avgDuration = (x: ActivityTotals) => (x.completed ? fmtDuration(x.avgCompletedDurationS) : "—");

function operations(driverId: string): HTMLElement {
  const state = { ...presetRange("last7"), outcome: null as Outcome | null, vehicleType: null as string | null, offset: 0 };
  const status = h("div", {}), summary = h("div", {}), daily = h("div", {}), history = h("div", {});
  const err = h("p", { class: "error", role: "alert" });
  const from = h("input", { type: "date", id: "from", value: state.from }) as HTMLInputElement;
  const to = h("input", { type: "date", id: "to", value: state.to }) as HTMLInputElement;
  const preset = h("select", { id: "preset" }, ...PRESETS.map(([v, l]) => h("option", { value: v, selected: v === "last7" }, l))) as HTMLSelectElement;
  const outcome = h("select", { id: "outcome" }, h("option", { value: "" }, "All statuses"),
    ...OUTCOMES.map((o) => h("option", { value: o }, OUTCOME_LABEL[o]))) as HTMLSelectElement;
  const vehicle = h("select", { id: "vehicle" }, h("option", { value: "" }, "All ambulance types"),
    ...VEHICLE_TYPES.map((v) => h("option", { value: v }, v))) as HTMLSelectElement;

  const setRange = (r: { from: string; to: string }) => { Object.assign(state, r); from.value = r.from; to.value = r.to; reload(); };
  preset.addEventListener("change", () => preset.value !== "custom" && setRange(presetRange(preset.value as Preset)));
  const onDate = () => { preset.value = "custom"; if (from.value && to.value) setRange({ from: from.value, to: to.value }); };
  from.addEventListener("change", onDate);
  to.addEventListener("change", onDate);
  outcome.addEventListener("change", () => { state.outcome = (outcome.value || null) as Outcome | null; state.offset = 0; void loadHistory(); });
  vehicle.addEventListener("change", () => { state.vehicleType = vehicle.value || null; state.offset = 0; void loadHistory(); });

  // Each loader drops a response that a newer filter change has superseded.
  let summarySeq = 0, historySeq = 0;
  async function loadSummary() {
    const my = ++summarySeq;
    summary.replaceChildren(h("p", { class: "muted" }, "Loading…"));
    const res = await getDriverActivity(db, driverId, state.from, state.to);
    if (my !== summarySeq) return;
    if (!res.ok) { summary.replaceChildren(); daily.replaceChildren(); return void (err.textContent = describeError(res.error)); }
    const t = res.data;
    status.replaceChildren(h("div", { class: "card" }, h("h2", {}, "Operational status"), fields([
      ["Presence flag", `${t.isOnline ? "Online" : "Offline"} (last reported ${when(t.lastSeenAt)})`],
      ["Holding a mission now", t.onMission ? "Yes" : "No"],
      ["Account created", when(t.accountCreatedAt)],
      ["Online session history", "Not recorded (the backend keeps only the current presence flag)"],
    ])));

    const cols: [string, ActivityTotals][] = [[`Today (${t.today.date})`, t.today], [`${state.from} → ${state.to}`, t.range], ["Lifetime", t.lifetime]];
    const metric = (label: string, f: (x: ActivityTotals) => string) => h("tr", {}, h("th", {}, label), ...cols.map(([, x]) => h("td", { class: "num" }, f(x))));
    summary.replaceChildren(h("div", { class: "card" }, h("h2", {}, "Operational summary"),
      h("p", { class: "muted" }, "A task belongs to the IST day it was accepted. Fare and distance count completed tasks only."),
      table(["", ...cols.map(([l]) => l)], [
        metric("Tasks accepted", (x) => String(x.accepted)),
        metric("Completed", (x) => String(x.completed)),
        metric("Cancelled while assigned", (x) => `${x.cancelled}${x.cancelledByDriver ? ` (${x.cancelledByDriver} by driver)` : ""}`),
        metric("Released before pickup", (x) => String(x.released)),
        metric("In progress", (x) => String(x.inProgress)),
        metric("Final fare (server, authoritative)", (x) => fmtInr(x.finalFareInr)),
        metric("Quoted fare of the same tasks", (x) => fmtInr(x.estimatedFareInr)),
        metric("Average final fare per completed task", (x) => fmtInr(x.avgFinalFareInr)),
        metric("Billed distance (transport leg)", (x) => fmtKm(x.distanceKm)),
        metric("… GPS-measured", (x) => fmtKm(x.measuredDistanceKm)),
        metric("… quoted estimate (no GPS track)", (x) => `${fmtKm(x.estimateDistanceKm)} · ${x.estimateDistanceMissions} task(s)`),
        metric("Average billed distance per completed task", (x) => fmtKm(x.avgDistanceKm)),
        metric("Average completed task duration", avgDuration),
        metric("Recorded mission time (accepted → end)", (x) => fmtDuration(x.recordedTimeS)),
        metric("First activity", (x) => when(x.firstActivityAt)),
        metric("Last activity", (x) => when(x.lastActivityAt)),
      ])));

    daily.replaceChildren(h("div", { class: "card" }, h("h2", {}, "Daily statistics"), h("p", { class: "muted" }, "Click a day to see that day's summary and tasks."),
      table(["Date", "Accepted", "Completed", "Cancelled", "Released", "Distance", "Final fare", "Avg completed duration", "Recorded time", "First activity", "Last activity"],
        t.days.map((d) => {
          const open = () => { preset.value = "custom"; setRange({ from: d.date!, to: d.date! }); };
          return h("tr", { class: "row", tabindex: 0, onclick: open, onkeydown: (e: KeyboardEvent) => e.key === "Enter" && open() },
          h("td", {}, d.date!), h("td", { class: "num" }, String(d.accepted)), h("td", { class: "num" }, String(d.completed)),
          h("td", { class: "num" }, String(d.cancelled)), h("td", { class: "num" }, String(d.released)), h("td", { class: "num" }, fmtKm(d.distanceKm)),
          h("td", { class: "num" }, fmtInr(d.finalFareInr)), h("td", { class: "num" }, avgDuration(d)), h("td", { class: "num" }, fmtDuration(d.recordedTimeS)),
          h("td", {}, when(d.firstActivityAt)), h("td", {}, when(d.lastActivityAt)));
        }))));
  }

  async function loadHistory() {
    const my = ++historySeq;
    history.replaceChildren(h("p", { class: "muted" }, "Loading…"));
    const res = await listDriverMissions(db, driverId, state);
    if (my !== historySeq) return;
    if (!res.ok) { history.replaceChildren(); return void (err.textContent = describeError(res.error)); }
    const { total, rows } = res.data;
    const page = (offset: number) => { state.offset = offset; void loadHistory(); };
    history.replaceChildren(h("div", { class: "card" }, h("h2", {}, "Mission history"),
      rows.length === 0 ? h("p", { class: "muted" }, "No tasks for these filters.") :
      table(["Accepted", "Mission", "Type", "Pickup", "Destination", "On scene", "Transport started", "Status", "Ended", "Duration", "Distance", "Fare"], rows.flatMap(missionRows)),
      h("div", { class: "row-actions" },
        h("span", { class: "muted" }, total ? `${state.offset + 1}–${state.offset + rows.length} of ${total}` : ""),
        h("button", { disabled: state.offset === 0, onclick: () => page(Math.max(0, state.offset - PAGE_SIZE)) }, "← Newer"),
        h("button", { disabled: state.offset + PAGE_SIZE >= total, onclick: () => page(state.offset + PAGE_SIZE) }, "Older →"))));
  }

  function reload() { err.textContent = ""; state.offset = 0; void loadSummary(); void loadHistory(); }
  reload();
  return h("div", {}, h("h2", {}, "Operations history"),
    h("div", { class: "card filters" },
      h("div", {}, h("label", { for: "preset" }, "Period"), preset),
      h("div", {}, h("label", { for: "from" }, "From (IST)"), from),
      h("div", {}, h("label", { for: "to" }, "To (IST)"), to),
      h("div", {}, h("label", { for: "outcome" }, "Task status"), outcome),
      h("div", {}, h("label", { for: "vehicle" }, "Ambulance type"), vehicle)),
    err, status, summary, daily, history);
}

/** A table row plus a hidden lifecycle row that the first row toggles. */
function missionRows(m: DriverMission): Node[] {
  const total = missionDurations(m).at(-1)!.seconds;
  const detailCell = h("td", { colspan: 12 });
  const detailRow = h("tr", { class: "expand", hidden: true }, detailCell);
  const toggle = () => {
    if (!detailCell.firstChild) detailCell.append(lifecycle(m));
    detailRow.hidden = !detailRow.hidden;
  };
  const outcome = OUTCOME_LABEL[m.outcome] + (m.cancelledBy ? ` (by ${m.cancelledBy})` : "");
  return [h("tr", { class: "row", tabindex: 0, onclick: toggle, onkeydown: (e: KeyboardEvent) => e.key === "Enter" && toggle() },
    h("td", {}, fmtIst(m.acceptedAt)), h("td", {}, m.displayRef), h("td", {}, m.vehicleType),
    h("td", {}, orDash(m.pickupAddress)), h("td", {}, orDash(m.destination)),
    h("td", {}, fmtIst(m.onSceneAt)), h("td", {}, fmtIst(m.transportAt)), h("td", {}, outcome),
    h("td", {}, when(m.endedAt)), h("td", { class: "num" }, fmtDuration(total)),
    h("td", { class: "num" }, m.billedDistanceKm == null ? "—" : `${fmtKm(m.billedDistanceKm)} (${m.distanceSource ?? "source not recorded"})`),
    h("td", { class: "num" }, fmtInr(m.finalFareInr))), detailRow];
}

function lifecycle(m: DriverMission): HTMLElement {
  const by = (e: DriverMission["events"][number]) => (e.byThisDriver ? "This driver" : e.actorRole === "driver" ? "Another driver" : e.actorRole);
  return h("div", { class: "lifecycle" },
    fields([
      ["Mission ID", m.missionId], ["Reference", m.displayRef], ["Urgency", m.urgency], ["Mission status now", m.missionStatus],
      ["This driver's outcome", OUTCOME_LABEL[m.outcome] + (m.endReason ? ` — ${m.endReason}` : "")],
      ["Pickup", `${m.pickupAddress ?? "Address not recorded"} (${m.pickupLat.toFixed(5)}, ${m.pickupLng.toFixed(5)})`],
      ["Destination", m.destination ?? "Not recorded"],
      ["Final fare (missions.final_fare_inr)", m.outcome === "completed" ? fmtInr(m.finalFareInr) : "Not billed to this driver"],
      ["Quoted fare at request", fmtInr(m.estimatedFareInr)],
      ["Billed distance", m.billedDistanceKm == null ? "Not billed to this driver" : `${fmtKm(m.billedDistanceKm)} — ${m.distanceSource === "measured" ? "GPS-measured transport leg" : m.distanceSource === "estimate" ? "quoted estimate (too few GPS fixes)" : "source not recorded"}`],
      ["Quoted distance at request", fmtKm(m.quotedDistanceKm)],
    ]),
    h("h3", {}, "Durations (server timestamps)"),
    table(["Segment", "Duration"], missionDurations(m).map((d) => h("tr", {}, h("td", {}, d.label), h("td", { class: d.seconds == null ? "muted" : "" }, fmtDuration(d.seconds))))),
    h("h3", {}, "Lifecycle events"),
    table(["#", "Event", "Server time", "Device-reported time", "By", "Detail"], m.events.map((e) => h("tr", {},
      h("td", {}, String(e.seq)), h("td", {}, e.eventType), h("td", {}, fmtIst(e.at)), h("td", {}, e.reportedAt ? fmtIst(e.reportedAt) : "—"),
      h("td", {}, by(e)), h("td", {}, [e.cancelledBy && `cancelled by ${e.cancelledBy}`, e.reason, e.distanceSource && `distance: ${e.distanceSource}`].filter(Boolean).join(" · ") || "—")))));
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
