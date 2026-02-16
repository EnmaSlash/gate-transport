import { VALID_TRANSITIONS, type TransportJobStatusValue } from "@/lib/domain";

export function allowedFromFor(to: TransportJobStatusValue): readonly TransportJobStatusValue[] {
  return VALID_TRANSITIONS[to] ?? [];
}

export function invalidTransitionPayload(from: string, to: TransportJobStatusValue) {
  return {
    ok: false,
    code: "INVALID_TRANSITION" as const,
    from,
    to,
    allowedFrom: allowedFromFor(to),
  };
}

