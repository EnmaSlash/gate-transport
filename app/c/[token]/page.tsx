import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/carrierInvite";
import Link from "next/link";
import { PageContainer, PageHeader, Card, Row, StatusBadge, Button, Alert } from "@/components/ui";
import { carrierPath, carrierStepForStatus } from "@/app/c/_lib/routing";

export const runtime = "nodejs";

export default async function CarrierTokenEntryPage(
  props: { params: Promise<{ token: string }> },
) {
  const { token } = await props.params;

  if (!token || typeof token !== "string") {
    return (
      <PageContainer>
        <PageHeader title="Link invalid" subtitle="This carrier link is missing or malformed." />
      </PageContainer>
    );
  }

  const tokenHash = hashToken(token);
  const now = new Date();

  const invite = await prisma.carrierInvite.findUnique({
    where: { tokenHash },
    include: {
      job: true,
    },
  });

  if (!invite) {
    return (
      <PageContainer>
        <PageHeader title="Link invalid" subtitle="Ask the dispatcher for a new link." />
      </PageContainer>
    );
  }

  if (invite.revokedAt) {
    return (
      <PageContainer>
        <PageHeader title="Link revoked" subtitle="Ask the dispatcher for a new link." />
      </PageContainer>
    );
  }

  if (invite.expiresAt && invite.expiresAt.getTime() < now.getTime()) {
    return (
      <PageContainer>
        <PageHeader title="Link expired" subtitle="Ask the dispatcher for a new link." />
      </PageContainer>
    );
  }

  await prisma.carrierInvite.update({
    where: { id: invite.id },
    data: {
      lastUsedAt: now,
      useCount: { increment: 1 },
    },
  });

  const job = invite.job;
  const nextPath = carrierPath(token, carrierStepForStatus(job.status));

  return (
    <PageContainer>
      <PageHeader title="Transport job" subtitle="Use this link for the full job lifecycle." />

      <Card className="mb-4">
        <div className="flex items-center justify-between mb-4">
          <StatusBadge status={job.status} />
          <span className="text-[22px] font-bold text-[var(--text-primary)] tabular-nums">
            ${(job.priceCents / 100).toFixed(2)}
          </span>
        </div>
        <Row label="VIN" value={job.vin} mono />
        <Row label="Pickup" value={job.pickupAddress} />
        <Row label="Dropoff" value={job.dropoffAddress} />
        {job.deliveryDeadline && (
          <Row label="Deadline" value={new Date(job.deliveryDeadline).toLocaleString()} />
        )}
      </Card>

      <Alert variant="info" className="mb-4">
        Continue to the next step. You don&apos;t need to sign in.
      </Alert>

      <Link href={nextPath} className="block">
        <Button variant="primary" size="lg" className="w-full">
          Continue
        </Button>
      </Link>
    </PageContainer>
  );
}

