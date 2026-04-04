import { IsUUID, IsOptional, IsString } from 'class-validator';

export class CreatePaymentPreferenceDto {
  @IsUUID()
  invoiceId: string;

  @IsOptional()
  @IsString()
  successUrl?: string;

  @IsOptional()
  @IsString()
  failureUrl?: string;

  @IsOptional()
  @IsString()
  pendingUrl?: string;
}
