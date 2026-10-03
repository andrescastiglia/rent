import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  ContactAddress,
  NormalizationRequest,
  contactAddressSchema,
} from './contact-data.dto';
import { previewPhone } from './phone';
export type NormalizedPhone = ReturnType<typeof previewPhone> & {
  normalizedAt: string;
};
export type NormalizedAddress = {
  original: ContactAddress;
  label: string;
  components: Record<string, string>;
  latitude: number;
  longitude: number;
  provider: 'nominatim';
  sourceId: string;
  normalizedAt: string;
  inputHash: string;
  precise: boolean;
};
export type ContactData = {
  address?: NormalizedAddress;
  phones?: Record<string, NormalizedPhone>;
};
type ContactRecord = {
  companyId?: string;
  contactAddress?: ContactAddress | null;
  contactData?: ContactData;
  latitude?: number | null;
  longitude?: number | null;
  [key: string]: unknown;
};
export function addressFingerprint(address: ContactAddress): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        ['street', 'number', 'city', 'state', 'country', 'postalCode'].map(
          (k) =>
            String(address[k as keyof ContactAddress] ?? '')
              .trim()
              .toLowerCase(),
        ),
      ),
    )
    .digest('hex');
}
function secret() {
  const key = process.env.CONTACT_DATA_SIGNING_SECRET || process.env.JWT_SECRET;
  if (!key)
    throw new ServiceUnavailableException(
      'Firma de normalización no configurada',
    );
  return key;
}
export function signAddress(address: NormalizedAddress, companyId: string) {
  const payload = Buffer.from(
    JSON.stringify({ address, companyId, expires: Date.now() + 86400000 }),
  ).toString('base64url');
  return `${payload}.${createHmac('sha256', secret()).update(payload).digest('base64url')}`;
}
export function verifyAddress(
  token: string,
  companyId: string,
  address: ContactAddress,
): NormalizedAddress {
  try {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra) throw new Error();
    const expected = createHmac('sha256', secret()).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new Error();
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (
      value.companyId !== companyId ||
      value.expires < Date.now() ||
      value.address.inputHash !== addressFingerprint(address) ||
      address.confidential
    )
      throw new Error();
    return value.address;
  } catch {
    throw new BadRequestException(
      'La propuesta de dirección venció o corresponde a otros datos. Volvé a normalizar.',
    );
  }
}
export function recordAddress(
  record: ContactRecord,
  kind: 'property' | 'owner' | 'tenant' | 'interested' | 'user',
): ContactAddress | null {
  if (kind === 'user') return null;
  if (kind === 'property')
    return contactAddressSchema.parse({
      floor: record.addressFloor ?? undefined,
      apartment: record.addressApartment ?? undefined,
      street: record.addressStreet ?? '',
      number: record.addressNumber ?? '',
      city: record.addressCity ?? '',
      state: record.addressState ?? '',
      country: record.addressCountry ?? 'Argentina',
      postalCode: record.addressPostalCode ?? '',
    });
  if (record.contactAddress) return record.contactAddress;
  if (kind === 'owner')
    return contactAddressSchema.parse({
      street: record.address ?? '',
      city: record.city ?? '',
      state: record.state ?? '',
      country: record.country ?? 'Argentina',
      postalCode: record.postalCode ?? '',
    });
  return null;
}
export function applyContactNormalization<T extends object>(
  entity: T,
  input: {
    contactAddress?: ContactAddress | null;
    normalization?: NormalizationRequest;
  },
  kind: 'property' | 'owner' | 'tenant' | 'interested' | 'user',
  phones: Record<string, string | undefined | null>,
  previous?: T,
): void {
  const record = entity as ContactRecord;
  const before = previous as ContactRecord | undefined;
  const data: ContactData = structuredClone(record.contactData ?? {});
  if (
    input.contactAddress !== undefined &&
    kind !== 'property' &&
    kind !== 'user'
  )
    record.contactAddress = input.contactAddress;
  const address = recordAddress(record, kind);
  const oldAddress = before ? recordAddress(before, kind) : null;
  if (
    (data.address &&
      (!address ||
        address.confidential ||
        data.address.inputHash !== addressFingerprint(address))) ||
    (oldAddress &&
      (!address ||
        addressFingerprint(oldAddress) !== addressFingerprint(address)))
  ) {
    delete data.address;
    record.latitude = null;
    record.longitude = null;
  }
  if (input.normalization?.addressToken === null) {
    delete data.address;
    record.latitude = null;
    record.longitude = null;
  }
  if (input.normalization?.addressToken) {
    if (!address || !record.companyId)
      throw new BadRequestException('Dirección incompleta');
    const selected = verifyAddress(
      input.normalization.addressToken,
      record.companyId,
      address,
    );
    data.address = {
      ...selected,
      original: address,
      normalizedAt: new Date().toISOString(),
    };
    record.latitude = selected.latitude;
    record.longitude = selected.longitude;
  }
  const normalized = data.phones ?? {};
  for (const [field, value] of Object.entries(phones))
    if (normalized[field] && normalized[field].original !== (value ?? ''))
      delete normalized[field];
  for (const [field, country] of Object.entries(
    input.normalization?.phones ?? {},
  )) {
    if (!(field in phones))
      throw new BadRequestException(`Campo telefónico no permitido: ${field}`);
    if (
      input.normalization?.phoneOriginals?.[field] !== undefined &&
      input.normalization.phoneOriginals[field].trim() !==
        (phones[field] ?? '').trim()
    )
      continue;
    const phone = previewPhone(phones[field] ?? '', country);
    if (!phone.valid)
      throw new BadRequestException(
        'Completá el código de área y el teléfono antes de normalizar.',
      );
    normalized[field] = { ...phone, normalizedAt: new Date().toISOString() };
  }
  if (Object.keys(normalized).length) data.phones = normalized;
  else delete data.phones;
  record.contactData = data;
}
