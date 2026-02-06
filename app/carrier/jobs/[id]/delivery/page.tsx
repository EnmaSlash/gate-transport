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

export default function DeliveryPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [review, setReview] = useState<any>(null);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [deliveryFiles, setDeliveryFiles] = useState<File[]>([]);
  const [vinValue, setVinValue] = useState("");
  const [podValue, setPodValue] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const deliveryRef = useRef<HTMLInputElement>(null);

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
    if (status !== "PICKUP_CONFIRMED") {
      if (["DELIVERY_SUBMITTED", "RELEASABLE", "RELEASED"].includes(status)) {
        setSubmitted(true);
      } else {
        router.replace(statusRoute(id, status));
      }
    }
  }, [review, id, router]);

  async function handleUploadDelivery() {
    if (deliveryFiles.length === 0) return;
    setActionMsg("");
    setLoading("upload-delivery");
    const items: { type: string; storageKey?: string }[] = [];
    for (const file of deliveryFiles) {
      const key = await uploadFile(file, id);
      if (!key) { setActionMsg(`Failed to upload ${file.name}`); setLoading(null); return; }
      items.push({ type: "delivery_photo", storageKey: key });
    }
    const result = await submitEvidenceItems(id, items);
    setActionMsg(result.ok ? `Uploaded ${result.accepted} delivery photo(s)` : (result.error || "Upload failed"));
    setDeliveryFiles([]);
    if (deliveryRef.current) deliveryRef.current.value = "";
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

  async function handleSubmitPod() {
    if (!podValue.trim()) return;
    setActionMsg("");
    setLoading("pod");
    const result = await submitEvidenceItems(id, [{ type: "pod", value: podValue.trim() }]);
    setActionMsg(result.ok ? "POD submitted" : (result.error || "POD submit failed"));
    setPodValue("");
    await load();
    setLoading(null);
  }

  async function handleSubmitDelivery() {
    setActionMsg("");
    setLoading("delivery-submit");
    const result = await doAction(id, "delivery-submit");
    if (result.ok) {
      setSubmitted(true);
      setActionMsg("Delivery submitted successfully");
    } else {
      setActionMsg(result.error || "Failed to submit delivery");
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
  const hasVin = (ev?.counts?.vin_scan ?? 0) > 0;
  const hasPod = (ev?.counts?.pod ?? 0) > 0;
  const deliveryCount = ev?.counts?.delivery_photo ?? 0;
  const deliveryNeeded = gate?.requireDeliveryPhotos ? gate.minDeliveryPhotos : 0;

  if (submitted) {
    return (
      <PageContainer>
        <div className="flex flex-col items-center justify-center py-16 text-center page-enter">
          {/* Success icon with brand gradient ring */}
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
            <Button variant="primary" onClick={() => router.push(`/carrier/jobs/${id}/status`)}>
              View status
            </Button>
            <Button variant="secondary" onClick={() => router.push("/carrier")}>
              Back to jobs
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
        back={{ label: "Back", onClick: () => router.push("/carrier") }}
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
        description="Upload delivery photos, scan VIN, and provide proof of delivery before submitting."
      />

      {actionMsg && (
        <Alert
          variant={actionMsg.toLowerCase().includes("fail") ? "error" : "success"}
          className="mb-5"
        >
          {actionMsg}
        </Alert>
      )}

      {/* Job summary */}
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

      {/* Requirements */}
      <Card title="Requirements" accent className="mb-4">
        {gate?.requireDeliveryPhotos && (
          <ProgressBar label="Delivery photos" current={deliveryCount} total={deliveryNeeded} className="mb-3" />
        )}
        {!gate?.requireDeliveryPhotos && (
          <Row label="Delivery photos" value="Not required" />
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
        {ev?.missing?.length > 0 && (
          <Alert variant="warning" className="mt-3">
            Still needed: {ev.missing.join(", ")}
          </Alert>
        )}
      </Card>

      {/* Delivery photos */}
      <Card title="Delivery photos" accent className="mb-4">
        <ProgressBar label="Progress" current={deliveryCount} total={deliveryNeeded} className="mb-4" />
        <input
          ref={deliveryRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setDeliveryFiles(Array.from(e.target.files || []))}
        />
        {deliveryFiles.length > 0 && (
          <Button
            variant="secondary"
            className="w-full mt-3"
            disabled={!!loading}
            onClick={handleUploadDelivery}
          >
            {loading === "upload-delivery" ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Uploading...
              </>
            ) : (
              `Upload ${deliveryFiles.length} photo${deliveryFiles.length > 1 ? "s" : ""}`
            )}
          </Button>
        )}
      </Card>

      {/* VIN */}
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
              <Button variant="secondary" disabled={!!loading || !vinValue.trim()} onClick={handleSubmitVin}>
                {loading === "vin" ? "..." : "Submit"}
              </Button>
            </div>
          </Field>
        </Card>
      )}

      {/* POD */}
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

      {/* Submit delivery */}
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        disabled={!!loading}
        onClick={handleSubmitDelivery}
      >
        {loading === "delivery-submit" ? "Submitting..." : "Submit delivery"}
      </Button>
    </PageContainer>
  );
}
