import { ApiProperty } from '@nestjs/swagger';

export class OwnerCollectionTotalDto {
  @ApiProperty({ example: 'ARS' })
  currencyCode: string;

  @ApiProperty({
    example: '150000.25',
    description: 'Exact decimal amount of gross allocated collections.',
  })
  amount: string;
}

export class OwnerSummaryDto {
  @ApiProperty()
  propertiesCount: number;

  @ApiProperty()
  activeLeases: number;

  @ApiProperty()
  pendingSettlements: number;

  @ApiProperty({ example: '2026-09' })
  period: string;

  @ApiProperty({ enum: ['America/Argentina/Buenos_Aires'] })
  timeZone: 'America/Argentina/Buenos_Aires';

  @ApiProperty({ type: [OwnerCollectionTotalDto] })
  collectionsByCurrency: OwnerCollectionTotalDto[];
}
