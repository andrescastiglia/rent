import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { z } from 'zod';
import { PropertyVisitResult } from '../entities/property-visit.entity';

const updatePropertyVisitResultZodSchema = z
  .object({
    result: z.enum(PropertyVisitResult),
    reason: z.string().trim().min(1).optional(),
    offerAmount: z.coerce.number().positive().optional(),
    offerCurrency: z.string().trim().min(1).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.result === PropertyVisitResult.OFFER && !value.offerAmount) {
      context.addIssue({
        code: 'custom',
        path: ['offerAmount'],
        message: 'Offer amount is required for an offer result',
      });
    }
    if (value.result === PropertyVisitResult.NOT_INTERESTED && !value.reason) {
      context.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'A reason is required when the visitor is not interested',
      });
    }
  });

export class UpdatePropertyVisitResultDto {
  static readonly zodSchema = updatePropertyVisitResultZodSchema;

  @IsEnum(PropertyVisitResult)
  result: PropertyVisitResult;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsNumber()
  @IsOptional()
  offerAmount?: number;

  @IsString()
  @IsOptional()
  offerCurrency?: string;
}
