import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { DocumentsModule } from './documents.module';
import { Document } from './entities/document.entity';
import { DocumentsService } from './documents.service';

// Exercise the real module middleware: binary bodies must reach the service,
// while oversized uploads must fail before persistence.
describe('Document content HTTP routes', () => {
  const id = 'a60e2a0a-1c3f-498b-92d1-c46e1d4aacfb';
  const service = {
    uploadContent: jest.fn().mockResolvedValue(undefined),
    downloadContent: jest.fn().mockResolvedValue({
      buffer: Buffer.from('%PDF-test'),
      contentType: 'application/pdf',
      name: 'recibo ñ.pdf',
    }),
  };
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [DocumentsModule],
    })
      .overrideProvider(getRepositoryToken(Document))
      .useValue({})
      .overrideProvider(DataSource)
      .useValue({})
      .overrideProvider(ConfigService)
      .useValue({})
      .overrideProvider(DocumentsService)
      .useValue(service)
      .compile();
    app = module.createNestApplication({ rawBody: true });
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => jest.clearAllMocks());

  it('passes an unmodified PDF buffer and the scoped token to persistence', async () => {
    await request(app.getHttpServer())
      .put(`/documents/${id}/content?token=signed-link`)
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('%PDF-test'))
      .expect(204);
    expect(service.uploadContent).toHaveBeenCalledWith(
      id,
      'signed-link',
      Buffer.from('%PDF-test'),
      'application/pdf',
    );
  });
  it('limits raw uploads to 10 MiB', async () => {
    await request(app.getHttpServer())
      .put(`/documents/${id}/content?token=signed-link`)
      .set('Content-Type', 'application/pdf')
      .send(Buffer.alloc(10485761))
      .expect(413);
    expect(service.uploadContent).not.toHaveBeenCalled();
  });
  it('requires a valid document UUID', async () => {
    await request(app.getHttpServer())
      .get('/documents/invalid/content?token=x')
      .expect(400);
    expect(service.downloadContent).not.toHaveBeenCalled();
  });
  it('streams private downloads as attachments', async () => {
    const response = await request(app.getHttpServer())
      .get(`/documents/${id}/content?token=signed-link`)
      .expect(200);
    expect(service.downloadContent).toHaveBeenCalledWith(id, 'signed-link');
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-disposition']).toContain('attachment;');
    expect(response.body).toEqual(Buffer.from('%PDF-test'));
  });
});
