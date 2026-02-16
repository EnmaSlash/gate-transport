export function carrierStepForStatus(status: string): "pickup" | "delivery" | "status" {
  if (["ASSIGNED", "ACCEPTED"].includes(status)) return "pickup";
  if (status === "PICKUP_CONFIRMED") return "status";
  return "status";
}

export function carrierPath(token: string, step?: "pickup" | "delivery" | "status"): string {
  const t = encodeURIComponent(token);
  if (!step) return `/c/${t}`;
  return `/c/${t}/${step}`;
}

