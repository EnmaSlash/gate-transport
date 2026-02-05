#!/usr/bin/env bash
# Smoke tests for approve/release hardening.
# Requires: running dev server at BASE_URL (default http://localhost:3000)
#           and a seeded database with at least one gate.
#
# Usage: bash tests/api-smoke.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

check() {
  local label="$1" expected="$2" actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    echo "  PASS  $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $label"
    echo "        expected to contain: $expected"
    echo "        got: $actual"
    FAIL=$((FAIL + 1))
  fi
}

# ---- Setup: create a job ----
echo "==> Creating test job..."
CREATE=$(curl -sf "$BASE_URL/api/jobs" -X POST \
  -H "Content-Type: application/json" \
  -d '{"vin":"1HGBH41JXMN109186","pickupAddress":"123 Main St","dropoffAddress":"456 Oak Ave","price":500,"deliveryDeadline":"2026-12-31T00:00:00Z","carrierName":"Smoke Test Carrier"}')

JOB_ID=$(echo "$CREATE" | sed -n 's/.*"jobId":"\([^"]*\)".*/\1/p')
GATE_ID=$(echo "$CREATE" | sed -n 's/.*"gateId":"\([^"]*\)".*/\1/p')

if [ -z "$JOB_ID" ]; then
  echo "FATAL: could not create job"
  echo "$CREATE"
  exit 1
fi
echo "    jobId=$JOB_ID"

# ---- Test 1: Approve without evidence -> BLOCKED ----
echo "==> Test 1: Approve without evidence"
R=$(curl -s "$BASE_URL/api/jobs/$JOB_ID/approve" -X POST \
  -H "Content-Type: application/json" -d '{"actor":"smoke"}')
check "blocked missing pickup" "BLOCKED_MISSING_PICKUP" "$R"

# ---- Test 2: Release before approval -> Conflict (not releasable) ----
echo "==> Test 2: Release before approval"
R=$(curl -s "$BASE_URL/api/jobs/$JOB_ID/release" -X POST \
  -H "Content-Type: application/json" -d '{"actor":"smoke"}')
check "hold not releasable" "not releasable" "$R"

# ---- Submit all required evidence ----
echo "==> Submitting evidence..."
curl -sf "$BASE_URL/api/jobs/$JOB_ID/evidence" -X POST \
  -H "Content-Type: application/json" \
  -d "{\"items\":[
    {\"type\":\"pickup_photo\",\"storageKey\":\"p1.jpg\"},
    {\"type\":\"pickup_photo\",\"storageKey\":\"p2.jpg\"},
    {\"type\":\"pickup_photo\",\"storageKey\":\"p3.jpg\"},
    {\"type\":\"pickup_photo\",\"storageKey\":\"p4.jpg\"},
    {\"type\":\"delivery_photo\",\"storageKey\":\"d1.jpg\"},
    {\"type\":\"delivery_photo\",\"storageKey\":\"d2.jpg\"},
    {\"type\":\"delivery_photo\",\"storageKey\":\"d3.jpg\"},
    {\"type\":\"delivery_photo\",\"storageKey\":\"d4.jpg\"},
    {\"type\":\"vin_scan\",\"value\":\"1HGBH41JXMN109186\"}
  ]}" > /dev/null

# ---- Test 3: Approve with evidence -> OK ----
echo "==> Test 3: Approve with all evidence"
R=$(curl -s "$BASE_URL/api/jobs/$JOB_ID/approve" -X POST \
  -H "Content-Type: application/json" -d '{"actor":"smoke"}')
check "approve success" '"ok":true' "$R"

# ---- Test 4: Approve again -> idempotent 200 ----
echo "==> Test 4: Approve idempotency"
R=$(curl -s "$BASE_URL/api/jobs/$JOB_ID/approve" -X POST \
  -H "Content-Type: application/json" -d '{"actor":"smoke"}')
check "already approved" "alreadyApproved" "$R"

# ---- Test 5: Release -> OK ----
echo "==> Test 5: Release"
R=$(curl -s "$BASE_URL/api/jobs/$JOB_ID/release" -X POST \
  -H "Content-Type: application/json" -d '{"actor":"smoke"}')
check "release success" '"ok":true' "$R"

# ---- Test 6: Release again -> idempotent 200 ----
echo "==> Test 6: Release idempotency"
R=$(curl -s "$BASE_URL/api/jobs/$JOB_ID/release" -X POST \
  -H "Content-Type: application/json" -d '{"actor":"smoke"}')
check "already released" "alreadyReleased" "$R"

# ---- Test 7: Approve after release -> blocked (RELEASED status) ----
echo "==> Test 7: Approve after release"
R=$(curl -s "$BASE_URL/api/jobs/$JOB_ID/approve" -X POST \
  -H "Content-Type: application/json" -d '{"actor":"smoke"}')
check "blocked released job" "Cannot approve job in status RELEASED" "$R"

# ---- Setup: create a second job for CANCELLED/DISPUTED tests ----
echo "==> Creating second test job..."
CREATE2=$(curl -sf "$BASE_URL/api/jobs" -X POST \
  -H "Content-Type: application/json" \
  -d '{"vin":"2HGBH41JXMN109999","pickupAddress":"789 Elm St","dropoffAddress":"321 Pine Ave","price":300,"deliveryDeadline":"2026-12-31T00:00:00Z","carrierName":"Smoke Carrier 2"}')

JOB2_ID=$(echo "$CREATE2" | sed -n 's/.*"jobId":"\([^"]*\)".*/\1/p')
echo "    jobId=$JOB2_ID"

# Set job to CANCELLED via the API-less direct DB update
node -e "
  const{PrismaClient}=require('@prisma/client');
  const db=new PrismaClient();
  db.transportJob.update({where:{id:'$JOB2_ID'},data:{status:'CANCELLED'}})
    .then(()=>process.exit(0));
" 2>/dev/null

# ---- Test 8: Approve CANCELLED job ----
echo "==> Test 8: Approve CANCELLED job"
R=$(curl -s "$BASE_URL/api/jobs/$JOB2_ID/approve" -X POST \
  -H "Content-Type: application/json" -d '{"actor":"smoke"}')
check "blocked cancelled approve" "Cannot approve job in status CANCELLED" "$R"

# ---- Test 9: Release CANCELLED job ----
echo "==> Test 9: Release CANCELLED job"
R=$(curl -s "$BASE_URL/api/jobs/$JOB2_ID/release" -X POST \
  -H "Content-Type: application/json" -d '{"actor":"smoke"}')
check "blocked cancelled release" "Cannot release job in status CANCELLED" "$R"

# Set job to DISPUTED
node -e "
  const{PrismaClient}=require('@prisma/client');
  const db=new PrismaClient();
  db.transportJob.update({where:{id:'$JOB2_ID'},data:{status:'DISPUTED'}})
    .then(()=>process.exit(0));
" 2>/dev/null

# ---- Test 10: Approve DISPUTED job ----
echo "==> Test 10: Approve DISPUTED job"
R=$(curl -s "$BASE_URL/api/jobs/$JOB2_ID/approve" -X POST \
  -H "Content-Type: application/json" -d '{"actor":"smoke"}')
check "blocked disputed approve" "Cannot approve job in status DISPUTED" "$R"

# ---- Test 11: Release DISPUTED job ----
echo "==> Test 11: Release DISPUTED job"
R=$(curl -s "$BASE_URL/api/jobs/$JOB2_ID/release" -X POST \
  -H "Content-Type: application/json" -d '{"actor":"smoke"}')
check "blocked disputed release" "Cannot release job in status DISPUTED" "$R"

# ---- Summary ----
echo ""
echo "=============================="
echo "  $PASS passed, $FAIL failed"
echo "=============================="

[ "$FAIL" -eq 0 ] || exit 1
