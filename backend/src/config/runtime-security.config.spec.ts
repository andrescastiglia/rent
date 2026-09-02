import {
  getRuntimeHttpSecurityConfig,
  validateRuntimeEnvironment,
} from './runtime-security.config';

const completeEnvironment = (overrides: Record<string, string> = {}) => ({
  NODE_ENV: 'development',
  FRONTEND_URL: 'http://localhost:3000',
  TRUST_PROXY_HOPS: '0',
  JWT_SECRET: 'local-jwt-secret',
  METRICS_SCRAPE_TOKEN: 'local-metrics-secret',
  PROPERTY_IMAGE_SIGNING_SECRET: 'local-image-secret',
  TURNSTILE_SECRET_KEY: 'local-turnstile-secret',
  BATCH_WHATSAPP_INTERNAL_TOKEN: 'local-whatsapp-batch-secret',
  BATCH_BANK_RECONCILIATION_INTERNAL_TOKEN: 'local-bank-batch-secret',
  BATCH_COMMUNICATIONS_INTERNAL_TOKEN: 'local-comms-batch-secret',
  S3_ACCESS_KEY: 'local-s3-access',
  S3_SECRET_KEY: 'local-s3-secret',
  ...overrides,
});

describe('runtime security configuration', () => {
  it('parses exact origins and disables implicit proxy trust by default', () => {
    expect(
      getRuntimeHttpSecurityConfig({
        NODE_ENV: 'development',
        FRONTEND_URL: 'http://localhost:3000,https://preview.example.com',
      }),
    ).toEqual({
      allowedOrigins: ['http://localhost:3000', 'https://preview.example.com'],
      allowLocalDevelopmentOrigins: true,
      trustProxyHops: 0,
    });
  });

  it('requires explicit HTTPS origins and proxy hops in production', () => {
    expect(() =>
      getRuntimeHttpSecurityConfig({
        NODE_ENV: 'production',
        FRONTEND_URL: 'http://rent.example.com',
        TRUST_PROXY_HOPS: '1',
      }),
    ).toThrow('must use HTTPS');
    expect(() =>
      getRuntimeHttpSecurityConfig({
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://rent.example.com',
      }),
    ).toThrow('TRUST_PROXY_HOPS is required');
  });

  it('rejects paths, credentials and invalid proxy values', () => {
    expect(() =>
      getRuntimeHttpSecurityConfig({
        FRONTEND_URL: 'https://rent.example.com/app',
      }),
    ).toThrow('Invalid FRONTEND_URL origin');
    expect(() =>
      getRuntimeHttpSecurityConfig({
        FRONTEND_URL: 'https://user:pass@rent.example.com',
      }),
    ).toThrow('Invalid FRONTEND_URL origin');
    expect(() =>
      getRuntimeHttpSecurityConfig({
        FRONTEND_URL: 'https://rent.example.com',
        TRUST_PROXY_HOPS: 'all',
      }),
    ).toThrow('integer between 0 and 10');
  });

  it('requires baseline and conditionally enabled integration secrets', () => {
    expect(() =>
      validateRuntimeEnvironment(
        completeEnvironment({
          JWT_SECRET: '',
          WHATSAPP_ENABLED: 'true',
          MERCADOPAGO_ACCESS_TOKEN: 'access-token',
        }),
      ),
    ).toThrow(
      'JWT_SECRET, MERCADOPAGO_WEBHOOK_SECRET, WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_DOCUMENT_LINK_SECRET, WHATSAPP_VERIFY_TOKEN',
    );
  });

  it('rejects placeholder secrets in production and skips checks in test', () => {
    expect(() =>
      validateRuntimeEnvironment(
        completeEnvironment({
          NODE_ENV: 'production',
          FRONTEND_URL: 'https://rent.example.com',
          TRUST_PROXY_HOPS: '1',
          JWT_SECRET: 'dev_jwt_secret_change_in_production',
        }),
      ),
    ).toThrow('Production secrets contain placeholder values: JWT_SECRET');

    expect(validateRuntimeEnvironment({ NODE_ENV: 'test' })).toEqual({
      NODE_ENV: 'test',
    });
  });

  it('does not allow inbound WhatsApp while the provider is disabled', () => {
    expect(() =>
      validateRuntimeEnvironment(
        completeEnvironment({
          WHATSAPP_ENABLED: 'false',
          WHATSAPP_INBOUND_ENABLED: 'true',
        }),
      ),
    ).toThrow('WHATSAPP_INBOUND_ENABLED requires WHATSAPP_ENABLED=true');
  });

  it('rejects invalid WhatsApp retention and abuse limits', () => {
    expect(() =>
      validateRuntimeEnvironment(
        completeEnvironment({ WHATSAPP_INBOX_RETENTION_DAYS: '0' }),
      ),
    ).toThrow('WHATSAPP_INBOX_RETENTION_DAYS must be a positive integer');
    expect(() =>
      validateRuntimeEnvironment(
        completeEnvironment({ WHATSAPP_INBOUND_DAILY_LIMIT: 'many' }),
      ),
    ).toThrow('WHATSAPP_INBOUND_DAILY_LIMIT must be a positive integer');
  });
});
