import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync, verify } from 'node:crypto';
import { ProviderConfigService } from './provider-config.service';
import {
  ProviderHttpService,
  ProviderRequestError,
} from './provider-http.service';
import { BfaClient } from './bfa.client';
import {
  MercadoPagoPayoutsClient,
  PayoutRequest,
} from './mercadopago-payouts.client';
import { MercadoLibreClient, MercadoLibreItem } from './mercadolibre.client';

const company = 'company-1';
const hash = 'a'.repeat(64);
function setup(values: Record<string, string> = {}) {
  const settings = new ConfigService(values);
  const config = new ProviderConfigService(settings);
  const http = { request: jest.fn() };
  return {
    settings,
    config,
    http,
    bfa: new BfaClient(config, http as never),
    payouts: new MercadoPagoPayoutsClient(config, http as never),
    ml: new MercadoLibreClient(config, http as never),
  };
}
const payout: PayoutRequest = {
  externalReference: 'settlement-1',
  idempotencyKey: 'b1d0a2a3-373b-4ee7-bf2b-18f111584cc0',
  amount: '100.50',
  currency: 'ARS',
  recipientEmail: 'owner@example.test',
};
const payoutResult = {
  id: 'POP123',
  status: 'created',
  external_reference: payout.externalReference,
  transactions: [
    {
      id: 'TOP123',
      external_reference: payout.externalReference,
      amount: { currency: 'ARS', value: 100.5 },
    },
  ],
};
const item: MercadoLibreItem = {
  title: 'Venta departamento',
  category_id: 'MLA401686',
  price: 100000,
  currency_id: 'USD',
  available_quantity: 1,
  buying_mode: 'classified',
  listing_type_id: 'silver',
  condition: 'not_specified',
  pictures: [{ source: 'https://images.example.test/property.jpg' }],
  seller_contact: {
    contact: 'Agent',
    area_code: '11',
    phone: '44445555',
    country_code2: '54',
    area_code2: '11',
    phone2: '44446666',
  },
  location: { address_line: 'Test 100', city: { id: 'CITY1' } },
  attributes: [],
};
const itemResult = {
  id: 'MLA123',
  seller_id: 42,
  permalink: 'https://departamento.mercadolibre.com.ar/MLA123',
  status: 'active',
};
const mlSettings = {
  MERCADOLIBRE_ENABLED: 'true',
  MERCADOLIBRE_ACCOUNTS_JSON: JSON.stringify({
    [company]: { accessToken: 'private-token', sellerId: 42 },
  }),
};
const mpSettings = {
  MERCADOPAGO_PAYOUTS_ENABLED: 'true',
  MERCADOPAGO_PAYOUTS_ACCOUNTS_JSON: JSON.stringify({
    [company]: { accessToken: 'private-token', sandbox: true },
  }),
};

describe('disabled external providers', () => {
  it('rejects all external operations with no settings, including in test mode', async () => {
    const f = setup();
    await expect(f.bfa.submit(hash)).rejects.toThrow('temporarily disabled');
    await expect(f.bfa.verify(hash)).rejects.toThrow('temporarily disabled');
    await expect(f.payouts.create(company, payout)).rejects.toThrow(
      'temporarily disabled',
    );
    await expect(
      f.payouts.transaction(company, 'POP123', 'TOP123', payout),
    ).rejects.toThrow('temporarily disabled');
    await expect(f.ml.create(company, item)).rejects.toThrow(
      'temporarily disabled',
    );
    await expect(f.ml.exchangeToken({ refreshToken: 'token' })).rejects.toThrow(
      'temporarily disabled',
    );
    expect(f.http.request).not.toHaveBeenCalled();
  });

  it.each(['', '{}', 'invalid-json', JSON.stringify({ [company]: {} })])(
    'fails closed for missing or malformed accounts (%s)',
    async (accounts) => {
      const f = setup({
        ...mpSettings,
        MERCADOPAGO_PAYOUTS_ACCOUNTS_JSON: accounts,
      });
      await expect(f.payouts.create(company, payout)).rejects.toThrow();
      expect(f.http.request).not.toHaveBeenCalled();
    },
  );

  it('does not reuse another company account', async () => {
    const f = setup({ ...mpSettings, ...mlSettings });
    await expect(f.payouts.create('foreign', payout)).rejects.toThrow(
      'not configured for this company',
    );
    await expect(f.ml.get('foreign', 'MLA123')).rejects.toThrow(
      'not configured for this company',
    );
    expect(f.http.request).not.toHaveBeenCalled();
  });
});

describe('BFA TSA2 protocol', () => {
  const settings = {
    BFA_ENABLED: 'true',
    BFA_TSA_URL: 'https://tsa.example.test/',
  };
  it('sends only the SHA-256 digest and requires a separate verified proof', async () => {
    const f = setup(settings);
    expect(f.bfa.digest(Buffer.from('test'))).toBe(
      '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    );
    f.http.request
      .mockResolvedValueOnce('success')
      .mockResolvedValueOnce({ stamped: false, stamps: [] });
    await f.bfa.submit(hash);
    expect(f.http.request).toHaveBeenCalledWith(
      'BFA',
      'https://tsa.example.test/stamp',
      expect.objectContaining({
        body: JSON.stringify({ hashes: [`0x${hash}`] }),
      }),
    );
    await expect(f.bfa.verify(hash)).resolves.toEqual({
      stamped: false,
      stamps: [],
    });
    expect(f.http.request.mock.calls[1][1]).toBe(
      `https://tsa.example.test/verify/0x${hash}`,
    );
  });
  it('accepts a complete proof and rejects a claimed stamp without blockchain evidence', async () => {
    const f = setup(settings);
    const proof = {
      stamped: true,
      stamps: [
        {
          whostamped: '0x' + '1'.repeat(40),
          blocknumber: '123',
          blocktimestamp: 1700000000,
        },
      ],
    };
    f.http.request
      .mockResolvedValueOnce(proof)
      .mockResolvedValueOnce({ stamped: true, stamps: [] })
      .mockResolvedValueOnce('unexpected');
    await expect(f.bfa.verify(hash)).resolves.toEqual(proof);
    await expect(f.bfa.verify(hash)).rejects.toBeInstanceOf(
      ProviderRequestError,
    );
    await expect(f.bfa.submit(hash)).rejects.toMatchObject({
      outcomeUnknown: true,
    });
  });
  it.each([
    '',
    'not-a-url',
    'http://tsa.example.test',
    'https://user:secret@tsa.example.test',
    'https://tsa.example.test?key=secret',
  ])('rejects unsafe or missing endpoints', async (url) => {
    const f = setup({ ...settings, BFA_TSA_URL: url });
    await expect(f.bfa.submit(hash)).rejects.toThrow();
    expect(f.http.request).not.toHaveBeenCalled();
  });
  it('validates the digest before transmission', async () => {
    const f = setup(settings);
    await expect(f.bfa.verify('not-a-digest')).rejects.toThrow('SHA-256');
    expect(f.http.request).not.toHaveBeenCalled();
  });
});

describe('Mercado Pago Payouts protocol', () => {
  const bankAccount = {
    accountType: 'checking' as const,
    holder: 'Test Recipient',
    number: '0000001234567876543210',
    bankId: '015',
    ownerValue: '12345678',
    ownerType: 'DNI',
  };
  it.each([undefined, '0001'])(
    'serializes a bank destination with optional branch %s',
    async (branch) => {
      const f = setup(mpSettings);
      f.http.request.mockResolvedValue(payoutResult);
      await f.payouts.create(company, {
        ...payout,
        recipientEmail: undefined,
        bankAccount: { ...bankAccount, branch },
      });
      const request = f.http.request.mock.calls[0][2];
      expect(JSON.parse(request.body).transactions[0].account).toEqual({
        holder: bankAccount.holder,
        number: bankAccount.number,
        bank_id: bankAccount.bankId,
        owner_value: bankAccount.ownerValue,
        owner_type: bankAccount.ownerType,
        ...(branch ? { branch } : {}),
      });
      expect(request.headers['X-Idempotency-Key']).toBe(payout.idempotencyKey);
    },
  );
  it.each([
    { recipientEmail: undefined },
    { bankAccount },
    {
      recipientEmail: undefined,
      bankAccount: { ...bankAccount, accountType: 'savings' },
    },
    {
      recipientEmail: undefined,
      bankAccount: { ...bankAccount, ownerValue: '' },
    },
    {
      recipientEmail: undefined,
      bankAccount: { ...bankAccount, bankId: '15' },
    },
    {
      recipientEmail: undefined,
      bankAccount: { ...bankAccount, number: 'invalid' },
    },
  ])(
    'rejects missing, conflicting or invalid recipients without provider traffic: %p',
    async (destination) => {
      const f = setup(mpSettings);
      await expect(
        f.payouts.create(company, {
          ...payout,
          ...destination,
        } as PayoutRequest),
      ).rejects.toThrow('Invalid payout request');
      expect(f.http.request).not.toHaveBeenCalled();
    },
  );
  it('keeps bank transfers disabled when unconfigured', async () => {
    const f = setup();
    await expect(
      f.payouts.create(company, {
        ...payout,
        recipientEmail: undefined,
        bankAccount,
      }),
    ).rejects.toThrow('disabled');
    expect(f.http.request).not.toHaveBeenCalled();
  });

  it('reuses the supplied idempotency key and leaves accepted transfers unconfirmed', async () => {
    const f = setup(mpSettings);
    f.http.request.mockResolvedValue(payoutResult);
    await f.payouts.create(company, payout);
    await f.payouts.create(company, payout);
    expect(f.http.request.mock.calls[0]).toEqual(f.http.request.mock.calls[1]);
    const request = f.http.request.mock.calls[0][2];
    expect(request.headers).toMatchObject({
      'X-Idempotency-Key': payout.idempotencyKey,
      'X-test-token': 'true',
      'X-enforce-signature': 'false',
    });
    expect(JSON.parse(request.body).transactions[0]).toMatchObject({
      account: { email: payout.recipientEmail },
      amount: { currency: 'ARS', value: 100.5 },
    });
    expect(
      f.payouts.isAccredited({
        ...payoutResult.transactions[0],
        status: 'success',
        status_detail: 'in_progress',
      }),
    ).toBe(false);
  });
  it('signs the exact production request bytes with Ed25519', async () => {
    const keys = generateKeyPairSync('ed25519');
    const pem = keys.privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString();
    const f = setup({
      ...mpSettings,
      MERCADOPAGO_PAYOUTS_ACCOUNTS_JSON: JSON.stringify({
        [company]: {
          accessToken: 'private-token',
          sandbox: false,
          signingPrivateKey: pem,
        },
      }),
    });
    f.http.request.mockResolvedValue(payoutResult);
    await f.payouts.create(company, payout);
    const request = f.http.request.mock.calls[0][2];
    expect(request.headers['X-enforce-signature']).toBe('true');
    expect(
      verify(
        null,
        Buffer.from(request.body),
        keys.publicKey,
        Buffer.from(request.headers['X-signature'], 'base64'),
      ),
    ).toBe(true);
    expect(
      verify(
        null,
        Buffer.from(request.body + ' '),
        keys.publicKey,
        Buffer.from(request.headers['X-signature'], 'base64'),
      ),
    ).toBe(false);
  });
  it.each([undefined, 'invalid-key'])(
    'requires a valid production signing key',
    async (key) => {
      const f = setup({
        ...mpSettings,
        MERCADOPAGO_PAYOUTS_ACCOUNTS_JSON: JSON.stringify({
          [company]: {
            accessToken: 'token',
            sandbox: false,
            signingPrivateKey: key,
          },
        }),
      });
      await expect(f.payouts.create(company, payout)).rejects.toThrow(
        'Ed25519',
      );
      expect(f.http.request).not.toHaveBeenCalled();
    },
  );
  it.each(['0.50', '1.001', '-1.00', '10000000001.00'])(
    'rejects unsupported amounts (%s)',
    async (amount) => {
      const f = setup(mpSettings);
      await expect(
        f.payouts.create(company, { ...payout, amount }),
      ).rejects.toThrow('Invalid payout');
      expect(f.http.request).not.toHaveBeenCalled();
    },
  );
  it('checks amount, reference and transaction identity on reconciliation', async () => {
    const f = setup(mpSettings);
    const transaction = {
      ...payoutResult.transactions[0],
      status: 'success',
      status_detail: 'accredited',
    };
    f.http.request.mockResolvedValueOnce(transaction).mockResolvedValueOnce({
      ...transaction,
      external_reference: 'different',
    });
    const confirmed = await f.payouts.transaction(
      company,
      'POP123',
      'TOP123',
      payout,
    );
    expect(f.payouts.isAccredited(confirmed)).toBe(true);
    await expect(
      f.payouts.transaction(company, 'POP123', 'TOP123', payout),
    ).rejects.toMatchObject({ outcomeUnknown: false });
    await expect(
      f.payouts.transaction(company, '../invalid', 'TOP123', payout),
    ).rejects.toThrow('identifiers');
  });
  it('treats malformed or mismatching accepted responses as ambiguous', async () => {
    const f = setup(mpSettings);
    f.http.request
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ ...payoutResult, external_reference: 'other' });
    await expect(f.payouts.create(company, payout)).rejects.toMatchObject({
      outcomeUnknown: true,
    });
    await expect(f.payouts.create(company, payout)).rejects.toMatchObject({
      outcomeUnknown: true,
    });
  });
});

describe('Mercado Libre classifieds protocol', () => {
  it('validates a stored publication without any provider request', () => {
    const f = setup();
    expect(f.ml.validateListing(item)).toEqual(item);
    expect(() => f.ml.validateListing({})).toThrow('incomplete');
    expect(f.http.request).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    'checks whether the description exists before writing it (%s)',
    async (exists) => {
      const f = setup(mlSettings);
      f.http.request.mockResolvedValueOnce(itemResult);
      if (exists) f.http.request.mockResolvedValueOnce({ plain_text: 'Old' });
      else
        f.http.request.mockRejectedValueOnce(
          new ProviderRequestError('MERCADOLIBRE', false, 404),
        );
      f.http.request.mockResolvedValueOnce({});
      await f.ml.upsertDescription(company, 'MLA123', 'New');
      expect(f.http.request.mock.calls.map((call) => call[2].method)).toEqual([
        'GET',
        'GET',
        exists ? 'PUT' : 'POST',
      ]);
    },
  );
  it('does not create a description on a failed read or invalid input', async () => {
    const f = setup(mlSettings);
    f.http.request
      .mockResolvedValueOnce(itemResult)
      .mockRejectedValueOnce(
        new ProviderRequestError('MERCADOLIBRE', false, 503),
      );
    await expect(
      f.ml.upsertDescription(company, 'MLA123', 'New'),
    ).rejects.toThrow();
    expect(f.http.request).toHaveBeenCalledTimes(2);
    f.http.request.mockResolvedValue(itemResult);
    await expect(f.ml.upsertDescription(company, 'MLA123', '')).rejects.toThrow(
      'Invalid listing description',
    );
    await expect(
      setup().ml.upsertDescription(company, 'MLA123', 'New'),
    ).rejects.toThrow('disabled');
  });

  it('verifies the seller, validates then creates without silently posting a description twice', async () => {
    const f = setup(mlSettings);
    f.http.request
      .mockResolvedValueOnce({ id: 42 })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(itemResult);
    await expect(f.ml.create(company, item)).resolves.toEqual(itemResult);
    expect(f.http.request.mock.calls.map((call) => call[1])).toEqual([
      'https://api.mercadolibre.com/users/me',
      'https://api.mercadolibre.com/items/validate',
      'https://api.mercadolibre.com/items',
    ]);
    expect(JSON.parse(f.http.request.mock.calls[2][2].body)).toMatchObject({
      buying_mode: 'classified',
      category_id: item.category_id,
      seller_contact: item.seller_contact,
    });
  });
  it('refuses a token for another seller or incomplete publication data', async () => {
    const f = setup(mlSettings);
    f.http.request.mockResolvedValue({ id: 99 });
    await expect(f.ml.create(company, item)).rejects.toThrow('seller');
    expect(f.http.request).toHaveBeenCalledTimes(1);
    await expect(
      f.ml.create(company, { ...item, pictures: [] }),
    ).rejects.toThrow('incomplete');
    expect(f.http.request).toHaveBeenCalledTimes(1);
  });
  it('updates and changes state by existing ID after ownership verification', async () => {
    const f = setup(mlSettings);
    f.http.request.mockResolvedValue(itemResult);
    await f.ml.update(company, itemResult.id, item);
    for (const status of ['paused', 'active', 'closed'] as const)
      await f.ml.setStatus(company, itemResult.id, status);
    await f.ml.description(company, itemResult.id, 'Descripción', true);
    await f.ml.description(company, itemResult.id, 'Actualizada', false);
    const mutations = f.http.request.mock.calls.filter(
      (call) => call[2].method !== 'GET',
    );
    expect(mutations.map((call) => call[2].method)).toEqual([
      'PUT',
      'PUT',
      'PUT',
      'PUT',
      'POST',
      'PUT',
    ]);
    expect(mutations.every((call) => call[1].includes('/items/MLA123'))).toBe(
      true,
    );
  });
  it('rejects foreign ownership, unsafe URLs and invalid remote identities', async () => {
    const f = setup(mlSettings);
    await expect(f.ml.get(company, '../users')).rejects.toThrow('Invalid');
    f.http.request
      .mockResolvedValueOnce({ ...itemResult, seller_id: 99 })
      .mockResolvedValueOnce({ ...itemResult, permalink: 'https://evil.test' })
      .mockResolvedValueOnce({ ...itemResult, id: 'MLA999' });
    await expect(
      f.ml.setStatus(company, 'MLA123', 'closed'),
    ).rejects.toBeInstanceOf(ProviderRequestError);
    await expect(f.ml.get(company, 'MLA123')).rejects.toBeInstanceOf(
      ProviderRequestError,
    );
    await expect(f.ml.get(company, 'MLA123')).rejects.toBeInstanceOf(
      ProviderRequestError,
    );
    expect(
      f.http.request.mock.calls.every((call) => call[2].method === 'GET'),
    ).toBe(true);
  });
  it('exchanges and rotates OAuth tokens without disclosing client credentials in the URL', async () => {
    const f = setup({
      ...mlSettings,
      MERCADOLIBRE_CLIENT_ID: 'client',
      MERCADOLIBRE_CLIENT_SECRET: 'client-secret',
    });
    const token = {
      access_token: 'access',
      refresh_token: 'rotated',
      expires_in: 21600,
      user_id: 42,
      token_type: 'bearer',
    };
    f.http.request.mockResolvedValue(token);
    await expect(
      f.ml.exchangeToken({
        code: 'code',
        codeVerifier: 'pkce',
        redirectUri: 'https://rent.example.test/callback',
      }),
    ).resolves.toEqual(token);
    await expect(
      f.ml.exchangeToken({ refreshToken: 'refresh' }),
    ).resolves.toEqual(token);
    expect(f.http.request.mock.calls[1][2].body).toContain(
      'grant_type=refresh_token',
    );
    expect(
      f.http.request.mock.calls.every((call) => !call[1].includes('secret')),
    ).toBe(true);
    await expect(
      f.ml.exchangeToken({
        code: 'code',
        codeVerifier: 'pkce',
        redirectUri: 'http://unsafe',
      }),
    ).rejects.toThrow('HTTPS');
    f.http.request.mockResolvedValue({});
    await expect(
      f.ml.exchangeToken({ refreshToken: 'refresh' }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
  });
});

describe('provider HTTP boundary', () => {
  afterEach(() => jest.restoreAllMocks());
  it('bounds requests and forbids credential-bearing redirects', async () => {
    const fetcher = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => '{"ok":true}',
    } as Response);
    await expect(
      new ProviderHttpService().request('TEST', 'https://example.test', {
        method: 'GET',
      }),
    ).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith(
      'https://example.test',
      expect.objectContaining({
        redirect: 'error',
        signal: expect.any(AbortSignal),
      }),
    );
  });
  it.each([400, 500])(
    'redacts remote error bodies and classifies HTTP %s',
    async (status) => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue({ ok: false, status } as Response);
      await expect(
        new ProviderHttpService().request('TEST', 'https://example.test', {
          method: 'POST',
        }),
      ).rejects.toMatchObject({ status, outcomeUnknown: status >= 500 });
    },
  );
  it('does not retry a timed-out mutation or leak its error contents', async () => {
    const fetcher = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('secret-token'));
    await expect(
      new ProviderHttpService().request('TEST', 'https://example.test', {
        method: 'POST',
      }),
    ).rejects.toMatchObject({
      message: 'TEST request failed',
      outcomeUnknown: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(
      new ProviderHttpService().request('TEST', 'http://unsafe', {
        method: 'GET',
      }),
    ).rejects.toThrow('HTTPS');
  });
});
