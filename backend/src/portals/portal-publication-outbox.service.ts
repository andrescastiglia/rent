import {
  PortalOperationDto,
  PortalOperationOverviewDto,
} from './dto/portal-operation.dto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  MercadoLibreClient,
  MercadoLibreItem,
} from '../integrations/mercadolibre.client';
import { ProviderConfigService } from '../integrations/provider-config.service';
import { ProviderRequestError } from '../integrations/provider-http.service';

export type PublicationOperation =
  'publish' | 'update' | 'pause' | 'remove' | 'refresh';
type Payload = { item?: MercadoLibreItem; description?: string };
type Listing = {
  id: string;
  portal: string;
  external_id: string | null;
  provider_status: string | null;
  listing_data: Record<string, unknown>;
};
type Job = {
  id: string;
  company_id: string;
  listing_id: string;
  operation: PublicationOperation;
  payload: Payload;
  status: string;
  claim_token: string;
  attempts: number;
};
type RemoteItem = { id: string; permalink: string; status: string };

@Injectable()
export class PortalPublicationOutboxService {
  private readonly logger = new Logger(PortalPublicationOutboxService.name);
  constructor(
    private readonly db: DataSource,
    private readonly client: MercadoLibreClient,
    private readonly config: ProviderConfigService,
  ) {}

  assertEnabled(): void {
    this.config.assertEnabled('MERCADOLIBRE');
  }

  async enqueue(
    listingId: string,
    companyId: string,
    operation: PublicationOperation,
    data?: Record<string, unknown>,
  ) {
    this.config.assertEnabled('MERCADOLIBRE');
    if (!companyId) throw new BadRequestException('Company scope required');
    return this.db.transaction(async (manager) => {
      const listing = await this.listing(manager, listingId, companyId, true);
      if (listing.portal !== 'mercadolibre')
        throw new ServiceUnavailableException('This portal is not configured');
      if (!['publish', 'update'].includes(operation) && !listing.external_id)
        throw new ConflictException('Listing has no external publication');
      if (
        !['refresh', 'remove'].includes(operation) &&
        listing.provider_status === 'closed'
      )
        throw new ConflictException('Closed publications cannot be changed');
      const payload = this.payload(operation, data ?? listing.listing_data);
      if (operation === 'update' && listing.external_id)
        this.assertMutableFields(listing, payload);
      const [active] = await manager.query(
        `SELECT id, (operation = $3 AND payload = $4::jsonb) AS matches FROM portal_publication_outbox WHERE listing_id = $1::uuid AND company_id = $2::uuid
         AND status IN ('queued','dispatching','retry','needs_review')`,
        [listingId, companyId, operation, JSON.stringify(payload)],
      );
      if (active) {
        if (!active.matches)
          throw new ConflictException(
            'A publication operation is pending or requires review',
          );
        return { id: active.id };
      }
      if (data)
        await manager.query(
          'UPDATE portal_listings SET listing_data = $3::jsonb WHERE id = $1::uuid AND company_id = $2::uuid',
          [listingId, companyId, JSON.stringify(payload)],
        );
      if (operation === 'update' && !listing.external_id) return { id: null };
      const [job] = await manager.query(
        `INSERT INTO portal_publication_outbox(company_id, listing_id, operation, payload) VALUES($1::uuid,$2::uuid,$3,$4::jsonb) RETURNING id`,
        [companyId, listingId, operation, JSON.stringify(payload)],
      );
      return job;
    });
  }

  async latest(
    listingId: string,
    companyId: string,
  ): Promise<PortalOperationOverviewDto> {
    if (!companyId) throw new BadRequestException('Company scope required');
    await this.listing(this.db.manager, listingId, companyId);
    const [job]: PortalOperationDto[] = await this.db.query(
      `SELECT id, operation, status, attempts, error_code AS "errorCode", updated_at AS "updatedAt"
      FROM portal_publication_outbox WHERE company_id = $1::uuid AND listing_id = $2::uuid ORDER BY created_at DESC, id DESC LIMIT 1`,
      [companyId, listingId],
    );
    return { enabled: this.config.enabled('MERCADOLIBRE'), job: job ?? null };
  }

  async processDue() {
    const counts = {
      processed: 0,
      completed: 0,
      failed: 0,
      deadLetter: 0,
      disabled: !this.config.enabled('MERCADOLIBRE'),
    };
    if (counts.disabled) return counts;
    for (let index = 0; index < 25; index++) {
      const [job]: Job[] = await this.db.query(
        `WITH next AS (
        SELECT id FROM portal_publication_outbox WHERE status IN ('queued','dispatching','retry')
        AND next_attempt_at <= now() AND (lease_expires_at IS NULL OR lease_expires_at < now())
        ORDER BY next_attempt_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
      ), claimed AS (UPDATE portal_publication_outbox j SET claim_token = $1::uuid,
        lease_expires_at = now() + interval '2 minutes', attempts = attempts + 1, updated_at = now()
        FROM next WHERE j.id = next.id RETURNING j.*) SELECT * FROM claimed`,
        [randomUUID()],
      );
      if (!job) break;
      counts.processed++;
      try {
        if (await this.execute(job)) counts.completed++;
      } catch (error) {
        counts.failed++;
        await this.fail(job, error);
        this.logger.warn(
          JSON.stringify({
            event: 'portal_publication_failed',
            id: job.id,
            attempt: job.attempts,
          }),
        );
      }
    }
    const [queue] = await this.db.query(
      `SELECT count(*)::integer AS "deadLetter" FROM portal_publication_outbox WHERE status IN ('failed','needs_review')`,
    );
    counts.deadLetter = queue.deadLetter;
    return counts;
  }

  private async execute(job: Job): Promise<boolean> {
    const listing = await this.listing(
      this.db.manager,
      job.listing_id,
      job.company_id,
    );
    if (listing.portal !== 'mercadolibre')
      throw new BadRequestException('Unsupported portal');
    let item: RemoteItem;
    if (job.operation === 'publish' && !listing.external_id) {
      if (job.status === 'dispatching') {
        await this.finish(job, 'needs_review', 'create_outcome_unknown');
        return false;
      }
      const [intent] = await this.db.query(
        `WITH intent AS (UPDATE portal_publication_outbox SET status = 'dispatching', updated_at = now()
        WHERE id = $1::uuid AND claim_token = $2::uuid RETURNING id) SELECT * FROM intent`,
        [job.id, job.claim_token],
      );
      if (!intent) return false;
      job.status = 'dispatching';
      item = await this.client.create(
        job.company_id,
        this.client.validateListing(job.payload.item),
      );
      if (!(await this.persistItem(job, item, false))) return false;
      listing.external_id = item.id;
      // Once the ID is durable, retries address that exact item and never create another.
      job.status = 'retry';
    } else {
      if (!listing.external_id)
        throw new BadRequestException('Missing external item');
      item = await this.changeItem(job, listing.external_id);
    }
    if (job.payload.description)
      await this.client.upsertDescription(
        job.company_id,
        listing.external_id!,
        job.payload.description,
      );
    return this.persistItem(job, item, true);
  }

  private changeItem(job: Job, itemId: string): Promise<RemoteItem> {
    if (job.operation === 'refresh')
      return this.client.get(job.company_id, itemId);
    if (job.operation === 'update')
      return this.client.update(
        job.company_id,
        itemId,
        this.client.validateListing(job.payload.item),
      );
    const status =
      job.operation === 'pause'
        ? 'paused'
        : job.operation === 'remove'
          ? 'closed'
          : 'active';
    return this.client.setStatus(job.company_id, itemId, status);
  }

  private async persistItem(
    job: Job,
    item: RemoteItem,
    complete: boolean,
  ): Promise<boolean> {
    return this.db.transaction(async (manager) => {
      const [claim] = await manager.query(
        'SELECT id FROM portal_publication_outbox WHERE id = $1::uuid AND claim_token = $2::uuid FOR UPDATE',
        [job.id, job.claim_token],
      );
      if (!claim) return false;
      const status = this.localStatus(item.status);
      await manager.query(
        `UPDATE portal_listings SET external_id = $3, external_url = $4, provider_status = $5::text,
        status = $6::portal_listing_status, published_at = CASE WHEN $5::text = 'active' THEN COALESCE(published_at,now()) ELSE published_at END,
        last_synced_at = now(), error_message = $7, updated_at = now() WHERE id = $1::uuid AND company_id = $2::uuid`,
        [
          job.listing_id,
          job.company_id,
          item.id,
          item.permalink,
          item.status,
          status,
          status === 'error' ? 'provider_not_active' : null,
        ],
      );
      await manager.query(
        `UPDATE portal_publication_outbox SET status = $3, error_code = NULL,
        claim_token = CASE WHEN $4 THEN NULL ELSE claim_token END,
        lease_expires_at = CASE WHEN $4 THEN NULL ELSE lease_expires_at END, updated_at = now()
        WHERE id = $1::uuid AND claim_token = $2::uuid`,
        [job.id, job.claim_token, complete ? 'completed' : 'retry', complete],
      );
      return true;
    });
  }

  private async fail(job: Job, error: unknown) {
    const uncertainCreate =
      job.operation === 'publish' && job.status === 'dispatching';
    if (uncertainCreate) {
      const definitive =
        error instanceof ProviderRequestError && !error.outcomeUnknown;
      return this.finish(
        job,
        definitive ? 'failed' : 'needs_review',
        definitive ? 'provider_rejected' : 'create_outcome_unknown',
      );
    }
    if (
      error instanceof NotFoundException ||
      error instanceof BadRequestException
    )
      return this.finish(job, 'failed', 'listing_unavailable');
    if (job.attempts >= 5)
      return this.finish(job, 'needs_review', 'provider_unavailable');
    await this.db.query(
      `UPDATE portal_publication_outbox SET status = 'retry', error_code = 'provider_unavailable',
      claim_token = NULL, lease_expires_at = NULL, next_attempt_at = now() + interval '60 seconds', updated_at = now()
      WHERE id = $1::uuid AND claim_token = $2::uuid`,
      [job.id, job.claim_token],
    );
  }

  private finish(job: Job, status: string, error: string) {
    return this.db.query(
      `UPDATE portal_publication_outbox SET status = $3, error_code = $4, claim_token = NULL,
      lease_expires_at = NULL, updated_at = now() WHERE id = $1::uuid AND claim_token = $2::uuid`,
      [job.id, job.claim_token, status, error],
    );
  }

  private async listing(
    manager: EntityManager,
    id: string,
    companyId: string,
    lock = false,
  ): Promise<Listing> {
    const [listing] = await manager.query(
      `SELECT l.* FROM portal_listings l JOIN properties p ON p.id = l.property_id AND p.company_id = l.company_id
      WHERE l.id = $1::uuid AND l.company_id = $2::uuid AND p.deleted_at IS NULL ${lock ? 'FOR UPDATE OF l' : ''}`,
      [id, companyId],
    );
    if (!listing) throw new NotFoundException('Portal listing not found');
    return listing;
  }

  private payload(
    operation: PublicationOperation,
    data: Record<string, unknown>,
  ): Payload {
    if (!['publish', 'update'].includes(operation)) return {};
    const item = this.client.validateListing(data.item);
    const description = data.description;
    if (
      description !== undefined &&
      (typeof description !== 'string' ||
        !description.trim() ||
        description.length > 50000)
    )
      throw new BadRequestException('Invalid listing description');
    return {
      item,
      ...(description ? { description: description as string } : {}),
    };
  }

  private assertMutableFields(listing: Listing, payload: Payload): void {
    const immutable = (item: MercadoLibreItem) => {
      const {
        title: _title,
        price: _price,
        pictures: _pictures,
        attributes: _attributes,
        ...rest
      } = item;
      return rest;
    };
    const previous = this.client.validateListing(listing.listing_data.item);
    if (!isDeepStrictEqual(immutable(previous), immutable(payload.item!)))
      throw new BadRequestException(
        'Only title, price, pictures, attributes and description can be updated',
      );
  }

  private localStatus(status: string) {
    if (status === 'active') return 'published';
    if (status === 'paused') return 'paused';
    if (status === 'closed') return 'removed';
    return 'error';
  }
}
