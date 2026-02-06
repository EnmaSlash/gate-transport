"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  PageContainer, PageHeader, Card, Badge, Button, Alert,
} from "@/components/ui";

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("jwt") : null;
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const FILTER_OPTIONS = [
  { label: "All", statuses: "RELEASED,CANCELLED" },
  { label: "Released", statuses: "RELEASED" },
  { label: "Cancelled", statuses: "CANCELLED" },
] as const;

interface Job {
  id: string;
  vin: string;
  status: string;
  carrierName: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  priceCents: number;
  updatedAt: string;
}

export default function HistoryPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const loadJobs = useCallback(async (statuses: string, loadCursor?: string | null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: statuses, limit: "20" });
      if (loadCursor) params.set("cursor", loadCursor);
      const res = await fetch(`/api/jobs?${params}`, { headers: authHeaders() });
      const data = await res.json();
      if (!data.ok) { setError(data.detail || data.error || "Failed to load"); return; }
      if (loadCursor) {
        setJobs((prev) => [...prev, ...data.jobs]);
      } else {
        setJobs(data.jobs);
      }
      setCursor(data.nextCursor);
      setHasMore(!!data.nextCursor);
      setError("");
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    setCursor(null);
    setHasMore(false);
    loadJobs(FILTER_OPTIONS[activeFilter].statuses);
  }, [activeFilter, loadJobs]);

  return (
    <PageContainer size="lg">
      <PageHeader
        title="History"
        subtitle="Completed and cancelled shipments"
        back={{ label: "Back", onClick: () => router.push("/admin/shipments") }}
      />

      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-5">
        {FILTER_OPTIONS.map((opt, i) => (
          <button
            key={opt.label}
            onClick={() => setActiveFilter(i)}
            className={`rounded-full px-4 py-1.5 text-[13px] font-semibold
                        transition-all duration-150 whitespace-nowrap ${
              activeFilter === i
                ? "bg-[var(--brand-600)] text-white shadow-[var(--shadow-brand)]"
                : "bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:border-[var(--brand-200)] hover:text-[var(--brand-600)]"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && <Alert variant="error" className="mb-5">{error}</Alert>}

      {loading && jobs.length === 0 && (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
              <div className="shimmer h-5 w-20 rounded-full mb-3" />
              <div className="shimmer h-4 w-40 rounded mb-2" />
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
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <p className="text-[16px] font-semibold text-[var(--text-primary)]">No completed shipments yet</p>
          <p className="text-[14px] text-[var(--text-tertiary)] mt-1.5">Completed and cancelled jobs will appear here.</p>
        </Card>
      )}

      <div className="space-y-2">
        {jobs.map((job) => {
          const isCancelled = job.status === "CANCELLED";
          return (
            <Card key={job.id} hover className={`p-0 overflow-hidden ${isCancelled ? "opacity-70" : ""}`}>
              <button
                onClick={() => router.push(`/admin/jobs/${job.id}`)}
                className="w-full text-left p-5 hover:bg-[var(--bg-muted)]/50 transition-colors relative"
              >
                {/* Left accent strip */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-[var(--radius-lg)] ${
                  isCancelled ? "bg-[var(--status-gray-text)]" : "bg-[var(--status-green-text)]"
                }`} />
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-mono text-[var(--text-tertiary)]">
                      {job.id.slice(0, 8)}
                    </span>
                    <Badge variant={isCancelled ? "gray" : "green"}>
                      {isCancelled ? "Cancelled" : "Released"}
                    </Badge>
                  </div>
                  <span className={`text-[18px] font-bold tabular-nums ${
                    isCancelled ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]"
                  }`}>
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
                      {job.carrierName || "—"}
                    </p>
                    <p className="text-[12px] text-[var(--text-tertiary)]">
                      {new Date(job.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </button>
            </Card>
          );
        })}
      </div>

      {hasMore && (
        <div className="mt-5 text-center">
          <Button
            variant="secondary"
            disabled={loading}
            onClick={() => loadJobs(FILTER_OPTIONS[activeFilter].statuses, cursor)}
          >
            {loading ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </PageContainer>
  );
}
