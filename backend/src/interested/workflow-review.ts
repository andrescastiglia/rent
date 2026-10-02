import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

function secret(): string {
  if (!process.env.JWT_SECRET)
    throw new ServiceUnavailableException(
      'Workflow review signing is unavailable',
    );
  return process.env.JWT_SECRET;
}
export function workflowDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function signWorkflowReview(companyId: string, value: unknown): string {
  const payload = Buffer.from(
    JSON.stringify({
      companyId,
      digest: workflowDigest(value),
      expiresAt: Date.now() + 900_000,
    }),
  ).toString('base64url');
  return `${payload}.${createHmac('sha256', secret()).update(payload).digest('base64url')}`;
}
export function verifyWorkflowReview(
  token: string,
  companyId: string,
  value: unknown,
): void {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra)
    throw new BadRequestException('Invalid workflow review');
  const supplied = Buffer.from(signature, 'base64url');
  const expected = createHmac('sha256', secret()).update(payload).digest();
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    throw new BadRequestException('Invalid workflow review signature');
  let review: { companyId: string; digest: string; expiresAt: number };
  try {
    review = JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    throw new BadRequestException('Invalid workflow review payload');
  }
  if (
    review.companyId !== companyId ||
    !Number.isFinite(review.expiresAt) ||
    review.expiresAt <= Date.now()
  )
    throw new BadRequestException(
      'Workflow review expired or belongs to another company',
    );
  if (review.digest !== workflowDigest(value))
    throw new ConflictException(
      'Los datos cambiaron desde la revisión. Revise nuevamente.',
    );
}
