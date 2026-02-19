import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { CaptchaService } from './captcha.service';

describe('CaptchaService', () => {
  const prevEnv = { ...process.env };
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env = { ...prevEnv };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('skips verification in test env', async () => {
    process.env.NODE_ENV = 'test';
    const service = new CaptchaService();
    service.assertConfigured();
    await expect(
      service.assertValidToken(undefined, undefined, true),
    ).resolves.toBeUndefined();
  });

  it('assertConfigured throws when secret is missing outside test env', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.TURNSTILE_SECRET_KEY;
    const service = new CaptchaService();
    expect(() => service.assertConfigured()).toThrow(
      ServiceUnavailableException,
    );
  });

  it('allows optional captcha when not required and token missing', async () => {
    process.env.NODE_ENV = 'production';
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    const service = new CaptchaService();
    await expect(
      service.assertValidToken(undefined, undefined, false),
    ).resolves.toBeUndefined();
  });

  it('throws when required token is missing', async () => {
    process.env.NODE_ENV = 'production';
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    const service = new CaptchaService();
    await expect(
      service.assertValidToken(undefined, undefined, true),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws when verify endpoint is unavailable or invalid response', async () => {
    process.env.NODE_ENV = 'production';
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    const service = new CaptchaService();

    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    await expect(
      service.assertValidToken('token', '127.0.0.1', true),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false }),
    });
    await expect(
      service.assertValidToken('token', '127.0.0.1', true),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('passes when verification is successful', async () => {
    process.env.NODE_ENV = 'production';
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    const service = new CaptchaService();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    await expect(
      service.assertValidToken('token', '127.0.0.1', true),
    ).resolves.toBeUndefined();
  });
});
