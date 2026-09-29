import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class ResolvePortalPublicationDto {
  @ApiProperty({
    enum: ['link', 'retry', 'confirm_not_created', 'accept_remote'],
  })
  @IsIn(['link', 'retry', 'confirm_not_created', 'accept_remote'])
  action: 'link' | 'retry' | 'confirm_not_created' | 'accept_remote';

  @ApiProperty({ minLength: 10, maxLength: 1000 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason: string;

  @ApiProperty({ required: false, pattern: '^MLA[0-9]+$' })
  @ValidateIf(
    (dto: ResolvePortalPublicationDto) =>
      dto.action === 'link' || dto.externalId !== undefined,
  )
  @Matches(/^MLA\d+$/)
  externalId?: string;

  @ApiProperty({ required: false, enum: [true] })
  @ValidateIf(
    (dto: ResolvePortalPublicationDto) =>
      dto.action === 'confirm_not_created' ||
      dto.confirmedNoPublication !== undefined,
  )
  @Equals(true)
  confirmedNoPublication?: boolean;
}
export class PortalCandidateDto {
  @ApiProperty() id: string;
  @ApiProperty() seller_id: number;
  @ApiProperty() permalink: string;
  @ApiProperty() status: string;
  @ApiProperty({ required: false }) title?: string;
}
export class PortalResolutionDto {
  @ApiProperty() id: string;
  @ApiProperty() jobId: string;
  @ApiProperty() actorId: string;
  @ApiProperty({
    enum: ['link', 'retry', 'confirm_not_created', 'accept_remote'],
  })
  action: 'link' | 'retry' | 'confirm_not_created' | 'accept_remote';
  @ApiProperty() reason: string;
  @ApiProperty({ type: String, nullable: true }) externalId: string | null;
  @ApiProperty({ type: String, nullable: true }) followupJobId: string | null;
  @ApiProperty() createdAt: Date;
}
