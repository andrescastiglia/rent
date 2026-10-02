import { withDomainOperationReceipt } from './domain-operation-receipt';

describe('Domain operation receipts', () => {
  const key = '22222222-2222-4222-8222-222222222222';
  const manager = {
    query: jest.fn(),
    queryRunner: { isTransactionActive: true },
  };
  beforeEach(() => manager.query.mockReset());

  it('rejects reused keys with changed input before executing', async () => {
    manager.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ matches: false }]);
    const execute = jest.fn();
    await expect(
      withDomainOperationReceipt(
        manager as any,
        'company',
        key,
        'property.create',
        { name: 'Other' },
        execute,
      ),
    ).rejects.toThrow('different operation or request');
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects invalid keys and nontransactional managers', async () => {
    await expect(
      withDomainOperationReceipt(
        manager as any,
        'company',
        'invalid',
        'create',
        {},
        jest.fn(),
      ),
    ).rejects.toThrow('UUID');
    await expect(
      withDomainOperationReceipt(
        { queryRunner: {} } as any,
        'company',
        key,
        'create',
        {},
        jest.fn(),
      ),
    ).rejects.toThrow('transaction');
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('does not persist plaintext credentials or return secrets on recovery', async () => {
    const originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'fixture-fingerprint-key';
    try {
      manager.query.mockResolvedValue([]);
      const date = new Date('2026-10-01T00:00:00Z');
      const result = await withDomainOperationReceipt(
        manager as any,
        'company',
        key,
        'tenant.create',
        { password: 'private-password' },
        async () => ({
          id: 'user',
          passwordHash: 'private-hash',
          nested: { token: 'private-token', authorizationCode: 'receipt-code' },
          date,
        }),
      );
      expect(result).toEqual({
        id: 'user',
        nested: { authorizationCode: 'receipt-code' },
        date,
      });
      expect(result.date).toBeInstanceOf(Date);
      const insert = manager.query.mock.calls[2][1];
      expect(insert[3]).not.toContain('private-password');
      expect(JSON.parse(insert[3]).password.fingerprint).toMatch(
        /^[\da-f]{64}$/,
      );
      expect(insert[4]).not.toContain('private-hash');
      expect(insert[4]).not.toContain('private-token');
    } finally {
      if (originalSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = originalSecret;
    }
  });

  it('rolls back before storing a receipt if a domain write fails', async () => {
    manager.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(
      withDomainOperationReceipt(
        manager as any,
        'company',
        key,
        'create',
        {},
        async () => {
          throw new Error('write failed');
        },
      ),
    ).rejects.toThrow('write failed');
    expect(manager.query).toHaveBeenCalledTimes(2);
  });
});
