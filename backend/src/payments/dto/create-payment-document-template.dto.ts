import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaymentDocumentTemplateType } from '../entities/payment-document-template.entity';

export class CreatePaymentDocumentTemplateDto {
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
