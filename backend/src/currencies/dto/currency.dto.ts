import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  Length,
  Min,
  Max,
} from 'class-validator';
import { z } from 'zod';

const createCurrencyZodSchema = z
  .object({
    code: z
      .string()
      .length(3)
      .describe('3-letter ISO currency code (e.g. ARS, USD, BRL)'),
    symbol: z.string().min(1).max(5),
    decimalPlaces: z.coerce
      .number()
      .min(0)
      .max(4)
      .optional()
      .default(2)
      .describe('Number of decimal places (0-4, default: 2)'),
    isActive: z.coerce.boolean().optional().default(true),
  })
  .strict();

const updateCurrencyZodSchema = z
  .object({
    symbol: z.string().min(1).max(5).optional(),
    decimalPlaces: z.coerce
      .number()
      .min(0)
      .max(4)
      .optional()
      .describe('Number of decimal places (0-4, default: 2)'),
    isActive: z.coerce.boolean().optional(),
  })
  .strict();

export class CreateCurrencyDto {
  static readonly zodSchema = createCurrencyZodSchema;

  @IsString()
  @Length(3, 3)
  code: string;

  @IsString()
  @Length(1, 5)
  symbol: string;

  @IsNumber()
  @Min(0)
  @Max(4)
  @IsOptional()
  decimalPlaces?: number = 2;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;
}

export class UpdateCurrencyDto {
  static readonly zodSchema = updateCurrencyZodSchema;

  @IsString()
  @Length(1, 5)
  @IsOptional()
  symbol?: string;

  @IsNumber()
  @Min(0)
  @Max(4)
  @IsOptional()
  decimalPlaces?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CurrencyResponseDto {
  code: string;
  symbol: string;
  decimalPlaces: number;
  isActive: boolean;
}
