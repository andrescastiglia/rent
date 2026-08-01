import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { BankMovementDirection } from '../entities/bank-movement.entity';

export class CreateSandboxBankMovementDto {
  @IsString()
  @IsNotEmpty()
  externalId: string;

  @IsEnum(BankMovementDirection)
  direction: BankMovementDirection;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsOptional()
  currency?: string = 'ARS';

  @IsDateString()
  occurredAt: string;

  @IsUUID()
  @IsOptional()
  bankAccountId?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  counterparty?: string;

  @IsObject()
  @IsOptional()
  rawPayload?: Record<string, unknown>;
}
