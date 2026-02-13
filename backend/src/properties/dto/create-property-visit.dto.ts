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
    visitedAt: z.string().date().optional(),
    interestedName: z.string().min(1).optional(),
    interestedProfileId: z.string().uuid().optional(),
    comments: z.string().optional(),
    hasOffer: z.coerce.boolean().optional(),
    offerAmount: z.coerce.number().optional(),
    offerCurrency: z.string().optional(),
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
