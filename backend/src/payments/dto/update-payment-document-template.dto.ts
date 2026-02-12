import { PartialType } from '@nestjs/mapped-types';
import { CreatePaymentDocumentTemplateDto } from './create-payment-document-template.dto';

export class UpdatePaymentDocumentTemplateDto extends PartialType(
  CreatePaymentDocumentTemplateDto,
) {}
