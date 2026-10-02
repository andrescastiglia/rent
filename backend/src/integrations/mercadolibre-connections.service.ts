import { MercadoLibreConnectionStatusDto } from './dto/mercadolibre-authorization.dto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { ProviderConfigService } from './provider-config.service';
import { ProviderTokenCipherService } from './provider-token-cipher.service';
import {
  MercadoLibreOAuthClient,
  MercadoLibreOAuthTokens,
  mercadoLibreOAuthTokenSchema,
} from './mercadolibre-oauth.client';

type Connection = {
  company_id: string;
  seller_id: string | null;
  encrypted_tokens: string | null;
  expires_at: Date | null;
  status: string;
  operation_id: string | null;
  operation_started_at: Date | null;
};
type Credentials = { accessToken: string; sellerId: number };
type RefreshClaim = {
  companyId: string;
  operationId: string;
  sellerId: number;
  tokens: MercadoLibreOAuthTokens;
};

@Injectable()
export class MercadoLibreConnectionsService {
  constructor(
    private readonly db: DataSource,
    private readonly config: ProviderConfigService,
    private readonly cipher: ProviderTokenCipherService,
    private readonly oauth: MercadoLibreOAuthClient,
  ) {}

  async begin(companyId: string, userId: string) {
    this.requireEnabled(companyId);
    if (!userId) throw new BadRequestException('User scope required');
    const clientId = this.config.required('MERCADOLIBRE_CLIENT_ID');
    this.config.required('MERCADOLIBRE_CLIENT_SECRET');
    const redirectUri = this.redirectUri();
    const state = randomBytes(32).toString('base64url');
    const stateHash = this.hash(state);
    const verifier = randomBytes(32).toString('base64url');
    const encrypted = this.cipher.encrypt(
      verifier,
      this.verifierContext(companyId, stateHash),
    );
    await this.db.transaction(async (manager) => {
      await this.lockCompany(manager, companyId);
      const [busy] = await manager.query(
        `SELECT state_hash FROM mercadolibre_authorizations WHERE company_id = $1::uuid
        AND status = 'exchanging' AND updated_at > now() - interval '2 minutes' LIMIT 1`,
        [companyId],
      );
      if (busy)
        throw new ConflictException('Authorization is already in progress');
      await manager.query(
        "UPDATE mercadolibre_authorizations SET status = 'failed', updated_at = now() WHERE company_id = $1::uuid AND status IN ('pending','exchanging')",
        [companyId],
      );
      await manager.query(
        `INSERT INTO mercadolibre_authorizations(state_hash,company_id,user_id,encrypted_verifier,redirect_uri,expires_at)
        VALUES($1,$2::uuid,$3::uuid,$4,$5,now() + interval '10 minutes')`,
        [stateHash, companyId, userId, encrypted, redirectUri],
      );
      await this.event(manager, companyId, 'authorization_started', userId);
    });
    const url = new URL('https://auth.mercadolibre.com.ar/authorization');
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    }).toString();
    return { authorizationUrl: url.toString() };
  }

  async complete(
    companyId: string,
    userId: string,
    state: string,
    code: string,
  ) {
    this.requireEnabled(companyId);
    this.config.required('MERCADOLIBRE_CLIENT_ID');
    this.config.required('MERCADOLIBRE_CLIENT_SECRET');
    if (
      !userId ||
      !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      !code ||
      code.length > 2048
    )
      throw new BadRequestException('Invalid authorization response');
    const stateHash = this.hash(state);
    const operationId = randomUUID();
    const claim = await this.db.transaction(async (manager) => {
      await this.lockCompany(manager, companyId);
      const [connection]: Connection[] = await manager.query(
        'SELECT * FROM mercadolibre_connections WHERE company_id = $1::uuid FOR UPDATE',
        [companyId],
      );
      if (connection && this.busy(connection))
        throw new ConflictException('Connection update is in progress');
      const [authorization] = await manager.query(
        `WITH claimed AS (UPDATE mercadolibre_authorizations
        SET status = 'exchanging', operation_id = $4::uuid, updated_at = now()
        WHERE state_hash = $1 AND company_id = $2::uuid AND user_id = $3::uuid AND status = 'pending' AND expires_at > now()
        RETURNING encrypted_verifier, redirect_uri) SELECT * FROM claimed`,
        [stateHash, companyId, userId, operationId],
      );
      if (!authorization)
        throw new BadRequestException('Authorization expired, used or invalid');
      const verifier = this.cipher.decrypt(
        authorization.encrypted_verifier,
        this.verifierContext(companyId, stateHash),
      );
      await manager.query(
        `INSERT INTO mercadolibre_connections(company_id,status,operation_id,operation_started_at)
        VALUES($1::uuid,'connecting',$2::uuid,now()) ON CONFLICT(company_id) DO UPDATE SET
        status = 'connecting', operation_id = $2::uuid, operation_started_at = now(), updated_at = now()`,
        [companyId, operationId],
      );
      return {
        verifier,
        redirectUri: authorization.redirect_uri as string,
        sellerId: connection?.seller_id ? Number(connection.seller_id) : null,
      };
    });
    const startedAt = Date.now();
    try {
      const tokens = await this.oauth.exchangeToken({
        code,
        redirectUri: claim.redirectUri,
        codeVerifier: claim.verifier,
      });
      await this.persist(
        companyId,
        operationId,
        tokens,
        claim.sellerId,
        startedAt,
        userId,
        stateHash,
      );
      return this.status(companyId);
    } catch {
      await this.requireReconnect(companyId, operationId, userId, stateHash);
      throw new ServiceUnavailableException(
        'Mercado Libre authorization failed; start a new connection',
      );
    }
  }

  async access(companyId: string): Promise<Credentials> {
    this.requireEnabled(companyId);
    const result = await this.db.transaction(
      async (
        manager,
      ): Promise<
        { credentials: Credentials } | { refresh: RefreshClaim } | null
      > => {
        const [connection]: Connection[] = await manager.query(
          'SELECT * FROM mercadolibre_connections WHERE company_id = $1::uuid FOR UPDATE',
          [companyId],
        );
        if (
          !connection ||
          ['reconnect_required', 'disconnected'].includes(connection.status)
        )
          return null;
        if (this.busy(connection))
          throw new ServiceUnavailableException(
            'Mercado Libre connection update is in progress',
          );
        if (connection.status !== 'active') {
          await this.clear(manager, companyId, connection.operation_id, null);
          return null;
        }
        const tokens = this.storedTokens(companyId, connection);
        if (new Date(connection.expires_at!).getTime() > Date.now() + 60000)
          return {
            credentials: {
              accessToken: tokens.access_token,
              sellerId: tokens.user_id,
            },
          };
        // Persist single-use refresh intent before network I/O, without holding a transaction open.
        const operationId = randomUUID();
        await manager.query(
          `UPDATE mercadolibre_connections SET status = 'refreshing', operation_id = $2::uuid,
        operation_started_at = now(), updated_at = now() WHERE company_id = $1::uuid`,
          [companyId, operationId],
        );
        return {
          refresh: { companyId, operationId, sellerId: tokens.user_id, tokens },
        };
      },
    );
    if (!result)
      throw new ServiceUnavailableException(
        'Mercado Libre account requires connection',
      );
    if ('credentials' in result) return result.credentials;
    return this.refresh(result.refresh);
  }

  async invalidate(companyId: string, accessToken: string): Promise<void> {
    if (!companyId) throw new BadRequestException('Company scope required');
    await this.db.transaction(async (manager) => {
      const [connection]: Connection[] = await manager.query(
        'SELECT * FROM mercadolibre_connections WHERE company_id = $1::uuid FOR UPDATE',
        [companyId],
      );
      if (connection?.status !== 'active') return;
      const current = this.storedTokens(companyId, connection);
      // A delayed 401 for an old token must not invalidate a newer token pair.
      if (current.access_token !== accessToken) return;
      await this.clear(manager, companyId, connection.operation_id, null);
    });
  }

  async status(companyId: string): Promise<MercadoLibreConnectionStatusDto> {
    if (!companyId) throw new BadRequestException('Company scope required');
    const [connection]: Omit<MercadoLibreConnectionStatusDto, 'enabled'>[] =
      await this.db.query(
        `SELECT seller_id AS "sellerId", status, expires_at AS "expiresAt"
      FROM mercadolibre_connections WHERE company_id = $1::uuid`,
        [companyId],
      );
    return {
      enabled: this.config.enabled('MERCADOLIBRE'),
      status: connection?.status ?? 'unconfigured',
      sellerId: connection?.sellerId ?? null,
      expiresAt: connection?.expiresAt ?? null,
    };
  }

  async disconnect(companyId: string, userId: string) {
    if (!companyId || !userId)
      throw new BadRequestException('Authenticated scope required');
    await this.db.transaction(async (manager) => {
      await this.lockCompany(manager, companyId);
      const rows = await manager.query(
        `WITH removed AS (UPDATE mercadolibre_connections SET encrypted_tokens = NULL, expires_at = NULL,
        status = 'disconnected', operation_id = NULL, operation_started_at = NULL, updated_at = now()
        WHERE company_id = $1::uuid AND status <> 'disconnected' RETURNING company_id) SELECT * FROM removed`,
        [companyId],
      );
      // Lock the connection before authorization rows, as in complete/persist.
      await manager.query(
        "UPDATE mercadolibre_authorizations SET status = 'failed', updated_at = now() WHERE company_id = $1::uuid AND status IN ('pending','exchanging')",
        [companyId],
      );
      if (rows.length)
        await this.event(manager, companyId, 'disconnected', userId);
    });
    return this.status(companyId);
  }

  private async refresh(claim: RefreshClaim): Promise<Credentials> {
    const startedAt = Date.now();
    try {
      const tokens = await this.oauth.exchangeToken({
        refreshToken: claim.tokens.refresh_token,
      });
      await this.persist(
        claim.companyId,
        claim.operationId,
        tokens,
        claim.sellerId,
        startedAt,
        null,
      );
      return { accessToken: tokens.access_token, sellerId: tokens.user_id };
    } catch {
      await this.requireReconnect(claim.companyId, claim.operationId, null);
      throw new ServiceUnavailableException(
        'Mercado Libre account requires reconnection',
      );
    }
  }

  private async persist(
    companyId: string,
    operationId: string,
    input: MercadoLibreOAuthTokens,
    sellerId: number | null,
    startedAt: number,
    userId: string | null,
    stateHash?: string,
  ) {
    const tokens = mercadoLibreOAuthTokenSchema.parse(input);
    if (sellerId !== null && tokens.user_id !== sellerId)
      throw new Error('Seller changed');
    const encrypted = this.cipher.encrypt(
      JSON.stringify(tokens),
      this.tokenContext(companyId, tokens.user_id),
    );
    await this.db.transaction(async (manager) => {
      const [stored] = await manager.query(
        `WITH saved AS (UPDATE mercadolibre_connections SET seller_id = $3,
        encrypted_tokens = $4, expires_at = $5, status = 'active', operation_id = NULL, operation_started_at = NULL,
        connected_by = COALESCE($6::uuid,connected_by), updated_at = now()
        WHERE company_id = $1::uuid AND operation_id = $2::uuid AND status IN ('connecting','refreshing') RETURNING company_id) SELECT * FROM saved`,
        [
          companyId,
          operationId,
          tokens.user_id,
          encrypted,
          new Date(startedAt + tokens.expires_in * 1000),
          userId,
        ],
      );
      if (!stored)
        throw new ConflictException('Connection operation was replaced');
      if (stateHash)
        await manager.query(
          "UPDATE mercadolibre_authorizations SET status = 'used', updated_at = now() WHERE state_hash = $1 AND operation_id = $2::uuid",
          [stateHash, operationId],
        );
      await this.event(
        manager,
        companyId,
        stateHash ? 'connected' : 'refreshed',
        userId,
      );
    });
  }

  private async requireReconnect(
    companyId: string,
    operationId: string,
    userId: string | null,
    stateHash?: string,
  ) {
    await this.db.transaction(async (manager) => {
      await this.clear(manager, companyId, operationId, userId);
      if (stateHash)
        await manager.query(
          "UPDATE mercadolibre_authorizations SET status = 'failed', updated_at = now() WHERE state_hash = $1 AND operation_id = $2::uuid AND status = 'exchanging'",
          [stateHash, operationId],
        );
    });
  }

  private async clear(
    manager: EntityManager,
    companyId: string,
    operationId: string | null,
    userId: string | null,
  ) {
    const rows = await manager.query(
      `WITH cleared AS (UPDATE mercadolibre_connections SET status = 'reconnect_required', encrypted_tokens = NULL,
      expires_at = NULL, operation_id = NULL, operation_started_at = NULL, updated_at = now()
      WHERE company_id = $1::uuid AND operation_id IS NOT DISTINCT FROM $2::uuid RETURNING company_id) SELECT * FROM cleared`,
      [companyId, operationId],
    );
    if (rows.length)
      await this.event(manager, companyId, 'reconnect_required', userId);
  }

  private storedTokens(
    companyId: string,
    connection: Connection,
  ): MercadoLibreOAuthTokens {
    try {
      const tokens = mercadoLibreOAuthTokenSchema.parse(
        JSON.parse(
          this.cipher.decrypt(
            connection.encrypted_tokens!,
            this.tokenContext(companyId, Number(connection.seller_id)),
          ),
        ),
      );
      if (tokens.user_id !== Number(connection.seller_id))
        throw new Error('Invalid Mercado Libre credential response');
      return tokens;
    } catch {
      throw new ServiceUnavailableException(
        'Stored provider credentials are invalid',
      );
    }
  }

  private busy(connection: Connection): boolean {
    return (
      ['connecting', 'refreshing'].includes(connection.status) &&
      !!connection.operation_started_at &&
      new Date(connection.operation_started_at).getTime() > Date.now() - 120000
    );
  }
  private requireEnabled(companyId: string) {
    this.config.assertEnabled('MERCADOLIBRE');
    if (!companyId) throw new BadRequestException('Company scope required');
    this.cipher.assertConfigured();
  }
  private async lockCompany(manager: EntityManager, companyId: string) {
    const [company] = await manager.query(
      'SELECT id FROM companies WHERE id = $1::uuid FOR NO KEY UPDATE',
      [companyId],
    );
    if (!company) throw new NotFoundException('Company not found');
  }
  private event(
    manager: EntityManager,
    companyId: string,
    event: string,
    userId: string | null,
  ) {
    return manager.query(
      'INSERT INTO mercadolibre_connection_events(company_id,actor_id,event) VALUES($1::uuid,$2::uuid,$3)',
      [companyId, userId, event],
    );
  }
  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
  private verifierContext(companyId: string, stateHash: string): string {
    return `mercadolibre:pkce:${companyId}:${stateHash}`;
  }
  private tokenContext(companyId: string, sellerId: number): string {
    return `mercadolibre:tokens:${companyId}:${sellerId}`;
  }
  private redirectUri(): string {
    const value = this.config.required('MERCADOLIBRE_REDIRECT_URI');
    try {
      const url = new URL(value);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error('Invalid Mercado Libre credential response');
      return value;
    } catch {
      throw new ServiceUnavailableException(
        'Invalid Mercado Libre redirect URI',
      );
    }
  }
}
