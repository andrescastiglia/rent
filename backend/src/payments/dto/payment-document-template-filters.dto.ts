import { IsEnum, IsOptional } from 'class-validator';
import { PaymentDocumentTemplateType } from '../entities/payment-document-template.entity';
import { z } from 'zod';

const paymentDocumentTemplateFiltersZodSchema = z
  .object({
    type: z
      .nativeEnum(PaymentDocumentTemplateType)
      .optional()
      .describe('receipt|invoice|credit_note'),
  })
  .strict();

export class PaymentDocumentTemplateFiltersDto {
  static readonly zodSchema = paymentDocumentTemplateFiltersZodSchema;

  @IsEnum(PaymentDocumentTemplateType)
  @IsOptional()
  type?: PaymentDocumentTemplateType;
}
