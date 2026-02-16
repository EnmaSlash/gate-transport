export type PaymentReleaseResult =
  | {
      ok: true;
      provider: string;
      providerRef: string;
      idempotencyKey: string;
    }
  | {
      ok: false;
      provider: string;
      idempotencyKey: string;
      error: string;
    };

export type PaymentReleaseArgs = {
  jobId: string;
  holdId: string;
  amountCents: number;
  rail: string;
  idempotencyKey: string;
};

export interface PaymentProvider {
  name: string;
  release(args: PaymentReleaseArgs): Promise<PaymentReleaseResult>;
}

