import { Type } from 'class-transformer';
import {
  IsEmail,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { z } from 'zod';

const convertInterestedToBuyerZodSchema = z
  .object({
    email: z.email().optional(),
    password: z.string().min(8).optional(),
    dni: z.string().optional(),
    folderId: z.uuid().optional().describe('UUID of the sale folder'),
    totalAmount: z.coerce
      .number()
      .min(1)
      .optional()
      .describe('Total sale amount'),
    installmentAmount: z.coerce
      .number()
      .min(1)
      .optional()
      .describe('Amount per installment'),
    installmentCount: z.coerce
      .number()
      .min(1)
      .optional()
      .describe('Number of installments'),
    startDate: z.iso
      .date()
      .optional()
      .describe('First installment date (YYYY-MM-DD)'),
    currency: z.string().optional().describe('Currency code'),
    notes: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const hasAgreementData =
      value.folderId !== undefined ||
      value.totalAmount !== undefined ||
      value.installmentAmount !== undefined ||
      value.installmentCount !== undefined ||
      value.startDate !== undefined;

    if (!hasAgreementData) {
      return;
    }

    if (!value.folderId) {
      ctx.addIssue({
        code: 'custom',
        path: ['folderId'],
        message: 'folderId is required when creating a sale agreement',
      });
    }

    if (value.totalAmount === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['totalAmount'],
        message: 'totalAmount is required when creating a sale agreement',
      });
    }

    if (value.installmentAmount === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['installmentAmount'],
        message: 'installmentAmount is required when creating a sale agreement',
      });
    }

    if (value.installmentCount === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['installmentCount'],
        message: 'installmentCount is required when creating a sale agreement',
      });
    }

    if (!value.startDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['startDate'],
        message: 'startDate is required when creating a sale agreement',
      });
    }
  })
  .strict();

export class ConvertInterestedToBuyerDto {
  static readonly zodSchema = convertInterestedToBuyerZodSchema;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsString()
  @IsOptional()
  dni?: string;

  @IsUUID()
  @IsOptional()
  folderId: string;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  totalAmount: number;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  installmentAmount: number;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  installmentCount: number;

  @IsDateString()
  @IsOptional()
  startDate: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
