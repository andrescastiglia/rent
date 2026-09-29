import { ApiProperty } from '@nestjs/swagger';
import {
  Equals,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  SettlementCalculationDto,
  SettlementCalculationQueryDto,
} from './settlement-calculation.dto';

export class GenerateSettlementDto extends SettlementCalculationQueryDto {
  @IsUUID() idempotencyKey: string;
  @Matches(/^[a-f0-9]{64}$/) expectedFingerprint: string;
  @ApiProperty({ type: Boolean, enum: [true] })
  @Equals(true)
  confirmed: boolean;
  @Matches(/^(0|[1-9]\d{0,12})\.\d{2}$/) additionalWithholdings: string;
  @IsString() @MinLength(10) @MaxLength(1000) withholdingReason: string;
}
export class VoidSettlementGenerationDto {
  @ApiProperty({ type: Boolean, enum: [true] })
  @Equals(true)
  confirmed: boolean;
  @IsString() @MinLength(10) @MaxLength(1000) reason: string;
}
export class SettlementGenerationSnapshotDto {
  @ApiProperty({ type: SettlementCalculationDto })
  calculation: SettlementCalculationDto;
  @ApiProperty() additionalWithholdings: string;
  @ApiProperty() withholdingReason: string;
  @ApiProperty() netAmount: string;
}
export class SettlementGenerationDto {
  @ApiProperty() id: string;
  @ApiProperty() settlementId: string;
  @ApiProperty({ enum: ['active', 'voided'] }) state: string;
  @ApiProperty() requestedBy: string;
  @ApiProperty() createdAt: string;
  @ApiProperty({ type: String, nullable: true }) voidedBy: string | null;
  @ApiProperty({ type: String, nullable: true }) voidedAt: string | null;
  @ApiProperty({ type: String, nullable: true }) voidReason: string | null;
  @ApiProperty({ type: SettlementGenerationSnapshotDto })
  snapshot: SettlementGenerationSnapshotDto;
}
