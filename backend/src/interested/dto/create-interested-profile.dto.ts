import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsObject,
  Min,
} from 'class-validator';
import {
  InterestedOperation,
  InterestedPropertyType,
  InterestedQualificationLevel,
  InterestedStatus,
} from '../entities/interested-profile.entity';
import { Type } from 'class-transformer';
import { z } from 'zod';

export const createInterestedProfileZodSchema = z
  .object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().min(1),
    email: z.string().email().optional(),
    peopleCount: z.coerce
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Number of people who will occupy the property'),
    minAmount: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Minimum budget amount'),
    maxAmount: z.coerce
      .number()
      .min(0)
      .optional()
      .describe('Maximum budget amount'),
    hasPets: z.coerce.boolean().optional(),
    guaranteeTypes: z
      .array(z.string())
      .optional()
      .describe('Array of guarantee types the prospect can provide'),
    preferredZones: z
      .array(z.string())
      .optional()
      .describe('Array of preferred neighborhood/zone names'),
    preferredCity: z.string().optional(),
    desiredFeatures: z.array(z.string()).optional(),
    propertyTypePreference: z
      .nativeEnum(InterestedPropertyType)
      .optional()
      .describe(
        'apartment|house|commercial|office|warehouse|land|parking|other',
      ),
    operation: z
      .nativeEnum(InterestedOperation)
      .optional()
      .describe('rent|sale (deprecated, use operations)'),
    operations: z
      .array(z.nativeEnum(InterestedOperation))
      .min(1)
      .optional()
      .describe('Array of: rent|sale — interested operation types'),
    status: z
      .nativeEnum(InterestedStatus)
      .optional()
      .describe('interested|tenant|buyer — pipeline status'),
    qualificationLevel: z
      .nativeEnum(InterestedQualificationLevel)
      .optional()
      .describe('mql|sql|rejected — lead qualification'),
    qualificationNotes: z.string().optional(),
    source: z
      .string()
      .optional()
      .describe('Lead source (e.g. website, referral, portal)'),
    assignedToUserId: z
      .string()
      .uuid()
      .optional()
      .describe('UUID of staff user assigned to this lead'),
    organizationName: z.string().optional(),
    customFields: z.record(z.string(), z.unknown()).optional(),
    consentContact: z.coerce
      .boolean()
      .optional()
      .describe('Whether the prospect consented to be contacted'),
    consentRecordedAt: z.coerce.date().optional(),
    lastContactAt: z.coerce.date().optional(),
    nextContactAt: z.coerce.date().optional(),
    lostReason: z
      .string()
      .optional()
      .describe('Reason the lead was lost/rejected'),
    notes: z.string().optional(),
  })
  .strict();

export class CreateInterestedProfileDto {
  static readonly zodSchema = createInterestedProfileZodSchema;

  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  peopleCount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  minAmount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  maxAmount?: number;

  @IsBoolean()
  @IsOptional()
  hasPets?: boolean;

  @IsString({ each: true })
  @IsOptional()
  @IsArray()
  guaranteeTypes?: string[];

  @IsString({ each: true })
  @IsOptional()
  @IsArray()
  preferredZones?: string[];

  @IsString()
  @IsOptional()
  preferredCity?: string;

  @IsString({ each: true })
  @IsOptional()
  @IsArray()
  desiredFeatures?: string[];

  @IsEnum(InterestedPropertyType)
  @IsOptional()
  propertyTypePreference?: InterestedPropertyType;

  @IsEnum(InterestedOperation)
  @IsOptional()
  operation?: InterestedOperation;

  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(InterestedOperation, { each: true })
  @IsOptional()
  operations?: InterestedOperation[];

  @IsEnum(InterestedStatus)
  @IsOptional()
  status?: InterestedStatus;

  @IsEnum(InterestedQualificationLevel)
  @IsOptional()
  qualificationLevel?: InterestedQualificationLevel;

  @IsString()
  @IsOptional()
  qualificationNotes?: string;

  @IsString()
  @IsOptional()
  source?: string;

  @IsUUID()
  @IsOptional()
  assignedToUserId?: string;

  @IsString()
  @IsOptional()
  organizationName?: string;

  @IsObject()
  @IsOptional()
  customFields?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  consentContact?: boolean;

  @IsOptional()
  @Type(() => Date)
  consentRecordedAt?: Date;

  @IsOptional()
  @Type(() => Date)
  lastContactAt?: Date;

  @IsOptional()
  @Type(() => Date)
  nextContactAt?: Date;

  @IsString()
  @IsOptional()
  lostReason?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
