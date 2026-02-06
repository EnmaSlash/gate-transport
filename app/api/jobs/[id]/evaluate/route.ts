import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DecisionAction } from "@/lib/domain";
import { runGateEvaluation } from "@/lib/evaluateGate";
import { requireAuth, formatActor } from "@/lib/auth";

type Ctx = { params?: Promise<{ id: string }> | { id: string } };

async function getJobId(req: Request, context: Ctx): Promise<string | null> {
  try {
    const p = context?.params;
    if (p && typeof (p as Promise<{ id: string }>).then === "function") {
      const awaited = await (p as Promise<{ id: string }>);
      if (awaited?.id) return String(awaited.id);
    } else if (p && typeof p === "object" && "id" in p) {
      if ((p as { id: string }).id) return String((p as { id: string }).id);
    }
  } catch {}

  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.findIndex((x) => x === "jobs");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return null;
}

export async function POST(req: Request, context: Ctx) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const actor = formatActor(auth);

  const jobId = await getJobId(req, context);
  if (!jobId) {
    return NextResponse.json(
      { ok: false, error: "Missing job id", got: null },
      { status: 400 }
    );
  }

  try {
    const job = await prisma.transportJob.findUnique({
      where: { id: jobId },
      include: { gate: true, evidence: true },
    });

    if (!job) {
      return NextResponse.json(
        { ok: false, jobId, error: "Job not found" },
        { status: 404 }
      );
    }

    const gate = job.gate;
    const evidence = job.evidence ?? [];

    const result = runGateEvaluation(
      { vin: job.vin, deliveryDeadline: job.deliveryDeadline },
      {
        requirePickupPhotos: gate.requirePickupPhotos,
        requireDeliveryPhotos: gate.requireDeliveryPhotos,
        requireVin: gate.requireVin,
        requirePod: gate.requirePod,
        minPickupPhotos: gate.minPickupPhotos ?? 0,
        minDeliveryPhotos: gate.minDeliveryPhotos ?? 0,
      },
      evidence.map((e) => ({ type: e.type, note: e.note }))
    );

    const logCode = result.pass ? "PASS" : "BLOCKED";
    await prisma.decisionLog.create({
      data: {
        jobId,
        action: DecisionAction.EVALUATE,
        actor,
        reason: result.code,
        evidenceSnapshot: {
          code: logCode,
          gateCode: result.code,
          pass: result.pass,
          missing: result.missing,
          counts: result.counts,
          gate: {
            minPickupPhotos: gate.minPickupPhotos,
            minDeliveryPhotos: gate.minDeliveryPhotos,
            requireVin: gate.requireVin,
            requirePod: gate.requirePod,
          },
          deliveryDeadline: job.deliveryDeadline?.toISOString() ?? null,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      jobId,
      pass: result.pass,
      code: result.code,
      missing: result.missing,
      counts: result.counts,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: "Evaluate failed",
        detail: e instanceof Error ? e.message : String(e),
        jobId,
      },
      { status: 500 }
    );
  }
}
