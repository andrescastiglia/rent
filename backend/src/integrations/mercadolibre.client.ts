import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import { ProviderConfigService } from './provider-config.service';
import {
  ProviderHttpService,
  ProviderRequestError,
} from './provider-http.service';

const accountSchema = z.object({
  accessToken: z.string().min(1),
  sellerId: z.number().int().positive(),
});
const httpsUrl = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === 'https:');
const attribute = z.object({
  id: z.string().min(1),
  value_name: z.string().optional(),
  value_id: z.string().nullable().optional(),
});
const itemSchema = z.object({
  title: z.string().min(1).max(256),
  category_id: z.string().regex(/^MLA\d+$/),
  price: z.number().positive(),
  currency_id: z.enum(['ARS', 'USD']),
  available_quantity: z.literal(1),
  buying_mode: z.literal('classified'),
  listing_type_id: z.string().min(1),
  condition: z.literal('not_specified'),
  pictures: z
    .array(z.object({ source: httpsUrl }))
    .min(1)
    .max(100),
  seller_contact: z.object({
    contact: z.string().min(1),
    area_code: z.string().min(1),
    phone: z.string().min(1),
    country_code: z.string().optional(),
    country_code2: z.string().min(1),
    area_code2: z.string(),
    phone2: z.string().min(1),
    email: z.string().email().optional(),
    other_info: z.string().optional(),
    webmail: z.string().optional(),
  }),
  location: z
    .object({
      address_line: z.string().min(1),
      zip_code: z.string().optional(),
      city: z.object({ id: z.string().min(1) }).optional(),
      neighborhood: z.object({ id: z.string().min(1) }).optional(),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
    })
    .refine((value) => Boolean(value.city || value.neighborhood)),
  attributes: z.array(attribute),
});
export type MercadoLibreItem = z.infer<typeof itemSchema>;
const responseSchema = z.object({
  id: z.string().regex(/^MLA\d+$/),
  seller_id: z.number(),
  permalink: z.string().url(),
  status: z.string(),
});
const oauthSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  user_id: z.number().int().positive(),
  token_type: z.literal('bearer'),
});

@Injectable()
export class MercadoLibreClient {
  private readonly base = 'https://api.mercadolibre.com';
  constructor(
    private readonly config: ProviderConfigService,
    private readonly http: ProviderHttpService,
  ) {}

  async create(companyId: string, input: MercadoLibreItem) {
    const account = this.config.account(
      'MERCADOLIBRE',
      companyId,
      accountSchema,
    );
    const parsed = itemSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        'Mercado Libre listing data is incomplete or invalid',
      );
    const me = (await this.call(account, '/users/me', 'GET')) as {
      id?: number;
    } | null;
    if (me?.id !== account.sellerId)
      throw new ServiceUnavailableException(
        'Mercado Libre seller does not match company configuration',
      );
    await this.call(account, '/items/validate', 'POST', parsed.data);
    return this.result(
      await this.call(account, '/items', 'POST', parsed.data),
      account.sellerId,
      true,
    );
  }

  async get(companyId: string, itemId: string) {
    const account = this.config.account(
      'MERCADOLIBRE',
      companyId,
      accountSchema,
    );
    return this.ownedItem(account, itemId);
  }

  async update(
    companyId: string,
    itemId: string,
    input: Pick<
      MercadoLibreItem,
      'title' | 'price' | 'pictures' | 'attributes'
    >,
  ) {
    const account = this.config.account(
      'MERCADOLIBRE',
      companyId,
      accountSchema,
    );
    await this.ownedItem(account, itemId);
    const payload = itemSchema
      .pick({ title: true, price: true, pictures: true, attributes: true })
      .safeParse(input);
    if (!payload.success)
      throw new BadRequestException('Invalid listing update');
    return this.result(
      await this.call(account, `/items/${itemId}`, 'PUT', payload.data),
      account.sellerId,
      true,
    );
  }

  async setStatus(
    companyId: string,
    itemId: string,
    status: 'active' | 'paused' | 'closed',
  ) {
    const account = this.config.account(
      'MERCADOLIBRE',
      companyId,
      accountSchema,
    );
    if (!['active', 'paused', 'closed'].includes(status))
      throw new BadRequestException('Invalid listing status');
    await this.ownedItem(account, itemId);
    return this.result(
      await this.call(account, `/items/${itemId}`, 'PUT', { status }),
      account.sellerId,
      true,
    );
  }

  async description(
    companyId: string,
    itemId: string,
    plainText: string,
    create: boolean,
  ) {
    const account = this.config.account(
      'MERCADOLIBRE',
      companyId,
      accountSchema,
    );
    await this.ownedItem(account, itemId);
    if (!plainText.trim() || plainText.length > 50000)
      throw new BadRequestException('Invalid listing description');
    return this.call(
      account,
      `/items/${itemId}/description`,
      create ? 'POST' : 'PUT',
      { plain_text: plainText },
    );
  }

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
    const token = oauthSchema.safeParse(raw);
    if (!token.success) throw new ProviderRequestError('MERCADOLIBRE', true);
    // Caller must durably replace both tokens together before using this result.
    return token.data;
  }

  private async ownedItem(account: z.infer<typeof accountSchema>, id: string) {
    if (!/^MLA\d+$/.test(id))
      throw new BadRequestException('Invalid Mercado Libre item ID');
    const item = this.result(
      await this.call(account, `/items/${id}`, 'GET'),
      account.sellerId,
      false,
    );
    if (item.id !== id) throw new ProviderRequestError('MERCADOLIBRE', false);
    return item;
  }

  private result(raw: unknown, seller: number, mutating: boolean) {
    const result = responseSchema.safeParse(raw);
    if (!result.success || result.data.seller_id !== seller)
      throw new ProviderRequestError('MERCADOLIBRE', mutating);
    const host = new URL(result.data.permalink).hostname;
    if (
      host !== 'mercadolibre.com.ar' &&
      !host.endsWith('.mercadolibre.com.ar')
    )
      throw new ProviderRequestError('MERCADOLIBRE', mutating);
    return result.data;
  }

  private call(
    account: z.infer<typeof accountSchema>,
    path: string,
    method: string,
    payload?: unknown,
  ) {
    return this.http.request('MERCADOLIBRE', `${this.base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  }
}
