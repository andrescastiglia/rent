import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ProviderConfigService } from './provider-config.service';

@Injectable()
export class ProviderTokenCipherService {
  constructor(private readonly config: ProviderConfigService) {}

  assertConfigured(): void {
    this.key();
  }

  encrypt(plain: string, context: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    cipher.setAAD(Buffer.from(context));
    const encrypted = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      encrypted.toString('base64'),
    ].join('.');
  }

  decrypt(envelope: string, context: string): string {
    try {
      const [version, iv, tag, data, ...extra] = envelope.split('.');
      if (version !== 'v1' || extra.length || !iv || !tag || !data)
        throw new Error();
      const nonce = Buffer.from(iv, 'base64');
      const authTag = Buffer.from(tag, 'base64');
      if (nonce.length !== 12 || authTag.length !== 16) throw new Error();
      const decipher = createDecipheriv('aes-256-gcm', this.key(), nonce);
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(authTag);
      return Buffer.concat([
        decipher.update(Buffer.from(data, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new ServiceUnavailableException(
        'Stored provider credentials cannot be decrypted',
      );
    }
  }

  private key(): Buffer {
    const value = this.config.required('MERCADOLIBRE_TOKEN_ENCRYPTION_KEY');
    const key = Buffer.from(value, 'base64');
    if (key.length !== 32 || key.toString('base64') !== value)
      throw new ServiceUnavailableException(
        'Invalid Mercado Libre token encryption key',
      );
    return key;
  }
}
