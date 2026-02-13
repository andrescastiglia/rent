import { IsEnum, IsOptional } from 'class-validator';
import { z } from 'zod';
import { ContractType } from '../entities/lease.entity';

const leaseTemplateFiltersZodSchema = z
  .object({
    contractType: z.nativeEnum(ContractType).optional(),
  })
  .strict();

export class LeaseTemplateFiltersDto {
  static readonly zodSchema = leaseTemplateFiltersZodSchema;

  @IsOptional()
  @IsEnum(ContractType)
  contractType?: ContractType;
}
