import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateBankAccountDto {
  @IsString()
  @MaxLength(200)
  bankName: string;

  @IsString()
  @MaxLength(100)
  accountType: string;

  @IsString()
  @MaxLength(50)
  accountNumber: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  cbu?: string;

  @IsString()
  @MaxLength(22)
  @IsOptional()
  cbuCvu?: string;

  @IsString()
  @MaxLength(50)
  @IsOptional()
  alias?: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  holderName?: string;

  @IsString()
  @MaxLength(20)
  @IsOptional()
  holderCuit?: string;

  @IsString()
  @MaxLength(10)
  @IsOptional()
  currency?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsUUID()
  @IsOptional()
  ownerId?: string;

  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsUUID()
  @IsOptional()
  propertyId?: string;

  @IsBoolean()
  @IsOptional()
  isVirtualAlias?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
