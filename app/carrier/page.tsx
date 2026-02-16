"use client";
import { PageContainer, PageHeader, Card, Alert } from "@/components/ui";

export default function CarrierPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Carrier access"
        subtitle="Link required"
      />

      <Alert variant="warning" className="mb-5">
        Access requires a job link. Open the link from SMS.
      </Alert>

      <Card className="py-8 text-center">
        <p className="text-sm text-[var(--text-secondary)]">
          If you don&apos;t have a link, ask the dispatcher to resend it.
        </p>
      </Card>
    </PageContainer>
  );
}
