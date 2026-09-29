import { PartialType } from '@nestjs/swagger';
import {
  CreateLeaseContractTemplateDto,
  createLeaseContractTemplateZodSchema,
} from './create-lease-contract-template.dto';

export class UpdateLeaseContractTemplateDto extends PartialType(
  CreateLeaseContractTemplateDto,
) {
  static readonly zodSchema = createLeaseContractTemplateZodSchema
    .extend({
      templateFormat:
        createLeaseContractTemplateZodSchema.shape.templateFormat.removeDefault(),
    })
    .partial()
    .strict();
}
