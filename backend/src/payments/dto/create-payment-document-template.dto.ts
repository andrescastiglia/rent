import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaymentDocumentTemplateType } from '../entities/payment-document-template.entity';
import { z } from 'zod';

export const createPaymentDocumentTemplateZodSchema = z
  .object({
    type: z
      .nativeEnum(PaymentDocumentTemplateType)
      .describe('receipt|invoice|credit_note'),
    name: z.string().min(1).max(120),
    templateBody: z
      .string()
      .min(1)
      .describe('HTML template body with {{placeholders}}'),
    isActive: z.coerce.boolean().optional(),
    isDefault: z.coerce.boolean().optional(),
  })
  .strict();

export class CreatePaymentDocumentTemplateDto {
  static readonly zodSchema = createPaymentDocumentTemplateZodSchema;

  @IsEnum(PaymentDocumentTemplateType)
  type: PaymentDocumentTemplateType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsString()
  @IsNotEmpty()
  templateBody: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
