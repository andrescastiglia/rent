import { PartialType } from '@nestjs/mapped-types';
import { CreateUnitDto, createUnitZodSchema } from './create-unit.dto';

export class UpdateUnitDto extends PartialType(CreateUnitDto) {
  static readonly zodSchema = createUnitZodSchema
    .omit({ propertyId: true, companyId: true })
    .partial()
    .strict();

  // Cannot update propertyId via this DTO
  propertyId?: never;
  companyId?: never;
}
