import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Company } from '../src/companies/entities/company.entity';
import { Admin } from '../src/users/entities/admin.entity';
import { UsersService } from '../src/users/users.service';
import {
  configureE2eApp,
  createTestCompany,
  createSuperAdminTestUser,
  loginTestUser,
} from './e2e-helpers';

describe('PostgreSQL document lifecycle (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  let token: string;
  let otherToken: string;
  let ownerId: string;
  let companyId: string;
  const pdf = Buffer.from('%PDF-1.4\nprivate document\n%%EOF');
  const apiPath = (url: string) => {
    const parsed = new URL(url);
    return parsed.pathname.replace(/^\/api\//, '/') + parsed.search;
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication({ rawBody: true });
    configureE2eApp(app);
    await app.init();
    db = module.get(DataSource);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    for (const [index, name] of ['Documents', 'Other documents'].entries()) {
      const company = await createTestCompany(
        module.get(getRepositoryToken(Company)),
        { name, taxId: `docs-${index}-${suffix}` },
      );
      const user = await createSuperAdminTestUser(
        module.get(UsersService),
        module.get(getRepositoryToken(Admin)),
        {
          companyId: company.id,
          email: `docs-${index}-${suffix}@example.test`,
          password: 'Password123!',
          firstName: 'Document',
          lastName: 'Tester',
        },
      );
      const login = await loginTestUser(
        app,
        user.email as string,
        'Password123!',
      );
      if (index === 0) {
        token = login;
        companyId = company.id;
        const rows = await db.query(
          'INSERT INTO owners (user_id, company_id) VALUES ($1, $2) RETURNING id',
          [user.id, company.id],
        );
        ownerId = rows[0].id;
      } else {
        otherToken = login;
      }
    }
  });
  afterAll(async () => {
    await app?.close();
  });

  it('uploads, confirms, downloads and deletes with real bytea persistence and company isolation', async () => {
    const server = app.getHttpServer();
    const created = await request(server)
      .post('/documents/upload-url')
      .auth(token, { type: 'bearer' })
      .send({
        entityType: 'owner',
        entityId: ownerId,
        documentType: 'other',
        fileName: 'private.pdf',
        fileSize: pdf.length,
        mimeType: 'application/pdf',
      })
      .expect(201);
    const { documentId, uploadUrl } = created.body;
    await request(server)
      .patch(`/documents/${documentId}/confirm`)
      .auth(token, { type: 'bearer' })
      .expect(400);
    await request(server)
      .get(`/documents/${documentId}/download-url`)
      .auth(token, { type: 'bearer' })
      .expect(404);
    await request(server)
      .put(apiPath(uploadUrl))
      .set('Content-Type', 'application/pdf')
      .send(pdf)
      .expect(204);
    const stored = await db.query(
      'SELECT file_data, file_url FROM documents WHERE id = $1 AND company_id = $2',
      [documentId, companyId],
    );
    expect(stored[0].file_data).toEqual(pdf);
    expect(stored[0].file_url).toBe(`db://document/${documentId}`);
    await request(server)
      .patch(`/documents/${documentId}/confirm`)
      .auth(otherToken, { type: 'bearer' })
      .expect(404);
    const confirmed = await request(server)
      .patch(`/documents/${documentId}/confirm`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(confirmed.body.status).toBe('approved');
    expect(confirmed.body.fileData).toBeUndefined();
    await request(server)
      .patch(`/documents/${documentId}/confirm`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    await request(server)
      .put(apiPath(uploadUrl))
      .set('Content-Type', 'application/pdf')
      .send(pdf)
      .expect(404);
    const listed = await request(server)
      .get(`/documents/entity/owner/${ownerId}`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].fileData).toBeUndefined();
    await request(server)
      .get(`/documents/${documentId}/download-url`)
      .auth(otherToken, { type: 'bearer' })
      .expect(404);
    const link = await request(server)
      .get(`/documents/${documentId}/download-url`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    await request(server).get(`/documents/${documentId}/content`).expect(403);
    const downloaded = await request(server)
      .get(apiPath(link.body.downloadUrl))
      .expect(200);
    expect(downloaded.body).toEqual(pdf);
    await request(server)
      .delete(`/documents/${documentId}`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    await request(server).get(apiPath(link.body.downloadUrl)).expect(404);
  });
});
