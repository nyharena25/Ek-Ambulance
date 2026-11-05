# 2. Introduction

## 2.1 Background and Motivation

Road traffic injury is one of India's largest public-health burdens. The Ministry of Road Transport and Highways
reported more than 480,000 accidents and 172,000 deaths in 2023, the highest number recorded, with young adults aged 18
to 45 most affected and Uttar Pradesh reporting the highest mortality [@morth2023]. Trauma audits at Indian centres show
that a substantial share of these deaths is potentially preventable and that prehospital delay is a recurring
contributor [@roy2017; @dar2025]. The "golden hour" doctrine [@ummcGoldenHour] condenses the clinical intuition that
outcomes worsen as definitive care is delayed. The quantitative evidence is more nuanced. Blackwell and Kaufman found a
survival benefit from very short response intervals for the most critically ill patients [@blackwell2002], whereas
Pons and Markovchick found no outcome difference attributable to the eight-minute guideline in a trauma population
[@pons2002]. A design that cannot shorten every response can still remove the avoidable components of delay. These are
the time spent finding an available, appropriate vehicle and the uncertainty that makes callers hesitate.

India's principal public system, the 108 Emergency Response Service, is a centralised, call-centre-driven network that
handles tens of thousands of emergencies per day [@emri108]. Its scale is unmatched, but its interaction model has three
structural limitations. A caller cannot see the location of the assigned vehicle. The caller is not told the vehicle's
clinical capability. Private ambulance operators, who make up a large share of the urban fleet, are not aggregated.
Private bookings, in turn, are often arranged by telephone with opaque, negotiated prices. Patients in distress have no
reference against which to judge them.

The Automotive Industry Standard AIS-125 already defines four road-ambulance categories with specified equipment, from
Type A (first responder) to Type D (advanced life support) [@ais125p1; @ais125p2]. The Digital Personal Data Protection
(DPDP) Act 2023 and its 2025 Rules define how health-adjacent personal data must be handled [@dpdp2023]. A digital
platform can therefore be designed against concrete regulatory artefacts instead of ad-hoc categories.

## 2.2 Problem Statement

We study the following problem. A patient (or bystander) at pickup location *p* inside the service region (Delhi or
Uttar Pradesh) issues an emergency request. Answers to a short triage questionnaire determine an urgency tier
*u* ∈ {CAT-1 Immediate, CAT-2 Urgent, CAT-3 Delayed} and a minimum care level, which maps to a required AIS-125 vehicle
type τ. The system must:

1. **Find a responder.** Within seconds, identify drivers who are verified, online, present, physically near *p*, of
   type exactly τ, and not already committed to another mission. Offer them the mission and assign it to *exactly one*
   who accepts.
2. **Keep everyone synchronised.** Let the patient and the assigned driver observe every subsequent state change
   (`en_route → on_scene → transporting → arrived_hospital → completed`, or a cancellation) in the same order, with low
   latency, and recover after a disconnection.
3. **Price transparently and lawfully.** Quote a statutory, surge-free fare before booking and bill a final fare whose
   distance source is disclosed.
4. **Withstand adversarial clients.** Do all of the above although any client binary may be modified: no client may
   assign itself, alter a fare, read another person's mission, or impersonate a driver's location.
5. **Respect data-protection law.** Collect only what is necessary, record consent, honour erasure, and purge personal
   data after a retention period [@dpdp2023].

## 2.3 Technical Challenges

The problem is hard for reasons that go beyond building a booking form. We group them into seven challenges, which the
rest of the report addresses explicitly.

| # | Challenge | Why it is difficult | Addressed in |
|---|---|---|---|
| C1 | **Trust boundary** | Mobile clients run on uncontrolled devices; any decision taken on the client can be forged. | §5.2, §5.9 |
| C2 | **Exclusive assignment under concurrency** | Several drivers accept the same offer at once; one driver may accept two offers at once; concurrent waves may target the same free driver. | §6.5, §7.4 |
| C3 | **Timeliness of escalation** | A periodic scheduler and offer expiry interact. A naïve design leaves "dead windows" in which nobody can accept and nothing escalates. | §6.4, §7.10 |
| C4 | **Location truthfulness** | A heartbeat can carry a stale fix. Phone clocks are skewed. GPS fixes are noisy, and the final fare depends on them. | §6.12, §6.13 |
| C5 | **Ordered, recoverable realtime delivery** | WebSockets drop. Messages can be duplicated or arrive out of order, and silence is not evidence of failure. | §5.8, §6.8, §6.9 |
| C6 | **Usability under acute stress** | Users are frightened, may have low literacy, and switch between English and Hindi. Timers must not lie, and colour alone must not carry meaning. | §4 |
| C7 | **Regulatory conformance** | AIS-125 categories, state tariff orders, no surge pricing, and DPDP consent, erasure and residency requirements. | §5.5, §5.9 |

## 2.4 Value Proposition

| Stakeholder | Current pain | What Ek-Ambulance provides |
|---|---|---|
| Patient or caller | Does not know when help will arrive, what kind of vehicle is coming, or what it costs. | A guided triage that recommends the right ambulance category. A pre-booking statutory fare. A live search visualisation, then a live map of the assigned ambulance with its make, colour and crew size. A receipt that states whether the billed distance was GPS-measured or estimated. |
| Ambulance driver or operator | Leads arrive by telephone, unverified and unpriced. | Verified offers matched to the driver's own vehicle category, with a server-timed countdown. A pull-based board for requests that nearby drivers did not take. One active mission at a time, enforced by the server. |
| Platform staff | Manual, paper-based verification of drivers and vehicles. | A KYC console with private document storage, signed short-lived document links, and approve, reject and revoke actions that record the reviewer. A per-driver activity history. |
| Regulator or public system | Private fleets are invisible. Prices are unregulated in practice. | AIS-125-aligned categorisation, a surge-free tariff enforced by a database constraint, an append-only audit trail of every mission transition, and DPDP-oriented consent, erasure and retention mechanisms. |

## 2.5 Contributions

This report makes the following contributions.

1. **A server-authoritative dispatch architecture with no application server.** All business rules live in
   transactional PostgreSQL functions next to the data, while clients are thin state renderers (§5). We argue
   that this choice, unusual for consumer applications, is well matched to safety-critical dispatch built by a small
   team, and we state its costs.
2. **A wave-based dispatch protocol with formal invariants.** We specify the protocol in pseudocode with its complexity
   (§6.3–6.6) and prove that no driver can hold two active missions. The invariant is enforced by lock ordering and,
   redundantly, by a partial unique index.
3. **A shared, pure domain core with drift tests.** One TypeScript package defines triage, tariff, wire contracts and
   lifecycle statecharts for three clients. Static tests fail when its constants diverge from the SQL.
4. **An empirical characterisation** of the client compute cost, the realtime plane (latency, fan-out, throughput, CPU
   and memory) and gateway protection, measured on the running system with reproducible scripts (§7).
5. **A Monte Carlo model of escalation timeliness.** It quantifies the effect of the scheduler redesign and is
   validated against the closed-form Poisson coverage probability (§7.10).
6. **An honest account of limitations and defects** found by the evaluation itself, including two new findings
   reported and fixed here for the first time: a date-parsing constant in the O(n log n) board sort, and contrast
   claims in the design tokens that did not match the colours.

## 2.6 Scope and Non-Goals

The platform is a booking, dispatch and tracking system. It is **not** a diagnostic or clinical-decision system.
Triage is a decision-support aid whose output only constrains the vehicle category. It does **not** replace the 108
service, which the patient application points to whenever no ambulance accepts. Payments, telephony masking,
server-side push notifications, SMS fallback and integration with hospital information systems are out of scope for the
version described. The evaluation is a software-engineering evaluation. It does not measure clinical outcomes and makes
no claim about real-world response times.

## 2.7 Organisation of the Report

Section 3 reviews related work and justifies each technology choice against its alternatives. Section 4 presents the
user-experience design and the design system. Section 5 describes the system architecture, data model, API and security
protocols. Section 6 gives the core algorithms in pseudocode with complexity analysis. Section 7 reports the
experiments, discusses the results and concludes. Section 8 collects the diagrams in draw.io-importable form, and
Section 9 lists the references.
