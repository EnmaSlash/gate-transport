import type { PaymentProvider } from "./provider";
import { noopProvider } from "./noop";

export function getPaymentProvider(): PaymentProvider {
  const name = (process.env.PAYMENT_PROVIDER ?? "noop").toLowerCase();
  if (name === "noop") return noopProvider;
  // Future providers (stripe/ach) will go here. Default safe fallback is noop.
  return noopProvider;
}

