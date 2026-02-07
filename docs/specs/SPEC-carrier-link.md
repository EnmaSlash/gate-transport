# Carrier Job Link — Technical Spec

*Last updated: 2026-02-06*

## Overview

A single, job-scoped link that carriers use for the entire lifecycle: acceptance → pickup → delivery.

**Link beats "go to the website" every time.**

---

## Link Format

```
https://app.yourdomain.com/c/{token}
```

Where `{token}` is a secure, unguessable identifier.

---

## Token Design Options

### Option A: Signed JWT (Recommended)
```typescript
// Generate
const token = await new SignJWT({ jobId, carrierEmail })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('7d')
  .sign(getCarrierLinkSecret());

// Verify
const { payload } = await jwtVerify(token, getCarrierLinkSecret());
const { jobId, carrierEmail } = payload;
```

Pros:
- Self-contained (no DB lookup to validate)
- Built-in expiry
- Can include carrier identity

Cons:
- Can't revoke without blacklist
- Slightly longer URL

### Option B: Random Token + DB Lookup
```typescript
// Generate
const token = crypto.randomUUID();
await prisma.carrierLink.create({
  data: { token, jobId, carrierEmail, expiresAt: addDays(7) }
});

// Verify
const link = await prisma.carrierLink.findUnique({ where: { token } });
if (!link || link.expiresAt < new Date()) throw new Error('Invalid');
```

Pros:
- Revocable
- Can track usage

Cons:
- DB lookup on every request

### Recommendation

Use **Option A (JWT)** for simplicity. Add revocation later if needed via a `revokedTokens` table.

---

## Database Changes

### New Table: CarrierInvite (for identity binding)

```prisma
model CarrierInvite {
  id           String       @id @default(uuid())
  jobId        String       @unique
  job          TransportJob @relation(fields: [jobId], references: [id])
  carrierEmail String
  carrierPhone String?
  token        String       @unique  // The JWT or random token
  acceptedAt   DateTime?
  expiresAt    DateTime
  createdAt    DateTime     @default(now())
}
```

### New Status: ASSIGNED_PENDING_ACCEPTANCE

Add to JobStatus enum:
```prisma
enum JobStatus {
  DRAFT
  ASSIGNED_PENDING_ACCEPTANCE  // NEW
  ASSIGNED                     // Renamed from old ASSIGNED (after acceptance)
  ACCEPTED
  // ...rest
}
```

Or simpler: keep ASSIGNED but check `CarrierInvite.acceptedAt` before allowing state mutations.

---

## API Endpoints

### POST /api/jobs/{id}/invite
Creates carrier invite and generates link.

**Request:**
```json
{
  "carrierEmail": "driver@example.com",
  "carrierPhone": "+15551234567",  // optional
  "carrierName": "John's Hauling"
}
```

**Response:**
```json
{
  "ok": true,
  "inviteLink": "https://app.yourdomain.com/c/eyJhbGc...",
  "expiresAt": "2026-02-13T12:00:00Z"
}
```

### GET /c/{token}
Carrier-facing page. No auth required.

**Behavior:**
1. Verify token (JWT or DB lookup)
2. Fetch job + gate + evidence
3. Determine current phase:
   - **Not accepted** → Show "Accept Job" screen
   - **Accepted, not picked up** → Show "Pickup" screen
   - **Picked up, not delivered** → Show "Delivery" screen
   - **Delivered** → Show "Complete" screen
4. Render appropriate UI

### POST /api/c/{token}/accept
Carrier accepts the job.

**Response:**
```json
{
  "ok": true,
  "jobId": "...",
  "status": "ACCEPTED"
}
```

### POST /api/c/{token}/pickup
Submit pickup confirmation + evidence.

**Request:**
```json
{
  "vinLast6": "109186",  // Optional confirmation
  "evidenceIds": ["uuid1", "uuid2", "uuid3", "uuid4"]
}
```

### POST /api/c/{token}/delivery
Submit delivery confirmation + evidence.

**Request:**
```json
{
  "evidenceIds": ["uuid5", "uuid6", "uuid7", "uuid8"],
  "podEvidenceId": "uuid9"  // If POD required
}
```

### POST /api/c/{token}/evidence
Upload evidence (photo, VIN scan, etc.)

Same as existing `/api/jobs/{id}/evidence` but scoped to token's job.

---

## UI Screens (Carrier App)

### Screen 1: Accept Job
```
┌─────────────────────────────┐
│  🚛 New Transport Job       │
│                             │
│  VIN: ****109186            │
│  Pickup: Houston, TX        │
│  Delivery: Dallas, TX       │
│  Pay: $450                  │
│                             │
│  [    Accept Job    ]       │
│                             │
│  By accepting, you agree... │
└─────────────────────────────┘
```

### Screen 2: Pickup
```
┌─────────────────────────────┐
│  📍 Pickup                  │
│  123 Main St, Houston TX    │
│                             │
│  ✅ Front photo             │
│  ✅ Rear photo              │
│  ✅ Driver side             │
│  ⬜ Passenger side (1 more) │
│  ⬜ VIN confirmation        │
│                             │
│  [  Upload Photo  ]         │
│  [  Scan VIN      ]         │
│                             │
│  [Confirm Pickup] (disabled)│
└─────────────────────────────┘
```

### Screen 3: Delivery
```
┌─────────────────────────────┐
│  📍 Delivery                │
│  456 Oak Ave, Dallas TX     │
│                             │
│  ✅ Front photo             │
│  ✅ Rear photo              │
│  ✅ Driver side             │
│  ✅ Passenger side          │
│  ⬜ Proof of Delivery       │
│                             │
│  [  Upload Photo  ]         │
│  [  Get Signature ]         │
│                             │
│  [Submit Delivery] (disabled│
└─────────────────────────────┘
```

### Screen 4: Complete
```
┌─────────────────────────────┐
│  ✅ Delivery Submitted      │
│                             │
│  Waiting for shipper review │
│                             │
│  Status: DELIVERY_SUBMITTED │
│                             │
│  You'll be notified when    │
│  payment is released.       │
└─────────────────────────────┘
```

---

## Security Considerations

1. **Token expiry** — 7 days default, configurable per job
2. **Rate limiting** — Limit evidence uploads per token (e.g., 20/hour)
3. **VIN mismatch blocking** — If scanned VIN doesn't match, block submission
4. **No browsing** — Token only grants access to ONE job
5. **Audit logging** — Log all actions with token identifier

---

## SMS Integration (Optional)

When creating invite, optionally send SMS:

```typescript
await sendSMS(carrierPhone, 
  `New transport job: ${vin.slice(-6)} from ${pickup} to ${delivery}. ` +
  `Accept here: ${inviteLink}`
);
```

Use Twilio, AWS SNS, or similar.
