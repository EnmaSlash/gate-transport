"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PageContainer, PageHeader, Card, Button, Alert, Field, Divider,
} from "@/components/ui";

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("jwt") : null;
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

export default function NewShipmentPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    vin: "", pickupAddress: "", dropoffAddress: "", price: "",
    deliveryDeadline: "", carrierName: "", approvalMode: "manual", rail: "ach",
  });
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function createJob(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          vin: form.vin,
          pickupAddress: form.pickupAddress,
          dropoffAddress: form.dropoffAddress,
          price: Number(form.price),
          deliveryDeadline: form.deliveryDeadline,
          carrierName: form.carrierName,
          approvalMode: form.approvalMode,
          rail: form.rail,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(JSON.stringify(data.detail || data.error));
        return;
      }
      setResult(data);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
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
            Shipment created
          </h2>
          <p className="text-[13px] font-mono text-[var(--text-tertiary)] mb-8">
            {result.jobId}
          </p>
          <div className="flex gap-3">
            <Button variant="primary" onClick={() => router.push(`/admin/jobs/${result.jobId}`)}>
              Open job review
            </Button>
            <Button variant="secondary" onClick={() => router.push("/admin/shipments")}>
              Back to shipments
            </Button>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="New shipment"
        subtitle="Create a new transport job"
        back={{ label: "Back", onClick: () => router.push("/admin/shipments") }}
      />

      {error && <Alert variant="error" className="mb-5">{error}</Alert>}

      <Card>
        <form onSubmit={createJob}>
          {/* Vehicle */}
          <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--brand-600)] mb-3">
            Vehicle
          </p>
          <Field label="VIN">
            <input value={form.vin} onChange={(e) => set("vin", e.target.value)}
              placeholder="1HGCM82633A004352" className="input font-mono" />
          </Field>

          <Divider className="my-5" />

          {/* Route */}
          <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--brand-600)] mb-3">
            Route
          </p>
          <div className="space-y-4">
            <Field label="Pickup address">
              <input value={form.pickupAddress} onChange={(e) => set("pickupAddress", e.target.value)}
                placeholder="123 Origin St, City, ST" className="input" />
            </Field>
            <Field label="Dropoff address">
              <input value={form.dropoffAddress} onChange={(e) => set("dropoffAddress", e.target.value)}
                placeholder="456 Dest Ave, City, ST" className="input" />
            </Field>
          </div>

          <Divider className="my-5" />

          {/* Assignment */}
          <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--brand-600)] mb-3">
            Assignment
          </p>
          <div className="space-y-4">
            <Field label="Carrier name">
              <input value={form.carrierName} onChange={(e) => set("carrierName", e.target.value)}
                placeholder="Acme Transport LLC" className="input" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Price ($)">
                <input type="number" step="0.01" value={form.price}
                  onChange={(e) => set("price", e.target.value)} placeholder="1500.00" className="input" />
              </Field>
              <Field label="Delivery deadline">
                <input type="datetime-local" value={form.deliveryDeadline}
                  onChange={(e) => set("deliveryDeadline", e.target.value)} className="input" />
              </Field>
            </div>
          </div>

          <Divider className="my-5" />

          {/* Settings */}
          <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--brand-600)] mb-3">
            Settings
          </p>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Field label="Approval mode">
              <select value={form.approvalMode} onChange={(e) => set("approvalMode", e.target.value)}
                className="input">
                <option value="manual">Manual</option>
                <option value="auto">Auto</option>
              </select>
            </Field>
            <Field label="Payment rail">
              <select value={form.rail} onChange={(e) => set("rail", e.target.value)}
                className="input">
                <option value="ach">ACH</option>
                <option value="stripe">Stripe</option>
                <option value="balance">Balance</option>
              </select>
            </Field>
          </div>

          <Button variant="primary" size="lg" className="w-full" disabled={loading}>
            {loading && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {loading ? "Creating..." : "Create shipment"}
          </Button>
        </form>
      </Card>
    </PageContainer>
  );
}
