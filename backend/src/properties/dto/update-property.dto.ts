import { PartialType } from '@nestjs/mapped-types';
import { CreatePropertyDto } from './create-property.dto';
import { IsEnum, IsOptional } from 'class-validator';
import { PropertyStatus } from '../entities/property.entity';
import { createPropertyZodSchema } from './create-property.dto';
import { z } from 'zod';

export class UpdatePropertyDto extends PartialType(CreatePropertyDto) {
  static readonly zodSchema = createPropertyZodSchema
    .omit({ companyId: true, ownerId: true })
    .partial()
    .extend({
      status: z.nativeEnum(PropertyStatus).optional(),
    })
    .strict();

  @IsEnum(PropertyStatus)
  @IsOptional()
  status?: PropertyStatus;

  // Cannot update companyId or ownerId via this DTO
  companyId?: never;
  ownerId?: never;
}
