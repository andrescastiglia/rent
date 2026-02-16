import { PartialType } from '@nestjs/mapped-types';
import { CreateOwnerDto, createOwnerZodSchema } from './create-owner.dto';

export class UpdateOwnerDto extends PartialType(CreateOwnerDto) {
  static readonly zodSchema = createOwnerZodSchema.partial().strict();
}
