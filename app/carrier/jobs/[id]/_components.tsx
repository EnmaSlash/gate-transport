"use client";

// ----- Auth -----

export function authHeaders(json = true): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("jwt") : null;
  const h: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (json) h["Content-Type"] = "application/json";
  return h;
}

// ----- API helpers -----

export async function uploadFile(file: File, jobId: string): Promise<string | null> {
  const form = new FormData();
  form.append("file", file);
  form.append("jobId", jobId);
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { Authorization: authHeaders(false).Authorization || "" },
    body: form,
  });
  const data = await res.json();
  if (!data.ok) return null;
  return data.storageKey;
}

export async function submitEvidenceItems(
  jobId: string,
  items: { type: string; storageKey?: string; value?: string }[],
): Promise<{ ok: boolean; accepted?: number; error?: string }> {
  const res = await fetch(`/api/jobs/${jobId}/evidence`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ items }),
  });
  const data = await res.json();
  if (!data.ok) return { ok: false, error: data.detail || data.error || "Failed" };
  return { ok: true, accepted: data.inserted };
}

export async function doAction(
  jobId: string,
  endpoint: string,
  body: Record<string, unknown> = {},
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/jobs/${jobId}/${endpoint}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) return { ok: false, error: data.detail || data.error || "Failed" };
  return { ok: true };
}

export async function fetchReview(jobId: string) {
  const res = await fetch(`/api/jobs/${jobId}/review`, { headers: authHeaders() });
  return res.json();
}

// ----- Routing -----

export function statusRoute(jobId: string, status: string): string {
  if (["ASSIGNED", "ACCEPTED"].includes(status)) return `/carrier/jobs/${jobId}/pickup`;
  if (status === "PICKUP_CONFIRMED") return `/carrier/jobs/${jobId}/delivery`;
  return `/carrier/jobs/${jobId}/status`;
}
