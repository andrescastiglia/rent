import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CompleteMercadoLibreAuthorizationDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  code: string;

  @ApiProperty()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  state: string;
}
export class MercadoLibreAuthorizationDto {
  @ApiProperty()
  authorizationUrl: string;
}
export class MercadoLibreConnectionStatusDto {
  @ApiProperty()
  enabled: boolean;

  @ApiProperty({
    enum: [
      'unconfigured',
      'active',
      'connecting',
      'refreshing',
      'reconnect_required',
      'disconnected',
    ],
  })
  status:
    | 'unconfigured'
    | 'active'
    | 'connecting'
    | 'refreshing'
    | 'reconnect_required'
    | 'disconnected';

  @ApiProperty({ type: String, nullable: true })
  sellerId: string | null;

  @ApiProperty({ type: Date, nullable: true })
  expiresAt: Date | null;
}
