"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { authHeaders, statusRoute } from "./_components";

export default function CarrierJobRouter() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/jobs/${id}`, { headers: authHeaders() });
        const data = await res.json();
        if (!data.ok) { setError(data.detail || data.error || "Failed to load job"); return; }
        const status = data.job?.status ?? data.status;
        router.replace(statusRoute(id, status));
      } catch {
        setError("Network error");
      }
    })();
  }, [id, router]);

  if (error) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10">
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <p className="text-sm text-gray-400">Loading...</p>
    </div>
  );
}
