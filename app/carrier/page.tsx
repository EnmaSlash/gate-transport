"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageContainer, PageHeader, Card, Badge, Button, Alert, NextStepBanner } from "@/components/ui";

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("jwt") : null;
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

async function postAction(jobId: string, action: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`/api/jobs/${jobId}/${action}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return res.json();
}

interface Job {
  id: string;
  vin: string;
  status: string;
  pickupAddress: string;
  dropoffAddress: string;
  priceCents: number;
  carrierName: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  ASSIGNED:           "Needs acceptance",
  ACCEPTED:           "Ready for pickup",
  PICKUP_CONFIRMED:   "In transit",
  DELIVERY_SUBMITTED: "Awaiting review",
  RELEASABLE:         "Approved",
  RELEASED:           "Completed",
};

type BadgeVariant = "gray" | "blue" | "violet" | "amber" | "green" | "red";
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  ASSIGNED:           "gray",
  ACCEPTED:           "blue",
  PICKUP_CONFIRMED:   "violet",
  DELIVERY_SUBMITTED: "amber",
  RELEASABLE:         "green",
  RELEASED:           "green",
};

function jobRoute(jobId: string, status: string): string {
  if (["ASSIGNED", "ACCEPTED"].includes(status)) return `/carrier/jobs/${jobId}/pickup`;
  if (status === "PICKUP_CONFIRMED") return `/carrier/jobs/${jobId}/delivery`;
  return `/carrier/jobs/${jobId}/status`;
}

export default function CarrierPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function handleAction(jobId: string, action: string, body: Record<string, unknown> = {}) {
    setActionLoading(`${jobId}-${action}`);
    try {
      const data = await postAction(jobId, action, body);
      if (!data.ok) { setError(data.detail || data.error || "Action failed"); return; }
      await load();
    } catch { setError("Network error"); }
    finally { setActionLoading(null); }
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        "/api/jobs?status=ASSIGNED,ACCEPTED,PICKUP_CONFIRMED,DELIVERY_SUBMITTED,RELEASABLE,RELEASED",
        { headers: authHeaders() },
      );
      const data = await res.json();
      if (!data.ok) { setError(data.detail || data.error || "Failed to load"); return; }
      setJobs(data.jobs);
      setError("");
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const needsAction = jobs.filter((j) => ["ASSIGNED", "ACCEPTED", "PICKUP_CONFIRMED"].includes(j.status));

  return (
    <PageContainer>
      <PageHeader
        title="My jobs"
        subtitle={jobs.length > 0 ? `${jobs.length} active` : undefined}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
              </svg>
              Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { localStorage.clear(); router.push("/login"); }}>
              Sign out
            </Button>
          </div>
        }
      />

      {error && <Alert variant="error" className="mb-5">{error}</Alert>}

      {/* Next-step prompt when there are actionable jobs */}
      {!loading && needsAction.length > 0 && (
        <NextStepBanner
          className="mb-5"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
          title={needsAction.length === 1
            ? `You have 1 job that needs your attention`
            : `You have ${needsAction.length} jobs that need your attention`}
          description="Tap a job below to continue where you left off."
        />
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
              <div className="shimmer h-5 w-28 rounded mb-3" />
              <div className="shimmer h-4 w-40 rounded mb-2" />
              <div className="shimmer h-4 w-64 rounded" />
            </div>
          ))}
        </div>
      )}

      {!loading && jobs.length === 0 && !error && (
        <Card className="text-center py-14">
          <div className="text-[var(--text-tertiary)]">
            {/* Truck illustration */}
            <div className="mx-auto mb-5 w-20 h-20 rounded-full bg-[var(--brand-50)] flex items-center justify-center">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
                   stroke="var(--brand-400)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="3" width="15" height="13" rx="2" />
                <path d="M16 8h4l3 3v5a2 2 0 01-2 2h-1" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
            </div>
            <p className="text-[16px] font-semibold text-[var(--text-primary)]">No active jobs</p>
            <p className="text-[14px] mt-1.5">Jobs will appear here once assigned to you.</p>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {jobs.map((job) => {
          const isAssigned = job.status === "ASSIGNED";
          return (
            <Card key={job.id} hover className={`p-0 overflow-hidden ${
              isAssigned ? "border-[var(--brand-200)] bg-[var(--brand-50)]/30" : ""
            }`}>
              <button
                onClick={() => router.push(jobRoute(job.id, job.status))}
                className="w-full text-left p-5 hover:bg-[var(--bg-muted)]/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <Badge variant={STATUS_VARIANT[job.status] ?? "gray"}>
                    {STATUS_LABEL[job.status] ?? job.status}
                  </Badge>
                  <span className="text-[20px] font-bold text-[var(--text-primary)] tabular-nums">
                    ${(job.priceCents / 100).toFixed(2)}
                  </span>
                </div>
                <div className="space-y-1">
                  <p className="text-[14px] font-mono font-semibold text-[var(--text-primary)]">
                    {job.vin}
                  </p>
                  <div className="flex items-center gap-1.5 text-[13px] text-[var(--text-tertiary)] leading-snug">
                    <span className="truncate">{job.pickupAddress}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-40">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                    <span className="truncate">{job.dropoffAddress}</span>
                  </div>
                </div>
              </button>

              {isAssigned && (
                <div className="flex gap-2 px-5 pb-5 pt-0">
                  <Button
                    variant="primary"
                    size="sm"
                    className="flex-1"
                    disabled={!!actionLoading}
                    onClick={() => handleAction(job.id, "accept")}
                  >
                    {actionLoading === `${job.id}-accept` ? "Accepting..." : "Accept"}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    className="flex-1"
                    disabled={!!actionLoading}
                    onClick={() => handleAction(job.id, "cancel", { reason: "Declined by carrier" })}
                  >
                    {actionLoading === `${job.id}-cancel` ? "Declining..." : "Decline"}
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </PageContainer>
  );
}
