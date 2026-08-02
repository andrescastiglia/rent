import { createHmac } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('MercadoPago webhook (e2e)', () => {
  let app: INestApplication;
  const webhookSecret = 'e2e-mercadopago-webhook-secret';
  const originalSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;

  beforeAll(async () => {
    process.env.MERCADOPAGO_WEBHOOK_SECRET = webhookSecret;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (originalSecret === undefined) {
      delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    } else {
      process.env.MERCADOPAGO_WEBHOOK_SECRET = originalSecret;
    }
  });

  const signatureFor = (dataId: string, requestId: string, timestamp: string) =>
    createHmac('sha256', webhookSecret)
      .update(`id:${dataId};request-id:${requestId};ts:${timestamp};`)
      .digest('hex');

  it('accepts a valid signed notification with provider metadata', async () => {
    const dataId = '456';
    const requestId = 'e2e-request-1';
    const timestamp = String(Date.now());
    const digest = signatureFor(dataId, requestId, timestamp);

    await request(app.getHttpServer())
      .post('/payment-gateway/webhook')
      .query({ 'data.id': dataId })
      .set('x-request-id', requestId)
      .set('x-signature', `ts=${timestamp},v1=${digest}`)
      .send({
        id: 123,
        live_mode: false,
        type: 'merchant_order',
        api_version: 'v1',
        action: 'merchant_order.updated',
        data: { id: Number(dataId) },
      })
      .expect(200);
  });

  it('rejects a notification with an invalid signature', async () => {
    const timestamp = String(Date.now());

    await request(app.getHttpServer())
      .post('/payment-gateway/webhook')
      .query({ 'data.id': '456' })
      .set('x-request-id', 'e2e-request-2')
      .set('x-signature', `ts=${timestamp},v1=${'0'.repeat(64)}`)
      .send({
        id: 124,
        type: 'merchant_order',
        data: { id: 456 },
      })
      .expect(401);
  });
});
