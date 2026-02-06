import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, formatActor } from "@/lib/auth";
import { deleteObject } from "@/lib/r2";
import { DecisionAction } from "@/lib/domain";
import { type DecisionAction as PrismaDecisionAction } from "@prisma/client";

type Ctx = { params: Promise<{ id: string; evidenceId: string }> };

export async function POST(req: Request, context: Ctx) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const actor = formatActor(auth);

  try {
    const { id: jobId, evidenceId } = await context.params;

    if (!jobId || !evidenceId) {
      return NextResponse.json(
        { ok: false, error: "BadRequest", detail: "Missing jobId or evidenceId" },
        { status: 400 },
      );
    }

    // Parse body
    let body: { reason?: string; deleteFromR2?: boolean } | null = null;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "BadRequest", detail: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const reason = body?.reason;
    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "BadRequest", detail: "reason is required" },
        { status: 400 },
      );
    }

    const deleteFromR2 = body?.deleteFromR2 === true;

    // Verify job exists
    const job = await prisma.transportJob.findUnique({
      where: { id: jobId },
      select: { id: true },
    });
    if (!job) {
      return NextResponse.json(
        { ok: false, error: "NotFound", detail: "Job not found" },
        { status: 404 },
      );
    }

    // Verify evidence exists and belongs to job
    const evidence = await prisma.evidence.findUnique({
      where: { id: evidenceId },
    });
    if (!evidence || evidence.jobId !== jobId) {
      return NextResponse.json(
        { ok: false, error: "NotFound", detail: "Evidence not found for this job" },
        { status: 404 },
      );
    }

    if (evidence.redactedAt) {
      return NextResponse.json(
        { ok: false, error: "Conflict", detail: "Evidence already redacted" },
        { status: 409 },
      );
    }

    // Mark as redacted
    await prisma.evidence.update({
      where: { id: evidenceId },
      data: {
        redactedAt: new Date(),
        redactedBy: actor,
        redactReason: reason.trim(),
      },
    });

    // Best-effort R2 delete
    let r2Deleted = false;
    if (deleteFromR2 && evidence.fileUrl) {
      try {
        await deleteObject({ key: evidence.fileUrl });
        r2Deleted = true;
      } catch {
        // best-effort — still marked as redacted
      }
    }

    // Audit log
    await prisma.decisionLog.create({
      data: {
        jobId,
        action: DecisionAction.REDACT_EVIDENCE as PrismaDecisionAction,
        actor,
        reason: reason.trim(),
        evidenceSnapshot: {
          evidenceId,
          evidenceType: evidence.type,
          storageKey: evidence.fileUrl ?? null,
          deleteFromR2,
          r2Deleted,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      evidenceId,
      redacted: true,
      r2Deleted,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "ServerError", detail: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}
