import { DomainMutationScope } from './domain-mutation-scope';

describe('Domain transaction scope', () => {
  class RecordEntity {
    id: string;
  }

  it('isolates concurrent managers and restores repositories after each request', async () => {
    const original = { name: 'outside' };
    let entered = 0;
    let release: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    const managers = ['first', 'second'].map((name) => ({
      getRepository: jest.fn(() => ({ name })),
    }));
    const transaction = jest.fn(async (execute) =>
      execute(managers[entered++]),
    );
    const scope = new DomainMutationScope(transaction);
    const operation = (company: string) =>
      scope.run(company, undefined, 'record.create', {}, async () => {
        const before = scope.repository(RecordEntity, original as any);
        if (entered === 2) release();
        await ready;
        expect(scope.repository(RecordEntity, original as any)).toEqual(before);
        return before;
      });
    await expect(
      Promise.all([operation('company-one'), operation('company-two')]),
    ).resolves.toEqual([{ name: 'first' }, { name: 'second' }]);
    expect(scope.repository(RecordEntity, original as any)).toBe(original);
    expect(scope.manager).toBeUndefined();
  });

  it('keeps nested writes in the existing transaction and propagates failures', async () => {
    const manager = { getRepository: jest.fn() };
    const transaction = jest.fn(async (execute) => execute(manager));
    const scope = new DomainMutationScope(transaction);
    await expect(
      scope.run('company', undefined, 'record.create', {}, () =>
        scope.inTransaction(async (current) => {
          expect(current).toBe(manager);
          throw new Error('rollback');
        }),
      ),
    ).rejects.toThrow('rollback');
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(scope.manager).toBeUndefined();
  });

  it('rejects unscoped writes without opening a transaction', async () => {
    const transaction = jest.fn();
    const scope = new DomainMutationScope(transaction);
    expect(() =>
      scope.run(undefined, undefined, 'record.create', {}, jest.fn()),
    ).toThrow('Company scope required');
    expect(transaction).not.toHaveBeenCalled();
  });
});
