"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { statusRouteForToken, uploadFile } from "@/app/carrier/jobs/[id]/_components";
import {
  PageContainer, PageHeader, Card, Row, Badge, Button, Alert, Field,
  NextStepBanner, ProgressBar,
} from "@/components/ui";
import { carrierFetchJson, carrierPostJson } from "@/app/c/_lib/carrierFetch";
import { evaluatePickupPhase } from "@/lib/evaluatePhase";
import {
  type UploadItem,
  newUploadId,
  uploadFileWithProgress,
  submitPhotoEvidence,
} from "@/app/c/_lib/uploadEvidence";

const SIM_ENABLED =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_ENABLE_SIM_EVIDENCE === "true";

export function PickupFlow({ jobId, token }: { jobId: string; token: string }) {
  const router = useRouter();
  const [review, setReview] = useState<any>(null);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [pickupUploads, setPickupUploads] = useState<UploadItem[]>([]);
  const [vinPhoto, setVinPhoto] = useState<File | null>(null);
  const pickupRef = useRef<HTMLInputElement>(null);
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
    if (!["ASSIGNED", "ACCEPTED"].includes(status)) {
      router.replace(statusRouteForToken(token, status));
    }
  }, [review, router, token]);

  async function handleAccept() {
    setActionMsg("");
    setLoading("accept");
    const r = await carrierPostJson(token, `/api/jobs/${jobId}/accept`, {});
    if (r.ok && r.data?.ok) { setActionMsg("Job accepted"); await load(); }
    else { setActionMsg((r.ok ? (r.data?.detail || r.data?.error) : r.error.message) || "Failed to accept"); }
    setLoading(null);
  }

  async function handleUploadPickup() {
    const queued = pickupUploads.filter((u) => u.status === "queued");
    if (queued.length === 0) return;
    setActionMsg("");
    setLoading("upload-pickup");

    for (const u of queued) {
      setPickupUploads((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, status: "uploading", progress: 0, error: undefined } : x))
      );

      const up = await uploadFileWithProgress({
        token,
        jobId,
        file: u.file,
        onProgress: (pct) => {
          setPickupUploads((prev) =>
            prev.map((x) => (x.id === u.id ? { ...x, progress: pct } : x))
          );
        },
      });

      if (!up.ok) {
        setPickupUploads((prev) =>
          prev.map((x) => (x.id === u.id ? { ...x, status: "failed", error: up.error } : x))
        );
        continue;
      }

      const evRes = await submitPhotoEvidence({
        token,
        jobId,
        type: "pickup_photo",
        storageKey: up.storageKey,
      });

      if (!evRes.ok) {
        setPickupUploads((prev) =>
          prev.map((x) => (x.id === u.id ? { ...x, status: "failed", error: evRes.error, progress: 0 } : x))
        );
        continue;
      }

      // Update counts locally so requirements/checklist update without a full refresh.
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

      setPickupUploads((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, status: "success", progress: 100 } : x))
      );
    }

    if (pickupRef.current) pickupRef.current.value = "";
    setLoading(null);
  }

  async function uploadOnePickup(id: string) {
    const item = pickupUploads.find((u) => u.id === id);
    if (!item) return;
    if (item.status === "uploading") return;

    setActionMsg("");
    setLoading(`upload-pickup-${id}`);
    setPickupUploads((prev) =>
      prev.map((x) => (x.id === id ? { ...x, status: "uploading", progress: 0, error: undefined } : x))
    );

    const up = await uploadFileWithProgress({
      token,
      jobId,
      file: item.file,
      onProgress: (pct) => {
        setPickupUploads((prev) => prev.map((x) => (x.id === id ? { ...x, progress: pct } : x)));
      },
    });

    if (!up.ok) {
      setPickupUploads((prev) =>
        prev.map((x) => (x.id === id ? { ...x, status: "failed", error: up.error, progress: 0 } : x))
      );
      setLoading(null);
      return;
    }

    const evRes = await submitPhotoEvidence({
      token,
      jobId,
      type: "pickup_photo",
      storageKey: up.storageKey,
    });

    if (!evRes.ok) {
      setPickupUploads((prev) =>
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

    setPickupUploads((prev) =>
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

  async function handleConfirmPickup() {
    setActionMsg("");
    setLoading("pickup-confirm");
    const r = await carrierPostJson(token, `/api/jobs/${jobId}/pickup-confirm`, {});
    if (r.ok && r.data?.ok) {
      router.push(`/c/${encodeURIComponent(token)}/status`);
    } else if (r.ok && r.data?.code === "MISSING_EVIDENCE") {
      const missing = Array.isArray(r.data?.missing) ? r.data.missing.join(", ") : "missing evidence";
      setActionMsg(`Missing: ${missing}`);
    } else {
      setActionMsg((r.ok ? (r.data?.detail || r.data?.error) : r.error.message) || "Failed to confirm pickup");
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
          <div className="shimmer h-40 rounded-[var(--radius-lg)]" />
          <div className="shimmer h-32 rounded-[var(--radius-lg)]" />
        </div>
      </PageContainer>
    );
  }

  const job = review.job;
  const gate = review.gate;
  const ev = review.evidence;
  const status = job?.status;
  const isAssigned = status === "ASSIGNED";
  const isAccepted = status === "ACCEPTED";
  const hasVin = (ev?.counts?.vin_photo ?? 0) > 0;
  const pickupCount = ev?.counts?.pickup_photo ?? 0;
  const pickupNeeded = gate?.requirePickupPhotos ? gate.minPickupPhotos : 0;
  const pickupPhase = evaluatePickupPhase(gate, ev?.counts);

  return (
    <PageContainer>
      <PageHeader
        title="Pickup"
        subtitle={`VIN ${job.vin}`}
        back={{ label: "Back", onClick: () => router.push(`/c/${encodeURIComponent(token)}`) }}
      />

      <NextStepBanner
        className="mb-5"
        icon={
          isAssigned ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          )
        }
        title={isAssigned ? "Accept this job to begin" : "Upload evidence and confirm pickup"}
        description={isAssigned
          ? "Review the job details below, then accept to start the pickup process."
          : "Upload pickup photos, upload VIN photo, then confirm when you're ready to depart."}
      />

      {actionMsg && (
        <Alert
          variant={actionMsg.toLowerCase().includes("fail") ? "error" : "success"}
          className="mb-5"
        >
          {actionMsg}
        </Alert>
      )}

      {SIM_ENABLED && isAccepted && (
        <Card title="Dev tools" accent className="mb-4">
          <Alert variant="warning" className="mb-3">
            <span className="font-semibold">SIMULATION MODE</span>
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={!!loading} onClick={() => simulate("pickup_photo")}>
              +pickup_photo
            </Button>
            <Button variant="secondary" disabled={!!loading} onClick={() => simulate("vin_photo")}>
              +vin_photo
            </Button>
          </div>
          <p className="text-[12px] text-[var(--text-tertiary)] mt-2">
            Simulated evidence (dev-only). Creates Evidence rows without uploads.
          </p>
        </Card>
      )}

      <Card className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <Badge variant={isAssigned ? "gray" : "blue"}>
            {isAssigned ? "Needs acceptance" : "Accepted"}
          </Badge>
          <span className="text-[22px] font-bold text-[var(--text-primary)] tabular-nums">
            ${(job.priceCents / 100).toFixed(2)}
          </span>
        </div>
        <div className="space-y-0.5">
          <Row label="Pickup" value={job.pickupAddress} />
          <Row label="Dropoff" value={job.dropoffAddress} />
          <Row label="Carrier" value={job.carrierName || "—"} />
          {job.deliveryDeadline && (
            <Row label="Deadline" value={new Date(job.deliveryDeadline).toLocaleString()} />
          )}
        </div>
      </Card>

      <Card title="Requirements" accent className="mb-4">
        {gate?.requirePickupPhotos && (
          <ProgressBar label="Pickup photos" current={pickupCount} total={pickupNeeded} className="mb-3" />
        )}
        {!gate?.requirePickupPhotos && (
          <Row label="Pickup photos" value="Not required" />
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
                Submitted
              </span>
            ) : (
              <Badge variant="amber">Required</Badge>
            )}
          </div>
        )}
        {pickupPhase.missing.length > 0 && (
          <Alert variant="warning" className="mt-3">
            Still needed: {pickupPhase.missing.join(", ")}
          </Alert>
        )}
      </Card>

      {isAssigned && (
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={!!loading}
          onClick={handleAccept}
        >
          {loading === "accept" ? "Accepting..." : "Accept job"}
        </Button>
      )}

      {isAccepted && (
        <>
          <Card title="Pickup photos" accent className="mb-4">
            <ProgressBar label="Progress" current={pickupCount} total={pickupNeeded} className="mb-4" />
            <input
              ref={pickupRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length === 0) return;
                setPickupUploads((prev) => [
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
            {pickupUploads.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="space-y-1">
                  {pickupUploads.map((u) => (
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
                          onClick={() => uploadOnePickup(u.id)}
                        >
                          Retry
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                {pickupUploads.some((u) => u.status === "failed" && u.error) && (
                  <div className="text-[12px] text-[var(--status-red-text)]">
                    {pickupUploads.find((u) => u.status === "failed" && u.error)?.error}
                  </div>
                )}

                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={!!loading || pickupUploads.filter((u) => u.status === "queued").length === 0}
                  onClick={handleUploadPickup}
                >
                  {loading === "upload-pickup"
                    ? "Uploading..."
                    : `Upload ${pickupUploads.filter((u) => u.status === "queued").length} queued`}
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

          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={!!loading || !pickupPhase.pass}
            onClick={handleConfirmPickup}
          >
            {loading === "pickup-confirm" ? "Confirming..." : "Confirm pickup"}
          </Button>
        </>
      )}
    </PageContainer>
  );
}

