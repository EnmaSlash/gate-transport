"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  fetchReview, doAction, uploadFile, submitEvidenceItems, statusRoute,
} from "../_components";
import {
  PageContainer, PageHeader, Card, Row, Badge, Button, Alert, Field,
  NextStepBanner, ProgressBar,
} from "@/components/ui";

export default function PickupPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [review, setReview] = useState<any>(null);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [pickupFiles, setPickupFiles] = useState<File[]>([]);
  const [vinValue, setVinValue] = useState("");
  const pickupRef = useRef<HTMLInputElement>(null);

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
    if (!["ASSIGNED", "ACCEPTED"].includes(status)) {
      router.replace(statusRoute(id, status));
    }
  }, [review, id, router]);

  async function handleAccept() {
    setActionMsg("");
    setLoading("accept");
    const result = await doAction(id, "accept");
    if (result.ok) { setActionMsg("Job accepted"); await load(); }
    else { setActionMsg(result.error || "Failed to accept"); }
    setLoading(null);
  }

  async function handleUploadPickup() {
    if (pickupFiles.length === 0) return;
    setActionMsg("");
    setLoading("upload-pickup");
    const items: { type: string; storageKey?: string }[] = [];
    for (const file of pickupFiles) {
      const key = await uploadFile(file, id);
      if (!key) { setActionMsg(`Failed to upload ${file.name}`); setLoading(null); return; }
      items.push({ type: "pickup_photo", storageKey: key });
    }
    const result = await submitEvidenceItems(id, items);
    setActionMsg(result.ok ? `Uploaded ${result.accepted} pickup photo(s)` : (result.error || "Upload failed"));
    setPickupFiles([]);
    if (pickupRef.current) pickupRef.current.value = "";
    await load();
    setLoading(null);
  }

  async function handleSubmitVin() {
    if (!vinValue.trim()) return;
    setActionMsg("");
    setLoading("vin");
    const result = await submitEvidenceItems(id, [{ type: "vin_scan", value: vinValue.trim() }]);
    setActionMsg(result.ok ? "VIN submitted" : (result.error || "VIN submit failed"));
    setVinValue("");
    await load();
    setLoading(null);
  }

  async function handleConfirmPickup() {
    setActionMsg("");
    setLoading("pickup-confirm");
    const result = await doAction(id, "pickup-confirm");
    if (result.ok) { router.push(`/carrier/jobs/${id}/delivery`); }
    else { setActionMsg(result.error || "Failed to confirm pickup"); }
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
  const hasVin = (ev?.counts?.vin_scan ?? 0) > 0;
  const pickupCount = ev?.counts?.pickup_photo ?? 0;
  const pickupNeeded = gate?.requirePickupPhotos ? gate.minPickupPhotos : 0;

  return (
    <PageContainer>
      <PageHeader
        title="Pickup"
        subtitle={`VIN ${job.vin}`}
        back={{ label: "Back", onClick: () => router.push("/carrier") }}
      />

      {/* Step banner */}
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
          : "Upload pickup photos, scan the VIN, then confirm when you're ready to depart."}
      />

      {actionMsg && (
        <Alert
          variant={actionMsg.toLowerCase().includes("fail") ? "error" : "success"}
          className="mb-5"
        >
          {actionMsg}
        </Alert>
      )}

      {/* Job info */}
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

      {/* Requirements with progress */}
      <Card title="Requirements" accent className="mb-4">
        {gate?.requirePickupPhotos && (
          <ProgressBar label="Pickup photos" current={pickupCount} total={pickupNeeded} className="mb-3" />
        )}
        {!gate?.requirePickupPhotos && (
          <Row label="Pickup photos" value="Not required" />
        )}
        {gate?.requireVin && (
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[13px] font-medium text-[var(--text-secondary)]">VIN scan</span>
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
        {ev?.missing?.length > 0 && (
          <Alert variant="warning" className="mt-3">
            Still needed: {ev.missing.join(", ")}
          </Alert>
        )}
      </Card>

      {/* Accept (ASSIGNED only) */}
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

      {/* Upload + confirm (ACCEPTED only) */}
      {isAccepted && (
        <>
          <Card title="Pickup photos" accent className="mb-4">
            <ProgressBar label="Progress" current={pickupCount} total={pickupNeeded} className="mb-4" />
            <input
              ref={pickupRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setPickupFiles(Array.from(e.target.files || []))}
            />
            {pickupFiles.length > 0 && (
              <Button
                variant="secondary"
                className="w-full mt-3"
                disabled={!!loading}
                onClick={handleUploadPickup}
              >
                {loading === "upload-pickup" ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Uploading...
                  </>
                ) : (
                  `Upload ${pickupFiles.length} photo${pickupFiles.length > 1 ? "s" : ""}`
                )}
              </Button>
            )}
          </Card>

          {gate?.requireVin && !hasVin && (
            <Card title="VIN scan" accent className="mb-4">
              <Field label="Scanned VIN">
                <div className="flex gap-2">
                  <input
                    value={vinValue}
                    onChange={(e) => setVinValue(e.target.value)}
                    placeholder="Enter scanned VIN"
                    className="input flex-1 font-mono"
                  />
                  <Button
                    variant="secondary"
                    disabled={!!loading || !vinValue.trim()}
                    onClick={handleSubmitVin}
                  >
                    {loading === "vin" ? "..." : "Submit"}
                  </Button>
                </div>
              </Field>
            </Card>
          )}

          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={!!loading}
            onClick={handleConfirmPickup}
          >
            {loading === "pickup-confirm" ? "Confirming..." : "Confirm pickup"}
          </Button>
        </>
      )}
    </PageContainer>
  );
}
