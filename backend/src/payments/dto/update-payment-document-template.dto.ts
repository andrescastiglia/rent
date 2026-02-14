import { PartialType } from '@nestjs/mapped-types';
import { CreatePaymentDocumentTemplateDto } from './create-payment-document-template.dto'; // NOSONAR
import { createPaymentDocumentTemplateZodSchema } from './create-payment-document-template.dto'; // NOSONAR

export class UpdatePaymentDocumentTemplateDto extends PartialType(
  CreatePaymentDocumentTemplateDto,
) {
  static readonly zodSchema = createPaymentDocumentTemplateZodSchema
    .partial()
    .strict();
}
