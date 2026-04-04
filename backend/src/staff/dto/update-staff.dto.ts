import { PartialType } from '@nestjs/mapped-types';
import { CreateStaffDto, createStaffZodSchema } from './create-staff.dto';

export class UpdateStaffDto extends PartialType(CreateStaffDto) {
  static readonly zodSchema = createStaffZodSchema.partial().strict();
}
