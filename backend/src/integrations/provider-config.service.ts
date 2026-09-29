import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

export type ExternalProvider = 'BFA' | 'MERCADOLIBRE' | 'MERCADOPAGO_PAYOUTS';

@Injectable()
export class ProviderConfigService {
  constructor(private readonly config: ConfigService) {}

  enabled(provider: ExternalProvider): boolean {
    return this.config.get<string>(`${provider}_ENABLED`) === 'true';
  }

  assertEnabled(provider: ExternalProvider): void {
    if (!this.enabled(provider))
      throw new ServiceUnavailableException(
        `${provider} is temporarily disabled`,
      );
  }

  required(name: string): string {
    const value = this.config.get<string>(name)?.trim();
    if (!value)
      throw new ServiceUnavailableException(
        `Missing provider setting: ${name}`,
      );
    return value;
  }

  account<T>(
    provider: ExternalProvider,
    companyId: string,
    schema: z.ZodType<T>,
  ): T {
    this.assertEnabled(provider);
    let accounts: unknown;
    try {
      accounts = JSON.parse(this.required(`${provider}_ACCOUNTS_JSON`));
    } catch {
      throw new ServiceUnavailableException(
        `${provider} accounts are not configured`,
      );
    }
    if (
      !companyId ||
      !accounts ||
      typeof accounts !== 'object' ||
      !Object.prototype.hasOwnProperty.call(accounts, companyId)
    ) {
      throw new ServiceUnavailableException(
        `${provider} account is not configured for this company`,
      );
    }
    const result = schema.safeParse(
      (accounts as Record<string, unknown>)[companyId],
    );
    if (!result.success)
      throw new ServiceUnavailableException(
        `${provider} account configuration is invalid`,
      );
    return result.data;
  }
}
