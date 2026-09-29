import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource, EntityManager } from 'typeorm';
import { allocatePaymentDocumentNumber } from '../src/payments/payment-document-number';

describe('Persistent payment document numbers (PostgreSQL)', () => {
  let db: DataSource;
  let schema: string;
  const migration = readFileSync(
    join(
      __dirname,
      '../../migrations/131_persistent_payment_document_numbers.sql',
    ),
    'utf8',
  );

  beforeAll(async () => {
    db = await new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      extra: { max: 12 },
    }).initialize();
  });
  afterAll(async () => {
    await db?.destroy();
  });

  async function transaction<T>(work: (manager: EntityManager) => Promise<T>) {
    return db.transaction(async (manager) => {
      await manager.query(`SET LOCAL search_path TO "${schema}"`);
      return work(manager);
    });
  }
  async function migrate() {
    const runner = db.createQueryRunner();
    await runner.connect();
    try {
      await runner.query(`SET search_path TO "${schema}"`);
      await runner.query(migration);
    } finally {
      await runner.query('RESET search_path');
      await runner.release();
    }
  }

  beforeEach(async () => {
    schema = `number_test_${randomUUID().replaceAll('-', '')}`;
    await db.query(`CREATE SCHEMA "${schema}"`);
    await transaction(async (manager) => {
      await manager.query(`CREATE TABLE receipts(receipt_number varchar(50) PRIMARY KEY,created_at timestamptz DEFAULT now());
        CREATE TABLE credit_notes(note_number varchar(50) PRIMARY KEY,status text,deleted_at timestamptz);`);
      await manager.query(`INSERT INTO receipts VALUES ('REC-202001-0100','2020-01-01'),('REC-202609-0007','2026-09-29'),('IMPORTED-MANUAL','2099-01-01');
        INSERT INTO credit_notes VALUES ('NC-202001-0999','cancelled',now()),('NC-202609-0001','issued',null);`);
    });
    await migrate();
  });
  afterEach(async () => {
    await db.query(`DROP SCHEMA "${schema}" CASCADE`);
  });

  it('seeds from all historical numbers regardless of date, cancellation, deletion or custom format', async () => {
    const numbers = await transaction(async (manager) => {
      const receipt = await allocatePaymentDocumentNumber(manager, 'receipt');
      const note = await allocatePaymentDocumentNumber(manager, 'credit_note');
      return { receipt, note };
    });
    expect(numbers.receipt).toMatch(/^REC-\d{6}-0101$/);
    expect(numbers.note).toMatch(/^NC-\d{6}-1000$/);
  });

  it('retains the high-water mark across deletion and repeated migration', async () => {
    await transaction(async (manager) => {
      await allocatePaymentDocumentNumber(manager, 'receipt');
      await manager.query('DELETE FROM receipts');
    });
    await migrate();
    expect(
      await transaction((manager) =>
        allocatePaymentDocumentNumber(manager, 'receipt'),
      ),
    ).toMatch(/-0102$/);
  });

  it('tracks subsequent imports without letting custom numbers or older suffixes reset the counter', async () => {
    await transaction(async (manager) => {
      await manager.query(
        `INSERT INTO receipts VALUES ('REC-200001-9007199254740993','2000-01-01'),('CUSTOM-99999999999999999999999999999','2099-01-01'),('REC-199912-0002','2099-01-01');`,
      );
      await manager.query(
        `INSERT INTO credit_notes VALUES ('NC-200001-9000','cancelled',now());`,
      );
    });
    expect(
      await transaction((manager) =>
        allocatePaymentDocumentNumber(manager, 'receipt'),
      ),
    ).toMatch(/-9007199254740994$/);
    expect(
      await transaction((manager) =>
        allocatePaymentDocumentNumber(manager, 'credit_note'),
      ),
    ).toMatch(/-9001$/);
  });

  it.each(['receipt', 'credit_note'] as const)(
    'allocates unique %s numbers under concurrent transactions',
    async (kind) => {
      const numbers = await Promise.all(
        Array.from({ length: 20 }, () =>
          transaction((manager) =>
            allocatePaymentDocumentNumber(manager, kind),
          ),
        ),
      );
      expect(new Set(numbers).size).toBe(20);
      const suffixes = numbers
        .map((number) => BigInt(number.split('-').pop()!))
        .sort((a, b) => (a < b ? -1 : 1));
      const first = kind === 'receipt' ? 101n : 1000n;
      expect(suffixes).toEqual(
        Array.from({ length: 20 }, (_, index) => first + BigInt(index)),
      );
    },
  );

  it('rolls back the allocation and inserted document together when accounting fails', async () => {
    let aborted = '';
    await expect(
      transaction(async (manager) => {
        aborted = await allocatePaymentDocumentNumber(manager, 'receipt');
        await manager.query('INSERT INTO receipts(receipt_number) VALUES($1)', [
          aborted,
        ]);
        throw new Error('accounting failure');
      }),
    ).rejects.toThrow('accounting failure');
    expect(
      await transaction((manager) =>
        manager.query('SELECT * FROM receipts WHERE receipt_number=$1', [
          aborted,
        ]),
      ),
    ).toHaveLength(0);
    expect(
      await transaction((manager) =>
        allocatePaymentDocumentNumber(manager, 'receipt'),
      ),
    ).toBe(aborted);
  });

  it('serializes a manual import with the next automatic allocation', async () => {
    const writer = db.createQueryRunner();
    await writer.connect();
    await writer.startTransaction();
    try {
      await writer.query(`SET LOCAL search_path TO "${schema}"`);
      await writer.query(
        "INSERT INTO receipts(receipt_number) VALUES('REC-200001-9000')",
      );
      expect(
        (
          await transaction((manager) =>
            manager.query(
              "SELECT pg_try_advisory_xact_lock(hashtextextended('receipt-number',0)) AS acquired",
            ),
          )
        )[0].acquired,
      ).toBe(false);
      const pending = transaction((manager) =>
        allocatePaymentDocumentNumber(manager, 'receipt'),
      );
      await writer.commitTransaction();
      expect(await pending).toMatch(/-9001$/);
    } finally {
      if (writer.isTransactionActive) await writer.rollbackTransaction();
      await writer.release();
    }
  });

  it('does not reuse a number after its issued document is removed', async () => {
    const first = await transaction(async (manager) => {
      const number = await allocatePaymentDocumentNumber(
        manager,
        'credit_note',
      );
      await manager.query(
        "INSERT INTO credit_notes(note_number,status) VALUES($1,'issued')",
        [number],
      );
      return number;
    });
    await transaction((manager) =>
      manager.query('DELETE FROM credit_notes WHERE note_number=$1', [first]),
    );
    expect(
      await transaction((manager) =>
        allocatePaymentDocumentNumber(manager, 'credit_note'),
      ),
    ).toMatch(/-1001$/);
  });

  it('rejects counter rollback, deletion and renumbering of an issued document', async () => {
    await expect(
      transaction((manager) =>
        manager.query(
          "UPDATE payment_document_counters SET last_value=1 WHERE kind='receipt'",
        ),
      ),
    ).rejects.toThrow('cannot move backwards');
    await expect(
      transaction((manager) =>
        manager.query(
          "DELETE FROM payment_document_counters WHERE kind='receipt'",
        ),
      ),
    ).rejects.toThrow('cannot be deleted');
    await expect(
      transaction((manager) =>
        manager.query(
          "UPDATE receipts SET receipt_number='REC-202609-5555' WHERE receipt_number='REC-202001-0100'",
        ),
      ),
    ).rejects.toThrow('number is immutable');
  });

  it('rejects truncation and unsupported allocator inputs without changing counters', async () => {
    await expect(
      transaction((manager) =>
        manager.query('TRUNCATE payment_document_counters'),
      ),
    ).rejects.toThrow('cannot be deleted');
    await expect(
      transaction((manager) =>
        manager.query("SELECT next_payment_document_number('other')"),
      ),
    ).rejects.toThrow('Unsupported');
    await expect(
      transaction((manager) =>
        manager.query("SELECT next_payment_document_number('receipt',NULL)"),
      ),
    ).rejects.toThrow('issue time is required');
    expect(
      await transaction((manager) =>
        allocatePaymentDocumentNumber(manager, 'receipt'),
      ),
    ).toMatch(/-0101$/);
  });

  it.each([
    ['receipt', 'REC'],
    ['credit_note', 'NC'],
  ] as const)(
    'fails explicitly when %s exceeds the existing field capacity',
    async (kind, prefix) => {
      const table = kind === 'receipt' ? 'receipts' : 'credit_notes',
        field = kind === 'receipt' ? 'receipt_number' : 'note_number';
      const suffix = '9'.repeat(50 - prefix.length - 8);
      await transaction((manager) =>
        manager.query(`INSERT INTO ${table}(${field}) VALUES($1)`, [
          `${prefix}-202609-${suffix}`,
        ]),
      );
      await expect(
        transaction((manager) => allocatePaymentDocumentNumber(manager, kind)),
      ).rejects.toThrow('capacity exhausted');
      expect(
        (
          await transaction((manager) =>
            manager.query(
              'SELECT last_value::text FROM payment_document_counters WHERE kind=$1',
              [kind],
            ),
          )
        )[0].last_value,
      ).toBe(suffix);
    },
  );

  it('uses the month in Argentina across the UTC month boundary without resetting the sequence', async () => {
    const numbers = await transaction((manager) =>
      manager.query(`SELECT next_payment_document_number('receipt','2026-10-01T02:59:59Z') AS before,
      next_payment_document_number('receipt','2026-10-01T03:00:00Z') AS after`),
    );
    expect(numbers[0]).toEqual({
      before: 'REC-202609-0101',
      after: 'REC-202610-0102',
    });
  });
});
