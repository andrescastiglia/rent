import { PartialType } from '@nestjs/mapped-types';
import { CreateBuyerDto, createBuyerZodSchema } from './create-buyer.dto';

export class UpdateBuyerDto extends PartialType(CreateBuyerDto) {
  static readonly zodSchema = createBuyerZodSchema.partial().strict();
}
