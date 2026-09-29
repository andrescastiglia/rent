import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';

const protectedSources = new Set([
  'mercadopago_payout',
  'lease_contract',
  'financial_document',
]);

export function financialDocumentMetadata(buffer: Buffer) {
  return {
    source: 'financial_document',
    integrityVersion: 1,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

export function assertStoredDocumentIntegrity(
  buffer: Buffer,
  metadata?: Record<string, unknown>,
) {
  if (
    protectedSources.has(String(metadata?.source)) &&
    createHash('sha256').update(buffer).digest('hex') !== metadata?.sha256
  ) {
    throw new ConflictException('Document integrity check failed');
  }
}
