import { IsString, MaxLength, MinLength } from 'class-validator';
import { z } from 'zod';
export class CancelSaleReceiptDto {
  static readonly zodSchema = z
    .object({ reason: z.string().trim().min(5).max(2000) })
    .strict();
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  reason: string;
}
