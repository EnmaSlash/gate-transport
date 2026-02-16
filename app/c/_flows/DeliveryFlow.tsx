"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  uploadFile,
  statusRouteForToken,
} from "@/app/carrier/jobs/[id]/_components";
import {
  PageContainer, PageHeader, Card, Row, Badge, Button, Alert, Field,
  NextStepBanner, ProgressBar,
} from "@/components/ui";
import { carrierFetchJson, carrierPostJson } from "@/app/c/_lib/carrierFetch";
import { evaluateDeliveryPhase } from "@/lib/evaluatePhase";
import {
  type UploadItem,
  newUploadId,
  uploadFileWithProgress,
  submitPhotoEvidence,
} from "@/app/c/_lib/uploadEvidence";

const SIM_ENABLED =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_ENABLE_SIM_EVIDENCE === "true";

export function DeliveryFlow({ jobId, token }: { jobId: string; token: string }) {
  const router = useRouter();
  const [review, setReview] = useState<any>(null);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [deliveryUploads, setDeliveryUploads] = useState<UploadItem[]>([]);
  const [vinPhoto, setVinPhoto] = useState<File | null>(null);
  const [podValue, setPodValue] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const deliveryRef = useRef<HTMLInputElement>(null);
  const vinRef = useRef<HTMLInputElement>(null);

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
    if (status !== "PICKUP_CONFIRMED") {
      if (["DELIVERY_SUBMITTED", "RELEASABLE", "RELEASED"].includes(status)) {
        setSubmitted(true);
      } else if (["ASSIGNED", "ACCEPTED"].includes(status)) {
        // Guard: cannot start delivery before pickup is confirmed
        setError("Confirm pickup first.");
      }
    }
  }, [review, router, token]);

  async function handleUploadDelivery() {
    const queued = deliveryUploads.filter((u) => u.status === "queued");
    if (queued.length === 0) return;
    setActionMsg("");
    setLoading("upload-delivery");

    for (const u of queued) {
      setDeliveryUploads((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, status: "uploading", progress: 0, error: undefined } : x))
      );

      const up = await uploadFileWithProgress({
        token,
        jobId,
        file: u.file,
        onProgress: (pct) => {
          setDeliveryUploads((prev) =>
            prev.map((x) => (x.id === u.id ? { ...x, progress: pct } : x))
          );
        },
      });

      if (!up.ok) {
        setDeliveryUploads((prev) =>
          prev.map((x) => (x.id === u.id ? { ...x, status: "failed", error: up.error, progress: 0 } : x))
        );
        continue;
      }

      const evRes = await submitPhotoEvidence({
        token,
        jobId,
        type: "delivery_photo",
        storageKey: up.storageKey,
      });

      if (!evRes.ok) {
        setDeliveryUploads((prev) =>
          prev.map((x) => (x.id === u.id ? { ...x, status: "failed", error: evRes.error, progress: 0 } : x))
        );
        continue;
      }

      setReview((prev: any) => {
        if (!prev) return prev;
        const prevEv = prev.evidence ?? {};
        const prevCounts = prevEv.counts ?? {};
        const nextCounts = { ...prevCounts, ...evRes.countsByType };
        return {
          ...prev,
          evidence: {
            ...prevEv,
            counts: nextCounts,
            total: (prevEv.total ?? 0) + (evRes.inserted ?? 0),
          },
        };
      });

      setDeliveryUploads((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, status: "success", progress: 100 } : x))
      );
    }

    if (deliveryRef.current) deliveryRef.current.value = "";
    setLoading(null);
  }

  async function uploadOneDelivery(id: string) {
    const item = deliveryUploads.find((u) => u.id === id);
    if (!item) return;
    if (item.status === "uploading") return;

    setActionMsg("");
    setLoading(`upload-delivery-${id}`);
    setDeliveryUploads((prev) =>
      prev.map((x) => (x.id === id ? { ...x, status: "uploading", progress: 0, error: undefined } : x))
    );

    const up = await uploadFileWithProgress({
      token,
      jobId,
      file: item.file,
      onProgress: (pct) => {
        setDeliveryUploads((prev) => prev.map((x) => (x.id === id ? { ...x, progress: pct } : x)));
      },
    });

    if (!up.ok) {
      setDeliveryUploads((prev) =>
        prev.map((x) => (x.id === id ? { ...x, status: "failed", error: up.error, progress: 0 } : x))
      );
      setLoading(null);
      return;
    }

    const evRes = await submitPhotoEvidence({
      token,
      jobId,
      type: "delivery_photo",
      storageKey: up.storageKey,
    });

    if (!evRes.ok) {
      setDeliveryUploads((prev) =>
        prev.map((x) => (x.id === id ? { ...x, status: "failed", error: evRes.error, progress: 0 } : x))
      );
      setLoading(null);
      return;
    }

    setReview((prev: any) => {
      if (!prev) return prev;
      const prevEv = prev.evidence ?? {};
      const prevCounts = prevEv.counts ?? {};
      const nextCounts = { ...prevCounts, ...evRes.countsByType };
      return {
        ...prev,
        evidence: {
          ...prevEv,
          counts: nextCounts,
          total: (prevEv.total ?? 0) + (evRes.inserted ?? 0),
        },
      };
    });

    setDeliveryUploads((prev) =>
      prev.map((x) => (x.id === id ? { ...x, status: "success", progress: 100 } : x))
    );
    setLoading(null);
  }

  async function handleUploadVinPhoto() {
    if (!vinPhoto) return;
    setActionMsg("");
    setLoading("vin-photo");
    const key = await uploadFile(vinPhoto, jobId, token);
    if (!key) { setActionMsg("Failed to upload VIN photo"); setLoading(null); return; }
    const r = await carrierPostJson(token, `/api/jobs/${jobId}/evidence`, { items: [{ type: "vin_photo", storageKey: key }] });
    setActionMsg(r.ok && r.data?.ok ? "VIN photo uploaded" : ((r.ok ? (r.data?.detail || r.data?.error) : r.error.message) || "VIN upload failed"));
    setVinPhoto(null);
    if (vinRef.current) vinRef.current.value = "";
    await load();
    setLoading(null);
  }

  async function handleSubmitPod() {
    if (!podValue.trim()) return;
    setActionMsg("");
    setLoading("pod");
    const r = await carrierPostJson(token, `/api/jobs/${jobId}/evidence`, { items: [{ type: "pod", value: podValue.trim() }] });
    setActionMsg(r.ok && r.data?.ok ? "POD submitted" : ((r.ok ? (r.data?.detail || r.data?.error) : r.error.message) || "POD submit failed"));
    setPodValue("");
    await load();
    setLoading(null);
  }

  async function handleSubmitDelivery() {
    setActionMsg("");
    setLoading("delivery-submit");
    const r = await carrierPostJson(token, `/api/jobs/${jobId}/delivery-submit`, {});
    if (r.ok && r.data?.ok) {
      setSubmitted(true);
      setActionMsg("Delivery submitted successfully");
    } else if (r.ok && r.data?.code === "MISSING_EVIDENCE") {
      const missing = Array.isArray(r.data?.missing) ? r.data.missing.join(", ") : "missing evidence";
      setActionMsg(`Missing: ${missing}`);
    } else {
      setActionMsg((r.ok ? (r.data?.detail || r.data?.error) : r.error.message) || "Failed to submit delivery");
    }
    setLoading(null);
  }

  async function simulate(type: string) {
    setActionMsg("");
    setLoading(`sim-${type}`);
    const r = await carrierPostJson(token, `/api/jobs/${jobId}/evidence/simulate`, { type });
    if (r.ok && r.data?.ok) {
      const countsByType = r.data?.countsByType ?? {};
      setReview((prev: any) => {
        if (!prev) return prev;
        const prevEv = prev.evidence ?? {};
        const prevCounts = prevEv.counts ?? {};
        const nextCounts = { ...prevCounts, ...countsByType };
        return {
          ...prev,
          evidence: {
            ...prevEv,
            counts: nextCounts,
            total: (prevEv.total ?? 0) + 1,
          },
        };
      });
      setActionMsg(`Simulated: ${type}`);
    } else {
      setActionMsg((r.ok ? (r.data?.detail || r.data?.error) : r.error.message) || "Simulate failed");
    }
    setLoading(null);
  }

  if (error && !review) {
    return <PageContainer><Alert variant="error">{error}</Alert></PageContainer>;
  }
  if (!review) {
    return (
      <PageContainer>
        <div className="space-y-4">
          <div className="shimmer h-8 w-32 rounded" />
          <div className="shimmer h-24 rounded-[var(--radius-lg)]" />
          <div className="shimmer h-40 rounded-[var(--radius-lg)]" />
        </div>
      </PageContainer>
    );
  }

  const job = review.job;
  const gate = review.gate;
  const ev = review.evidence;
  const hasVin = (ev?.counts?.vin_photo ?? 0) > 0;
  const hasPod = (ev?.counts?.pod ?? 0) > 0;
  const deliveryCount = ev?.counts?.delivery_photo ?? 0;
  const deliveryNeeded = gate?.requireDeliveryPhotos ? gate.minDeliveryPhotos : 0;
  const status = job?.status;
  const deliveryPhase = evaluateDeliveryPhase(gate, ev?.counts);

  if (status !== "PICKUP_CONFIRMED" && !submitted) {
    return (
      <PageContainer>
        <PageHeader
          title="Delivery"
          subtitle="Confirm pickup first"
          back={{ label: "Back", onClick: () => router.push(`/c/${encodeURIComponent(token)}/status`) }}
        />
        <Alert variant="warning" className="mb-4">
          Confirm pickup first, then return here when you arrive at delivery.
        </Alert>
        <Button
          variant="primary"
          className="w-full"
          onClick={() => router.push(`/c/${encodeURIComponent(token)}/pickup`)}
        >
          Go to pickup
        </Button>
      </PageContainer>
    );
  }

  if (submitted) {
    return (
      <PageContainer>
        <div className="flex flex-col items-center justify-center py-16 text-center page-enter">
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-full bg-[var(--status-green-bg)] flex items-center justify-center">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--status-green-text)"
                   strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="absolute inset-0 rounded-full border-2 border-[var(--status-green-border)] animate-pulse" />
          </div>
          <h2 className="text-[22px] font-bold text-[var(--text-primary)] mb-2">
            Delivery submitted
          </h2>
          <p className="text-[14px] text-[var(--text-secondary)] max-w-xs mb-8 leading-relaxed">
            Your delivery is under review. You&apos;ll be notified when the admin approves it.
          </p>
          <div className="flex gap-3">
            <Button variant="primary" onClick={() => router.push(`/c/${encodeURIComponent(token)}/status`)}>
              View status
            </Button>
            <Button variant="secondary" onClick={() => router.push(`/c/${encodeURIComponent(token)}`)}>
              Back
            </Button>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Delivery"
        subtitle={`VIN ${job.vin}`}
        back={{ label: "Back", onClick: () => router.push(`/c/${encodeURIComponent(token)}`) }}
      />

      <NextStepBanner
        className="mb-5"
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        }
        title="Complete delivery evidence"
        description="Upload delivery photos, upload VIN photo, and provide proof of delivery before submitting."
      />

      {actionMsg && (
        <Alert
          variant={actionMsg.toLowerCase().includes("fail") ? "error" : "success"}
          className="mb-5"
        >
          {actionMsg}
        </Alert>
      )}

      {SIM_ENABLED && (
        <Card title="Dev tools" accent className="mb-4">
          <Alert variant="warning" className="mb-3">
            <span className="font-semibold">SIMULATION MODE</span>
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={!!loading} onClick={() => simulate("delivery_photo")}>
              +delivery_photo
            </Button>
            <Button variant="secondary" disabled={!!loading} onClick={() => simulate("vin_photo")}>
              +vin_photo
            </Button>
            {gate?.requirePod && (
              <Button variant="secondary" disabled={!!loading} onClick={() => simulate("pod")}>
                +pod
              </Button>
            )}
          </div>
          <p className="text-[12px] text-[var(--text-tertiary)] mt-2">
            Simulated evidence (dev-only). Creates Evidence rows without uploads.
          </p>
        </Card>
      )}

      <Card className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <Badge variant="violet">In transit</Badge>
          <span className="text-[22px] font-bold text-[var(--text-primary)] tabular-nums">
            ${(job.priceCents / 100).toFixed(2)}
          </span>
        </div>
        <Row label="Dropoff" value={job.dropoffAddress} />
        {job.deliveryDeadline && (
          <Row label="Deadline" value={new Date(job.deliveryDeadline).toLocaleString()} />
        )}
      </Card>

      <Card title="Requirements" accent className="mb-4">
        {gate?.requireDeliveryPhotos && (
          <ProgressBar label="Delivery photos" current={deliveryCount} total={deliveryNeeded} className="mb-3" />
        )}
        {!gate?.requireDeliveryPhotos && (
          <Row label="Delivery photos" value="Not required" />
        )}
        {gate?.requireVin && (
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[13px] font-medium text-[var(--text-secondary)]">VIN photo</span>
            {hasVin ? (
              <span className="inline-flex items-center gap-1 text-[13px] font-bold text-[var(--status-green-text)]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Done
              </span>
            ) : (
              <Badge variant="amber">Required</Badge>
            )}
          </div>
        )}
        {gate?.requirePod && (
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[13px] font-medium text-[var(--text-secondary)]">Proof of delivery</span>
            {hasPod ? (
              <span className="inline-flex items-center gap-1 text-[13px] font-bold text-[var(--status-green-text)]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Done
              </span>
            ) : (
              <Badge variant="amber">Required</Badge>
            )}
          </div>
        )}
        {deliveryPhase.missing.length > 0 && (
          <Alert variant="warning" className="mt-3">
            Still needed: {deliveryPhase.missing.join(", ")}
          </Alert>
        )}
      </Card>

      <Card title="Delivery photos" accent className="mb-4">
        <ProgressBar label="Progress" current={deliveryCount} total={deliveryNeeded} className="mb-4" />
        <input
          ref={deliveryRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length === 0) return;
            setDeliveryUploads((prev) => [
              ...prev,
              ...files.map((file) => ({
                id: newUploadId(file),
                file,
                status: "queued" as const,
                progress: 0,
              })),
            ]);
          }}
        />
        {deliveryUploads.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="space-y-1">
              {deliveryUploads.map((u) => (
                <div key={u.id} className="flex items-center gap-2 text-[12px]">
                  <span className="font-mono truncate flex-1">{u.file.name}</span>
                  <span className="text-[var(--text-tertiary)] w-20 text-right">
                    {u.status === "uploading" ? `${u.progress}%` : u.status}
                  </span>
                  {u.status === "failed" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!!loading}
                      onClick={() => uploadOneDelivery(u.id)}
                    >
                      Retry
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {deliveryUploads.some((u) => u.status === "failed" && u.error) && (
              <div className="text-[12px] text-[var(--status-red-text)]">
                {deliveryUploads.find((u) => u.status === "failed" && u.error)?.error}
              </div>
            )}

            <Button
              variant="secondary"
              className="w-full"
              disabled={!!loading || deliveryUploads.filter((u) => u.status === "queued").length === 0}
              onClick={handleUploadDelivery}
            >
              {loading === "upload-delivery"
                ? "Uploading..."
                : `Upload ${deliveryUploads.filter((u) => u.status === "queued").length} queued`}
            </Button>
          </div>
        )}
      </Card>

      {gate?.requireVin && !hasVin && (
        <Card title="VIN photo" accent className="mb-4">
          <Field label="Upload VIN photo">
            <input
              ref={vinRef}
              type="file"
              accept="image/*"
              onChange={(e) => setVinPhoto((e.target.files?.[0] as File) || null)}
            />
            {vinPhoto && (
              <Button
                variant="secondary"
                className="w-full mt-3"
                disabled={!!loading}
                onClick={handleUploadVinPhoto}
              >
                {loading === "vin-photo" ? "Uploading..." : "Upload VIN photo"}
              </Button>
            )}
          </Field>
        </Card>
      )}

      {gate?.requirePod && !hasPod && (
        <Card title="Proof of delivery" accent className="mb-4">
          <Field label="Recipient name or reference">
            <div className="flex gap-2">
              <input
                value={podValue}
                onChange={(e) => setPodValue(e.target.value)}
                placeholder="Recipient name or signature ref"
                className="input flex-1"
              />
              <Button variant="secondary" disabled={!!loading || !podValue.trim()} onClick={handleSubmitPod}>
                {loading === "pod" ? "..." : "Submit"}
              </Button>
            </div>
          </Field>
        </Card>
      )}

      <Button
        variant="primary"
        size="lg"
        className="w-full"
        disabled={!!loading || !deliveryPhase.pass}
        onClick={handleSubmitDelivery}
      >
        {loading === "delivery-submit" ? "Submitting..." : "Submit delivery"}
      </Button>
    </PageContainer>
  );
}

