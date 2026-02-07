# gate-transport — Project Overview

*Last updated: 2026-02-06*

## What It Is (Axis Language)

**gate-transport** is a **Permissioned Capital mini-engine** scoped to transport custody:

```
Evidence → Gate evaluation → Payment permission → Release
```

Core components:
- **Explicit states** — DRAFT → ASSIGNED → ACCEPTED → PICKUP_CONFIRMED → DELIVERY_SUBMITTED → RELEASABLE → RELEASED
- **Deterministic rule evaluation** — Gate checks are pure functions, same input = same output
- **Audit log** — DecisionLog captures every action with evidence snapshots
- **Dispute branch** — Explicit path for contested deliveries

### Axis Relationship

This fits the Axis worldview as a **downstream executor / specialized subsystem**, not Axis itself.

> **North Star:** Gate-transport is a custody-scoped permissioned capital engine; checks are a vendor-spend-scoped one.

The pattern is reusable:
- **Transport:** Evidence → gate rules → payment permission → release
- **Check writing:** Invoice evidence → gate rules (VIN exists? vendor verified? cost category allowed? buyer approval?) → payment intent → QB check print → audit

**Axis stays the law; Control Room is the court; these are clerks/executors.**

---

## Core Principles

### Truth Before Convenience

1. **No silent transitions** — Every state change must be logged with reason
2. **No fake deletes** — Redaction must be a state machine, not fire-and-forget
3. **Facts unlock permissions** — Identity/evidence must be explicit before allowing actions
4. **Canonical formatting** — Normalize data at ingestion boundaries (VINs, emails, etc.)

### Link > Login

Drivers should never have to "find the job." The system drops them onto the one job they're working on.

- One link per job
- No job list for carriers
- Link selects the job; VIN scan confirms reality

---

## Carrier Flow (Post-CentralDispatch)

### The Reality

CentralDispatch is just matching + messaging. Once a driver accepts there, you need a **job-bound handoff** into gate-transport via a link.

### Flow

#### 1. Dispatch on CentralDispatch
Driver accepts the load.

#### 2. Assign Carrier in gate-transport
Enter:
- Carrier name
- Carrier phone (prefer SMS) and/or email
- Agreed price
- Pickup + delivery locations
- VIN (full VIN preferred)

System generates: **Carrier Job Link**
```
https://app.yourdomain.com/c/{token}
```

Properties:
- Scoped to exactly one TransportJob
- Time-bound (optional)
- No login required
- Permission-limited (carrier can only submit evidence + status updates)

**Paste link to driver in CentralDispatch chat (and optionally SMS it).**

#### 3. Pickup (same link)
Driver opens link → sees one job only.

UI shows:
- VIN (masked, like last 6 + confirm step)
- Pickup address
- Required pickup evidence checklist (Gate)

Driver:
1. Taps "Start Pickup"
2. Uploads photos
3. Optional VIN scan / last-6 entry
4. Submits "Pickup Confirmed"

System logs:
- Evidence uploaded (immutable record)
- Pickup confirmed (state transition)

**If VIN scan doesn't match job VIN → block submission ("VIN mismatch"), require admin override.**

#### 4. Delivery (SAME link again)
When opened later, UI is now in "Delivery" mode:
- Delivery address
- Delivery evidence checklist
- POD upload / signature photo
- "Delivery Submitted"

System evaluates gate:
- **Pass + approvalMode=auto** → RELEASABLE
- **Fail** → stays DELIVERY_SUBMITTED with explicit missing items
- **Shipper/admin approve** → RELEASABLE
- **Dispute** → DISPUTED

Then release happens (manual or rule-based), always logged.

### Why Not VIN-First Lookup?

Tempting, but it's a trap unless you have strong identity + collision handling.

Problems:
- Drivers haul multiple cars
- VINs can be mistyped
- Last-6 collisions exist
- "Finding a job by VIN" creates ambiguity → ambiguity must block

**Safe version:** VIN scan is validation, not lookup.
- Link selects the job
- VIN scan proves the driver is touching the right vehicle

---

## UI Rules (Driver Confusion → Near Zero)

1. **One link per job**
2. **No job list for carriers**
3. **Big "What do I do next?" at top**
4. **Checklist gating** (show remaining items)
5. **Offline-friendly uploads** (queue if signal drops)
6. **Clear "Submitted ✅ / Needs more ❌" state**

---

## Tech Stack

- Next.js 16 (app router) + TypeScript
- Prisma + PostgreSQL
- Cloudflare R2 for file storage
- JWT + API key auth
- Vitest for testing
