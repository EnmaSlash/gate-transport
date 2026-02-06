import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  TransportJobStatus,
  PaymentHoldStatus,
  PaymentRail,
  GATE_DEFAULTS,
  ApprovalMode,
  isValidPaymentRail,
  isValidApprovalMode,
} from "@/lib/domain";
import { requireAuth } from "@/lib/auth";

const JOB_STATUSES = Object.values(TransportJobStatus) as string[];

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const carrier = url.searchParams.get("carrier");
    const cursor = url.searchParams.get("cursor");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 100);

    const statuses = status ? status.split(",") : [];
    if (statuses.length && !statuses.every((s) => JOB_STATUSES.includes(s))) {
      return NextResponse.json(
        { ok: false, error: "BadRequest", detail: { message: "Invalid status filter", valid: JOB_STATUSES } },
        { status: 400 },
      );
    }

    const where: Record<string, unknown> = {};
    if (statuses.length === 1) where.status = statuses[0];
    else if (statuses.length > 1) where.status = { in: statuses };
    if (carrier) where.carrierName = { contains: carrier, mode: "insensitive" };

    const jobs = await prisma.transportJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { paymentHold: { select: { status: true, amountCents: true, rail: true } } },
    });

    const hasMore = jobs.length > limit;
    const results = hasMore ? jobs.slice(0, limit) : jobs;
    const nextCursor = hasMore ? results[results.length - 1].id : null;

    return NextResponse.json({
      ok: true,
      count: results.length,
      nextCursor,
      jobs: results,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "ServerError", detail: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}

function jsonError(status: number, error: string, detail: any, hint?: string) {
  return NextResponse.json({ ok: false, error, detail, hint }, { status });
}

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return jsonError(400, "BadRequest", "Body must be valid JSON object");
    }

    const vin = body.vin ?? body.VIN ?? body.vehicleVin;
    const pickupAddress = body.pickupAddress ?? body.pickup ?? body.pickup_location;
    const dropoffAddress = body.dropoffAddress ?? body.dropoff ?? body.dropoff_location;
    const price = body.price ?? body.amount ?? body.total;
    const deliveryDeadline = body.deliveryDeadline ?? body.deadline ?? body.delivery_by;
    const carrierName = body.carrierName ?? body.carrier ?? body.carrier_name;
    const approvalModeRaw = body.approvalMode ?? body.approval_mode ?? ApprovalMode.MANUAL;
    const approvalMode = isValidApprovalMode(approvalModeRaw) ? approvalModeRaw : GATE_DEFAULTS.approvalMode;

    const railRaw = body.rail ?? body.paymentRail ?? PaymentRail.ACH;
    const rail = isValidPaymentRail(railRaw) ? railRaw : PaymentRail.ACH;

    const missing: string[] = [];
    if (!vin) missing.push("vin");
    if (!pickupAddress) missing.push("pickupAddress");
    if (!dropoffAddress) missing.push("dropoffAddress");
    if (price === undefined || price === null) missing.push("price");
    if (!deliveryDeadline) missing.push("deliveryDeadline");
    if (!carrierName) missing.push("carrierName");

    if (missing.length) {
      return jsonError(
        400,
        "BadRequest",
        { message: "Missing required fields", missing },
        "Send vin, pickupAddress, dropoffAddress, price, deliveryDeadline, carrierName"
      );
    }

    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      return jsonError(400, "BadRequest", { message: "Invalid price", price });
    }

    const priceCents = Math.round(priceNum * 100);
    if (!Number.isInteger(priceCents) || priceCents <= 0) {
      return jsonError(400, "BadRequest", { message: "Invalid priceCents", priceCents });
    }

    const deadlineDate = new Date(deliveryDeadline);
    if (Number.isNaN(deadlineDate.getTime())) {
      return jsonError(400, "BadRequest", { message: "Invalid deliveryDeadline", deliveryDeadline });
    }

    const job = await prisma.transportJob.create({
      data: {
        vin: String(vin),
        pickupAddress: String(pickupAddress),
        dropoffAddress: String(dropoffAddress),
        priceCents,
        deliveryDeadline: deadlineDate,
        carrierName: String(carrierName),
        status: TransportJobStatus.DRAFT,

        gate: {
          create: {
            approvalMode,
            requirePickupPhotos: GATE_DEFAULTS.requirePickupPhotos,
            requireDeliveryPhotos: GATE_DEFAULTS.requireDeliveryPhotos,
            requireVin: GATE_DEFAULTS.requireVin,
            requirePod: GATE_DEFAULTS.requirePod,
            minPickupPhotos: GATE_DEFAULTS.minPickupPhotos,
            minDeliveryPhotos: GATE_DEFAULTS.minDeliveryPhotos,
          },
        },

        paymentHold: {
          create: {
            amountCents: priceCents,
            rail,
            status: PaymentHoldStatus.HELD,
          },
        },
      },
      include: {
        gate: true,
        paymentHold: true,
      },
    });

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      job,
      gate: (job as any).gate ?? null,
      paymentHold: (job as any).paymentHold ?? null,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "ServerError",
        detail: {
          message: err?.message ?? "Unknown error",
          name: err?.name,
          code: err?.code,
          meta: err?.meta,
        },
      },
      { status: 500 }
    );
  }
}
