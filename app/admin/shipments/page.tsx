"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  PageContainer, PageHeader, Card, Badge, Button, Alert,
} from "@/components/ui";

const SIM_BANNER_ENABLED = process.env.NEXT_PUBLIC_ENABLE_SIM_EVIDENCE === "true";

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("jwt") : null;
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const ACTIVE_STATUSES = "DRAFT,ASSIGNED,ACCEPTED,PICKUP_CONFIRMED,DELIVERY_SUBMITTED,RELEASABLE,DISPUTED";

const FILTER_TABS = [
  { label: "All active", statuses: ACTIVE_STATUSES },
  { label: "Needs review", statuses: "DELIVERY_SUBMITTED" },
  { label: "In progress", statuses: "ASSIGNED,ACCEPTED,PICKUP_CONFIRMED" },
  { label: "Disputed", statuses: "DISPUTED" },
] as const;

type BadgeVariant = "gray" | "blue" | "violet" | "amber" | "green" | "red";
const STATUS_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
  DRAFT:              { label: "Draft", variant: "gray" },
  ASSIGNED:           { label: "Assigned", variant: "gray" },
  ACCEPTED:           { label: "Accepted", variant: "blue" },
  PICKUP_CONFIRMED:   { label: "In transit", variant: "violet" },
  DELIVERY_SUBMITTED: { label: "Needs review", variant: "amber" },
  RELEASABLE:         { label: "Approved", variant: "green" },
  DISPUTED:           { label: "Disputed", variant: "red" },
};

interface Job {
  id: string;
  vin: string;
  status: string;
  carrierName: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  priceCents: number;
  deliveryDeadline: string | null;
}

export default function ShipmentsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState(0);
  const [notifCount, setNotifCount] = useState(0);
  const [health, setHealth] = useState<any>(null);

  const loadJobs = useCallback(async (statuses: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs?status=${statuses}&limit=100`, { headers: authHeaders() });
      const data = await res.json();
      if (!data.ok) { setError(data.detail || data.error || "Failed to load"); return; }
      setJobs(data.jobs);
      setError("");
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const lastSeen = localStorage.getItem("admin_notification_last_seen") || "";
      const sinceParam = lastSeen ? `&since=${encodeURIComponent(lastSeen)}` : "";
      const res = await fetch(`/api/notifications/delivery?limit=100${sinceParam}`, { headers: authHeaders() });
      const data = await res.json();
      if (data.ok) setNotifCount(data.count);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadJobs(FILTER_TABS[activeFilter].statuses);
    loadNotifications();
  }, [activeFilter, loadJobs, loadNotifications]);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setHealth(d))
      .catch(() => setHealth({ ok: false, db: { ok: false, detail: "health fetch failed" } }));
  }, []);

  function handleFilterChange(index: number) {
    setActiveFilter(index);
    if (index === 1) {
      localStorage.setItem("admin_notification_last_seen", new Date().toISOString());
      setNotifCount(0);
    }
  }

  return (
    <PageContainer size="lg">
      <PageHeader
        title="Shipments"
        subtitle={jobs.length > 0 ? `${jobs.length} active` : undefined}
        actions={
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={() => router.push("/admin/shipments/new")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New shipment
            </Button>
            <Button variant="secondary" size="sm" onClick={() => router.push("/admin/shipments/history")}>
              History
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { localStorage.clear(); router.push("/login"); }}>
              Sign out
            </Button>
          </div>
        }
      />

      {SIM_BANNER_ENABLED && (
        <Alert variant="warning" className="mb-5">
          <div className="font-semibold">SIMULATION MODE</div>
          <div className="text-[12px] mt-1">
            Simulated evidence is enabled. Carrier/dev actions may generate non-production audit/evidence entries.
          </div>
        </Alert>
      )}

      <Card title="System Status" accent className="mb-5">
        {!health ? (
          <div className="text-[13px] text-[var(--text-tertiary)]">Loading…</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-3">
              <Badge variant={health.db?.ok ? "green" : "red"}>DB {health.db?.ok ? "OK" : "FAIL"}</Badge>
              <Badge variant={health.r2?.ok ? "green" : "amber"}>R2 {health.r2?.ok ? "OK" : "MISSING"}</Badge>
              <Badge variant={health.simEvidence?.enabled ? "amber" : "gray"}>
                SIM {health.simEvidence?.enabled ? "ON" : "OFF"}
              </Badge>
              <Badge variant="gray">PAY {health.payment?.provider ?? "—"}</Badge>
              <Badge variant={Number(health.outbox?.queued ?? 0) > 0 ? "amber" : "gray"}>
                OUTBOX {health.outbox?.queued ?? 0}
              </Badge>
            </div>
            {!health.r2?.ok && (
              <Alert variant="warning">
                Uploads disabled{health.r2?.detail ? ` — ${health.r2.detail}` : ""}
              </Alert>
            )}
          </>
        )}
      </Card>

      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
        {FILTER_TABS.map((tab, i) => (
          <button
            key={tab.label}
            onClick={() => handleFilterChange(i)}
            className={`relative rounded-full px-4 py-1.5 text-[13px] font-semibold
                        transition-all duration-150 whitespace-nowrap ${
              activeFilter === i
                ? "bg-[var(--brand-600)] text-white shadow-[var(--shadow-brand)]"
                : "bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:border-[var(--brand-200)] hover:text-[var(--brand-600)]"
            }`}
          >
            {tab.label}
            {i === 1 && notifCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-[20px] min-w-[20px] items-center justify-center
                               rounded-full bg-[var(--status-red-text)] px-1.5 text-[10px] font-bold text-white
                               shadow-sm animate-pulse">
                {notifCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && <Alert variant="error" className="mb-5">{error}</Alert>}

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="shimmer h-4 w-16 rounded" />
                  <div className="shimmer h-5 w-20 rounded-full" />
                </div>
                <div className="shimmer h-5 w-20 rounded" />
              </div>
              <div className="shimmer h-4 w-32 rounded mb-2" />
              <div className="shimmer h-4 w-64 rounded" />
            </div>
          ))}
        </div>
      )}

      {!loading && jobs.length === 0 && !error && (
        <Card className="text-center py-14">
          <div className="mx-auto mb-5 w-20 h-20 rounded-full bg-[var(--brand-50)] flex items-center justify-center">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
                 stroke="var(--brand-400)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0022 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </div>
          <p className="text-[16px] font-semibold text-[var(--text-primary)]">No shipments found</p>
          <p className="text-[14px] text-[var(--text-tertiary)] mt-1.5">Try a different filter or create a new shipment.</p>
        </Card>
      )}

      <div className="space-y-2">
        {jobs.map((job) => {
          const sb = STATUS_BADGE[job.status] ?? { label: job.status, variant: "gray" as BadgeVariant };
          const needsReview = job.status === "DELIVERY_SUBMITTED";
          return (
            <Card key={job.id} hover className={`p-0 overflow-hidden ${
              needsReview ? "border-[var(--status-amber-border)]" : ""
            }`}>
              <button
                onClick={() => router.push(`/admin/jobs/${job.id}`)}
                className="w-full text-left p-5 hover:bg-[var(--bg-muted)]/50 transition-colors relative"
              >
                {/* Left accent strip for needs-review items */}
                {needsReview && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--status-amber-text)] rounded-l-[var(--radius-lg)]" />
                )}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-mono text-[var(--text-tertiary)]">
                      {job.id.slice(0, 8)}
                    </span>
                    <Badge variant={sb.variant}>{sb.label}</Badge>
                  </div>
                  <span className="text-[18px] font-bold text-[var(--text-primary)] tabular-nums">
                    ${(job.priceCents / 100).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-[14px] font-mono font-semibold text-[var(--text-primary)]">
                      {job.vin}
                    </p>
                    <div className="flex items-center gap-1.5 text-[13px] text-[var(--text-tertiary)] leading-snug">
                      <span className="truncate max-w-[200px]">{job.pickupAddress}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-40">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                      <span className="truncate max-w-[200px]">{job.dropoffAddress}</span>
                    </div>
                  </div>
                  <div className="text-right space-y-0.5 shrink-0 ml-4">
                    <p className="text-[13px] font-medium text-[var(--text-secondary)]">
                      {job.carrierName || "No carrier"}
                    </p>
                    {job.deliveryDeadline && (
                      <p className="text-[12px] text-[var(--text-tertiary)]">
                        {new Date(job.deliveryDeadline).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            </Card>
          );
        })}
      </div>
    </PageContainer>
  );
}
