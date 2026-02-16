"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { statusRouteForToken } from "@/app/carrier/jobs/[id]/_components";
import {
  PageContainer, PageHeader, Card, Row, Badge, Button, Alert,
} from "@/components/ui";
import { carrierFetchJson } from "@/app/c/_lib/carrierFetch";
import { evaluateDeliveryPhase } from "@/lib/evaluatePhase";

const STATUS_CONFIG: Record<string, {
  label: string;
  badge: "amber" | "green" | "red" | "gray";
  message: string;
  icon: "clock" | "check" | "alert" | "x";
  heroBg: string;
  heroText: string;
  heroBorder: string;
}> = {
  DELIVERY_SUBMITTED: {
    label: "Awaiting review",
    badge: "amber",
    message: "Your delivery has been submitted and is awaiting admin review.",
    icon: "clock",
    heroBg: "from-amber-50 to-orange-50",
    heroText: "text-[var(--status-amber-text)]",
    heroBorder: "border-[var(--status-amber-border)]",
  },
  RELEASABLE: {
    label: "Approved",
    badge: "green",
    message: "Payment has been approved and is awaiting release.",
    icon: "check",
    heroBg: "from-green-50 to-emerald-50",
    heroText: "text-[var(--status-green-text)]",
    heroBorder: "border-[var(--status-green-border)]",
  },
  RELEASED: {
    label: "Completed",
    badge: "green",
    message: "Payment has been released. This job is complete.",
    icon: "check",
    heroBg: "from-green-50 to-emerald-50",
    heroText: "text-[var(--status-green-text)]",
    heroBorder: "border-[var(--status-green-border)]",
  },
  DISPUTED: {
    label: "Disputed",
    badge: "red",
    message: "This job is disputed. Please contact your administrator.",
    icon: "alert",
    heroBg: "from-red-50 to-rose-50",
    heroText: "text-[var(--status-red-text)]",
    heroBorder: "border-[var(--status-red-border)]",
  },
  CANCELLED: {
    label: "Cancelled",
    badge: "gray",
    message: "This job has been cancelled.",
    icon: "x",
    heroBg: "from-gray-50 to-slate-50",
    heroText: "text-[var(--text-tertiary)]",
    heroBorder: "border-[var(--border-default)]",
  },
};

function StatusIcon({ type }: { type: string }) {
  if (type === "check") {
    return (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (type === "clock") {
    return (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    );
  }
  if (type === "alert") {
    return (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    );
  }
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

export function StatusFlow({ jobId, token }: { jobId: string; token: string }) {
  const router = useRouter();
  const [review, setReview] = useState<any>(null);
  const [error, setError] = useState("");
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueMsg, setIssueMsg] = useState("");
  const [issueState, setIssueState] = useState<"idle" | "sending" | "sent">("idle");
  const [issueError, setIssueError] = useState("");

  const load = useCallback(async () => {
    const r = await carrierFetchJson(token, `/api/jobs/${jobId}/review`);
    if (!r.ok) { setError(r.error.message); return; }
    if (!r.data?.ok) { setError(r.data?.detail || r.data?.error || "Failed to load"); return; }
    setReview(r.data);
    setError("");
  }, [jobId, token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!review) return;
    const status = review.job?.status;
    if (["ASSIGNED", "ACCEPTED"].includes(status)) {
      router.replace(statusRouteForToken(token, status));
    }
  }, [review, router, token]);

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
        </div>
      </PageContainer>
    );
  }

  const job = review.job;
  const ev = review.evidence;
  const status = job?.status;
  const isInTransit = status === "PICKUP_CONFIRMED";
  const deliveryPreview = isInTransit ? evaluateDeliveryPhase(review.gate, ev?.counts) : null;
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    badge: "gray" as const,
    message: `Current status: ${status}`,
    icon: "clock" as const,
    heroBg: "from-gray-50 to-slate-50",
    heroText: "text-[var(--text-tertiary)]",
    heroBorder: "border-[var(--border-default)]",
  };

  async function submitIssue() {
    setIssueError("");
    const msg = issueMsg.trim();
    if (msg.length < 5) { setIssueError("Please enter at least 5 characters."); return; }
    if (msg.length > 1000) { setIssueError("Please keep it under 1000 characters."); return; }
    setIssueState("sending");
    const r = await carrierFetchJson(token, `/api/jobs/${jobId}/issue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg }),
    });
    if (!r.ok) {
      setIssueError(r.error.message);
      setIssueState("idle");
      return;
    }
    if (!r.data?.ok) {
      setIssueError(r.data?.detail || r.data?.error || "Failed to send issue");
      setIssueState("idle");
      return;
    }
    // Update counts optimistically
    const countsByType = r.data?.countsByType ?? {};
    setReview((prev: any) => {
      if (!prev) return prev;
      const prevEv = prev.evidence ?? {};
      const prevCounts = prevEv.counts ?? {};
      const nextCounts = { ...prevCounts, ...countsByType };
      return { ...prev, evidence: { ...prevEv, counts: nextCounts, total: (prevEv.total ?? 0) + 1 } };
    });
    setIssueState("sent");
    setIssueOpen(false);
    setIssueMsg("");
  }

  return (
    <PageContainer>
      <PageHeader
        title="Job status"
        subtitle={`VIN ${job.vin}`}
        back={{ label: "Back", onClick: () => router.push(`/c/${encodeURIComponent(token)}`) }}
      />

      <div className={`rounded-[var(--radius-xl)] bg-gradient-to-br ${config.heroBg}
                        border ${config.heroBorder} p-8 mb-5 text-center`}>
        <div className={`w-16 h-16 rounded-full bg-white/80 flex items-center justify-center
                         mx-auto mb-4 shadow-sm ${config.heroText}`}>
          <StatusIcon type={config.icon} />
        </div>
        <Badge variant={config.badge} className="mb-3">{config.label}</Badge>
        <p className="text-[15px] text-[var(--text-secondary)] max-w-xs mx-auto leading-relaxed">
          {isInTransit ? "In transit. Return here when you arrive at delivery." : config.message}
        </p>
      </div>

      {isInTransit && (
        <Button
          variant="primary"
          size="lg"
          className="w-full mb-4"
          onClick={() => router.push(`/c/${encodeURIComponent(token)}/delivery`)}
        >
          Start delivery
        </Button>
      )}

      {isInTransit && deliveryPreview && (
        <Card title="Delivery checklist" accent className="mb-4">
          {deliveryPreview.pass ? (
            <Alert variant="success">All delivery requirements met</Alert>
          ) : (
            <Alert variant="info">
              For delivery: {deliveryPreview.missing.join(", ")}
            </Alert>
          )}
        </Card>
      )}

      <Card title="Report an issue" accent className="mb-4">
        {issueState === "sent" && (
          <Alert variant="success" className="mb-3">
            Issue sent to dispatcher/admin
          </Alert>
        )}
        {!issueOpen ? (
          <Button variant="secondary" className="w-full" onClick={() => { setIssueError(""); setIssueOpen(true); }}>
            Report an issue
          </Button>
        ) : (
          <div className="space-y-3">
            <textarea
              value={issueMsg}
              onChange={(e) => setIssueMsg(e.target.value)}
              placeholder="Describe the issue (pickup/delivery access, vehicle condition, address problem, etc.)"
              className="input w-full min-h-[120px] font-normal"
            />
            {issueError && <Alert variant="error">{issueError}</Alert>}
            <div className="flex gap-2">
              <Button
                variant="primary"
                disabled={issueState === "sending" || issueMsg.trim().length < 5}
                onClick={submitIssue}
              >
                {issueState === "sending" ? "Sending..." : "Send"}
              </Button>
              <Button
                variant="secondary"
                disabled={issueState === "sending"}
                onClick={() => { setIssueOpen(false); setIssueError(""); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[13px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Payout</span>
          <span className="text-[22px] font-bold text-[var(--text-primary)] tabular-nums">
            ${(job.priceCents / 100).toFixed(2)}
          </span>
        </div>
        <Row label="Pickup" value={job.pickupAddress} />
        <Row label="Dropoff" value={job.dropoffAddress} />
        <Row label="Carrier" value={job.carrierName || "—"} />
        {job.deliveryDeadline && (
          <Row label="Deadline" value={new Date(job.deliveryDeadline).toLocaleString()} />
        )}
      </Card>

      <Card title="Evidence" accent className="mb-4">
        <Row label="Total items" value={String(ev?.total ?? 0)} />
        {ev?.counts && Object.entries(ev.counts).map(([k, v]) => (
          <Row key={k} label={k.replace(/_/g, " ")} value={String(v)} />
        ))}
        {ev?.complete && (
          <Alert variant="success" className="mt-3">
            All gate requirements met
          </Alert>
        )}
      </Card>

      <Button
        variant="secondary"
        className="w-full"
        onClick={() => router.push(`/c/${encodeURIComponent(token)}`)}
      >
        Back
      </Button>
    </PageContainer>
  );
}

