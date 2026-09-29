import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createPrivateKey, sign } from 'node:crypto';
import { z } from 'zod';
import { ProviderConfigService } from './provider-config.service';
import {
  ProviderHttpService,
  ProviderRequestError,
} from './provider-http.service';

const accountSchema = z.object({
  accessToken: z.string().min(1),
  sandbox: z.boolean(),
  signingPrivateKey: z.string().optional(),
});
const reference = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
export const bankAccountSchema = z.object({
  // Payouts currently supports checking accounts, not savings accounts.
  accountType: z.literal('checking'),
  holder: z.string().trim().min(1).max(200),
  number: z.string().regex(/^\d{1,34}$/),
  bankId: z.string().regex(/^\d{3}$/),
  branch: z
    .string()
    .regex(/^\d{1,10}$/)
    .optional(),
  ownerValue: z.string().regex(/^\d{1,20}$/),
  ownerType: z.string().regex(/^[A-Z]{2,10}$/),
});
const payoutSchema = z
  .object({
    externalReference: reference,
    idempotencyKey: z.string().uuid(),
    // Monetary decimal string is converted only after enforcing a cent-exact range.
    amount: z
      .string()
      .regex(/^\d{1,11}\.\d{2}$/)
      .refine((v) => Number(v) >= 1 && Number(v) <= 10000000000),
    currency: z.literal('ARS'),
    recipientEmail: z.string().email().optional(),
    bankAccount: bankAccountSchema.optional(),
  })
  .refine(
    (value) => Boolean(value.recipientEmail) !== Boolean(value.bankAccount),
  );
export type PayoutRequest = z.infer<typeof payoutSchema>;
const payoutResponse = z.object({
  id: z.string().regex(/^POP[A-Za-z0-9]+$/),
  external_reference: reference,
  status: z.string(),
  transactions: z
    .array(
      z.object({
        id: z.string().regex(/^TOP[A-Za-z0-9]+$/),
        external_reference: reference,
        amount: z.object({ currency: z.string(), value: z.number() }),
      }),
    )
    .length(1),
});
const transactionSchema = z.object({
  id: z.string(),
  external_reference: reference,
  status: z.string(),
  status_detail: z.string().optional(),
  last_update_date: z.string().datetime({ offset: true }),
  amount: z.object({ currency: z.string(), value: z.number() }),
});
export type PayoutTransaction = z.infer<typeof transactionSchema>;

@Injectable()
export class MercadoPagoPayoutsClient {
  constructor(
    private readonly config: ProviderConfigService,
    private readonly http: ProviderHttpService,
  ) {}

  validate(input: unknown): PayoutRequest {
    const parsed = payoutSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException('Invalid payout request');
    return parsed.data;
  }

  async create(companyId: string, input: PayoutRequest) {
    const account = this.config.account(
      'MERCADOPAGO_PAYOUTS',
      companyId,
      accountSchema,
    );
    const data = this.validate(input);
    const body = JSON.stringify({
      external_reference: data.externalReference,
      transactions: [
        {
          type: 'account',
          account: data.bankAccount
            ? {
                holder: data.bankAccount.holder,
                number: data.bankAccount.number,
                bank_id: data.bankAccount.bankId,
                ...(data.bankAccount.branch
                  ? { branch: data.bankAccount.branch }
                  : {}),
                owner_value: data.bankAccount.ownerValue,
                owner_type: data.bankAccount.ownerType,
              }
            : { email: data.recipientEmail },
          amount: { currency: data.currency, value: Number(data.amount) },
          external_reference: data.externalReference,
        },
      ],
    });
    const headers = this.headers(account);
    headers['X-Idempotency-Key'] = data.idempotencyKey;
    headers['X-enforce-signature'] = String(!account.sandbox);
    if (!account.sandbox)
      headers['X-signature'] = this.signature(account.signingPrivateKey, body);
    const raw = await this.http.request(
      'MERCADOPAGO_PAYOUTS',
      'https://api.mercadopago.com/v1/payouts',
      { method: 'POST', headers, body },
    );
    const result = payoutResponse.safeParse(raw);
    if (
      !result.success ||
      result.data.external_reference !== data.externalReference ||
      !this.matches(result.data.transactions[0], data)
    )
      throw new ProviderRequestError('MERCADOPAGO_PAYOUTS', true);
    return result.data;
  }

  async transaction(
    companyId: string,
    payoutId: string,
    transactionId: string,
    expected: PayoutRequest,
  ): Promise<PayoutTransaction> {
    const account = this.config.account(
      'MERCADOPAGO_PAYOUTS',
      companyId,
      accountSchema,
    );
    if (
      !/^POP[A-Za-z0-9]+$/.test(payoutId) ||
      !/^TOP[A-Za-z0-9]+$/.test(transactionId)
    )
      throw new BadRequestException('Invalid payout identifiers');
    const raw = await this.http.request(
      'MERCADOPAGO_PAYOUTS',
      `https://api.mercadopago.com/v1/payouts/${encodeURIComponent(payoutId)}/transactions/${encodeURIComponent(transactionId)}`,
      {
        method: 'GET',
        headers: this.headers(account),
      },
    );
    const result = transactionSchema.safeParse(raw);
    if (
      !result.success ||
      result.data.id !== transactionId ||
      !this.matches(result.data, expected)
    )
      throw new ProviderRequestError('MERCADOPAGO_PAYOUTS', false);
    return result.data;
  }

  isAccredited(transaction: PayoutTransaction): boolean {
    return (
      transaction.status === 'success' &&
      transaction.status_detail === 'accredited'
    );
  }

  private matches(
    value: {
      external_reference: string;
      amount: { currency: string; value: number };
    },
    expected: PayoutRequest,
  ): boolean {
    return (
      value.external_reference === expected.externalReference &&
      value.amount.currency === expected.currency &&
      value.amount.value === Number(expected.amount)
    );
  }

  private headers(
    account: z.infer<typeof accountSchema>,
  ): Record<string, string> {
    return {
      Authorization: `Bearer ${account.accessToken}`,
      'Content-Type': 'application/json',
      'X-test-token': String(account.sandbox),
    };
  }

  private signature(pem: string | undefined, body: string): string {
    try {
      if (!pem) throw new Error('missing key');
      const key = createPrivateKey(pem);
      if (key.asymmetricKeyType !== 'ed25519') throw new Error('invalid key');
      return sign(null, Buffer.from(body), key).toString('base64');
    } catch {
      throw new ServiceUnavailableException(
        'Mercado Pago Payouts requires an Ed25519 signing key',
      );
    }
  }
}
