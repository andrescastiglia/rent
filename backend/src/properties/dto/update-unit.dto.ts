import { PartialType } from '@nestjs/mapped-types';
import { CreateUnitDto } from './create-unit.dto'; // NOSONAR
import { createUnitZodSchema } from './create-unit.dto'; // NOSONAR

export class UpdateUnitDto extends PartialType(CreateUnitDto) {
  static readonly zodSchema = createUnitZodSchema
    .omit({ propertyId: true })
    .partial()
    .strict();

  // Cannot update propertyId via this DTO
  propertyId?: never;
}
