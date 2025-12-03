'use client';

import * as z from 'zod';

/**
 * Helper para crear schemas de Zod con mensajes traducidos
 * Uso: const schema = createPropertySchema(t) donde t es la función de traducción de 'validation'
 */

type TranslationFunction = (key: string, params?: Record<string, string | number>) => string;

/**
 * Crea el schema de validación para propiedades con mensajes traducidos
 */
export const createPropertySchema = (t: TranslationFunction) => z.object({
  name: z.string().min(3, t('minLength', { min: 3 })),
  description: z.string().optional(),
  type: z.enum(['APARTMENT', 'HOUSE', 'COMMERCIAL', 'OFFICE', 'LAND', 'OTHER'] as const),
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE'] as const).optional(),
  address: z.object({
    street: z.string().min(1, t('streetRequired')),
    number: z.string().min(1, t('numberRequired')),
    unit: z.string().optional(),
    city: z.string().min(1, t('cityRequired')),
    state: z.string().min(1, t('stateRequired')),
    zipCode: z.string().min(1, t('zipCodeRequired')),
    country: z.string().min(1, t('countryRequired')),
  }),
  features: z.array(z.object({
    name: z.string().min(1, t('required')),
    value: z.string().optional(),
  })).optional(),
  images: z.array(z.string()).optional(),
  ownerId: z.string().min(1, t('ownerRequired')),
});

/**
 * Crea el schema de validación para inquilinos con mensajes traducidos
 */
export const createTenantSchema = (t: TranslationFunction) => z.object({
  firstName: z.string().min(2, t('minLength', { min: 2 })),
  lastName: z.string().min(2, t('minLength', { min: 2 })),
  email: z.string().email(t('invalidEmail')),
  phone: z.string().min(6, t('invalidPhone')),
  dni: z.string().min(6, t('invalidDni')),
  address: z.string().optional(),
  emergencyContact: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    relationship: z.string().optional(),
  }).optional(),
});

/**
 * Crea el schema de validación para contratos con mensajes traducidos
 */
export const createLeaseSchema = (t: TranslationFunction) => z.object({
  propertyId: z.string().min(1, t('propertyRequired')),
  unitId: z.string().min(1, t('unitRequired')),
  tenantId: z.string().min(1, t('tenantRequired')),
  startDate: z.string().min(1, t('startDateRequired')),
  endDate: z.string().min(1, t('endDateRequired')),
  rentAmount: z.coerce.number().min(0, t('rentAmountPositive')),
  depositAmount: z.coerce.number().min(0, t('depositAmountPositive')),
  currency: z.string().min(1, t('required')).default('ARS'),
  status: z.enum(['DRAFT', 'ACTIVE', 'ENDED', 'TERMINATED'] as const),
  terms: z.string().optional(),
});

// Tipos inferidos de los schemas
export type PropertyFormData = z.infer<ReturnType<typeof createPropertySchema>>;
export type TenantFormData = z.infer<ReturnType<typeof createTenantSchema>>;
export type LeaseFormData = z.infer<ReturnType<typeof createLeaseSchema>>;
