import { DecisionAction } from "@prisma/client";
import { prisma } from "./prisma";

export async function audit(params: {
  jobId: string;
  action: DecisionAction;
  actor: string;
  reason?: string;
  evidenceSnapshot?: unknown;
}) {
  return prisma.decisionLog.create({
    data: {
      jobId: params.jobId,
      action: params.action,
      actor: params.actor,
      reason: params.reason,
      evidenceSnapshot: params.evidenceSnapshot as any,
    },
  });
}
