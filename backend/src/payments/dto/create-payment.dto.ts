import {
    IsDateString,
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Min,
} from 'class-validator';
import { PaymentMethod } from '../entities/payment.entity';

/**
 * DTO para crear un nuevo pago.
 */
export class CreatePaymentDto {
    @IsUUID()
    @IsNotEmpty()
    tenantAccountId: string;

    @IsNumber()
    @Min(0.01)
    @IsNotEmpty()
    amount: number;

    @IsString()
    @IsOptional()
    currencyCode?: string = 'ARS';

    @IsDateString()
    @IsNotEmpty()
    paymentDate: string;

    @IsEnum(PaymentMethod)
    @IsNotEmpty()
    method: PaymentMethod;

    @IsString()
    @IsOptional()
    reference?: string;

    @IsString()
    @IsOptional()
    notes?: string;
}
