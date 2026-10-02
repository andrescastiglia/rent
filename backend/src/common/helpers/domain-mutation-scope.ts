import { AsyncLocalStorage } from 'node:async_hooks';
import { ForbiddenException } from '@nestjs/common';
import {
  EntityManager,
  EntityTarget,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import { withDomainOperationReceipt } from './domain-operation-receipt';

/** Keeps repositories on the same transaction without sharing an active manager across requests. */
export class DomainMutationScope {
  private readonly storage = new AsyncLocalStorage<EntityManager>();

  constructor(
    private readonly transaction: <T>(
      execute: (manager: EntityManager) => Promise<T>,
    ) => Promise<T>,
  ) {}

  get manager(): EntityManager | undefined {
    return this.storage.getStore();
  }

  repository<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    original: Repository<T>,
  ): Repository<T> {
    return this.manager?.getRepository(entity) ?? original;
  }

  inTransaction<T>(
    execute: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.manager ? execute(this.manager) : this.transaction(execute);
  }

  run<T>(
    companyId: string | undefined,
    executionKey: string | undefined,
    operation: string,
    request: Record<string, unknown>,
    execute: () => Promise<T>,
  ): Promise<T> {
    if (!companyId) throw new ForbiddenException('Company scope required');
    if (this.manager) return execute();
    return this.transaction((manager) =>
      withDomainOperationReceipt(
        manager,
        companyId,
        executionKey,
        operation,
        request,
        async () => {
          if (typeof request.email === 'string' && request.email.trim()) {
            await manager.query(
              'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
              [
                `person:${companyId}:email:${request.email.trim().toLowerCase()}`,
              ],
            );
          }
          return this.storage.run(manager, execute);
        },
      ),
    );
  }
}
