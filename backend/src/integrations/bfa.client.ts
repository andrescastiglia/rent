import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ProviderConfigService } from './provider-config.service';
import {
  ProviderHttpService,
  ProviderRequestError,
} from './provider-http.service';

const proofSchema = z
  .object({
    stamped: z.boolean(),
    stamps: z
      .array(
        z.object({
          whostamped: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
          blocknumber: z.string().regex(/^\d+$/),
          blocktimestamp: z.coerce.number().int().positive(),
        }),
      )
      .max(1000),
  })
  .refine((value) => value.stamped === value.stamps.length > 0);
export type BfaProof = z.infer<typeof proofSchema>;

@Injectable()
export class BfaClient {
  constructor(
    private readonly config: ProviderConfigService,
    private readonly http: ProviderHttpService,
  ) {}

  digest(bytes: Buffer): string {
    return createHash('sha256').update(bytes).digest('hex');
  }

  async submit(hash: string): Promise<void> {
    const base = this.endpoint(hash);
    // TSA2 accepts only digests. No document bytes or identifying metadata leave Rent.
    const response = await this.http.request('BFA', `${base}/stamp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashes: [`0x${hash}`] }),
    });
    if (response !== 'success') throw new ProviderRequestError('BFA', true);
    // Submission is not evidence of a confirmed blockchain stamp; verify separately.
  }

  async verify(hash: string): Promise<BfaProof> {
    const base = this.endpoint(hash);
    const response = await this.http.request(
      'BFA',
      `${base}/verify/0x${hash}`,
      { method: 'GET' },
    );
    const proof = proofSchema.safeParse(response);
    if (!proof.success) throw new ProviderRequestError('BFA', false);
    return proof.data;
  }

  private endpoint(hash: string): string {
    this.config.assertEnabled('BFA');
    if (!/^[0-9a-f]{64}$/.test(hash))
      throw new BadRequestException('A SHA-256 digest is required');
    const value = this.config.required('BFA_TSA_URL');
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new ServiceUnavailableException('Invalid BFA TSA URL');
    }
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new ServiceUnavailableException('Invalid BFA TSA URL');
    return value.replace(/\/$/, '');
  }
}
