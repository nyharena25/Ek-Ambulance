# 4. UI/UX Design Philosophy, Design System and User Flows

## 4.1 Design Context

The primary users are a frightened caller standing next to a casualty and an ambulance driver who is often driving.
Both have one hand free, little attention to spare, uncertain connectivity, and for a large share of users Hindi as the
preferred reading language. These conditions invert several conventions of consumer app design. Delight and
discoverability matter less than **speed, legibility and truthfulness**, and an interface that is momentarily wrong is
worse than one that is momentarily empty.

## 4.2 Design Principles

The design rests on six principles. Each is traced to a heuristic from the HCI literature [@nielsen1994] or to an
accessibility criterion [@wcag22], and to the mechanism that enforces it in the code base.

| # | Principle | Rationale | Enforcing mechanism |
|---|---|---|---|
| P1 | **Show only facts the system has.** Never fabricate a name, plate, phone number, ETA, fare or count to fill a layout. | Visibility of system status [@nielsen1994]. A fabricated reassurance in an emergency is a safety hazard. | `pnpm test:integrity` scans 195 files against 28 banned patterns (fake names, plates, ETAs, default vehicle types, hard-coded fallbacks). |
| P2 | **One primary action per screen**, placed in the thumb zone, with a destructive action never adjacent to it. | Error prevention; Fitts's law under motor stress. | Screen review. Cancellation always needs a second confirmation with a reason. |
| P3 | **Timers count to the server's clock.** | A countdown that disagrees between patient and driver destroys trust. | Offer and board timers use the server's `expiresAt` or `dueAt` corrected by a measured clock offset (§6.10). |
| P4 | **Colour is never the only cue.** | WCAG 1.4.1 Use of Color [@wcag22]. Colour-vision deficiency is common. | Triage tiers carry a word and icon. Board timers carry a sign and text (`-00:52`). Connectivity uses words ("Live", "Connecting", "Waiting for GPS", "Paused"). |
| P5 | **Bilingual parity without layout shift.** | Match between system and the real world. Users switch language mid-flow. | Every string lives in `src/i18n/*Strings.ts` with English and Hindi keys. Typography uses identical line heights for Latin and Devanagari (§4.3.2). |
| P6 | **Degrade, don't fail.** | Help users recognise and recover from errors. | Route fallback never rejects. The tracking badge distinguishes "Connecting" from "Paused". "Call 108" is always reachable while searching. |

Principle P1 shaped one visible design change. An earlier matching screen showed a "radar" whose rings filled as the
search moved from the 3 km to the 6 km and 10 km wave, and a footer that claimed "9 AIS-125 certified ambulances
contacted". The count was invented and was removed. The wave indicator was later removed as well. The patient never
receives the server's wave number, and empty waves are skipped instantly (§6.3), so any client-side estimate of the
current radius could be wrong. The current matching screen shows only what is known: when the request was created on
the server, how long ago that was, a permanent "Call 108" action, and cancellation.

## 4.3 Design System (`@sahayak/ui`)

`@sahayak/ui` is a *token-only* package. It contains no components, only typed constants for colour, typography,
spacing, radii, elevation, touch targets and triage presentation, so the three applications share a visual language
without sharing a widget library. A test suite (`designSystem.test.ts`) guards the token structure.

### 4.3.1 Colour

The palette is semantic rather than decorative. A single emergency red is reserved for the primary emergency action and
siren-active states, and three triage families map to START priorities [@benson1996].

| Token family | Base | Surface | Text on surface | Meaning |
|---|---|---|---|---|
| `emergency` | `#DC2626` | `#FEF2F2` | `#B91C1C` | Primary emergency action, siren active |
| `triage.red` | `#EF4444` | `#FEF2F2` | `#991B1B` | CAT-1 Immediate, ALS required |
| `triage.yellow` | `#F59E0B` | `#FFFBEB` | `#78350F` | CAT-2 Urgent, BLS required |
| `triage.green` | `#10B981` | `#ECFDF5` | `#065F46` | CAT-3 Delayed, patient transport |
| `triage.black` | `#1E293B` | — | — | Expectant (defined for completeness, not produced by triage) |

**Contrast audit (defect found and fixed).** We recomputed every ratio documented in the token source with the
WCAG 2.x relative-luminance formula [@wcag22] (script in §7.14). 16 of the 17 annotated values were wrong; only the amber border (3.2:1) was right. The
header called the whole palette "WCAG AAA compliant", which it is not.

| Token(s) | Colour on background | Claimed | Measured | Level |
|---|---|---|---|---|
| `triage.*.textAccessible` on own surface | red / yellow / green | 8.9 / 10.4 / 9.4 | 7.60 / 8.75 / 7.29 | AAA |
| `emergency.dark`, `triage.red.textOnWhite` | `#B91C1C` on white | 7.1 (AAA) | 6.47 | AA |
| `triage.yellow.textOnWhite`, `status.caution` | `#B45309` on white | 7.0 (AAA) | 5.02 | AA |
| `triage.green.textOnWhite` | `#047857` on white | 7.2 (AAA) | 5.48 | AA |
| `status.verified` | `#15803D` on white | 7.1 | 5.02 | AA |
| `status.statutory` | `#1D4ED8` on white | 7.3 | 6.70 | AA |
| `clinicalSurface.slate600` (captions) | `#475569` on white | 7.0 | 7.58 | AAA |
| `clinicalSurface.slate300` (dividers) | `#CBD5E1` on white | 3.1 (non-text) | 1.48 | below 1.4.11 |
| White label on the emergency button | `#FFFFFF` on `#DC2626` | — | 4.83 | AA |

The fix corrects every comment to the measured value without changing any colour, so nothing renders differently. A new
test in `designSystem.test.ts` recomputes the ratios and fails if a `textAccessible` token drops below 7:1 or a
text-on-white token below 4.5:1, so documentation and colour can no longer drift apart. Every text token passes AA. The
three surface-text tokens and the caption colour pass AAA.

**Control boundaries (defect found and fixed).** `slate300` (1.48:1 on white) was used in 138 places across both
apps. WCAG 1.4.11 requires 3:1 only for "visual information required to identify user interface components and
states" [@wcag22]. Each use was therefore classified rather than darkened wholesale, which would have made every card in
the app heavier without an accessibility gain.

| Use | Count | WCAG 1.4.11 | Action |
|---|---|---|---|
| Text inputs and OTP cells (phone, OTP, search, profile, KYC, vitals, hand-off) | 11 | Required: the edge is the only cue that a field exists | → `controlBorder` |
| Checkbox outline (driver onboarding) | 1 | Required | → `controlBorder` |
| Switch "off" track (receipt deletion toggle, on-scene care) | 2 | Required: identifies the off state | → `controlBorder` |
| Card, badge and panel edges; dividers; drag handles | 78 | Not required: decorative grouping | unchanged |
| Buttons, chips and toggles with a text label or icon | 39 | Not required: the label or icon identifies the control | unchanged |
| Disabled button fills | 5 | Exempt: inactive components | unchanged |
| `slate300` as text colour (2 places) | 2 | 1.4.3 applies, but both sit on `slate900` (≈ 12:1) | unchanged |

A new semantic token, `colors.controlBorder` (= `slate500`), records the intent. It measures 4.76:1 on white and 4.55:1 on
`slate50`. The contrast test asserts that it stays at or above 3:1 on both surfaces, and that `slate300` stays below 3:1,
so the two roles cannot be swapped by accident. The change was checked in the browser at a 375 px mobile width. The
sign-in phone field computes `rgb(100, 116, 139)` at rest, and the console shows no errors. The other 13 changed
boundaries sit behind sign-in or an active mission and were verified by code review and the type checker, not
rendered.

### 4.3.2 Typography

Inter is used for Latin script and Noto Sans Devanagari for Hindi, with system fallbacks. The scale runs from 11 to
34 pt in ten steps. Line heights are 1.42–1.57× the font size and are *identical for both scripts*. This clears
Devanagari's upper vowel signs (e.g. े, ी, ं) and lower conjunct marks (e.g. ु, ृ, ्) without clipping, and it means
that switching EN ↔ हिन्दी does not move any container. Devanagari text uses neutral letter spacing because wide
tracking breaks conjunct shaping.

### 4.3.3 Space, shape, elevation and touch

| Token | Values |
|---|---|
| Spacing (4-pt base) | 4, 8, 12, 16, 20, 24, 32, 40, 48 |
| Radii | 0, 6, 10, 16, 20, 24, full |
| Elevation | `sm` (2), `md` (4), `lg` (8), plus a red-tinted `emergency` shadow reserved for the primary call to action |
| Minimum touch target | 48 dp, above WCAG 2.5.5 [@wcag22] and the 44 pt of Apple's guidelines [@appleHig] |

### 4.3.4 Iconography and motion

Icons are typed vector components (`AppIcon`). A refactoring pass replaced 425 raw emoji and glyph usages with 309
typed vector icons so that icons render identically across Android OEM fonts. Motion is used for one purpose only: to
indicate that something is live, for example the pulsing marker of the moving ambulance. It is suppressed when the
operating system's reduced-motion setting is on.

## 4.4 Information Architecture

```
Patient app (expo-router)                     Driver app (expo-router)
/                       entry, session check  /                         entry, session + KYC routing
/(auth)/phone-entry     phone OTP sign-in     /(auth)/phone-entry       phone OTP
/(tabs)/home            emergency CTA, map    /(auth)/otp-verify
/booking/triage         4 questions max       /(auth)/consent           DPDP notice + consent
/booking/category-select AIS-125 A–D          /(auth)/onboarding        KYC wizard + documents
/booking/location-entry pickup pin, search    /(auth)/verification      pending / rejected status
/booking/confirm        statutory fare sheet  /(shift)/standby          go online, GPS health, board card
/booking/matching       search status, 108    /(shift)/offer            incoming offer, 15 s countdown
/booking/[id]           tracking → transport  /(shift)/booking          Booking board (pull)
                        → completion/receipt  /(shift)/profile          vehicle, crew, zone (locked on mission)
/profile                language, consent,    /mission/[id]             navigation → on-scene → hospital
                        erasure request                                  → completion
```

The staff console (`apps/admin`) has two views, the KYC review queue and driver activity history, with no client-side
router.

## 4.5 User Flows

### 4.5.1 Patient booking flow

```
[Home] --"Emergency"--> [Triage Q1: primary complaint]
     chest pain | breathing distress | unconscious ──────────────► CAT-1, ALS (Type D)
     severe trauma ─► [Q2 respiration] ─► [Q3 bleeding] ─► [Q4 responsiveness]
                        any abnormal ─────────────────────────────► CAT-1, ALS (Type D)
                        all normal ───────────────────────────────► CAT-2, BLS (Type C)
     minor injury ────────────────────────────────────────────────► CAT-3, PTA (Type B)
  ─► [Category]  only clinically safe types are live: ALS → D only (screen skipped, 3 steps instead of 4);
                 BLS → C or D; PTA → B, C or D (Type A has no stretcher)
  ─► [Pickup]    GPS fix or search; jurisdiction badge (Delhi / Uttar Pradesh / out of zone)
  ─► [Confirm]   itemised statutory fare: base incl. 5 km + per-km; "no surge" declaration
  ─► create_mission (idempotent) ─► [Matching] elapsed time since server creation, Call 108, Cancel
        ├─ DRIVER_ACCEPTED ─► [Tracking] driver make/colour/crew, live marker, connectivity badge
        │     ├─ DRIVER_ARRIVED ─► on scene
        │     ├─ TRANSPORT_STARTED ─► [Transporting] destination hospital, ETA
        │     ├─ HOSPITAL_ARRIVED / MISSION_COMPLETED ─► [Completion] fare + distance source ("GPS-measured" or "estimate")
        │     └─ DRIVER_RELEASED ─► back to [Matching] (new dispatch round)
        └─ MISSION_CANCELLED(system: no_ambulance_available) ─► [Cancelled] "Call 108 now"
```

The flow is the patient statechart (§6.8, Figure 8.2). The app moves forward only on a server event or a successful RPC
response, never on a local timer.

### 4.5.2 Driver flow

```
[Phone] ─► [OTP] ─► [Consent (DPDP)] ─► [KYC wizard: licence, EMT level, AIS-125 type, vehicle, 3 documents]
  ─► [Verification pending] ──(staff approves)──► [Standby: offline]
[Standby] "Go online" ─► needs: verified + location permission + services on + a real GPS fix
     ├─ refused → specific reason (permission off / location off / waiting for fix) + Settings shortcut
     └─ online: 10 s presence heartbeat with fix age
  ─► offer arrives on driver:{id}:offers ─► [Incoming offer] urgency, type, pickup distance, statutory estimate,
        countdown to server expiresAt (15 s); Accept | Decline
        ├─ accept_offer ok ─► [Navigate to pickup] (OSM map, hand-off to Google Maps)
        │     ─► Arrived ─► [On-scene care] vitals, hospital selection with capacity
        │     ─► Transport ─► [In transit] high-accuracy GPS (3 s / 5 m), background task
        │     ─► At hospital ─► hand-off sign-off ─► Complete ─► [Standby]
        ├─ offer_taken / offer_expired / mission_cancelled ─► message, back to [Standby]
        └─ Decline ─► recorded; next wave opens at once if everyone declined
[Standby] Booking card ─► [Booking board] open requests nearby: green ≤ 4 km, red 4–7 km after 45 s,
        home-screen fallback 7–10 km after 90 s; "Accept and go" ─► claim_emergency
```

### 4.5.3 Staff flow

```
[Sign in (staff role)] ─► [KYC queue: pending first] ─► [Application]
   documents opened via short-lived signed URLs ─► Approve | Reject (reason required) | Revoke
   ─► decision recorded with reviewer id; regulated vehicle fields locked after approval
[Driver activity] ─► per-driver missions and outcomes over a date range
```

## 4.6 Wireframe Concepts

The low-fidelity wireframes below fix layout, hierarchy and the placement of the primary action. They are the design
intent the implemented screens follow.

**W1. Triage (patient), question 1**

```
┌──────────────────────────────────────┐
│ ←  What is the emergency?   EN | हिं │
│──────────────────────────────────────│
│ ┌──────────────────────────────────┐ │
│ │ ♥  Chest pain                    │ │  each option ≥ 48 dp tall,
│ └──────────────────────────────────┘ │  icon + word, no colour coding
│ ┌──────────────────────────────────┐ │  before the answer
│ │ 🫁 Breathing difficulty           │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ ⊘  Unconscious / not responding  │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ ✚  Severe injury / accident      │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ ▢  Minor injury                  │ │
│ └──────────────────────────────────┘ │
│  Describe in your own words (optional)│  → LLM suggestion, never decides
│──────────────────────────────────────│
│        [  CALL 108 INSTEAD  ]        │  secondary, always visible
└──────────────────────────────────────┘
```

**W2. Fare confirmation (patient)**

```
┌──────────────────────────────────────┐
│  Type D · Advanced Life Support      │
│  CAT-1 · Red · Immediate             │  tier = word + colour
│──────────────────────────────────────│
│  Base fare (incl. first 5 km)  ₹500  │
│  Additional 7.7 km × ₹25       ₹193  │
│  EMT / paramedic charges         ₹0  │
│  Surge                       1.0× ₹0 │
│  Estimated total               ₹693  │
│  Regulated non-surge emergency pricing│
│  (statutory order cited after booking)│
│──────────────────────────────────────│
│  [██████ REQUEST AMBULANCE ██████]   │  primary action, thumb zone
└──────────────────────────────────────┘
```

**W3. Matching (patient)**

```
┌──────────────────────────────────────┐
│  Finding an ambulance                │
│  Requested 14:02 · 00:41 elapsed     │  server creation time only
│                                      │
│        (pickup pin on map)           │
│                                      │
│  We will show the ambulance as soon  │
│  as a driver accepts.                │
│──────────────────────────────────────│
│  [   📞  CALL 108   ]   [ Cancel ]   │  cancel asks for a reason
└──────────────────────────────────────┘
```

**W4. Incoming offer (driver)**

```
┌──────────────────────────────────────┐
│  NEW EMERGENCY          ⏱ 00:12      │  counts to server expiresAt
│  CAT-1 · Immediate · Type D (ALS)    │
│  Chest pain · cardiac risk           │  only clinical content shown
│  Pickup 2.4 km · near Ring Road      │
│  Statutory estimate ₹535             │
│──────────────────────────────────────│
│  [  Decline  ]   [████ ACCEPT ████]  │  accept on the thumb side
└──────────────────────────────────────┘
```

**W5. Tracking (patient)**

```
┌──────────────────────────────────────┐
│ ● Live              EN | हिं         │  Live | Connecting | Waiting for GPS | Paused
│ ┌──────────────────────────────────┐ │
│ │   map: ambulance ▲ → ● pickup    │ │  marker glides between pings
│ └──────────────────────────────────┘ │
│  White Force Traveller · 2 crew      │  from DRIVER_ACCEPTED payload
│  Plate shown as registered           │
│  [ 📞 Call driver ]                  │  only if a masked number exists
│  [ Cancel request ]                  │  allowed until transport starts
└──────────────────────────────────────┘
```

**W6. Standby and Booking board (driver)**

```
┌──────────────────────────────────────┐
│  You are OFFLINE                     │
│  GPS: waiting for first fix          │  specific blocker, not generic
│  [ Open Settings ]                   │
│  [████████ GO ONLINE ████████]       │
│──────────────────────────────────────│
│  Booking (3 nearby)          ›       │
│  ┌ green ─ 1.8 km  CAT-2  -00:52 ─┐  │  signed timer: overdue is negative
│  └ red ── 5.1 km  CAT-1   00:07 ──┘  │  tone green/yellow/orange/red + text
└──────────────────────────────────────┘
```

## 4.7 Feedback, Error and Connectivity States

Three kinds of health are kept apart on purpose, so the interface never infers one from another.

1. **Transport health** (socket and subscription): `healthy`, `degraded` (a blip under 10 s), `reconnecting`, and
   `disconnected` (down 30 s or three failed attempts).
2. **GPS health**: `none`, `stale` or `fresh`, with fresh meaning under 30 s, the same window the server uses.
3. **Business state**: driver online or offline, and the mission state, which neither of the above may change.

The patient's tracking badge is derived as `paused` only when the transport is really `disconnected`. Silence on a
channel is never treated as failure, because a mission that is still searching can legitimately be quiet for minutes
(§6.9). Server error codes such as `offer_taken`, `offer_expired`, `already_on_mission`, `not_in_range`,
`active_mission_exists` and `too_many_requests` each map to a specific bilingual message rather than a generic
"something went wrong".

## 4.8 Accessibility and Localisation Summary

- Every interactive element declares an accessibility role and label. A repository search finds 209 uses of
  accessibility roles, live regions and reduced-motion checks across the two mobile apps.
- Status changes that the user did not initiate (a driver accepted, the connection paused) are announced through polite
  live regions.
- The language toggle is available on every screen of the booking flow. Triage rationale, fare declarations and DPDP
  notices are translated, not only the button labels.

## 4.9 Usability Evaluation Status and Protocol

No formal usability study has been conducted. The screens were rendered and checked in React Native Web at 320 px and
360 px widths in both languages, and on an Android device during development, but there has been no study with
representative users. We propose the following protocol as future work. Twelve participants (six Hindi-preferring) will
perform four tasks: book for a chest-pain scenario, cancel during the search, accept an offer as a driver, and recover
from airplane mode during tracking. The protocol measures task success, time on task and errors, followed by the System
Usability Scale [@brooke1996]. Driver tasks must be run in a stationary vehicle for safety.
