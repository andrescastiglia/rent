import { PartialType } from '@nestjs/mapped-types';
import { CreateLeaseContractTemplateDto } from './create-lease-contract-template.dto'; // NOSONAR
import { createLeaseContractTemplateZodSchema } from './create-lease-contract-template.dto'; // NOSONAR

export class UpdateLeaseContractTemplateDto extends PartialType(
  CreateLeaseContractTemplateDto,
) {
  static readonly zodSchema = createLeaseContractTemplateZodSchema
    .partial()
    .strict();
}
