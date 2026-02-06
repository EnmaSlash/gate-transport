"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchReview, statusRoute } from "../_components";
import {
  PageContainer, PageHeader, Card, Row, Badge, Button, Alert,
} from "@/components/ui";

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

export default function StatusPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [review, setReview] = useState<any>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const data = await fetchReview(id);
    if (!data.ok) { setError(data.detail || data.error || "Failed to load"); return; }
    setReview(data);
    setError("");
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!review) return;
    const status = review.job?.status;
    if (["ASSIGNED", "ACCEPTED", "PICKUP_CONFIRMED"].includes(status)) {
      router.replace(statusRoute(id, status));
    }
  }, [review, id, router]);

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
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    badge: "gray" as const,
    message: `Current status: ${status}`,
    icon: "clock" as const,
    heroBg: "from-gray-50 to-slate-50",
    heroText: "text-[var(--text-tertiary)]",
    heroBorder: "border-[var(--border-default)]",
  };

  return (
    <PageContainer>
      <PageHeader
        title="Job status"
        subtitle={`VIN ${job.vin}`}
        back={{ label: "Back", onClick: () => router.push("/carrier") }}
      />

      {/* Status hero card */}
      <div className={`rounded-[var(--radius-xl)] bg-gradient-to-br ${config.heroBg}
                        border ${config.heroBorder} p-8 mb-5 text-center`}>
        <div className={`w-16 h-16 rounded-full bg-white/80 flex items-center justify-center
                         mx-auto mb-4 shadow-sm ${config.heroText}`}>
          <StatusIcon type={config.icon} />
        </div>
        <Badge variant={config.badge} className="mb-3">{config.label}</Badge>
        <p className="text-[15px] text-[var(--text-secondary)] max-w-xs mx-auto leading-relaxed">
          {config.message}
        </p>
      </div>

      {/* Job info */}
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

      {/* Evidence summary */}
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
        onClick={() => router.push("/carrier")}
      >
        Back to jobs
      </Button>
    </PageContainer>
  );
}
