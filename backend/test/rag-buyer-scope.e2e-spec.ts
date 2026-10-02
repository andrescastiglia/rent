import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { AiStructuredRetrieverService } from '../src/ai/rag/ai-structured-retriever.service';
import { UserRole } from '../src/users/entities/user.entity';

describe('RAG buyer evidence with PostgreSQL', () => {
  const company = randomUUID();
  const foreignCompany = randomUUID();
  const fixtures = [company, company, foreignCompany].map((companyId) => ({
    companyId,
    userId: randomUUID(),
    ownerId: randomUUID(),
    buyerId: randomUUID(),
    propertyId: randomUUID(),
    contractId: randomUUID(),
    folderId: randomUUID(),
    agreementId: randomUUID(),
    receiptId: randomUUID(),
  }));
  let client: Client;
  let service: AiStructuredRetrieverService;
  const context = {
    companyId: company,
    userId: fixtures[0].userId,
    role: UserRole.BUYER,
    conversationId: randomUUID(),
  };

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query('BEGIN');
    for (const id of [company, foreignCompany])
      await client.query('INSERT INTO companies(id,name) VALUES($1,$2)', [
        id,
        'RAG fictitious company',
      ]);
    for (const fixture of fixtures) {
      const {
        companyId,
        userId,
        ownerId,
        buyerId,
        propertyId,
        contractId,
        folderId,
        agreementId,
        receiptId,
      } = fixture;
      await client.query(
        `INSERT INTO users(id,company_id,password_hash,first_name,last_name,role)
        VALUES($1,$2,'not-a-login-password','Fictitious','Buyer','buyer')`,
        [userId, companyId],
      );
      await client.query(
        'INSERT INTO owners(id,user_id,company_id) VALUES($1,$2,$3)',
        [ownerId, userId, companyId],
      );
      await client.query(
        'INSERT INTO buyers(id,user_id,company_id) VALUES($1,$2,$3)',
        [buyerId, userId, companyId],
      );
      await client.query(
        `INSERT INTO properties(id,company_id,owner_id,name,property_type,address_street,address_city,address_state)
        VALUES($1,$2,$3,'Fictitious property','apartment','Fictitious street','Test city','Test state')`,
        [propertyId, companyId, ownerId],
      );
      await client.query(
        `INSERT INTO leases(id,company_id,property_id,owner_id,buyer_id,contract_type,status,currency,fiscal_value)
        VALUES($1,$2,$3,$4,$5,'sale','draft','ARS',1000)`,
        [contractId, companyId, propertyId, ownerId, buyerId],
      );
      await client.query(
        'INSERT INTO sale_folders(id,company_id,name) VALUES($1,$2,$3)',
        [folderId, companyId, 'Fictitious folder'],
      );
      await client.query(
        `INSERT INTO sale_agreements(id,company_id,folder_id,buyer_id,contract_id,property_id,buyer_name,buyer_phone,
        total_amount,paid_amount,currency,installment_amount,installment_count,start_date)
        VALUES($1,$2,$3,$4,$5,$6,'Fictitious Buyer','+541100000000',1000,100,'ARS',500,2,CURRENT_DATE)`,
        [agreementId, companyId, folderId, buyerId, contractId, propertyId],
      );
      await client.query(
        `INSERT INTO sale_receipts(id,agreement_id,receipt_number,installment_number,amount,currency,payment_date,balance_after,overdue_amount)
        VALUES($1,$2,$3,1,100,'ARS',CURRENT_DATE,900,0)`,
        [receiptId, agreementId, randomUUID()],
      );
    }
    service = new AiStructuredRetrieverService({
      query: async (sql: string, params: unknown[]) =>
        (await client.query(sql, params)).rows,
    } as never);
  });

  afterAll(async () => {
    if (client) {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  it('returns only the own canonical sale and exact monetary balance', async () => {
    const sources = await service.retrieve(
      'Mis contratos de compraventa y sus cuotas',
      context,
    );
    expect(sources.map((source) => source.entityId)).toEqual([
      fixtures[0].agreementId,
    ]);
    expect(JSON.parse(sources[0].content)).toMatchObject({
      total: 1000,
      paidAmount: 100,
      balance: 900,
      currency: 'ARS',
      installmentCount: 2,
    });
  });

  it('returns only receipts linked to the authenticated buyer contract', async () => {
    const sources = await service.retrieve(
      'Mis recibos de compraventa',
      context,
    );
    expect(sources.map((source) => source.entityId)).toEqual([
      fixtures[0].receiptId,
    ]);
    expect(JSON.parse(sources[0].content)).toMatchObject({
      amount: 100,
      currency: 'ARS',
      agreementId: fixtures[0].agreementId,
    });
  });

  it.each([1, 2])(
    'a direct identifier cannot reveal another buyer or company: %s',
    async (index) => {
      const sources = await service.retrieve(
        `Compraventa ${fixtures[index].agreementId}`,
        context,
      );
      expect(sources).toHaveLength(1);
      expect(sources[0].entityType).toBe('structured_query');
      expect(JSON.parse(sources[0].content).resultCount).toBe(0);
      expect(sources[0].content).not.toContain(fixtures[index].agreementId);
    },
  );

  it('does not reinterpret buyer access as tenant or staff financial access', async () => {
    await expect(
      service.retrieve('Listá las deudas de todos los inquilinos', context),
    ).resolves.toEqual([]);
  });
});
