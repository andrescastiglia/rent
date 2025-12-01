import { PartialType } from '@nestjs/mapped-types';
import { CreatePropertyDto } from './create-property.dto';
import { IsEnum, IsOptional } from 'class-validator';
import { PropertyStatus } from '../entities/property.entity';

export class UpdatePropertyDto extends PartialType(CreatePropertyDto) {
  @IsEnum(PropertyStatus)
  @IsOptional()
  status?: PropertyStatus;

  // Cannot update companyId or ownerId via this DTO
  companyId?: never;
  ownerId?: never;
}
