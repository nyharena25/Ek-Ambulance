# Admin: Driver KYC Review Console (`@sahayak/admin`)

This app is a small browser console where **staff** review a driver's KYC application and then approve or reject it, and
read each driver's operations history (section 15). It has no map, no dispatch view, no user management and no staff management.

Everything below comes from the code in this repository. Where the repository does not provide something, this
document says so plainly.

---

## 1. Overview

| | |
|---|---|
| Package | `@sahayak/admin` (`apps/admin/package.json`) |
| Framework | Vite 8 with plain TypeScript and DOM. No React and no router. |
| Supabase client | `@supabase/supabase-js` (`createClient` in `src/main.ts`) |
| Package manager | pnpm 9 (root `packageManager: pnpm@9.12.0`, workspace `apps/*`) |
| Runtime | **Client only.** `vite build` outputs static files to `apps/admin/dist`. There is no server code. |
| Dev URL | `http://localhost:5173`. The port comes from `"dev": "vite --port 5173"`. There is no `--strictPort`, so if 5173 is busy Vite picks the next free port and prints it. |
| Source | `src/main.ts` (UI and session gate), `src/kycApi.ts` (service layer), `index.html` (markup and styles), `vite.config.ts` (secret-key guard) |
| Tests | `src/kycApi.test.ts`, `src/activityApi.test.ts` (unit), `src/kycAdmin.e2e.ts` (HTTP end to end, local stack only), `supabase/tests/driver_activity.behaviour.sql` (SQL) |

### Map clarification

`apps/admin` has **no map implementation** and no map dependency. Its only runtime dependency is
`@supabase/supabase-js`. Map UI exists only in the mobile apps (`apps/patient`, `apps/driver`, for example the driver's
`MapViewPort` and `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`). Do not add a map here.

---

## 2. Architecture and responsibility

```text
Browser (apps/admin, anon key + the staff member's own JWT)
   │  supabase-js
   ├── Auth (GoTrue)      signInWithOtp / verifyOtp (phone, SMS)
   ├── PostgREST RPC      is_staff, staff_list_kyc_applications, staff_get_kyc_application,
   │                      staff_approve_kyc, staff_reject_kyc
   └── Storage            createSignedUrl on bucket "driver-kyc-documents" (60 s links)
                │
                ▼
Postgres (supabase/migrations)
   20260929000001_staff_kyc_review.sql    is_staff(), _require_staff(), staff_* RPCs, Storage policy kyc_docs_select_staff
   20260928000001_approve_kyc.sql         approve_kyc / reject_kyc (service_role only, called by the staff_* wrappers)
   20260929000002_kyc_document_integrity.sql   _kyc_required_documents_valid(), and submit_kyc / approve_kyc re-check documents
```

The console makes **every** authorization decision on the server. The browser only hides UI.

---

## 3. Prerequisites

- Node with `--experimental-strip-types` support (the test scripts use it) and pnpm 9.
- `pnpm install` at the repository root.
- A Supabase project that has this repository's migrations applied, including `20260929000001` and `20260929000002`.
- **That project must have phone (SMS) auth enabled.** The console's only sign-in method is phone OTP (section 6).
  - **Hosted project:** phone auth is on. `GET /auth/v1/settings` returned `"phone": true` when this README was written.
  - **Local stack (`supabase start`):** phone auth is **off** as shipped. `supabase/config.toml` has
    `[auth.sms.twilio] enabled = false`, `[auth.sms.test_otp]` commented out and `[auth.sms] enable_signup = false`, and
    the local `GET /auth/v1/settings` returns `"phone": false`. **You cannot sign in to the Admin UI against the local
    stack as shipped.** The repository's local tests avoid this by using email+password sessions created with the
    service key (`src/kycAdmin.e2e.ts`). The browser UI has no email sign-in.
- A staff account (section 8).
- To test the full workflow: a driver account in the **same** Supabase project (section 11).

---

## 4. Environment variables

Read from `apps/admin/.env` (copy `apps/admin/.env.example`). Vite exposes only `VITE_*` variables, and it **bundles
them into the page**.

| Variable | Required? | Purpose | Safe for browser? | Example source |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | Yes. If either variable is missing, the page shows "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set". | Supabase API base URL for Auth, RPC and Storage | Yes | `.env.example`: `http://127.0.0.1:54321` (local stack). The hosted URL is `https://nzwbwuhbtqhhjwnopwmm.supabase.co`, as committed in `apps/driver/eas.json`. |
| `VITE_SUPABASE_ANON_KEY` | Yes | Public anon or publishable key | Yes. **Only** this kind of key. | Local: `supabase status -o env` → `ANON_KEY`. Hosted: Dashboard → Project Settings → API. |

No other variable is read. `src/main.ts` uses only these two.

**Secret keys.** `vite.config.ts` refuses to start **or** build if any `VITE_*` value is a secret key: an `sb_secret_…`
value, or a JWT whose payload has `role: "service_role"`. The service-role key appears only in Node test scripts run by
a developer (`src/kycAdmin.e2e.ts` and `apps/patient/src/integration/*.e2e.ts`, read from `SUPABASE_SERVICE_ROLE_KEY`),
and only to create and delete test users and grant their roles. It is never part of the console.

### Which project? Local vs hosted

| Environment | URL | Notes |
|---|---|---|
| Local stack | `http://127.0.0.1:54321` | `supabase/config.toml` sets `project_id = "Ek-Ambulance"` and API port 54321. Phone auth is off (see above). Used by the SQL suites and `kycAdmin.e2e.ts`. |
| Local Kong gateway | `http://127.0.0.1:8000` | Only when Kong runs with `docker/kong.local.yml` (`KONG_CONFIG=kong.local.yml docker compose up -d kong`). That config has the `/storage/v1/object` route and browser CORS headers. `.env.example` says **not** to point the console at a Kong running `docker/kong.yml`. |
| Hosted | `https://nzwbwuhbtqhhjwnopwmm.supabase.co` | Project ref `nzwbwuhbtqhhjwnopwmm`, committed in `apps/driver/eas.json` (every profile). The **driver app uses this project** (`eas.json`, `apps/driver/.env.example`). `.env.example` does not list it for Admin, and no repository test runs the console against it. When this README was written, the hosted project had phone auth on, and its staff RPCs existed (anon calls return `42501`, not `PGRST202`). A browser CORS preflight from `http://localhost:5173` returned 200. |

> **The Admin console and the Driver app must point at the same Supabase project.** The tracked driver configuration
> targets the hosted project, and `apps/admin/.env.example` defaults to local. Unless you change one of them, drivers
> will not appear in the console.

---

## 5. Run locally

```bash
pnpm install                                   # repo root
cp apps/admin/.env.example apps/admin/.env     # then fill VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY

pnpm --filter @sahayak/admin dev               # http://localhost:5173  (pnpm --filter admin dev also resolves)
pnpm --filter @sahayak/admin typecheck         # tsc --noEmit
pnpm --filter @sahayak/admin test              # unit tests: prints "ADMIN KYC API TESTS PASSED"
pnpm --filter @sahayak/admin build             # static output in apps/admin/dist
```

The root `turbo` scripts (`pnpm typecheck`, `pnpm test`, `pnpm preflight`) include the admin package. No root
`dev:admin` script exists.

Local Supabase (only needed for the local tests and SQL suites):

```bash
supabase start
supabase status -o env      # prints API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL (service key: tests only, never in .env)
```

### Check which project the console is connected to

Run these from `apps/admin`. They print no keys.

```bash
set -a; . ./.env; set +a
echo "$VITE_SUPABASE_URL"

# Key type and project. A legacy JWT anon key has a payload: expect "role":"anon", plus "ref":"<project-ref>" on hosted
# ("iss":"supabase-demo" on the local stack). An sb_publishable_ key has no payload to decode.
echo "$VITE_SUPABASE_ANON_KEY" | cut -d. -f2 | base64 -d 2>/dev/null | grep -o '"role":"[a-z_]*"\|"ref":"[a-z]*"\|"iss":"[a-z-]*"'

# Phone auth must be enabled for the console's sign-in:
curl -s "$VITE_SUPABASE_URL/auth/v1/settings" -H "apikey: $VITE_SUPABASE_ANON_KEY" | grep -o '"phone":[a-z]*'

# Staff migration present?  42501 "permission denied for function is_staff" = present (anon is correctly refused).
#                            PGRST202 "could not find the function"         = migration 20260929000001 not applied.
curl -s -X POST "$VITE_SUPABASE_URL/rest/v1/rpc/is_staff" -H "apikey: $VITE_SUPABASE_ANON_KEY" \
     -H "Content-Type: application/json" -d '{}'
```

Run the same checks with `apps/driver/.env` (`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`) and confirm
that both apps report the same URL.

---

## 6. How Admin authentication works (who you are)

```text
Admin opens http://localhost:5173
   ↓  src/main.ts: onAuthStateChange → route(session)
No session → "Staff phone number" form
   ↓  db.auth.signInWithOtp({ phone, options: { channel: "sms", shouldCreateUser: false } })
SMS code → "Code sent to …" form
   ↓  db.auth.verifyOtp({ phone, token, type: "sms" })
Supabase session (JWT) established; onAuthStateChange fires
   ↓  route(): rpc("is_staff")              ← authorization, section 7
true  → KYC list (filter "Pending review")
false → signed out again, "Your account is not authorised for KYC review."
error → signed out again, "Could not verify staff access (network or gateway error). Try again."
```

- **Method:** phone number + SMS OTP only. There is no email/password, magic link or OAuth in the UI. Enter the phone
  in E.164 form (placeholder `+919800000000`).
- **No sign-up:** `shouldCreateUser: false`. A phone with no existing `auth.users` row gets GoTrue's error (shown
  under the form), and no account is created.
- **Routes:** none. It is a single page that re-renders in place (sign-in → code → list → detail).
- **Session persistence:** `persistSession: true` and `autoRefreshToken: true`, so supabase-js stores the session in
  the browser's localStorage. A reload restores it, and the staff check runs again on restore.
- **Logout:** the header's "Sign out" button calls `db.auth.signOut()` and returns to the phone form.
- **Expired session:** supabase-js refreshes tokens automatically. If the refresh fails, the session ends and the
  console returns to sign-in. A call that reaches the server without a user gets `unauthenticated`, shown as "Your
  session has ended. Sign in again."

---

## 7. How staff authorization works (what you may do)

Authentication proves who you are. Authorization decides whether that person may review KYC. Here, authorization is
**entirely server-side**:

| Piece | Where | Rule |
|---|---|---|
| Staff marker | `auth.users.raw_app_meta_data.role = 'staff'` (seen in the JWT as `app_metadata.role`) | Only `service_role` (Dashboard SQL editor, or Admin API with the secret key) can write it. A client can change only `user_metadata`. `kycAdmin.e2e.ts` checks that `updateUser({ data: { role } })` does not set the role. |
| `public.is_staff()` | migration `20260929000001` | Reads `auth.users` for `auth.uid()`, **not** the JWT claim, so a grant or revoke takes effect on the next call without a token refresh. |
| `public._require_staff()` | same | Fails with `unauthenticated` (PT401) or `not_staff` (PT403). Called first by every `staff_*` RPC. |
| `staff_list_kyc_applications`, `staff_get_kyc_application`, `staff_approve_kyc`, `staff_reject_kyc` | same | `security definer`. Executable by `authenticated`, but each runs `_require_staff()`. Approve and reject also refuse `cannot_review_own_application`. |
| `approve_kyc` / `reject_kyc` | `20260928000001`, `20260929000002` | The only code that changes KYC state. EXECUTE is revoked from `anon` and `authenticated` (a direct call returns `42501`), so it is reachable only through the staff wrappers or as `service_role`. |
| Storage policy `kyc_docs_select_staff` | `20260929000001` | `select` on `storage.objects` in bucket `driver-kyc-documents` when `is_staff()`. Staff have **no** write policy. |

`profiles.role` is **not** used for staff. `handle_new_user` maps any role other than `driver` to `patient`, so a staff
account has an ordinary patient profile and can never pass the driver checks.

The console's own `is_staff` check at sign-in (`route()` in `src/main.ts`) is only a convenience. It runs once per
sign-in or page load. If staff access is revoked while the console is open, the screens stay visible, but the next
list, detail, document or decision call fails with "Your account is not authorised for KYC review."

---

## 8. How to provision a staff account

**The Admin application cannot create staff accounts or grant staff access.** No script, seed or migration creates
one. The only supported procedure is the one in the header comment of
`supabase/migrations/20260929000001_staff_kyc_review.sql`:

> Grant / revoke (service_role or SQL editor only; the user signs in once by phone OTP first)

### Step 1: create the Auth user (authentication identity)

The console uses `shouldCreateUser: false`, so the `auth.users` row must already exist. The repository creates phone
users only through an app sign-in that allows user creation:

- **Patient app → "Create account"** (`shouldCreateUser: true` in `apps/patient/src/hooks/useOtpAuth.ts`). This is the
  clean option. It leaves an ordinary patient profile, which is what a staff account is expected to have.
- The driver app also sends OTP with `shouldCreateUser: true`, but then signs out a non-driver with "This phone number
  is not registered as an active ambulance driver." The user row is still created.

Use a **dedicated phone number** for staff (see the warning in step 2).

### Step 2: grant staff (authorization)

Supabase Dashboard → your project (the same one `VITE_SUPABASE_URL` points at) → **SQL Editor**:

```sql
-- auth.users.phone is stored WITHOUT the leading '+', e.g. 919800000000
select id, phone, raw_app_meta_data->>'role' as app_role from auth.users where phone = '91XXXXXXXXXX';

update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"staff"}' where phone = '91XXXXXXXXXX';
-- Must report UPDATE 1. UPDATE 0 = the phone did not match (check the format / that step 1 happened).

select id, phone, raw_app_meta_data->>'role' as app_role from auth.users where phone = '91XXXXXXXXXX';  -- app_role = staff
```

Revoke (takes effect at once, even for a signed-in session):

```sql
update auth.users set raw_app_meta_data = raw_app_meta_data - 'role' where phone = '91XXXXXXXXXX';
```

> **Do not grant staff to a driver's account.** `app_metadata.role` holds one value. The `on_auth_user_created`
> trigger runs `handle_new_user` again whenever `raw_app_meta_data` changes, and it sets `profiles.role` to `patient`
> for any role other than `driver`. Overwriting `driver` with `staff` therefore removes the account's driver role and
> driver profile role. That account then fails the driver app's sign-in check.

The local `kycAdmin.e2e.ts` and the hosted patient e2e create staff with the service key
(`auth.admin.createUser({ …, app_metadata: { role: "staff" } })`) and email+password. That is a test harness, not an
operator procedure, and the console cannot sign in with email anyway.

---

## 9. KYC review workflow

### Finding applications: the list screen

After sign-in the console calls `staff_list_kyc_applications(p_status)` (`listApplications` in `src/kycApi.ts`).

- **Status** dropdown: `Pending review` (`pending_verification`, the default), `Rejected`, `Approved`,
  `Draft (not submitted)`, or `All`. A **Refresh** button reloads the list.
- Columns: Applicant (`profiles.full_name`, or "Name not provided"), Phone, Status, Submitted (`kyc_submitted_at`),
  Required docs (`uploaded / 3`, shown in red if incomplete, plus "+N other"), Vehicle type (`ais125_type`), Zone,
  Reference (`kyc_reference`, `EK-KYC-000123`).
- Rows are ordered by submission time (oldest first; unsubmitted last). There is no search box and no pagination.
- Only users with a `drivers` row appear, which `upsert_driver_application` creates. A driver-role user who has not
  started the application wizard is not listed.
- Click a row (or focus it and press Enter) to open the detail screen.

### Reviewing: the detail screen

`staff_get_kyc_application(p_driver_id)` returns these cards:

- **Applicant**: name, phone, status, verified, reference, submitted, reviewed, rejection reason, service zone.
- **Licence & medical**: licence number, DL expiry and state, PSV badge, AIS-125 type, EMT level, certificate,
  council and expiry, ACLS, BLS.
- **Vehicle** (the active `driver_vehicles` row): registration, make/model, year, VIN, AIS-125 type, equipment attested.
- **Documents**: one row per uploaded document, with slot (`*` marks a required slot), file name, size, MIME type,
  status (`uploaded` / `accepted` / `rejected`, plus that document's rejection reason), upload time, and an **Open**
  button. A required slot with no upload shows as "Required document not uploaded".

**Required documents** are defined server-side as exactly three slots: `arai_certificate`, `fitness_permit` and
`vehicle_rc` (`submit_kyc`, `_kyc_required_documents_valid`, and the `requiredSlots` the RPC returns). The bucket also
accepts `commercial_dl`, `emt_certificate`, `commercial_insurance` and `puc_certificate`. They are listed if uploaded,
but they are not required.

**Opening a document.** "Open" opens a new tab and points it at a **60-second signed URL** from
`storage.from("driver-kyc-documents").createSignedUrl(path, 60)`. The bucket is private. Storage issues the link only
if `kyc_docs_select_staff` allows it for the staff member's own JWT. Patients, other drivers and anonymous callers
are refused (covered by `kycAdmin.e2e.ts`). If the browser blocks the popup, the row shows "Popup blocked."

### Approve

```text
Admin clicks "Approve" → confirm() dialog ("…The driver becomes verified and can go online.")
  ↓ approveApplication(db, driverId)                         src/kycApi.ts
  ↓ rpc("staff_approve_kyc", { p_driver_id })                20260929000001
  ↓ _require_staff(); refuse own application
  ↓ approve_kyc(p_driver_id, null)                           20260929000002
      kyc_status must be 'pending_verification'                → else not_pending_verification
      _kyc_required_documents_valid(): 3 required slots, each 'uploaded'/'accepted', file exists in the bucket
                                                               → else documents_invalid
      drivers: kyc_status='approved', is_verified=true, kyc_reviewed_at=now(), kyc_reject_reason=null
      driver_documents: every 'uploaded' row → 'accepted'
  ↓ console reloads the detail: "Application approved."
Driver app: next get_driver_profile read returns kycStatus 'approved' → route gate sends the driver to /(shift)/standby
```

Approval does **not** grant `app_metadata.role = 'driver'`. The driver already needs that role to apply.

### Reject

- The **Rejection reason** text box is required (at most 500 characters, and the text is shown to the driver). A blank
  reason is refused in the browser (`reason_required`) and again in `reject_kyc`.
- `staff_reject_kyc(p_driver_id, p_reason)` → `reject_kyc` sets `kyc_status='rejected'`, `is_verified=false`,
  `is_online=false` and `kyc_reject_reason`, and marks every `uploaded` document `rejected` with the same reason.
- Approve and Reject appear only while the status is `pending_verification`. Any other status shows "This application
  is … and cannot be decided now."

### After a rejection

- The driver sees the reason and is returned to the application form (section 10).
- **Every required document that was rejected must be replaced.** Resubmitting unchanged documents fails with
  `documents_invalid` ("A required document was not accepted. Upload a replacement for each rejected document, then
  submit again.").
- `driver_documents` is unique on `(driver_id, slot)`. A replacement uploads a new file and repoints that slot's row,
  and the `driver_documents_reset_review` trigger resets its status to `uploaded`. **The console shows only the current
  file per slot.** Earlier files are not listed, although nothing in the app deletes the old objects from the bucket.
- The resubmission returns to `pending_verification` and reappears in "Pending review" with the same reference.

### What the Admin UI cannot do (SQL or Dashboard only)

| Action | How |
|---|---|
| Create or grant/revoke staff | Section 8 (SQL editor) |
| Grant the `driver` role | Server-side only (section 11, prerequisites) |
| Revoke an **approved** driver | No RPC or UI exists. `approve_kyc` and `reject_kyc` accept only `pending_verification`. |
| Change a single document's status | Not supported. Approve or reject applies to the whole application. |
| Set a custom `kyc_reference` | `approve_kyc(p_driver_id, p_kyc_reference)` as `service_role` only. The console passes `null`. |
| Delete documents or applications | Not supported |

---

## 10. Driver verification lifecycle

`drivers.kyc_status` has exactly four values: `draft`, `pending_verification`, `approved` and `rejected`. The driver
app's route gate (`authRedirectTarget` / `driverKycGate` in `apps/driver/src/hooks/otpAuth.core.ts`, applied in
`apps/driver/app/_layout.tsx`) reads the status from `get_driver_profile`, never from a local flag:

| Server state | Gate | Driver sees |
|---|---|---|
| No `drivers` row (`driver_profile_missing`) | `application` | `/(auth)/onboarding`: the 4-step wizard (License & Type, EMT Details, Vehicle, Statutory Permits) |
| `draft` | `application` | Same wizard |
| `pending_verification` | `pending` | `/(auth)/verification`: **"Application Under Review"**, "Verification in progress", a status pill ("Under review"), the steps *Application submitted ✓ / Documents being reviewed … / Approval decision*, a lock notice "You cannot go online or accept ambulance missions until your application is approved.", a "What happens next" text, **Check status** and **Sign out** |
| `approved` | `approved` | `/(shift)/standby`. Onboarding stays reachable and shows "KYC Approved". |
| `rejected` | `application` | Onboarding with a red "Application not approved" card, the reviewer's `kycRejectReason`, and "Fix the details or documents below and submit again." |
| Profile could not be read | `error` | Index screen: "Could not load your driver status" with **Try again**. The driver never reaches the shift. |

**How status refresh works.** There is **no polling and no realtime push** of KYC state. The driver's profile
(`useDriverProfileStore.load()` → `get_driver_profile`) is re-read:

- when a session is adopted (app start or sign-in, `useServerSync.ts`),
- when the verification screen opens,
- when the driver taps **Check status** (or **Try again**).

The route gate moves the driver as soon as the new state arrives: `approved` → standby, `rejected` → application form.

**What an unapproved driver cannot do** (server-enforced, `not_verified` / PT403, unless noted):

- go online: `set_driver_presence(true, …)` (driver message: "Your KYC is not approved yet. You can go online once it
  is approved.")
- see the booking board: `list_nearby_emergencies`
- claim a mission from the board: `claim_emergency`
- accept an offer: `accept_offer`
- be dispatched: `dispatch_next_wave` selects only `is_online AND is_verified` drivers
- reach any `(shift)` screen (standby, booking, offer, profile). The client route gate enforces this.

---

## 11. End-to-End Driver Verification Test

This is a manual browser and device procedure. **Code reading supports it, but it has not been executed end to end
in a browser** (see the note in section 3 on local phone auth).

### Prerequisites

- `pnpm install` done at the repository root.
- **One Supabase project for both apps.** In practice this is the hosted project `nzwbwuhbtqhhjwnopwmm`, because the
  driver app targets it and phone auth is on there. Set `apps/admin/.env` to that project's URL and anon key, then run
  the section 5 checks against both `.env` files.
- **Staff account** provisioned on that project (section 8), with a phone that can receive the SMS (or a test phone
  number configured in the Dashboard's phone provider settings).
- **Driver account**: a phone user whose `app_metadata.role = 'driver'`. The repository grants this only server-side.
  The hosted e2e uses the service key: `auth.admin.createUser({ phone, phone_confirm: true, app_metadata: { role:
  "driver" } })`. The repository has **no** operator SQL for it. By analogy with the staff SQL, an operator could run
  `update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"driver"}' where phone = '91…';`, and the
  same trigger sets `profiles.role = 'driver'`. That statement is derived, not provided by the repository. Use a phone
  different from the staff phone.
- **Driver device**: Android phone or emulator running the driver dev build, with `apps/driver/.env` filled in (see
  `apps/driver/.env.example`) and Metro running. Sign-in, KYC and Storage use `EXPO_PUBLIC_SUPABASE_URL` directly. Kong
  and Centrifugo (`pnpm services:up`, `pnpm adb:reverse`) are needed for realtime, not for this test.
- Real document files (PDF or image) on the device for the three required slots.

### Step 1: start Admin

```bash
pnpm --filter @sahayak/admin dev      # open http://localhost:5173
```

### Step 2: start Driver

```bash
pnpm dev:driver                       # = pnpm --filter @sahayak/driver dev (Metro); open the dev build on the device
```

### Step 3: driver authentication

Phone entry → enter the driver phone → OTP screen → enter the code. With `app_metadata.role = driver`, the route gate
opens `/(auth)/onboarding`. Without that role you see "This phone number is not registered as an active ambulance
driver." and are signed out.

### Step 4: submit KYC

Complete the wizard. Fields are server-validated, so use real values:

1. **License & Type**: DL number, DL expiry **in the future** (`dl_expired` otherwise), PSV badge, AIS-125 type.
2. **EMT Details**: EMT number and council. EMT expiry, if set, must be in the future. `TYPE_D_ALS` requires ACLS
   (`acls_required`).
3. **Vehicle**: registration (at least 6 characters) and make/model.
4. **Statutory Permits**: upload **ARAI AIS-125 certificate**, **Fitness permit (Form 38)** and **Vehicle RC**. These
   three are required by the client and the server. The other slots are optional. → **Submit**.

The app calls `upsert_driver_application` → saves the vehicle → `submit_kyc`, and the route gate opens **Application
Under Review**.

### Step 5: Admin login

Browser → "Staff phone number" → `+91…` → **Send code** → enter the SMS code → **Verify**. The list appears with the
filter on "Pending review".

### Step 6: find the driver

Find the driver's row in the list (phone, name or `EK-KYC-…` reference). "Required docs" must show `3 / 3`. Click
the row.

### Step 7: review documents

On the detail screen, check the Applicant, Licence & medical and Vehicle cards. Under **Documents**, click **Open** on
each row. Each opens in a new tab through a 60-second link. Allow popups for localhost if prompted.

### Step 8: approve

**Decision** card → **Approve** → confirm the dialog → "Application approved." Status becomes Approved and Verified
becomes Yes. To test rejection instead: type a reason → **Reject** → "Application rejected."

### Step 9: return to the driver

On "Application Under Review", tap **Check status**, or restart the app. Nothing pushes the decision to the device.

### Step 10: verify operational access

- Approved: the gate moves the driver to `/(shift)/standby`. **Go online** now succeeds with a real GPS fix
  (`set_driver_presence(true, lat, lng)`). Before approval it fails with "Your KYC is not approved yet…".
- Rejected: the driver lands on the application form with the reason. Replace each required document, submit again,
  and the application reappears under "Pending review".

Optional database check (SQL editor):

```sql
select id, kyc_status, is_verified, kyc_reference, kyc_reviewed_at, kyc_reject_reason from public.drivers where id = '<driver uuid>';
select slot, status, rejection_reason from public.driver_documents where driver_id = '<driver uuid>';
```

### Automated equivalents (local stack only)

```bash
supabase start
eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY|DB_URL)=')"

# SQL behaviour suites: one transaction, rolled back, no fixture survives
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/kyc_admin.behaviour.sql         # ALL KYC ADMIN CHECKS PASSED
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/kyc_draft_upload.behaviour.sql  # ALL KYC DRAFT UPLOAD CHECKS PASSED
#   no host psql? docker exec -i supabase_db_Ek-Ambulance psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < supabase/tests/kyc_admin.behaviour.sql

# HTTP e2e through this app's service layer. It creates throwaway local users and deletes them. It refuses non-loopback URLs.
SUPABASE_URL="$API_URL" SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  node --experimental-strip-types apps/admin/src/kycAdmin.e2e.ts                       # ALL ADMIN KYC E2E CHECKS PASSED
# add GATEWAY_URL=http://127.0.0.1:8000 to route user calls through Kong started with docker/kong.local.yml
```

---

## 12. Troubleshooting

| Symptom | Likely cause | How to verify | Correct action |
|---|---|---|---|
| Driver doesn't appear / list is empty | Admin and Driver point at different projects (Admin `.env.example` = local, driver = hosted) | Compare `VITE_SUPABASE_URL` with `EXPO_PUBLIC_SUPABASE_URL` (section 5) | Point both at the same project |
| List is empty, same project | Filter is "Pending review" and the driver hasn't submitted, or has no `drivers` row yet | Choose "All". `select id, kyc_status from public.drivers;` | Driver completes and submits the wizard |
| Page says "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set" | Missing `apps/admin/.env` or an empty value | `cat apps/admin/.env` | Copy `.env.example`, fill both, restart `dev` (Vite reads env at start) |
| `dev`/`build` fails: "Refusing to bundle a Supabase secret key" | A service-role or `sb_secret_` key in a `VITE_*` variable | The error names the variable | Use the anon or publishable key |
| Admin app won't start for another reason | Dependencies not installed | `pnpm --filter @sahayak/admin typecheck` | `pnpm install` at the root |
| Opens on 5174 instead of 5173 | 5173 already in use (no `--strictPort`) | Vite prints the URL | Use the printed URL, or free the port |
| "Send code" error (e.g. phone provider disabled / unsupported) | Project has phone auth off. The **local stack as shipped** does. | `curl …/auth/v1/settings` → `"phone":false` | Use a project with phone auth on (hosted) |
| "Send code" error for an unknown number (signups not allowed) | No `auth.users` row for that phone (`shouldCreateUser: false`) | `select id from auth.users where phone='91…'` | Section 8, step 1 |
| Wrong or expired code | OTP error from GoTrue | Message under the form | Re-send the code |
| Signed straight back out: "Your account is not authorised for KYC review." | Signed in, but `app_metadata.role` is not `staff` | `select raw_app_meta_data->>'role' from auth.users where phone='91…'` | Section 8, step 2 |
| "Could not verify staff access (network or gateway error)." | `is_staff` call failed (network, CORS, wrong URL, or migration missing) | `is_staff` curl in section 5 (`PGRST202` = migration missing) | Fix the URL or apply the migrations. If using a gateway, use `kong.local.yml`, not `kong.yml`. |
| "Request failed (…)" mentioning the JWT | Token expired or invalid | Reload the page | Sign out and sign in |
| "Your session has ended. Sign in again." | `unauthenticated` from the server | n/a | Sign in again |
| Document "Cannot open: …" | Not staff (policy refuses to sign), or the object is missing from the bucket | `select name from storage.objects where bucket_id='driver-kyc-documents' and name='<path>'` | Grant staff. A missing file means the driver must re-upload (approval will also refuse). |
| Document: "Popup blocked." | Browser popup blocker | Address bar icon | Allow popups for the console origin |
| No Approve or Reject buttons | Status is not `pending_verification` | Applicant card status | Expected. Only pending applications can be decided. |
| Approve fails: "Cannot approve: a required document is rejected or its file is missing…" | `documents_invalid` from `_kyc_required_documents_valid` | `driver_documents` statuses and `storage.objects` | Reject with a reason so the driver replaces the files |
| Approve or reject: "This application is no longer pending…" | Someone else already decided it | Reload | Reload to see the current state |
| "You cannot review your own application." | Staff user is the driver | n/a | Use a separate staff account |
| "A rejection reason is required." | Empty reason box | n/a | Enter a reason |
| Driver still "Under Review" after approval | No push of KYC state. The app hasn't re-read it, or it reads a different project. | `select kyc_status from public.drivers where id=…` | Tap **Check status**, or restart. Check that the project URLs match. |
| Driver still sees the rejection | Rejection is final until the driver resubmits | `kyc_status = 'rejected'` | Driver replaces every rejected required document and submits. A resubmission without replacements fails with `documents_invalid`. |
| Driver can't go online after approval | No GPS fix (`invalid_location`), or the profile wasn't refreshed | Message on standby. `is_verified` in SQL. | Wait for GPS. Restart the app. |
| Driver: "not registered as an active ambulance driver" | Phone lacks `app_metadata.role = 'driver'` | `raw_app_meta_data->>'role'` | Server-side driver grant (section 11, prerequisites) |

---

## 13. Security notes

- The browser holds only the anon or publishable key and the staff member's own session. `vite.config.ts` refuses
  secret keys in `VITE_*` variables.
- Hiding UI is not the security boundary. Every RPC runs `_require_staff()`, `approve_kyc` and `reject_kyc` are not
  executable by `authenticated`, and Storage enforces `kyc_docs_select_staff`.
- The staff role lives in `app_metadata`, which only the server can write, and is checked against `auth.users` on
  every call, so a revoke is immediate.
- Applicant data is driver-controlled. `src/main.ts` inserts every value as a text node, never as HTML.
- The page sends `<meta name="robots" content="noindex">`.
- Document links are signed for 60 seconds, and opened tabs get `opener = null`.
- Never put the service-role key in `apps/admin/.env`. Keep it in Node test runs only (`kycAdmin.e2e.ts` refuses
  non-local URLs).

## 14. Known limitations

- Phone OTP is the only sign-in, and the local stack ships with phone auth off, so the UI can't be used against
  local Supabase without changing `supabase/config.toml` (not done or tested here).
- No repository test runs the console against the hosted project. `.env.example` documents only local targets.
- No staff-management UI or script. Staff are granted by SQL only (section 8).
- No search, pagination or audit trail of which staff member decided. `approve_kyc` does not record the reviewer.
- No way to revoke an approved driver, or to accept or reject single documents.
- No push of the decision to the driver. The driver re-checks (section 10).
- Previously replaced document files are not visible in the console.
- The driver wizard shows "mandatory" badges on `commercial_dl` and `emt_certificate`, but neither the client
  (`validateCurrentStep`) nor the server requires them. Only `arai_certificate`, `fitness_permit` and `vehicle_rc`
  are required.

## 15. Operations history (driver detail screen)

Below the KYC cards, the detail screen shows the driver's operations history. It is read-only and comes from two staff RPCs in
`supabase/migrations/20261002000000_staff_driver_activity.sql`: `staff_driver_activity` (operational status, today / range /
lifetime totals, one row per day) and `staff_driver_missions` (paged task history with each mission's lifecycle). Both start
with `_require_staff()`, like the KYC RPCs.

- **Task** = one acceptance by the driver (offer or board claim), ended by the mission's next completed / cancelled /
  released event. A task belongs to the **Asia/Kolkata** day it was accepted.
- **Fare** = `missions.final_fare_inr` (set by `transition_mission` COMPLETE). The quote is `fare_details.estimatedTotalInr`.
- **Distance** = billed transport leg `missions.distance_km`, split into GPS-measured km and quote-fallback km.
- **Durations** = differences between server event times (`mission_events.created_at`). A missing event shows "Not recorded".
- **Not available:** online/offline session history. The backend stores only the current `is_online` / `last_seen_at`.

```bash
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/driver_activity.behaviour.sql   # ALL DRIVER ACTIVITY CHECKS PASSED
```
