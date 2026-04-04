import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { SignatureProvider } from '../entities/digital-signature-request.entity';

export class CreateSignatureRequestDto {
  @IsUUID()
  leaseId: string;

  @IsEmail()
  tenantEmail: string;

  @IsString()
  tenantName: string;

  @IsOptional()
  @IsEmail()
  ownerEmail?: string;

  @IsOptional()
  @IsString()
  ownerName?: string;

  @IsOptional()
  @IsEnum(SignatureProvider)
  provider?: SignatureProvider;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiryDays?: number;
}
