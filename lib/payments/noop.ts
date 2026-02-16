import type { PaymentProvider, PaymentReleaseArgs, PaymentReleaseResult } from "./provider";

function isNonEmptyString(s: unknown): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

export const noopProvider: PaymentProvider = {
  name: "noop",
  async release(args: PaymentReleaseArgs): Promise<PaymentReleaseResult> {
    try {
      if (!isNonEmptyString(args.jobId)) {
        return { ok: false, provider: "noop", idempotencyKey: args.idempotencyKey, error: "Missing jobId" };
      }
      if (!isNonEmptyString(args.holdId)) {
        return { ok: false, provider: "noop", idempotencyKey: args.idempotencyKey, error: "Missing holdId" };
      }
      if (!Number.isFinite(args.amountCents) || args.amountCents <= 0) {
        return { ok: false, provider: "noop", idempotencyKey: args.idempotencyKey, error: "Invalid amountCents" };
      }
      if (!isNonEmptyString(args.rail)) {
        return { ok: false, provider: "noop", idempotencyKey: args.idempotencyKey, error: "Missing rail" };
      }
      if (!isNonEmptyString(args.idempotencyKey)) {
        return { ok: false, provider: "noop", idempotencyKey: "", error: "Missing idempotencyKey" };
      }

      return {
        ok: true,
        provider: "noop",
        providerRef: `noop_${args.holdId}_${Date.now()}`,
        idempotencyKey: args.idempotencyKey,
      };
    } catch (e: any) {
      return {
        ok: false,
        provider: "noop",
        idempotencyKey: args.idempotencyKey,
        error: e?.message ?? "Unknown noop provider error",
      };
    }
  },
};

