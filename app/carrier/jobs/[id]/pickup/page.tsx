"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getCarrierToken } from "../_components";
import { PageContainer, PageHeader, Card, Alert } from "@/components/ui";

export default function PickupPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [blocked, setBlocked] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const jwt = typeof window !== "undefined" ? localStorage.getItem("jwt") : null;
    if (!jwt) { setBlocked(true); return; }
    const t = getCarrierToken();
    setToken(t);
    if (t) router.replace(`/c/${encodeURIComponent(t)}/pickup`);
  }, [router]);

  return (
    <PageContainer>
      <PageHeader title="Carrier access" subtitle="Link required" />
      {blocked ? (
        <Alert variant="warning" className="mb-5">
          Access requires a job link. Open the link from SMS.
        </Alert>
      ) : (
        <Alert variant="info" className="mb-5">
          {token ? "Redirecting to the token-native carrier flow…" : `Open the carrier link for job ${id}.`}
        </Alert>
      )}

      <Card className="py-8 text-center">
        <p className="text-sm text-[var(--text-secondary)]">
          Carrier pages now live under <span className="font-mono">/c/&lt;token&gt;</span>.
        </p>
      </Card>
    </PageContainer>
  );
}
