import { ApiProperty } from '@nestjs/swagger';
import { SettlementStatus } from '../entities/settlement.entity';

export class SettlementStatusTotalDto {
  @ApiProperty({ example: 'ARS' })
  currencyCode: string;

  @ApiProperty({ enum: SettlementStatus })
  status: SettlementStatus;

  @ApiProperty({
    example: '150000.25',
    description:
      'Exact sum of settlement net amounts in this currency and recorded status.',
  })
  netAmount: string;

  @ApiProperty()
  count: number;

  @ApiProperty({
    type: String,
    nullable: true,
    format: 'date-time',
    description:
      'Latest recorded processed_at; never inferred from a scheduled or creation date.',
  })
  lastProcessedAt: string | null;
}

export class SettlementSummaryDto {
  @ApiProperty({ type: [SettlementStatusTotalDto] })
  totals: SettlementStatusTotalDto[];
}
