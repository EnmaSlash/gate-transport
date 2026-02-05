import { DecisionAction } from "@prisma/client";
import { db } from "./db";

export async function audit(params: {
  jobId: string;
  action: DecisionAction;
  actor: string;
  reason?: string;
  evidenceSnapshot?: unknown;
}) {
  return db.decisionLog.create({
    data: {
      jobId: params.jobId,
      action: params.action,
      actor: params.actor,
      reason: params.reason,
      evidenceSnapshot: params.evidenceSnapshot as any,
    },
  });
}
