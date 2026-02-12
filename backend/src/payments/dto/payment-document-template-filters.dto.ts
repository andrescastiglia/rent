import { IsEnum, IsOptional } from 'class-validator';
import { PaymentDocumentTemplateType } from '../entities/payment-document-template.entity';

export class PaymentDocumentTemplateFiltersDto {
  @IsEnum(PaymentDocumentTemplateType)
  @IsOptional()
  type?: PaymentDocumentTemplateType;
}
