import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
export class PayoutBankAccountDto {
  @ApiProperty({ enum: ['checking'] })
  @Equals('checking')
  accountType: 'checking';
  @IsString() @MinLength(1) @MaxLength(200) holder: string;
  @Matches(/^\d{1,34}$/) number: string;
  @Matches(/^\d{3}$/) bankId: string;
  @IsOptional() @Matches(/^\d{1,10}$/) branch?: string;
  @Matches(/^\d{1,20}$/) ownerValue: string;
  @Matches(/^[A-Z]{2,10}$/) ownerType: string;
}
export class RequestSettlementPayoutDto {
  @ApiProperty({ type: Boolean, enum: [true] })
  @Equals(true)
  confirmed: boolean;
  @Matches(/^\d{1,11}\.\d{2}$/) expectedAmount: string;
  @ApiProperty({ enum: ['ARS'] })
  @Equals('ARS')
  currency: 'ARS';
  @IsOptional() @IsEmail() recipientEmail?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => PayoutBankAccountDto)
  bankAccount?: PayoutBankAccountDto;
}
export class ReviewSettlementPayoutDto {
  @IsIn(['retry', 'link', 'refresh']) action: 'retry' | 'link' | 'refresh';
  @ApiProperty({ type: Boolean, enum: [true] })
  @Equals(true)
  confirmed: boolean;
  @IsString() @MinLength(10) @MaxLength(1000) reason: string;
  @IsOptional() @Matches(/^POP[A-Za-z0-9]{1,100}$/) payoutId?: string;
  @IsOptional() @Matches(/^TOP[A-Za-z0-9]{1,100}$/) transactionId?: string;
}
export class SettlementPayoutJobDto {
  @ApiProperty() id: string;
  @ApiProperty({
    enum: [
      'queued',
      'dispatching',
      'awaiting',
      'completed',
      'failed',
      'needs_review',
      'reversed',
    ],
  })
  status: string;
  @ApiProperty({ type: String, nullable: true }) payoutId: string | null;
  @ApiProperty({ type: String, nullable: true }) transactionId: string | null;
  @ApiProperty() amount: string;
  @ApiProperty() currency: string;
  @ApiProperty({ type: String, nullable: true }) remoteStatus: string | null;
  @ApiProperty({ type: String, nullable: true }) remoteDetail: string | null;
  @ApiProperty({ type: String, nullable: true }) errorCode: string | null;
  @ApiProperty() attempts: number;
  @ApiProperty() updatedAt: string;
}
export class SettlementPayoutMovementDto {
  @ApiProperty() receiptAvailable: boolean;
  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['queued', 'completed', 'dead_letter'],
  })
  receiptStatus: string | null;
  @ApiProperty() id: string;
  @ApiProperty({ enum: ['transfer', 'reversal'] }) kind: string;
  @ApiProperty() amount: string;
  @ApiProperty() currency: string;
  @ApiProperty() transactionId: string;
  @ApiProperty() providerUpdatedAt: string;
  @ApiProperty() createdAt: string;
}
export class SettlementPayoutReviewDto {
  @ApiProperty() id: string;
  @ApiProperty() actorId: string;
  @ApiProperty({ enum: ['retry', 'link', 'refresh'] }) action: string;
  @ApiProperty() reason: string;
  @ApiProperty() createdAt: string;
}
export class SettlementPayoutOverviewDto {
  @ApiProperty() enabled: boolean;
  @ApiProperty({ type: SettlementPayoutJobDto, nullable: true })
  job: SettlementPayoutJobDto | null;
  @ApiProperty({ type: [SettlementPayoutMovementDto] })
  movements: SettlementPayoutMovementDto[];
  @ApiProperty({ type: [SettlementPayoutReviewDto] })
  reviews: SettlementPayoutReviewDto[];
}
