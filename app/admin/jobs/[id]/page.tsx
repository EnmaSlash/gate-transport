"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  PageContainer, PageHeader, Card, Row, Badge, Button, Alert, Divider, ProgressBar,
} from "@/components/ui";

function authHeaders(json = true): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("jwt") : null;
  const h: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (json) h["Content-Type"] = "application/json";
  return h;
}

function getUserRole(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("role") : null;
}

type BadgeVariant = "gray" | "blue" | "violet" | "amber" | "green" | "red";
const STATUS_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
  DRAFT:              { label: "Draft", variant: "gray" },
  ASSIGNED:           { label: "Assigned", variant: "gray" },
  ACCEPTED:           { label: "Accepted", variant: "blue" },
  PICKUP_CONFIRMED:   { label: "In transit", variant: "violet" },
  DELIVERY_SUBMITTED: { label: "Needs review", variant: "amber" },
  RELEASABLE:         { label: "Approved", variant: "green" },
  RELEASED:           { label: "Released", variant: "green" },
  DISPUTED:           { label: "Disputed", variant: "red" },
  CANCELLED:          { label: "Cancelled", variant: "gray" },
};

const HOLD_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
  held:       { label: "Held", variant: "amber" },
  releasable: { label: "Releasable", variant: "green" },
  released:   { label: "Released", variant: "green" },
};

export default function AdminJobReview() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [review, setReview] = useState<any>(null);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [reason, setReason] = useState("");
  const [carrierName, setCarrierName] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const isAdmin = getUserRole() === "admin";

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${id}/review`, { headers: authHeaders() });
      const data = await res.json();
      if (!data.ok) { setError(data.detail || data.error || "Failed to load"); return; }
      setReview(data);
      setError("");
    } catch { setError("Network error"); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function doAction(endpoint: string, body: Record<string, unknown> = {}) {
    setActionMsg("");
    setLoading(endpoint);
    try {
      const res = await fetch(`/api/jobs/${id}/${endpoint}`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify(body),
      });
      const data = await res.json();
      setActionMsg(`${endpoint}: ${data.ok ? "Success" : data.detail || data.error || "Failed"}`);
      if (data.ok) { setReason(""); setCarrierName(""); }
      await load();
    } catch { setActionMsg(`${endpoint}: Network error`); }
    finally { setLoading(null); }
  }

  async function redactEvidence(evidenceId: string) {
    const redactReason = prompt("Reason for redaction:");
    if (!redactReason) return;
    const deleteFromR2 = confirm("Also delete file from R2 storage?");

    setActionMsg("");
    setLoading(`redact-${evidenceId}`);
    try {
      const res = await fetch(`/api/jobs/${id}/evidence/${evidenceId}/redact`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ reason: redactReason, deleteFromR2 }),
      });
      const data = await res.json();
      setActionMsg(`redact: ${data.ok ? "Success" : data.detail || data.error || "Failed"}`);
      await load();
    } catch { setActionMsg("redact: Network error"); }
    finally { setLoading(null); }
  }

  if (error && !review) {
    return <PageContainer><Alert variant="error">{error}</Alert></PageContainer>;
  }
  if (!review) {
    return (
      <PageContainer>
        <div className="space-y-4">
          <div className="shimmer h-8 w-32 rounded" />
          <div className="shimmer h-48 rounded-[var(--radius-lg)]" />
          <div className="shimmer h-32 rounded-[var(--radius-lg)]" />
          <div className="shimmer h-40 rounded-[var(--radius-lg)]" />
        </div>
      </PageContainer>
    );
  }

  const job = review.job;
  const hold = review.paymentHold;
  const gate = review.gate;
  const ev = review.evidence;
  const status = job?.status;

  const canAssign = status === "DRAFT";
  const canEvaluate = !["CANCELLED", "DISPUTED", "RELEASED"].includes(status);
  const canApprove = status === "DELIVERY_SUBMITTED";
  const canRelease = status === "RELEASABLE";
  const canCancel = !["RELEASED", "DISPUTED", "CANCELLED"].includes(status);
  const canDispute = ["ACCEPTED", "PICKUP_CONFIRMED", "DELIVERY_SUBMITTED", "RELEASABLE", "RELEASED"].includes(status);

  const uploads: any[] = ev?.latestUploads ?? [];
  const pickupPhotos = uploads.filter((e: any) => e.type === "pickup_photo");
  const deliveryPhotos = uploads.filter((e: any) => e.type === "delivery_photo");
  const vinScans = uploads.filter((e: any) => e.type === "vin_scan");
  const pods = uploads.filter((e: any) => e.type === "pod");

  const sb = STATUS_BADGE[status] ?? { label: status, variant: "gray" as BadgeVariant };
  const hb = hold ? (HOLD_BADGE[hold.status] ?? { label: hold.status, variant: "gray" as BadgeVariant }) : null;

  return (
    <PageContainer>
      <PageHeader
        title="Job review"
        subtitle={id}
        back={{ label: "Shipments", onClick: () => router.push("/admin/shipments") }}
        actions={
          <Button variant="ghost" size="sm" onClick={() => { localStorage.clear(); router.push("/login"); }}>
            Sign out
          </Button>
        }
      />

      {/* Status hero card with gradient border */}
      <div className="rounded-[var(--radius-xl)] border border-[var(--border-default)] bg-[var(--bg-surface)]
                      shadow-[var(--shadow-md)] p-6 mb-4 relative overflow-hidden">
        {/* Top gradient accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--brand-600)] to-[var(--brand-400)]" />
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Badge variant={sb.variant}>{sb.label}</Badge>
            {hb && <Badge variant={hb.variant}>{hb.label}</Badge>}
          </div>
          <span className="text-[26px] font-bold text-[var(--text-primary)] tabular-nums">
            {hold ? `$${(hold.amountCents / 100).toFixed(2)}` : "—"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          <Row label="VIN" value={job?.vin} mono />
          <Row label="Carrier" value={job?.carrierName || "—"} />
          <Row label="Rail" value={hold?.rail ?? "—"} />
          <Row label="Pickup" value={job?.pickupAddress} />
          <Row label="Dropoff" value={job?.dropoffAddress} />
          {job?.deliveryDeadline && (
            <Row label="Deadline" value={new Date(job.deliveryDeadline).toLocaleString()} />
          )}
        </div>
      </div>

      {/* Gate requirements */}
      <Card title="Gate requirements" accent className="mb-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          <GateRow label="Pickup photos" required={gate?.requirePickupPhotos} detail={`min ${gate?.minPickupPhotos}`} />
          <GateRow label="Delivery photos" required={gate?.requireDeliveryPhotos} detail={`min ${gate?.minDeliveryPhotos}`} />
          <GateRow label="VIN scan" required={gate?.requireVin} />
          <GateRow label="Proof of delivery" required={gate?.requirePod} />
        </div>
        {ev?.missing?.length > 0 && (
          <Alert variant="warning" className="mt-3">
            Missing: {ev.missing.join(", ")}
          </Alert>
        )}
      </Card>

      {/* Evidence summary with progress */}
      <Card title="Evidence summary" accent className="mb-4">
        {gate?.requirePickupPhotos && (
          <ProgressBar label="Pickup photos" current={ev?.counts?.pickup_photo ?? 0} total={gate.minPickupPhotos} className="mb-2" />
        )}
        {gate?.requireDeliveryPhotos && (
          <ProgressBar label="Delivery photos" current={ev?.counts?.delivery_photo ?? 0} total={gate.minDeliveryPhotos} className="mb-2" />
        )}
        <Row label="Total items" value={String(ev?.total ?? 0)} />
        {ev?.complete && (
          <Alert variant="success" className="mt-3">All requirements met</Alert>
        )}
      </Card>

      {/* Evidence gallery sections */}
      <EvidenceSection
        title="Pickup photos"
        icon="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"
        items={pickupPhotos}
        required={gate?.requirePickupPhotos}
        isAdmin={isAdmin}
        loading={loading}
        onRedact={redactEvidence}
      />

      <EvidenceSection
        title="Delivery photos"
        icon="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"
        items={deliveryPhotos}
        required={gate?.requireDeliveryPhotos}
        isAdmin={isAdmin}
        loading={loading}
        onRedact={redactEvidence}
      />

      {/* VIN scan */}
      <Card className="mb-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-[var(--radius-sm)] bg-[var(--brand-50)] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brand-600)"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M7 8h4M7 12h6M7 16h2" />
            </svg>
          </div>
          <h3 className="text-[13px] font-semibold uppercase tracking-wider text-[var(--brand-600)]">VIN scan</h3>
        </div>
        {vinScans.length === 0 ? (
          <EmptyState required={gate?.requireVin} label="No VIN submitted" />
        ) : (
          <div className="space-y-1">
            {vinScans.map((e: any) => (
              <EvidenceText key={e.id} evidence={e} isAdmin={isAdmin} loading={loading} onRedact={redactEvidence} mono />
            ))}
          </div>
        )}
      </Card>

      {/* POD */}
      <Card className="mb-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-[var(--radius-sm)] bg-[var(--brand-50)] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brand-600)"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <h3 className="text-[13px] font-semibold uppercase tracking-wider text-[var(--brand-600)]">Proof of delivery</h3>
        </div>
        {pods.length === 0 ? (
          <EmptyState required={gate?.requirePod} label="No POD submitted" />
        ) : (
          <div className="space-y-1">
            {pods.map((e: any) => (
              <EvidenceText key={e.id} evidence={e} isAdmin={isAdmin} loading={loading} onRedact={redactEvidence} />
            ))}
          </div>
        )}
      </Card>

      {/* Action zone */}
      <div className="rounded-[var(--radius-xl)] border border-[var(--border-default)] bg-[var(--bg-surface)]
                      shadow-[var(--shadow-sm)] p-6 mb-4">
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-[var(--brand-600)] mb-4">Actions</h3>

        {canAssign && (
          <div className="flex gap-2 mb-4">
            <input
              placeholder="Carrier name"
              value={carrierName}
              onChange={(e) => setCarrierName(e.target.value)}
              className="input flex-1"
            />
            <Button
              variant="primary"
              disabled={!!loading || !carrierName}
              onClick={() => doAction("assign", { carrierName })}
            >
              Assign
            </Button>
          </div>
        )}

        {/* Primary actions row */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Button variant="secondary" disabled={!!loading || !canEvaluate}
            onClick={() => doAction("evaluate")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            Evaluate gate
          </Button>
          <Button variant="success" disabled={!!loading || !canApprove}
            onClick={() => doAction("approve")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Approve
          </Button>
          <Button variant="primary" disabled={!!loading || !canRelease}
            onClick={() => doAction("release")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
            Release payment
          </Button>
        </div>

        <Divider />

        {/* Destructive actions */}
        <div className="flex gap-2 mt-4">
          <input
            placeholder="Reason (required for cancel / dispute)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="input flex-1"
          />
          <Button variant="danger" disabled={!!loading || !canCancel || !reason}
            onClick={() => doAction("cancel", { reason })}>
            Cancel
          </Button>
          <Button variant="secondary" disabled={!!loading || !canDispute || !reason}
            onClick={() => doAction("dispute", { reason })}>
            Dispute
          </Button>
        </div>

        {actionMsg && (
          <Alert
            variant={actionMsg.includes("Success") ? "success" : "error"}
            className="mt-4"
          >
            {actionMsg}
          </Alert>
        )}
      </div>

      {/* Audit log */}
      <Card title="Audit log" accent>
        {review.audit?.recent?.length === 0 && (
          <p className="text-[14px] text-[var(--text-tertiary)]">No entries yet</p>
        )}
        <div className="max-h-64 overflow-auto space-y-0 divide-y divide-[var(--border-subtle)]">
          {review.audit?.recent?.map((log: any) => (
            <div key={log.id} className="py-2.5 text-[12px] font-mono flex gap-3 items-baseline">
              <span className="text-[var(--text-tertiary)] shrink-0">
                {new Date(log.createdAt).toLocaleString()}
              </span>
              <Badge variant={log.action.includes("fail") || log.action.includes("cancel") || log.action.includes("dispute")
                ? "red" : log.action.includes("release") || log.action.includes("approve") ? "green" : "gray"}>
                {log.action}
              </Badge>
              <span className="text-[var(--text-secondary)] truncate">{log.actor}</span>
              {log.reason && (
                <span className="text-[var(--text-tertiary)] truncate">— {log.reason}</span>
              )}
            </div>
          ))}
        </div>
      </Card>
    </PageContainer>
  );
}

// ============================================================
// Sub-components
// ============================================================

function GateRow({ label, required, detail }: { label: string; required?: boolean; detail?: string }) {
  return (
    <div className="flex items-center justify-between text-[14px] py-1">
      <span className="text-[var(--text-secondary)]">{label}</span>
      {required ? (
        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--status-amber-text)]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {detail || "required"}
        </span>
      ) : (
        <span className="text-[13px] text-[var(--text-tertiary)]">not required</span>
      )}
    </div>
  );
}

function EmptyState({ required, label }: { required?: boolean; label?: string }) {
  if (required) {
    return <Alert variant="warning">{label || "Missing"} — required</Alert>;
  }
  return <p className="text-[14px] text-[var(--text-tertiary)]">{label || "None uploaded"}</p>;
}

function EvidenceSection({ title, icon, items, required, isAdmin, loading, onRedact }: {
  title: string; icon: string; items: any[]; required?: boolean;
  isAdmin: boolean; loading: string | null; onRedact: (id: string) => void;
}) {
  return (
    <Card className="mb-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-[var(--radius-sm)] bg-[var(--brand-50)] flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brand-600)"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={icon} />
            {icon.includes("M23") && <circle cx="12" cy="13" r="4" />}
            {icon.includes("M21 10") && <circle cx="12" cy="10" r="3" />}
          </svg>
        </div>
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-[var(--brand-600)]">{title}</h3>
        <span className="text-[12px] font-semibold text-[var(--text-tertiary)] ml-auto">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <EmptyState required={required} />
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {items.map((e: any) => (
            <EvidencePhoto key={e.id} evidence={e} isAdmin={isAdmin} loading={loading} onRedact={onRedact} />
          ))}
        </div>
      )}
    </Card>
  );
}

function EvidencePhoto({ evidence, isAdmin, loading, onRedact }: {
  evidence: any; isAdmin: boolean; loading: string | null; onRedact: (id: string) => void;
}) {
  const [failed, setFailed] = useState(false);
  const isRedacted = !!evidence.redactedAt;

  if (isRedacted) {
    return (
      <div className="aspect-square rounded-[var(--radius-md)] bg-[var(--status-red-bg)]
                      border border-[var(--status-red-border)] flex flex-col items-center justify-center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--status-red-text)"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-1">
          <circle cx="12" cy="12" r="10" />
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        </svg>
        <span className="text-[10px] font-bold text-[var(--status-red-text)]">REDACTED</span>
      </div>
    );
  }

  if (!evidence.fileUrl) {
    return (
      <div className="aspect-square rounded-[var(--radius-md)] bg-[var(--bg-muted)]
                      border border-[var(--border-default)] flex items-center justify-center">
        <span className="text-[12px] text-[var(--text-tertiary)]">No file</span>
      </div>
    );
  }

  const src = `/api/files?key=${encodeURIComponent(evidence.fileUrl)}`;

  return (
    <div className="relative group">
      {failed ? (
        <div className="aspect-square rounded-[var(--radius-md)] bg-[var(--bg-muted)]
                        border border-[var(--border-default)] flex items-center justify-center">
          <span className="text-[12px] text-[var(--text-tertiary)]">Failed to load</span>
        </div>
      ) : (
        <a href={src} target="_blank" rel="noopener noreferrer">
          <img
            src={src}
            alt={`Evidence ${new Date(evidence.createdAt).toLocaleString()}`}
            onError={() => setFailed(true)}
            className="aspect-square w-full object-cover rounded-[var(--radius-md)]
                       border-2 border-[var(--border-default)] hover:border-[var(--brand-400)]
                       transition-all duration-150 cursor-pointer shadow-[var(--shadow-xs)]
                       hover:shadow-[var(--shadow-md)]"
          />
        </a>
      )}
      {isAdmin && (
        <button
          onClick={() => onRedact(evidence.id)}
          disabled={!!loading}
          className="absolute top-1 right-1 rounded-[var(--radius-sm)] bg-white/90
                     border border-[var(--status-red-border)] px-1.5 py-0.5
                     text-[10px] font-bold text-[var(--status-red-text)]
                     opacity-0 group-hover:opacity-100 hover:bg-[var(--status-red-bg)]
                     transition-all duration-150 shadow-sm"
        >
          Redact
        </button>
      )}
    </div>
  );
}

function EvidenceText({ evidence, isAdmin, loading, onRedact, mono }: {
  evidence: any; isAdmin: boolean; loading: string | null; onRedact: (id: string) => void; mono?: boolean;
}) {
  const isRedacted = !!evidence.redactedAt;

  if (isRedacted) {
    return (
      <div className="flex items-center gap-2 py-1.5 px-3 rounded-[var(--radius-sm)] bg-[var(--status-red-bg)]">
        <span className="text-[12px] font-bold text-[var(--status-red-text)]">REDACTED</span>
        {evidence.redactReason && (
          <span className="text-[10px] text-[var(--text-tertiary)]">{evidence.redactReason}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-[var(--radius-sm)] bg-[var(--bg-muted)]">
      <span className={`text-[14px] font-semibold text-[var(--text-primary)] ${mono ? "font-mono" : ""}`}>
        {evidence.note || "—"}
      </span>
      <span className="text-[12px] text-[var(--text-tertiary)]">
        {new Date(evidence.createdAt).toLocaleString()}
      </span>
      {isAdmin && (
        <button
          onClick={() => onRedact(evidence.id)}
          disabled={!!loading}
          className="ml-auto rounded-[var(--radius-sm)] border border-[var(--status-red-border)] px-2 py-0.5
                     text-[10px] font-bold text-[var(--status-red-text)]
                     hover:bg-[var(--status-red-bg)] transition-colors"
        >
          Redact
        </button>
      )}
    </div>
  );
}
