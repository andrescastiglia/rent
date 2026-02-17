import { IsOptional } from 'class-validator';
import { z } from 'zod';

const toBoolean = z
  .union([z.boolean(), z.string()])
  .transform((value) => value !== 'false' && value !== false);

const currencyFiltersZodSchema = z
  .object({
    activeOnly: toBoolean
      .optional()
      .default(true)
      .describe('Filter to only active currencies (default: true)'),
  })
  .strict();

export class CurrencyFiltersDto {
  static readonly zodSchema = currencyFiltersZodSchema;

  @IsOptional()
  activeOnly?: boolean | string;
}
