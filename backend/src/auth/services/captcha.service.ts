import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

type TurnstileVerifyResponse = {
  success: boolean;
  'error-codes'?: string[];
};

@Injectable()
export class CaptchaService {
  private readonly turnstileSecret =
    process.env.TURNSTILE_SECRET_KEY?.trim() ?? '';
  private readonly verifyUrl =
    process.env.TURNSTILE_VERIFY_URL?.trim() ??
    'https://challenges.cloudflare.com/turnstile/v0/siteverify';
  private readonly skipVerification = process.env.NODE_ENV === 'test';

  assertConfigured(): void {
    if (this.skipVerification) {
      return;
    }
    if (!this.turnstileSecret) {
      throw new ServiceUnavailableException('CAPTCHA_NOT_CONFIGURED');
    }
  }

  async assertValidToken(
    token: string | undefined,
    remoteIp: string | undefined,
    required: boolean,
  ): Promise<void> {
    if (this.skipVerification) {
      return;
    }

    if (!required && !token) {
      return;
    }

    if (!token) {
      throw new UnauthorizedException('CAPTCHA_REQUIRED');
    }

    this.assertConfigured();

    const params = new URLSearchParams();
    params.set('secret', this.turnstileSecret);
    params.set('response', token);
    if (remoteIp) {
      params.set('remoteip', remoteIp);
    }

    const response = await fetch(this.verifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException('CAPTCHA_UNAVAILABLE');
    }

    const payload = (await response.json()) as TurnstileVerifyResponse;
    if (!payload.success) {
      throw new UnauthorizedException('CAPTCHA_INVALID');
    }
  }
}
