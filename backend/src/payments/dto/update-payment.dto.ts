import { PartialType } from '@nestjs/mapped-types';
import { CreatePaymentDto, createPaymentZodSchema } from './create-payment.dto';

export class UpdatePaymentDto extends PartialType(CreatePaymentDto) {
  static readonly zodSchema = createPaymentZodSchema.partial().strict();
}
