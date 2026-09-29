import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, Matches } from 'class-validator';

export class SettlementCalculationQueryDto {
  @IsUUID() ownerId: string;
  @Matches(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/) period: string;
  @Matches(/^[A-Z]{3}$/) currency: string;
}

export class SettlementSourceAllocationDto {
  @ApiProperty() id: string;
  @ApiProperty() paymentId: string;
  @ApiProperty() amount: string;
  @ApiProperty() paymentDate: string;
}

export class SettlementSourceCreditDto {
  @ApiProperty() id: string;
  @ApiProperty() amount: string;
}

export class SettlementSourceInvoiceDto {
  @ApiProperty() id: string;
  @ApiProperty() invoiceNumber: string;
  @ApiProperty() totalAmount: string;
  @ApiProperty() dueDate: string;
  @ApiProperty() collectedAmount: string;
  @ApiProperty() creditedAmount: string;
  @ApiProperty() grossAmount: string;
  @ApiProperty() scheduledDate: string;
  @ApiProperty({ type: [SettlementSourceAllocationDto] })
  allocations: SettlementSourceAllocationDto[];
  @ApiProperty({ type: [SettlementSourceCreditDto] })
  creditNotes: SettlementSourceCreditDto[];
}

export class SettlementCalculationDto {
  @ApiProperty() ownerId: string;
  @ApiProperty() period: string;
  @ApiProperty() currency: string;
  @ApiProperty() commissionRate: string;
  @ApiProperty() grossAmount: string;
  @ApiProperty() commissionAmount: string;
  @ApiProperty({
    description:
      'Before any additional settlement withholding; not a transfer authorization.',
  })
  netBeforeWithholdings: string;
  @ApiProperty({ type: String, nullable: true }) scheduledDate: string | null;
  @ApiProperty({
    type: [String],
    description:
      'Existing settlements require reconciliation before generation; amounts are not unreserved balances.',
  })
  existingSettlementIds: string[];
  @ApiProperty({ type: [SettlementSourceInvoiceDto] })
  invoices: SettlementSourceInvoiceDto[];
  @ApiProperty({
    description: 'Hash of the source calculation, excluding calculation time.',
  })
  fingerprint: string;
}
