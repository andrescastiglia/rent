import { createHash } from 'node:crypto';
import { MercadoLibreConnectionsService } from './mercadolibre-connections.service';
import { MercadoLibreConnectionsController } from './mercadolibre-connections.controller';
import { ProviderTokenCipherService } from './provider-token-cipher.service';
import { ProviderConfigService } from './provider-config.service';
import { ConfigService } from '@nestjs/config';

const tokens = {
  access_token: 'test-access',
  refresh_token: 'test-refresh',
  user_id: 42,
  expires_in: 3600,
  token_type: 'bearer',
};
const rotated = {
  ...tokens,
  access_token: 'new-access',
  refresh_token: 'new-refresh',
};
const state = 'a'.repeat(43);
const stateHash = createHash('sha256').update(state).digest('hex');
function setup() {
  const account = {
    company_id: 'company',
    seller_id: '42',
    encrypted_tokens: 'encrypted',
    expires_at: new Date(Date.now() + 3600000),
    status: 'active',
    operation_id: 'operation',
    operation_started_at: null as Date | null,
  };
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('SELECT id FROM companies')) return [{ id: 'company' }];
    if (sql.includes('SELECT * FROM mercadolibre_connections'))
      return [account];
    if (sql.includes('WITH claimed'))
      return [
        {
          encrypted_verifier: 'encrypted',
          redirect_uri: 'https://rent.test/callback',
        },
      ];
    if (
      sql.includes('WITH saved') ||
      sql.includes('WITH cleared') ||
      sql.includes('WITH removed')
    )
      return [{ company_id: 'company' }];
    if (sql.includes('SELECT seller_id'))
      return [
        { sellerId: '42', status: 'active', expiresAt: account.expires_at },
      ];
    return [];
  });
  const db = { query, transaction: jest.fn(async (work) => work({ query })) };
  const settings: Record<string, string> = {
    MERCADOLIBRE_CLIENT_ID: '123',
    MERCADOLIBRE_CLIENT_SECRET: 'secret',
    MERCADOLIBRE_REDIRECT_URI: 'https://rent.test/callback',
  };
  const config = {
    enabled: jest.fn().mockReturnValue(true),
    assertEnabled: jest.fn(),
    required: jest.fn((name: string) => settings[name]),
  };
  const cipher = {
    assertConfigured: jest.fn(),
    encrypt: jest.fn().mockReturnValue('ciphertext'),
    decrypt: jest.fn((_value: string, context: string) =>
      context.includes(':pkce:') ? 'verifier' : JSON.stringify(tokens),
    ),
  };
  const oauth = { exchangeToken: jest.fn().mockResolvedValue(rotated) };
  const service = new MercadoLibreConnectionsService(
    db as never,
    config as never,
    cipher as never,
    oauth as never,
  );
  return { service, query, db, config, cipher, oauth, account, settings };
}

describe('Mercado Libre connection lifecycle', () => {
  it('blocks disabled use before accessing storage or cryptographic settings', async () => {
    const f = setup();
    f.config.assertEnabled.mockImplementation(() => {
      throw new Error('disabled');
    });
    await expect(f.service.begin('company', 'user')).rejects.toThrow(
      'disabled',
    );
    await expect(
      f.service.complete('company', 'user', state, 'code'),
    ).rejects.toThrow('disabled');
    await expect(f.service.access('company')).rejects.toThrow('disabled');
    expect(f.query).not.toHaveBeenCalled();
    expect(f.cipher.assertConfigured).not.toHaveBeenCalled();
    expect(f.oauth.exchangeToken).not.toHaveBeenCalled();
  });
  it('persists only a state digest and an encrypted PKCE verifier, then builds a fixed authorization URL', async () => {
    const f = setup();
    const result = await f.service.begin('company', 'user');
    const url = new URL(result.authorizationUrl);
    const rawState = url.searchParams.get('state')!;
    const hash = createHash('sha256').update(rawState).digest('hex');
    expect(url.origin).toBe('https://auth.mercadolibre.com.ar');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO mercadolibre_authorizations'),
      [hash, 'company', 'user', 'ciphertext', 'https://rent.test/callback'],
    );
    expect(f.cipher.encrypt).toHaveBeenCalledWith(
      expect.any(String),
      `mercadolibre:pkce:company:${hash}`,
    );
    expect(f.oauth.exchangeToken).not.toHaveBeenCalled();
  });
  it.each([
    'not-a-url',
    'http://rent.test',
    'https://user:pass@rent.test',
    'https://rent.test/?next=x',
    'https://rent.test/#x',
  ])('rejects unsafe redirect %s before storing state', async (uri) => {
    const f = setup();
    f.settings.MERCADOLIBRE_REDIRECT_URI = uri;
    await expect(f.service.begin('company', 'user')).rejects.toThrow(
      'Invalid Mercado Libre redirect',
    );
    expect(f.query).not.toHaveBeenCalled();
  });
  it('requires authenticated scope, a configured key and a known company', async () => {
    const f = setup();
    await expect(f.service.begin('', 'user')).rejects.toThrow('Company scope');
    await expect(f.service.begin('company', '')).rejects.toThrow('User scope');
    f.cipher.assertConfigured.mockImplementationOnce(() => {
      throw new Error('key missing');
    });
    await expect(f.service.begin('company', 'user')).rejects.toThrow(
      'key missing',
    );
    f.query.mockResolvedValueOnce([]);
    await expect(f.service.begin('company', 'user')).rejects.toThrow(
      'Company not found',
    );
  });
  it('does not replace an authorization exchange already in progress', async () => {
    const f = setup();
    const query = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql) =>
      sql.includes('SELECT state_hash')
        ? ([{ state_hash: 'busy' }] as never)
        : query(sql),
    );
    await expect(f.service.begin('company', 'user')).rejects.toThrow(
      'already in progress',
    );
    expect(f.oauth.exchangeToken).not.toHaveBeenCalled();
  });
  it('consumes a scoped one-time state before exchanging and persists both tokens together', async () => {
    const f = setup();
    await expect(
      f.service.complete('company', 'user', state, 'code'),
    ).resolves.toMatchObject({ status: 'active' });
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('WITH claimed'),
      [stateHash, 'company', 'user', expect.any(String)],
    );
    expect(f.cipher.decrypt).toHaveBeenCalledWith(
      'encrypted',
      `mercadolibre:pkce:company:${stateHash}`,
    );
    expect(f.oauth.exchangeToken).toHaveBeenCalledWith({
      code: 'code',
      redirectUri: 'https://rent.test/callback',
      codeVerifier: 'verifier',
    });
    expect(f.cipher.encrypt).toHaveBeenCalledWith(
      expect.any(String),
      'mercadolibre:tokens:company:42',
    );
    expect(JSON.parse(f.cipher.encrypt.mock.calls[0][0])).toEqual(rotated);
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('WITH saved'),
      [
        'company',
        expect.any(String),
        42,
        'ciphertext',
        expect.any(Date),
        'user',
      ],
    );
  });
  it('allows an initial connection without a seller binding', async () => {
    const f = setup();
    const query = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql) =>
      sql.includes('SELECT * FROM mercadolibre_connections') ? [] : query(sql),
    );
    await expect(
      f.service.complete('company', 'user', state, 'code'),
    ).resolves.toMatchObject({ status: 'active' });
  });
  it.each([
    ['', state, 'code'],
    ['user', 'bad', 'code'],
    ['user', state, ''],
    ['user', state, 'x'.repeat(2049)],
  ])(
    'rejects malformed callbacks before consuming state',
    async (user, callbackState, code) => {
      const f = setup();
      await expect(
        f.service.complete('company', user, callbackState, code),
      ).rejects.toThrow('Invalid authorization response');
      expect(f.query).not.toHaveBeenCalled();
    },
  );
  it('rejects expired, reused, foreign or replaced callback state before provider access', async () => {
    const f = setup();
    const query = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql) =>
      sql.includes('WITH claimed') ? [] : query(sql),
    );
    await expect(
      f.service.complete('company', 'user', state, 'code'),
    ).rejects.toThrow('expired, used or invalid');
    expect(f.oauth.exchangeToken).not.toHaveBeenCalled();
    f.account.status = 'refreshing';
    f.account.operation_started_at = new Date();
    await expect(
      f.service.complete('company', 'user', state, 'code'),
    ).rejects.toThrow('in progress');
  });
  it('redacts failed exchanges and invalidates their state without reusing the code', async () => {
    const f = setup();
    f.oauth.exchangeToken.mockRejectedValue(new Error('private refresh token'));
    await expect(
      f.service.complete('company', 'user', state, 'code'),
    ).rejects.toThrow('authorization failed');
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'failed'"),
      [stateHash, expect.any(String)],
    );
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('WITH cleared'),
      ['company', expect.any(String)],
    );
  });
  it('fences late results when the connection operation no longer matches', async () => {
    const f = setup();
    const query = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql) =>
      sql.includes('WITH saved') || sql.includes('WITH cleared')
        ? []
        : query(sql),
    );
    await expect(
      f.service.complete('company', 'user', state, 'code'),
    ).rejects.toThrow('authorization failed');
    expect(f.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO mercadolibre_connection_events'),
      ['company', 'user', 'connected'],
    );
  });
  it('uses unexpired credentials without refresh', async () => {
    const f = setup();
    await expect(f.service.access('company')).resolves.toEqual({
      accessToken: tokens.access_token,
      sellerId: 42,
    });
    expect(f.oauth.exchangeToken).not.toHaveBeenCalled();
    expect(f.cipher.decrypt).toHaveBeenCalledWith(
      'encrypted',
      'mercadolibre:tokens:company:42',
    );
  });
  it.each(['missing', 'disconnected', 'reconnect_required'])(
    'rejects unavailable connection %s',
    async (status) => {
      const f = setup();
      f.account.status = status;
      if (status === 'missing') f.query.mockResolvedValueOnce([]);
      await expect(f.service.access('company')).rejects.toThrow(
        'requires connection',
      );
      expect(f.oauth.exchangeToken).not.toHaveBeenCalled();
    },
  );
  it('rejects access during a live renewal and clears a stale intent without repeating it', async () => {
    const f = setup();
    f.account.status = 'refreshing';
    f.account.operation_started_at = new Date();
    await expect(f.service.access('company')).rejects.toThrow('in progress');
    f.account.operation_started_at = new Date(Date.now() - 180000);
    await expect(f.service.access('company')).rejects.toThrow(
      'requires connection',
    );
    expect(f.oauth.exchangeToken).not.toHaveBeenCalled();
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('WITH cleared'),
      ['company', 'operation'],
    );
  });
  it.each(['invalid-json', JSON.stringify({ ...tokens, user_id: 99 })])(
    'redacts corrupted stored credentials',
    async (value) => {
      const f = setup();
      f.cipher.decrypt.mockReturnValue(value);
      await expect(f.service.access('company')).rejects.toThrow(
        'Stored provider credentials are invalid',
      );
      expect(f.oauth.exchangeToken).not.toHaveBeenCalled();
    },
  );
  it('commits renewal intent before replacing both encrypted tokens', async () => {
    const f = setup();
    f.account.expires_at = new Date();
    await expect(f.service.access('company')).resolves.toEqual({
      accessToken: rotated.access_token,
      sellerId: 42,
    });
    expect(f.oauth.exchangeToken).toHaveBeenCalledWith({
      refreshToken: tokens.refresh_token,
    });
    const intent = f.query.mock.calls.findIndex(([sql]) =>
      sql.includes("status = 'refreshing'"),
    );
    expect(f.query.mock.invocationCallOrder[intent]).toBeLessThan(
      f.oauth.exchangeToken.mock.invocationCallOrder[0],
    );
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('WITH saved'),
      ['company', expect.any(String), 42, 'ciphertext', expect.any(Date), null],
    );
  });
  it.each(['response', 'seller', 'storage'])(
    'requires reconnect after an uncertain or unsafe renewal (%s)',
    async (failure) => {
      const f = setup();
      f.account.expires_at = new Date();
      if (failure === 'response')
        f.oauth.exchangeToken.mockRejectedValue(new Error('secret'));
      if (failure === 'seller')
        f.oauth.exchangeToken.mockResolvedValue({ ...rotated, user_id: 99 });
      if (failure === 'storage') {
        const query = f.query.getMockImplementation()!;
        f.query.mockImplementation(async (sql) => {
          if (sql.includes('WITH saved')) throw new Error('storage failed');
          return query(sql);
        });
      }
      await expect(f.service.access('company')).rejects.toThrow(
        'requires reconnection',
      );
      expect(f.query).toHaveBeenCalledWith(
        expect.stringContaining('WITH cleared'),
        ['company', expect.any(String)],
      );
    },
  );
  it('invalidates only the current rejected access token', async () => {
    const f = setup();
    await expect(f.service.invalidate('', 'token')).rejects.toThrow(
      'Company scope',
    );
    await f.service.invalidate('company', 'old-token');
    expect(
      f.query.mock.calls.some(([sql]) => sql.includes('WITH cleared')),
    ).toBe(false);
    await f.service.invalidate('company', tokens.access_token);
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('WITH cleared'),
      ['company', 'operation'],
    );
    f.account.status = 'refreshing';
    f.query.mockClear();
    await f.service.invalidate('company', tokens.access_token);
    expect(f.query).toHaveBeenCalledTimes(1);
    f.query.mockResolvedValueOnce([]);
    await f.service.invalidate('missing', tokens.access_token);
  });
  it('returns only status metadata, including disabled/unconfigured state', async () => {
    const f = setup();
    f.config.enabled.mockReturnValue(false);
    f.query.mockResolvedValueOnce([]);
    await expect(f.service.status('company')).resolves.toEqual({
      enabled: false,
      status: 'unconfigured',
      sellerId: null,
      expiresAt: null,
    });
    await expect(f.service.status('')).rejects.toThrow('Company scope');
  });
  it('disconnects locally without requiring provider availability or emitting credentials', async () => {
    const f = setup();
    await f.service.disconnect('company', 'user');
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('WITH removed'),
      ['company'],
    );
    expect(f.oauth.exchangeToken).not.toHaveBeenCalled();
    expect(f.config.assertEnabled).not.toHaveBeenCalled();
    await expect(f.service.disconnect('', 'user')).rejects.toThrow(
      'Authenticated scope',
    );
    const query = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql) =>
      sql.includes('WITH removed') ? [] : query(sql),
    );
    await f.service.disconnect('company', 'user');
  });
  it('passes authenticated company and user scope from the controller', async () => {
    const connections = {
      status: jest.fn(),
      begin: jest.fn(),
      complete: jest.fn(),
      disconnect: jest.fn(),
    };
    const controller = new MercadoLibreConnectionsController(
      connections as never,
    );
    const req = { user: { id: 'user', companyId: 'company' } };
    await controller.status(req);
    await controller.begin(req);
    await controller.complete({ state, code: 'code' }, req);
    await controller.disconnect(req);
    expect(connections.complete).toHaveBeenCalledWith(
      'company',
      'user',
      state,
      'code',
    );
    expect(connections.disconnect).toHaveBeenCalledWith('company', 'user');
    expect(connections.status).toHaveBeenCalledWith('company');
    expect(connections.begin).toHaveBeenCalledWith('company', 'user');
  });
});

describe('Provider credential encryption', () => {
  const cipher = (key = Buffer.alloc(32, 7).toString('base64')) =>
    new ProviderTokenCipherService(
      new ProviderConfigService(
        new ConfigService({ MERCADOLIBRE_TOKEN_ENCRYPTION_KEY: key }),
      ),
    );
  it('authenticates the company context and uses a fresh nonce for each encryption', () => {
    const c = cipher();
    c.assertConfigured();
    const first = c.encrypt('test-secret', 'company-one');
    const second = c.encrypt('test-secret', 'company-one');
    expect(first).not.toBe(second);
    expect(first).not.toContain('test-secret');
    expect(c.decrypt(first, 'company-one')).toBe('test-secret');
    expect(() => c.decrypt(first, 'company-two')).toThrow(
      'cannot be decrypted',
    );
  });
  it.each(['bad', 'v2.abc.def.ghi', 'v1.a.b.c', 'v1.a.b.c.extra'])(
    'rejects malformed authenticated envelope %s',
    (value) => {
      expect(() => cipher().decrypt(value, 'company')).toThrow(
        'cannot be decrypted',
      );
    },
  );
  it.each([
    '',
    'invalid',
    Buffer.alloc(16).toString('base64'),
    Buffer.alloc(32).toString('base64').replace(/=$/, ''),
  ])('rejects invalid encryption key %s', (key) => {
    expect(() => cipher(key).assertConfigured()).toThrow();
  });
});
