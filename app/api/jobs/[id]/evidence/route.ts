import { EvidenceType as PrismaEvidenceType } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  EvidenceType,
  isValidEvidenceType,
  DecisionAction,
} from "@/lib/domain";
import { getAuthFromHeaders, requireAuth, formatActor } from "@/lib/auth";
import { requireCarrierAuth } from "@/lib/authCarrier";

type Ctx = { params: Promise<{ id: string }> };

/** Photo types require storageKey (stored in fileUrl). */
const PHOTO_TYPES: readonly string[] = [
  EvidenceType.PICKUP_PHOTO,
  EvidenceType.DELIVERY_PHOTO,
  EvidenceType.VIN_PHOTO,
];

/** Types that require value (stored in note). */
const VALUE_TYPES: readonly string[] = [
  EvidenceType.POD,
  EvidenceType.NOTE,
];

type ItemInput = {
  type: string;
  storageKey?: string;
  value?: string;
  meta?: Record<string, unknown>;
};

function parseMeta(meta: unknown): { gpsLat?: number; gpsLng?: number; submittedBy?: string } {
  if (meta == null || typeof meta !== "object") return {};
  const m = meta as Record<string, unknown>;
  return {
    gpsLat: typeof m.gpsLat === "number" ? m.gpsLat : undefined,
    gpsLng: typeof m.gpsLng === "number" ? m.gpsLng : undefined,
    submittedBy: typeof m.submittedBy === "string" ? m.submittedBy : undefined,
  };
}

export async function POST(req: Request, context: Ctx) {
  try {
    const { id: jobId } = await context.params;

    if (!jobId) {
      return NextResponse.json(
        { ok: false, error: "Missing job id", got: jobId ?? null },
        { status: 400 }
      );
    }

    const headerUser = getAuthFromHeaders(req);
    let submitter: string;
    let carrier: { reason: string } | null = null;

    if (headerUser) {
      const auth = requireAuth(req);
      if (auth instanceof NextResponse) return auth;
      submitter = formatActor(auth);
    } else {
      const carrierAuth = await requireCarrierAuth(req, jobId);
      if (carrierAuth instanceof NextResponse) return carrierAuth;
      submitter = carrierAuth.actor;
      carrier = carrierAuth;
    }

    const job = await prisma.transportJob.findUnique({
      where: { id: jobId },
      select: { id: true, vin: true },
    });
    if (!job) {
      return NextResponse.json(
        { ok: false, jobId, error: "Job not found" },
        { status: 404 }
      );
    }

    let body: { items?: unknown[] } | null = null;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          ok: false,
          jobId,
          error: "Invalid JSON body",
          hint: 'Body must be JSON: { "items": [ { "type", "storageKey"|"value", "meta"? } ] }',
        },
        { status: 400 }
      );
    }

    const rawItems = Array.isArray(body?.items) ? body.items : null;
    if (!rawItems) {
      return NextResponse.json(
        {
          ok: false,
          jobId,
          error: "Invalid input",
          expected: { items: "array" },
          got: body ?? null,
        },
        { status: 400 }
      );
    }

    const items: ItemInput[] = rawItems.map((it: unknown) => {
      if (it == null || typeof it !== "object") return { type: "", meta: undefined };
      const o = it as Record<string, unknown>;
      return {
        type: typeof o.type === "string" ? o.type : "",
        storageKey: typeof o.storageKey === "string" ? o.storageKey : undefined,
        value: typeof o.value === "string" ? o.value : undefined,
        meta: o.meta != null && typeof o.meta === "object" ? (o.meta as Record<string, unknown>) : undefined,
      };
    });

    const errors: string[] = [];
    items.forEach((it, i) => {
      if (!isValidEvidenceType(it.type)) {
        errors.push(`items[${i}].type must be one of: ${Object.values(EvidenceType).join(", ")}`);
        return;
      }
      if (PHOTO_TYPES.includes(it.type) && !it.storageKey) {
        errors.push(`items[${i}]: storageKey required for type "${it.type}"`);
      }
      if (VALUE_TYPES.includes(it.type) && it.type !== EvidenceType.NOTE && !it.value) {
        errors.push(`items[${i}]: value required for type "${it.type}"`);
      }
    });
    if (errors.length) {
      return NextResponse.json(
        { ok: false, jobId, error: "Validation failed", details: errors },
        { status: 400 }
      );
    }

    // VIN proof is photo evidence (vin_photo). Any optional text entries are treated as notes.

    const existing = await prisma.evidence.findMany({
      where: { jobId },
      select: { type: true, fileUrl: true, note: true },
    });

    // Dedupe: same jobId + type + storageKey (photos) or type + value (vin/pod/note)
    const existingKeys = new Set<string>();
    for (const e of existing) {
      if (PHOTO_TYPES.includes(e.type)) {
        existingKeys.add(`${e.type}\0${e.fileUrl ?? ""}`);
      } else {
        existingKeys.add(`${e.type}\0${e.note ?? ""}`);
      }
    }

    const toCreate: {
      jobId: string;
      type: PrismaEvidenceType;
      fileUrl: string | null;
      note: string | null;
      gpsLat: number | null;
      gpsLng: number | null;
      submittedBy: string | null;
    }[] = [];
    let skipped = 0;

    for (const it of items) {
      const type = it.type as PrismaEvidenceType;
      const isPhoto = PHOTO_TYPES.includes(it.type);
      const fileUrl = isPhoto && it.storageKey ? it.storageKey : null;
      const valueForNote = VALUE_TYPES.includes(it.type) && it.value != null ? it.value : null;
      const noteForMeta = it.meta ? JSON.stringify(it.meta) : null;
      const note = valueForNote ?? noteForMeta;

      const dedupeKey = isPhoto
        ? `${type}\0${fileUrl ?? ""}`
        : `${type}\0${valueForNote ?? ""}`;
      if (existingKeys.has(dedupeKey)) {
        skipped += 1;
        continue;
      }

      const { gpsLat, gpsLng } = parseMeta(it.meta);
      toCreate.push({
        jobId,
        type,
        fileUrl,
        note,
        gpsLat: gpsLat ?? null,
        gpsLng: gpsLng ?? null,
        submittedBy: submitter,
      });
      existingKeys.add(dedupeKey);
    }

    await prisma.$transaction(async (tx) => {
      if (toCreate.length) {
        await tx.evidence.createMany({ data: toCreate });
      }
      await tx.decisionLog.create({
        data: {
          jobId,
          action: DecisionAction.EVIDENCE_UPLOAD as any,
          actor: submitter,
          reason: carrier
            ? `${carrier.reason} | inserted=${toCreate.length} skipped=${skipped}`
            : `inserted=${toCreate.length} skipped=${skipped}`,
        },
      });
    });

    const allEvidence = await prisma.evidence.findMany({
      where: { jobId },
      select: { type: true },
    });
    const countsByType: Record<string, number> = {};
    for (const e of allEvidence) {
      countsByType[e.type] = (countsByType[e.type] ?? 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      jobId,
      inserted: toCreate.length,
      skipped,
      countsByType,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: "Evidence upload failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
