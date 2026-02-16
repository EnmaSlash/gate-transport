/**
 * Domain constants and types aligned with prisma/schema.prisma.
 * Import here instead of hardcoding enum/status strings in routes.
 */

// ----- TransportJob (JobStatus in Prisma) -----
export const TransportJobStatus = {
  DRAFT: "DRAFT",
  ASSIGNED: "ASSIGNED",
  ACCEPTED: "ACCEPTED",
  PICKUP_CONFIRMED: "PICKUP_CONFIRMED",
  DELIVERY_SUBMITTED: "DELIVERY_SUBMITTED",
  RELEASABLE: "RELEASABLE",
  RELEASED: "RELEASED",
  DISPUTED: "DISPUTED",
  CANCELLED: "CANCELLED",
} as const;

export type TransportJobStatusValue =
  (typeof TransportJobStatus)[keyof typeof TransportJobStatus];

// ----- PaymentHold (PaymentStatus in Prisma) -----
export const PaymentHoldStatus = {
  HELD: "held",
  RELEASABLE: "releasable",
  RELEASED: "released",
} as const;

export type PaymentHoldStatusValue =
  (typeof PaymentHoldStatus)[keyof typeof PaymentHoldStatus];

// ----- PaymentRail -----
export const PaymentRail = {
  STRIPE: "stripe",
  ACH: "ach",
  BALANCE: "balance",
} as const;

export type PaymentRailValue = (typeof PaymentRail)[keyof typeof PaymentRail];

// ----- Evidence (EvidenceType in Prisma) -----
export const EvidenceType = {
  PICKUP_PHOTO: "pickup_photo",
  DELIVERY_PHOTO: "delivery_photo",
  VIN_PHOTO: "vin_photo",
  VIN_SCAN: "vin_scan",
  POD: "pod",
  NOTE: "note",
} as const;

export type EvidenceTypeValue = (typeof EvidenceType)[keyof typeof EvidenceType];

// ----- Gate (ApprovalMode in Prisma) -----
export const ApprovalMode = {
  AUTO: "auto",
  MANUAL: "manual",
} as const;

export type ApprovalModeValue = (typeof ApprovalMode)[keyof typeof ApprovalMode];

// ----- DecisionLog (DecisionAction in Prisma) -----
export const DecisionAction = {
  APPROVE: "approve",
  DISPUTE: "dispute",
  RELEASE: "release",
  CANCEL: "cancel",
  OVERRIDE: "override",
  EVALUATE: "evaluate",
  ASSIGN: "assign",
  ACCEPT: "accept",
  PICKUP_CONFIRM: "pickup_confirm",
  DELIVERY_SUBMIT: "delivery_submit",
  EVIDENCE_UPLOAD: "evidence_upload",
  NOTIFICATION_SENT: "notification_sent",
  REDACT_EVIDENCE: "redact_evidence",
  RETENTION_CLEANUP: "retention_cleanup",
} as const;

export type DecisionActionValue =
  (typeof DecisionAction)[keyof typeof DecisionAction];

// ----- Gate defaults (matches Prisma Gate model defaults) -----
export const GATE_DEFAULTS = {
  requirePickupPhotos: true,
  requireDeliveryPhotos: true,
  requireVin: true,
  requirePod: false,
  minPickupPhotos: 4,
  minDeliveryPhotos: 4,
  approvalMode: ApprovalMode.MANUAL as ApprovalModeValue,
} as const;

/** Evidence type strings valid for API input (subset often used in routes) */
export const EVIDENCE_TYPES_LIST: readonly EvidenceTypeValue[] = [
  EvidenceType.PICKUP_PHOTO,
  EvidenceType.DELIVERY_PHOTO,
  EvidenceType.VIN_PHOTO,
  EvidenceType.VIN_SCAN,
  EvidenceType.POD,
  EvidenceType.NOTE,
];

export function isValidEvidenceType(s: string): s is EvidenceTypeValue {
  return (EVIDENCE_TYPES_LIST as readonly string[]).includes(s);
}

export function isValidPaymentRail(s: string): s is PaymentRailValue {
  return s === PaymentRail.STRIPE || s === PaymentRail.ACH || s === PaymentRail.BALANCE;
}

export function isValidApprovalMode(s: string): s is ApprovalModeValue {
  return s === ApprovalMode.AUTO || s === ApprovalMode.MANUAL;
}

// ----- Retention -----

const PHOTO_TYPES: readonly string[] = [
  EvidenceType.PICKUP_PHOTO,
  EvidenceType.DELIVERY_PHOTO,
  EvidenceType.VIN_PHOTO,
];

export function getRetentionDays(evidenceType: string): number {
  if (PHOTO_TYPES.includes(evidenceType)) {
    return Number(process.env.RETENTION_DAYS_PHOTOS) || 30;
  }
  return Number(process.env.RETENTION_DAYS_TEXT) || 90;
}

export function isExpired(evidenceType: string, createdAt: Date): boolean {
  const days = getRetentionDays(evidenceType);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return createdAt < cutoff;
}

// ----- State machine: valid transitions -----
export const VALID_TRANSITIONS: Record<TransportJobStatusValue, readonly TransportJobStatusValue[]> = {
  [TransportJobStatus.DRAFT]: [],
  [TransportJobStatus.ASSIGNED]: [TransportJobStatus.DRAFT],
  [TransportJobStatus.ACCEPTED]: [TransportJobStatus.ASSIGNED],
  [TransportJobStatus.PICKUP_CONFIRMED]: [TransportJobStatus.ACCEPTED],
  [TransportJobStatus.DELIVERY_SUBMITTED]: [TransportJobStatus.PICKUP_CONFIRMED],
  [TransportJobStatus.RELEASABLE]: [TransportJobStatus.DELIVERY_SUBMITTED],
  [TransportJobStatus.RELEASED]: [TransportJobStatus.RELEASABLE],
  [TransportJobStatus.DISPUTED]: [
    TransportJobStatus.ACCEPTED,
    TransportJobStatus.PICKUP_CONFIRMED,
    TransportJobStatus.DELIVERY_SUBMITTED,
    TransportJobStatus.RELEASABLE,
    TransportJobStatus.RELEASED,
  ],
  [TransportJobStatus.CANCELLED]: [
    TransportJobStatus.DRAFT,
    TransportJobStatus.ASSIGNED,
    TransportJobStatus.ACCEPTED,
    TransportJobStatus.PICKUP_CONFIRMED,
    TransportJobStatus.DELIVERY_SUBMITTED,
    TransportJobStatus.RELEASABLE,
  ],
};

export function isValidTransition(
  currentStatus: string,
  targetStatus: TransportJobStatusValue,
): boolean {
  const validFrom = VALID_TRANSITIONS[targetStatus];
  if (!validFrom) return false;
  return (validFrom as readonly string[]).includes(currentStatus);
}
