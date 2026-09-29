import { buildAiToolDefinitions } from '../src/ai/openai-tools.registry';
import { DocumentsService } from '../src/documents/documents.service';
import { PaymentsService } from '../src/payments/payments.service';
import { InvoicesService } from '../src/payments/invoices.service';
import { SalesService } from '../src/sales/sales.service';
import { UserRole } from '../src/users/entities/user.entity';
import { createHash, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { Company } from '../src/companies/entities/company.entity';
import { createTestCompany } from './e2e-helpers';

/** Exercise real HTTP authorization even when a domain URL points to a wrongly scoped document. */
export async function verifyFinancialDocumentAccess(
  app: INestApplication,
  db: DataSource,
  token: string,
  path: string,
  fileUrl: string,
) {
  const id = fileUrl.slice('db://document/'.length);
  const [original] = await db.query('SELECT * FROM documents WHERE id=$1', [
    id,
  ]);
  expect(original.metadata).toMatchObject({
    source: 'financial_document',
    integrityVersion: 1,
    sha256: createHash('sha256').update(original.file_data).digest('hex'),
  });
  const company = await createTestCompany(db.getRepository(Company), {
    name: 'Foreign PDF scope',
    taxId: `pdf-${randomUUID().slice(0, 12)}`,
  });
  const download = () =>
    request(app.getHttpServer()).get(path).auth(token, { type: 'bearer' });
  const definitions = buildAiToolDefinitions({
    documentsService: app.get(DocumentsService),
    paymentsService: app.get(PaymentsService),
    invoicesService: app.get(InvoicesService),
    salesService: app.get(SalesService),
  } as any);
  const byType: Record<string, { name: string; args: Record<string, string> }> =
    {
      receipt: {
        name: 'get_payment_receipt_pdf_by_id',
        args: { id: path.split('/')[2] },
      },
      invoice: { name: 'get_invoice_pdf', args: { id: original.entity_id } },
      credit_note: {
        name: 'get_credit_note_pdf',
        args: { creditNoteId: original.entity_id },
      },
      sale_receipt: {
        name: 'get_sales_receipt_pdf',
        args: { receiptId: original.entity_id },
      },
    };
  const target = byType[original.entity_type];
  const tool = definitions.find((entry) => entry.name === target.name)!;
  const context = {
    companyId: original.company_id,
    role: UserRole.ADMIN,
    userId: JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
      .sub,
  };
  const ai = () => tool.execute(target.args, context as any);
  const setDocument = async (patch: Record<string, unknown> = {}) => {
    const row = { ...original, ...patch };
    await db.query(
      'UPDATE documents SET company_id=$2,entity_type=$3,entity_id=$4,status=$5,file_data=$6,metadata=$7::jsonb,deleted_at=$8 WHERE id=$1',
      [
        id,
        row.company_id,
        row.entity_type,
        row.entity_id,
        row.status,
        row.file_data,
        JSON.stringify(row.metadata),
        row.deleted_at,
      ],
    );
  };
  try {
    await download().expect(200);
    await expect(ai()).resolves.toBeDefined();
    for (const patch of [
      { company_id: company.id },
      { entity_id: randomUUID() },
      { entity_type: 'other' },
      { status: 'pending' },
      { status: 'rejected' },
      { status: 'expired' },
      { deleted_at: new Date() },
    ]) {
      await setDocument(patch);
      await download().expect(404);
      await expect(ai()).rejects.toMatchObject({ status: 404 });
    }
    await setDocument({ file_data: Buffer.from('tampered bytes') });
    await download().expect(409);
    await expect(ai()).rejects.toMatchObject({ status: 409 });
    await setDocument({
      metadata: { source: 'financial_document', integrityVersion: 1 },
    });
    await download().expect(409);
    await expect(ai()).rejects.toMatchObject({ status: 409 });
    await setDocument();
    const response = await download().expect(200);
    expect(response.body).toEqual(original.file_data);
  } finally {
    await setDocument();
    await db.query('DELETE FROM companies WHERE id=$1', [company.id]);
  }
}
