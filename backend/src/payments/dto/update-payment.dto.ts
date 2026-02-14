import { PartialType } from '@nestjs/mapped-types';
import { CreatePaymentDto } from './create-payment.dto'; // NOSONAR
import { createPaymentZodSchema } from './create-payment.dto'; // NOSONAR

export class UpdatePaymentDto extends PartialType(CreatePaymentDto) {
  static readonly zodSchema = createPaymentZodSchema.partial().strict();
}
