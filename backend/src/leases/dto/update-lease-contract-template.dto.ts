import { PartialType } from '@nestjs/mapped-types';
import { CreateLeaseContractTemplateDto } from './create-lease-contract-template.dto';

export class UpdateLeaseContractTemplateDto extends PartialType(
  CreateLeaseContractTemplateDto,
) {}
