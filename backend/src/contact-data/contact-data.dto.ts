import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow } from 'class-validator';
import { z } from 'zod';
export const contactAddressSchema = z
  .object({
    street: z.string().max(200).default(''),
    number: z.string().max(40).default(''),
    city: z.string().max(120).default(''),
    state: z.string().max(120).default(''),
    country: z.string().max(100).default('Argentina'),
    postalCode: z.string().max(30).default(''),
    floor: z.string().max(30).optional(),
    apartment: z.string().max(30).optional(),
    confidential: z.boolean().default(false),
  })
  .strict();
export const normalizationSchema = z
  .object({
    addressToken: z.string().max(12000).nullable().optional(),
    phoneOriginals: z
      .record(z.string().max(40), z.string().max(100))
      .optional(),
    phones: z
      .partialRecord(
        z.enum([
          'phone',
          'emergencyContactPhone',
          'emergencyPhone',
          'ownerWhatsapp',
        ]),
        z.string().regex(/^[A-Z]{2}$/),
      )
      .optional(),
  })
  .strict();
export const contactInputShape = {
  contactAddress: contactAddressSchema.nullable().optional(),
  normalization: normalizationSchema.optional(),
};
export type ContactAddress = z.infer<typeof contactAddressSchema>;
export type NormalizationRequest = z.infer<typeof normalizationSchema>;
export class ContactNormalizationDto {
  @ApiPropertyOptional({
    type: 'object' as const,
    properties: {
      street: { type: 'string' as const },
      number: { type: 'string' as const },
      city: { type: 'string' as const },
      state: { type: 'string' as const },
      country: { type: 'string' as const },
      postalCode: { type: 'string' as const },
      floor: { type: 'string' as const },
      apartment: { type: 'string' as const },
      confidential: { type: 'boolean' as const },
    },
    additionalProperties: false,
  })
  @Allow()
  contactAddress?: ContactAddress | null;
  @ApiPropertyOptional({
    type: 'object' as const,
    properties: {
      addressToken: { type: 'string' as const, nullable: true },
      phones: {
        type: 'object' as const,
        additionalProperties: {
          type: 'string' as const,
          pattern: '^[A-Z]{2}$',
        },
      },
      phoneOriginals: {
        type: 'object' as const,
        additionalProperties: { type: 'string' as const },
      },
    },
    additionalProperties: false,
  })
  @Allow()
  normalization?: NormalizationRequest;
}
export class PhonePreviewDto {
  static readonly zodSchema = z
    .object({
      value: z.string().max(100),
      country: z
        .string()
        .regex(/^[A-Z]{2}$/)
        .default('AR'),
    })
    .strict();
  @Allow() value: string;
  @Allow() country?: string;
}
export class AddressSearchDto {
  static readonly zodSchema = z
    .object({ address: contactAddressSchema, publicAddress: z.literal(true) })
    .strict();
  @ApiProperty({
    type: 'object' as const,
    properties: {
      street: { type: 'string' as const },
      number: { type: 'string' as const },
      city: { type: 'string' as const },
      state: { type: 'string' as const },
      country: { type: 'string' as const },
      postalCode: { type: 'string' as const },
      floor: { type: 'string' as const },
      apartment: { type: 'string' as const },
      confidential: { type: 'boolean' as const },
    },
    additionalProperties: false,
  })
  @Allow()
  address: ContactAddress;
  @Allow() publicAddress: true;
}
export const locationRefSchema = z
  .object({
    type: z.enum(['property', 'owner', 'tenant', 'interested']),
    id: z.uuid(),
  })
  .strict();
export type LocationRef = z.infer<typeof locationRefSchema>;
const originSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(10000),
    timestamp: z.number().int().positive(),
  })
  .strict();
export class EtaDto {
  static readonly zodSchema = z
    .object({
      destination: locationRefSchema,
      origin: originSchema,
      mode: z.enum(['driving', 'walking', 'cycling']).default('driving'),
    })
    .strict();
  @ApiProperty({
    type: 'object' as const,
    properties: {
      type: {
        type: 'string' as const,
        enum: ['property', 'owner', 'tenant', 'interested'],
      },
      id: { type: 'string' as const, format: 'uuid' },
    },
    required: ['type', 'id'],
  })
  @Allow()
  destination: LocationRef;
  @ApiProperty({
    type: 'object' as const,
    properties: {
      latitude: { type: 'number' as const, minimum: -90, maximum: 90 },
      longitude: { type: 'number' as const, minimum: -180, maximum: 180 },
      accuracy: { type: 'number' as const, minimum: 0 },
      timestamp: { type: 'integer' as const },
    },
    required: ['latitude', 'longitude', 'accuracy', 'timestamp'],
  })
  @Allow()
  origin: z.infer<typeof originSchema>;
  @Allow() mode?: 'driving' | 'walking' | 'cycling';
}
export class NearbyDto {
  static readonly zodSchema = z
    .object({
      origin: originSchema,
      radius: z.number().int().min(100).max(10000).optional(),
      limit: z.number().int().min(1).max(20).optional(),
    })
    .strict();
  @ApiProperty({
    type: 'object' as const,
    properties: {
      latitude: { type: 'number' as const, minimum: -90, maximum: 90 },
      longitude: { type: 'number' as const, minimum: -180, maximum: 180 },
      accuracy: { type: 'number' as const, minimum: 0 },
      timestamp: { type: 'integer' as const },
    },
    required: ['latitude', 'longitude', 'accuracy', 'timestamp'],
  })
  @Allow()
  origin: z.infer<typeof originSchema>;
  @Allow() radius?: number;
  @Allow() limit?: number;
}

export class PhonePreviewResultDto {
  @ApiProperty() original: string;
  @ApiProperty() country: string;
  @ApiProperty() possible: boolean;
  @ApiProperty() valid: boolean;
  @ApiProperty({ type: String, nullable: true }) e164: string | null;
  @ApiProperty({ type: String, nullable: true }) international: string | null;
  @ApiProperty({ type: String, nullable: true }) extension: string | null;
}
export class GeoDestinationDto {
  @ApiProperty({ enum: ['property', 'owner', 'tenant', 'interested'] })
  type: string;
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() address: string;
  @ApiProperty() latitude: number;
  @ApiProperty() longitude: number;
  @ApiProperty() precise: boolean;
}
export class EtaResultDto {
  @ApiProperty() durationSeconds: number;
  @ApiProperty() distanceMeters: number;
  @ApiProperty({ format: 'date-time' }) arrivesAt: string;
  @ApiProperty({ enum: ['driving', 'walking', 'cycling'] }) mode: string;
  @ApiProperty() traffic: boolean;
  @ApiProperty() attribution: string;
}
export class PlaceSearchDto {
  static readonly zodSchema = z
    .object({ search: z.string().max(100).default('') })
    .strict();
  @Allow() search?: string;
}
export class RegisteredPlaceDto {
  @ApiProperty({ enum: ['property', 'owner', 'tenant', 'interested'] })
  type: string;
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() address: string;
}
export class GeoConfigDto {
  @ApiProperty() normalization: boolean;
  @ApiProperty() maps: boolean;
  @ApiProperty() proximity: boolean;
  @ApiProperty() radius: number;
  @ApiProperty() imminentRadius: number;
  @ApiProperty() exitRadius: number;
  @ApiProperty() limit: number;
  @ApiProperty({
    type: 'object',
    properties: {
      userId: { type: 'string', format: 'uuid' },
      companyId: { type: 'string', format: 'uuid' },
    },
    required: ['userId', 'companyId'],
  })
  scope: { userId: string; companyId: string };
}
export class AddressCandidateDto {
  @ApiProperty() label: string;
  @ApiProperty() precise: boolean;
  @ApiProperty() token: string;
}
export class AddressSearchResultDto {
  @ApiProperty({ type: [AddressCandidateDto] })
  candidates: AddressCandidateDto[];
  @ApiProperty() attribution: string;
  @ApiProperty() attributionUrl: string;
}
export class NearbyContactDto {
  @ApiProperty({ enum: ['owner', 'tenant', 'interested'] }) type: string;
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() relationship: string;
}
export class NearbyPlaceDto extends GeoDestinationDto {
  @ApiProperty() distance: number;
  @ApiProperty({ type: [NearbyContactDto] }) contacts: NearbyContactDto[];
}
export class NearbyResultDto {
  @ApiProperty({ type: [NearbyPlaceDto] }) places: NearbyPlaceDto[];
  @ApiProperty() imminentRadius: number;
  @ApiProperty() exitRadius: number;
}
export class ContactCommunicationDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() channel: string;
  @ApiProperty() direction: string;
  @ApiProperty() summary: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}
export class ContactHistoryDto {
  @ApiProperty({ type: [ContactCommunicationDto] })
  communications: ContactCommunicationDto[];
  @ApiProperty({ type: String, nullable: true }) whatsappPhone: string | null;
}
export class ArrivalOpenedDto {
  @ApiProperty({ enum: ['arrival_whatsapp_opened'] }) event: string;
  @ApiProperty({ enum: [false] }) sent: boolean;
}
