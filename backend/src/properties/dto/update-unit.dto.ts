import { PartialType } from '@nestjs/mapped-types';
import { CreateUnitDto, createUnitZodSchema } from './create-unit.dto';
import { z } from 'zod';
import { UnitStatus } from '../entities/unit.entity';

export class UpdateUnitDto extends PartialType(CreateUnitDto) {
  static readonly zodSchema = createUnitZodSchema
    .omit({ propertyId: true, companyId: true })
    .partial()
    .extend({
      bedrooms: z.coerce.number().int().min(0).optional(),
      bathrooms: z.coerce.number().min(0).optional(),
      currency: z.string().optional(),
      hasParking: z.boolean().optional(),
      parkingSpots: z.coerce.number().int().min(0).optional(),
      hasStorage: z.boolean().optional(),
      isFurnished: z.boolean().optional(),
      status: z.enum(UnitStatus).optional(),
    })
    .strict();

  // Cannot update propertyId via this DTO
  propertyId?: never;
  companyId?: never;
}
