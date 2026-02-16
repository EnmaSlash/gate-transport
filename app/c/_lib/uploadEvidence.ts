export type UploadStatus = "queued" | "uploading" | "success" | "failed";

export type UploadItem = {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number; // 0..100
  error?: string;
};

export function newUploadId(file: File): string {
  // Stable-ish id for UI lists; avoids relying on crypto in older browsers.
  return `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(16).slice(2)}`;
}

export async function uploadFileWithProgress(opts: {
  token: string;
  jobId: string;
  file: File;
  onProgress?: (percent: number) => void;
}): Promise<{ ok: true; storageKey: string } | { ok: false; error: string }> {
  const { token, jobId, file, onProgress } = opts;

  return await new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;
      const pct = Math.max(0, Math.min(100, Math.round((evt.loaded / evt.total) * 100)));
      onProgress?.(pct);
    };

    xhr.onerror = () => resolve({ ok: false, error: "Network error" });
    xhr.onabort = () => resolve({ ok: false, error: "Upload aborted" });

    xhr.onload = () => {
      try {
        const status = xhr.status;
        const raw = xhr.responseText || "";
        const data = raw ? JSON.parse(raw) : null;
        if (status >= 200 && status < 300 && data?.ok && typeof data.storageKey === "string") {
          resolve({ ok: true, storageKey: data.storageKey });
          return;
        }
        const msg =
          data?.detail ||
          data?.error ||
          `Upload failed (${status})`;
        resolve({ ok: false, error: String(msg) });
      } catch (e: any) {
        resolve({ ok: false, error: e?.message ?? "Upload failed" });
      }
    };

    const form = new FormData();
    form.append("file", file);
    form.append("jobId", jobId);
    xhr.send(form);
  });
}

export async function submitPhotoEvidence(opts: {
  token: string;
  jobId: string;
  type: "pickup_photo" | "delivery_photo";
  storageKey: string;
}): Promise<
  | { ok: true; countsByType: Record<string, number>; inserted: number; skipped: number }
  | { ok: false; error: string }
> {
  const { token, jobId, type, storageKey } = opts;
  const res = await fetch(`/api/jobs/${jobId}/evidence`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ items: [{ type, storageKey }] }),
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // ignore
  }

  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.detail || data?.error || `Evidence submit failed (${res.status})` };
  }

  return {
    ok: true,
    countsByType: (data.countsByType as Record<string, number>) ?? {},
    inserted: Number(data.inserted ?? 0),
    skipped: Number(data.skipped ?? 0),
  };
}

