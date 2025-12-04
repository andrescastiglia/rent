import {
    IsEnum,
    IsOptional,
    IsInt,
    IsUUID,
    IsDateString,
    Min,
    Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentStatus, PaymentMethod } from '../entities/payment.entity';

/**
 * DTO para filtrar pagos.
 */
export class PaymentFiltersDto {
    @IsUUID()
    @IsOptional()
    tenantAccountId?: string;

    @IsUUID()
    @IsOptional()
    leaseId?: string;

    @IsEnum(PaymentStatus)
    @IsOptional()
    status?: PaymentStatus;

    @IsEnum(PaymentMethod)
    @IsOptional()
    method?: PaymentMethod;

    @IsDateString()
    @IsOptional()
    fromDate?: string;

    @IsDateString()
    @IsOptional()
    toDate?: string;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    @IsOptional()
    page?: number = 1;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    @IsOptional()
    limit?: number = 10;
}
