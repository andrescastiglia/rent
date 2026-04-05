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
  userId: string;
}
