import { PickupFlow } from "@/app/c/_flows/PickupFlow";
import { resolveCarrierTokenToJobId } from "@/app/c/_server/resolveToken";

export const runtime = "nodejs";

export default async function CarrierPickupPage(
  props: { params: Promise<{ token: string }> },
) {
  const { token } = await props.params;
  const resolved = await resolveCarrierTokenToJobId(token);

  if (!resolved.ok) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10">
        <h1 className="text-xl font-semibold mb-2">Link invalid or expired</h1>
        <p className="text-sm text-gray-600">Ask the dispatcher for a new link.</p>
      </div>
    );
  }

  return <PickupFlow jobId={resolved.jobId} token={token} />;
}

