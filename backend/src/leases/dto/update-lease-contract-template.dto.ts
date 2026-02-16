import { PartialType } from '@nestjs/mapped-types';
import {
  CreateLeaseContractTemplateDto,
  createLeaseContractTemplateZodSchema,
} from './create-lease-contract-template.dto';

export class UpdateLeaseContractTemplateDto extends PartialType(
  CreateLeaseContractTemplateDto,
) {
  static readonly zodSchema = createLeaseContractTemplateZodSchema
    .partial()
    .strict();
}
