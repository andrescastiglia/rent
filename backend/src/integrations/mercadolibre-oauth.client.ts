import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ProviderConfigService } from './provider-config.service';
import {
  ProviderHttpService,
  ProviderRequestError,
} from './provider-http.service';

const httpsUrl = z
  .url()
  .refine((value) => new URL(value).protocol === 'https:');

export const mercadoLibreOAuthTokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive().max(31536000),
  user_id: z.number().int().positive(),
  token_type: z.literal('bearer'),
});

export type MercadoLibreOAuthTokens = z.infer<
  typeof mercadoLibreOAuthTokenSchema
>;

@Injectable()
export class MercadoLibreOAuthClient {
  private readonly base = 'https://api.mercadolibre.com';
  constructor(
    private readonly config: ProviderConfigService,
    private readonly http: ProviderHttpService,
  ) {}
  async exchangeToken(
    input:
      | { code: string; redirectUri: string; codeVerifier: string }
      | { refreshToken: string },
  ) {
    this.config.assertEnabled('MERCADOLIBRE');
    const form = new URLSearchParams({
      client_id: this.config.required('MERCADOLIBRE_CLIENT_ID'),
      client_secret: this.config.required('MERCADOLIBRE_CLIENT_SECRET'),
    });
    if ('refreshToken' in input) {
      form.set('grant_type', 'refresh_token');
      form.set('refresh_token', input.refreshToken);
    } else {
      if (!httpsUrl.safeParse(input.redirectUri).success)
        throw new BadRequestException('HTTPS redirect URI required');
      form.set('grant_type', 'authorization_code');
      form.set('code', input.code);
      form.set('redirect_uri', input.redirectUri);
      form.set('code_verifier', input.codeVerifier);
    }
    const raw = await this.http.request(
      'MERCADOLIBRE',
      `${this.base}/oauth/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      },
    );
    const token = mercadoLibreOAuthTokenSchema.safeParse(raw);
    if (!token.success) throw new ProviderRequestError('MERCADOLIBRE', true);
    // Caller must durably replace both tokens together before using this result.
    return token.data;
  }
}
