import { UserRole } from '../src/users/entities/user.entity';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Company } from '../src/companies/entities/company.entity';
import { Admin } from '../src/users/entities/admin.entity';
import { UsersService } from '../src/users/users.service';
import { ProviderConfigService } from '../src/integrations/provider-config.service';
import { ProviderTokenCipherService } from '../src/integrations/provider-token-cipher.service';
import {
  ProviderHttpService,
  ProviderRequestError,
} from '../src/integrations/provider-http.service';
import { MercadoLibreOAuthClient } from '../src/integrations/mercadolibre-oauth.client';
import { MercadoLibreConnectionsService } from '../src/integrations/mercadolibre-connections.service';
import { MercadoLibreClient } from '../src/integrations/mercadolibre.client';
import {
  configureE2eApp,
  createActiveTestUser,
  createTestCompany,
  createSuperAdminTestUser,
  loginTestUser,
} from './e2e-helpers';

const tokens = {
  access_token: 'test-access-original',
  refresh_token: 'test-refresh-original',
  token_type: 'bearer' as const,
  expires_in: 3600,
  user_id: 42,
};
const rotated = {
  ...tokens,
  access_token: 'test-access-rotated',
  refresh_token: 'test-refresh-rotated',
};

describe('Mercado Libre OAuth (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  let companyId: string;
  let foreignId: string;
  let userId: string;
  let token: string;
  let foreignToken: string;
  let sameCompanyToken: string;
  let ownerToken: string;
  let exchange: jest.SpyInstance;
  let transport: jest.SpyInstance;
  let enabled = false;
  const unique = randomUUID().slice(0, 16);
  const password = 'OAuthTest123!';
  const base = '/integrations/mercadolibre';
  const settings: Record<string, string> = {
    MERCADOLIBRE_CLIENT_ID: '1234',
    MERCADOLIBRE_CLIENT_SECRET: 'test-client-secret',
    MERCADOLIBRE_REDIRECT_URI:
      'https://rent.example.test/mercadolibre/callback',
    MERCADOLIBRE_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  };
  const service = () => app.get(MercadoLibreConnectionsService);
  const row = async () =>
    (
      await db.query(
        'SELECT * FROM mercadolibre_connections WHERE company_id = $1',
        [companyId],
      )
    )[0];
  const begin = async (auth = token) => {
    const response = await request(app.getHttpServer())
      .post(`${base}/authorization`)
      .set('Authorization', `Bearer ${auth}`)
      .expect(201);
    return new URL(response.body.authorizationUrl);
  };
  const complete = (state: string, auth = token) =>
    request(app.getHttpServer())
      .post(`${base}/authorization/complete`)
      .set('Authorization', `Bearer ${auth}`)
      .send({ state, code: 'test-authorization-code' });
  const connect = async () => {
    const url = await begin();
    return complete(url.searchParams.get('state')!).expect(201);
  };
  const expire = () =>
    db.query(
      "UPDATE mercadolibre_connections SET expires_at = now() - interval '1 second' WHERE company_id = $1",
      [companyId],
    );

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureE2eApp(app);
    await app.init();
    db = app.get(DataSource);
    companyId = (
      await createTestCompany(db.getRepository(Company), {
        name: 'OAuth',
        taxId: `oauth-${unique}`,
      })
    ).id;
    foreignId = (
      await createTestCompany(db.getRepository(Company), {
        name: 'Foreign OAuth',
        taxId: `foreign-oauth-${unique}`,
      })
    ).id;
    const makeUser = async (id: string, suffix: string) => {
      const email = `${suffix}-${unique}@oauth.test`;
      const user = await createSuperAdminTestUser(
        app.get(UsersService),
        db.getRepository(Admin),
        {
          email,
          password,
          companyId: id,
          firstName: 'OAuth',
          lastName: 'Test',
        },
      );
      return {
        userId: user.id,
        token: await loginTestUser(app, email, password),
      };
    };
    const own = await makeUser(companyId, 'own');
    userId = own.userId;
    token = own.token;
    foreignToken = (await makeUser(foreignId, 'foreign')).token;
    sameCompanyToken = (await makeUser(companyId, 'colleague')).token;
    const ownerEmail = `owner-${unique}@oauth.test`;
    const owner = await createActiveTestUser(app.get(UsersService), {
      email: ownerEmail,
      password,
      companyId,
      firstName: 'Owner',
      lastName: 'Test',
      role: UserRole.OWNER,
    });
    await db.query('INSERT INTO owners(company_id,user_id) VALUES($1,$2)', [
      companyId,
      owner.id,
    ]);
    ownerToken = await loginTestUser(app, ownerEmail, password);
    const config = app.get(ProviderConfigService);
    jest.spyOn(config, 'enabled').mockImplementation(() => enabled);
    jest.spyOn(config, 'required').mockImplementation((name) => {
      if (!settings[name]) throw new Error('missing setting');
      return settings[name];
    });
    exchange = jest.spyOn(app.get(MercadoLibreOAuthClient), 'exchangeToken');
    transport = jest.spyOn(app.get(ProviderHttpService), 'request');
  });
  beforeEach(async () => {
    enabled = true;
    exchange.mockReset().mockResolvedValue(tokens);
    transport.mockReset();
    for (const table of [
      'mercadolibre_connection_events',
      'mercadolibre_authorizations',
      'mercadolibre_connections',
    ])
      await db.query(
        `DELETE FROM ${table} WHERE company_id = ANY($1::uuid[])`,
        [[companyId, foreignId]],
      );
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    for (const id of [companyId, foreignId].filter(Boolean)) {
      for (const table of [
        'mercadolibre_connection_events',
        'mercadolibre_authorizations',
        'mercadolibre_connections',
        'owners',
        'admins',
        'users',
        'companies',
      ])
        await db.query(
          `DELETE FROM ${table} WHERE ${table === 'companies' ? 'id' : 'company_id'} = $1`,
          [id],
        );
    }
    await app?.close();
  });

  it('keeps authorization and token access disabled without changing storage', async () => {
    enabled = false;
    await request(app.getHttpServer())
      .post(`${base}/authorization`)
      .set('Authorization', `Bearer ${token}`)
      .expect(503);
    await expect(service().access(companyId)).rejects.toThrow('disabled');
    expect(await row()).toBeUndefined();
    expect(
      await db.query(
        'SELECT * FROM mercadolibre_authorizations WHERE company_id = $1',
        [companyId],
      ),
    ).toHaveLength(0);
    expect(exchange).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
    const status = await request(app.getHttpServer())
      .get(`${base}/status`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(status.body).toEqual({
      enabled: false,
      status: 'unconfigured',
      sellerId: null,
      expiresAt: null,
    });
  });
  it('requires an administrator for every account endpoint', async () => {
    await request(app.getHttpServer()).get(`${base}/status`).expect(401);
    await request(app.getHttpServer())
      .get(`${base}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${base}/authorization`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${base}/authorization/complete`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ state: 'a'.repeat(43), code: 'code' })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`${base}/connection`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(403);
    expect(exchange).not.toHaveBeenCalled();
    expect(await row()).toBeUndefined();
  });
  it('binds PKCE/state to the initiating user and company, with ciphertext at rest', async () => {
    await request(app.getHttpServer())
      .post(`${base}/authorization`)
      .expect(401);
    const url = await begin();
    const state = url.searchParams.get('state')!;
    expect(url.origin).toBe('https://auth.mercadolibre.com.ar');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    const [authorization] = await db.query(
      'SELECT * FROM mercadolibre_authorizations WHERE company_id = $1',
      [companyId],
    );
    expect(authorization.state_hash).toBe(
      createHash('sha256').update(state).digest('hex'),
    );
    expect(authorization.encrypted_verifier).not.toContain(state);
    await complete(state, foreignToken).expect(400);
    await complete(state, sameCompanyToken).expect(400);
    expect(exchange).not.toHaveBeenCalled();
    const response = await complete(state).expect(201);
    const call = exchange.mock.calls[0][0];
    expect(
      createHash('sha256').update(call.codeVerifier).digest('base64url'),
    ).toBe(url.searchParams.get('code_challenge'));
    expect(call.redirectUri).toBe(settings.MERCADOLIBRE_REDIRECT_URI);
    const stored = await row();
    expect(stored.encrypted_tokens).not.toContain(tokens.access_token);
    expect(stored.encrypted_tokens).not.toContain(tokens.refresh_token);
    expect(stored.connected_by).toBe(userId);
    expect(JSON.stringify(response.body)).not.toContain('token');
    expect(response.body).toMatchObject({ status: 'active', sellerId: '42' });
    const foreignStatus = await request(app.getHttpServer())
      .get(`${base}/status`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .expect(200);
    expect(foreignStatus.body.status).toBe('unconfigured');
    await request(app.getHttpServer())
      .delete(`${base}/connection`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .expect(200);
    expect((await row()).status).toBe('active');
    await complete(state).expect(400);
    expect(exchange).toHaveBeenCalledTimes(1);
    await expect(service().access(foreignId)).rejects.toThrow(
      'requires connection',
    );
  });
  it('expires old authorization states and invalidates replaced states without exchange', async () => {
    const old = await begin();
    const current = await begin();
    await complete(old.searchParams.get('state')!).expect(400);
    await db.query(
      "UPDATE mercadolibre_authorizations SET expires_at = now() - interval '1 second' WHERE company_id = $1",
      [companyId],
    );
    await complete(current.searchParams.get('state')!).expect(400);
    expect(exchange).not.toHaveBeenCalled();
  });
  it('atomically rotates both tokens once while concurrent callers wait for recovery', async () => {
    await connect();
    await expire();
    exchange.mockReset();
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let release!: (value: typeof tokens) => void;
    exchange.mockImplementation(() => {
      started();
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const first = service().access(companyId);
    await ready;
    await expect(service().access(companyId)).rejects.toThrow('in progress');
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(exchange).toHaveBeenCalledWith({
      refreshToken: tokens.refresh_token,
    });
    release(rotated);
    await expect(first).resolves.toEqual({
      accessToken: rotated.access_token,
      sellerId: 42,
    });
    await expect(service().access(companyId)).resolves.toEqual({
      accessToken: rotated.access_token,
      sellerId: 42,
    });
    expect(exchange).toHaveBeenCalledTimes(1);
    const plain = app
      .get(ProviderTokenCipherService)
      .decrypt(
        (await row()).encrypted_tokens,
        `mercadolibre:tokens:${companyId}:42`,
      );
    expect(JSON.parse(plain)).toEqual(rotated);
    transport.mockResolvedValue({
      id: 'MLA123',
      seller_id: 42,
      permalink: 'https://mercadolibre.com.ar/MLA123',
      status: 'active',
    });
    await app.get(MercadoLibreClient).get(companyId, 'MLA123');
    expect(transport).toHaveBeenCalledWith(
      'MERCADOLIBRE',
      'https://api.mercadolibre.com/items/MLA123',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${rotated.access_token}`,
        }),
      }),
    );
  });
  it('does not reuse a refresh token after a lost response or recovered process', async () => {
    await connect();
    await expire();
    exchange.mockReset().mockRejectedValue(new Error('response lost'));
    await expect(service().access(companyId)).rejects.toThrow('reconnection');
    await expect(service().access(companyId)).rejects.toThrow(
      'requires connection',
    );
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(await row()).toMatchObject({
      status: 'reconnect_required',
      encrypted_tokens: null,
    });
    exchange.mockResolvedValue(tokens);
    await connect();
    exchange.mockClear();
    await db.query(
      "UPDATE mercadolibre_connections SET status = 'refreshing', operation_id = $2, operation_started_at = now() - interval '3 minutes' WHERE company_id = $1",
      [companyId, randomUUID()],
    );
    await expect(service().access(companyId)).rejects.toThrow(
      'requires connection',
    );
    expect(exchange).not.toHaveBeenCalled();
    expect((await row()).status).toBe('reconnect_required');
  });
  it('does not persist changed seller identities or bind one seller to two companies', async () => {
    await connect();
    await expire();
    exchange.mockResolvedValue({ ...rotated, user_id: 99 });
    await expect(service().access(companyId)).rejects.toThrow('reconnection');
    expect(await row()).toMatchObject({
      seller_id: '42',
      encrypted_tokens: null,
    });
    exchange.mockResolvedValue(tokens);
    const foreign = await begin(foreignToken);
    await complete(foreign.searchParams.get('state')!, foreignToken).expect(
      503,
    );
    const [connection] = await db.query(
      'SELECT * FROM mercadolibre_connections WHERE company_id = $1',
      [foreignId],
    );
    expect(connection).toMatchObject({
      status: 'reconnect_required',
      encrypted_tokens: null,
      seller_id: null,
    });
  });
  it('disconnects locally even while disabled and fences a late refresh response', async () => {
    await connect();
    await expire();
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let release!: (value: typeof tokens) => void;
    exchange.mockImplementation(() => {
      started();
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const pending = service().access(companyId);
    const assertion = expect(pending).rejects.toThrow('reconnection');
    await ready;
    enabled = false;
    await request(app.getHttpServer())
      .delete(`${base}/connection`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    release(rotated);
    await assertion;
    expect(await row()).toMatchObject({
      status: 'disconnected',
      encrypted_tokens: null,
    });
    const [event] = await db.query(
      "SELECT actor_id FROM mercadolibre_connection_events WHERE company_id = $1 AND event = 'disconnected'",
      [companyId],
    );
    expect(event.actor_id).toBe(userId);
  });
  it('handles provider revocation without discarding a newer rotated token', async () => {
    await connect();
    transport.mockRejectedValue(
      new ProviderRequestError('MERCADOLIBRE', false, 401),
    );
    await expect(
      app.get(MercadoLibreClient).get(companyId, 'MLA123'),
    ).rejects.toMatchObject({ status: 401 });
    expect(await row()).toMatchObject({
      status: 'reconnect_required',
      encrypted_tokens: null,
    });
    await expect(service().access(companyId)).rejects.toThrow(
      'requires connection',
    );
    exchange.mockResolvedValue(rotated);
    await connect();
    await service().invalidate(companyId, tokens.access_token);
    expect((await row()).status).toBe('active');
    await expect(service().access(companyId)).resolves.toMatchObject({
      accessToken: rotated.access_token,
    });
  });
  it('rejects ciphertext copied to another company and never exposes the credential', async () => {
    await connect();
    const saved = await row();
    expect(() =>
      app
        .get(ProviderTokenCipherService)
        .decrypt(saved.encrypted_tokens, `mercadolibre:tokens:${foreignId}:42`),
    ).toThrow('cannot be decrypted');
    expect(() =>
      app
        .get(ProviderTokenCipherService)
        .decrypt(
          saved.encrypted_tokens.slice(0, -8) + 'tampered',
          `mercadolibre:tokens:${companyId}:42`,
        ),
    ).toThrow('cannot be decrypted');
  });
});
