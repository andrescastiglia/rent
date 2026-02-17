import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { z } from 'zod';

const createPropertyVisitZodSchema = z
  .object({
    visitedAt: z.string().date().optional().describe('Visit date (YYYY-MM-DD)'),
    interestedName: z.string().min(1).optional(),
    interestedProfileId: z
      .string()
      .uuid()
      .optional()
      .describe('UUID of the interested profile who visited'),
    comments: z.string().optional(),
    hasOffer: z.coerce.boolean().optional(),
    offerAmount: z.coerce
      .number()
      .optional()
      .describe('Offer amount if applicable'),
    offerCurrency: z.string().optional().describe('Currency code of the offer'),
  })
  .strict();

export class CreatePropertyVisitDto {
  static readonly zodSchema = createPropertyVisitZodSchema;

  @IsDateString()
  @IsOptional()
  visitedAt?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  interestedName?: string;

  @IsUUID()
  @IsOptional()
  interestedProfileId?: string;

  @IsString()
  @IsOptional()
  comments?: string;

  @IsBoolean()
  @IsOptional()
  hasOffer?: boolean;

  @IsNumber()
  @IsOptional()
  offerAmount?: number;

  @IsString()
  @IsOptional()
  offerCurrency?: string;
}
