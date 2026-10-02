import { Controller, Headers, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  getRuntimeCorsOptions,
  getRuntimeHttpSecurityConfig,
} from './runtime-security.config';

@Controller('operations')
class BrowserOperationsController {
  readonly receivedKeys: string[] = [];

  @Post()
  execute(@Headers('idempotency-key') key: string) {
    this.receivedKeys.push(key);
    return { key };
  }
}

describe('runtime browser CORS policy', () => {
  let app: INestApplication;
  let controller: BrowserOperationsController;

  async function createApp(production = true) {
    const module = await Test.createTestingModule({
      controllers: [BrowserOperationsController],
    }).compile();
    app = module.createNestApplication({ logger: false });
    controller = module.get(BrowserOperationsController);
    app.enableCors(
      getRuntimeCorsOptions(
        getRuntimeHttpSecurityConfig({
          NODE_ENV: production ? 'production' : 'development',
          FRONTEND_URL: 'https://rent.example.test',
          TRUST_PROXY_HOPS: '1',
        }),
      ),
    );
    await app.init();
  }

  afterEach(async () => {
    await app?.close();
  });

  it('allows the browser preflight and forwards the recovery key on the actual operation', async () => {
    await createApp();
    const preflight = await request(app.getHttpServer())
      .options('/operations')
      .set('Origin', 'https://rent.example.test')
      .set('Access-Control-Request-Method', 'POST')
      .set(
        'Access-Control-Request-Headers',
        'authorization,content-type,idempotency-key',
      )
      .expect(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(
      'https://rent.example.test',
    );
    expect(preflight.headers['access-control-allow-credentials']).toBe('true');
    const headers = String(preflight.headers['access-control-allow-headers'])
      .toLowerCase()
      .split(',');
    expect(headers).toEqual(
      expect.arrayContaining([
        'authorization',
        'content-type',
        'idempotency-key',
      ]),
    );
    expect(preflight.headers.vary).toContain('Origin');
    expect(controller.receivedKeys).toEqual([]);

    const result = await request(app.getHttpServer())
      .post('/operations')
      .set('Origin', 'https://rent.example.test')
      .set('Idempotency-Key', '2da3a7b4-a148-456b-9375-e222225e5f71')
      .expect(201);
    expect(result.body.key).toBe('2da3a7b4-a148-456b-9375-e222225e5f71');
    expect(controller.receivedKeys).toEqual([result.body.key]);
  });

  it.each([
    'https://blocked.example.test',
    'http://localhost:3000',
    'https://rent.example.test.attacker.test',
  ])(
    'rejects an unapproved production origin (%s) without executing the operation',
    async (origin) => {
      await createApp();
      const response = await request(app.getHttpServer())
        .post('/operations')
        .set('Origin', origin)
        .expect(500);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(controller.receivedKeys).toEqual([]);
    },
  );

  it('does not grant arbitrary browser request headers', async () => {
    await createApp();
    const response = await request(app.getHttpServer())
      .options('/operations')
      .set('Origin', 'https://rent.example.test')
      .set('Access-Control-Request-Method', 'POST')
      .set(
        'Access-Control-Request-Headers',
        'idempotency-key,x-privileged-action',
      )
      .expect(204);
    expect(
      String(response.headers['access-control-allow-headers']).toLowerCase(),
    ).not.toContain('x-privileged-action');
  });

  it('allows local development preflight without weakening production origins', async () => {
    await createApp(false);
    const response = await request(app.getHttpServer())
      .options('/operations')
      .set('Origin', 'http://localhost:3015')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'idempotency-key')
      .expect(204);
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:3015',
    );
  });
});
