import {
  addressFingerprint,
  applyContactNormalization,
  ContactData,
  signAddress,
  verifyAddress,
} from './normalization';
import { contactAddressSchema, normalizationSchema } from './contact-data.dto';
const address = contactAddressSchema.parse({
  street: 'Mitre',
  number: '100',
  city: 'Buenos Aires',
});
const candidate = {
  original: address,
  label: 'Mitre 100, Buenos Aires',
  components: { road: 'Mitre' },
  latitude: -34.6,
  longitude: -58.4,
  provider: 'nominatim' as const,
  sourceId: 'node:1',
  normalizedAt: new Date().toISOString(),
  inputHash: addressFingerprint(address),
  precise: true,
};
describe('accepted contact data', () => {
  it('accepts one optional phone field independently in the HTTP schema', () => {
    expect(normalizationSchema.parse({ phones: { phone: 'AR' } })).toEqual({
      phones: { phone: 'AR' },
    });
    expect(
      normalizationSchema.safeParse({ phones: { unknown: 'AR' } }).success,
    ).toBe(false);
  });
  beforeEach(() => {
    process.env.CONTACT_DATA_SIGNING_SECRET = 'test-key';
  });
  afterEach(() => {
    delete process.env.CONTACT_DATA_SIGNING_SECRET;
  });
  it('binds a proposal to its company and address, not floor or apartment', () => {
    const token = signAddress(candidate, 'company-a');
    expect(
      verifyAddress(token, 'company-a', {
        ...address,
        floor: '3',
        apartment: 'B',
      }).latitude,
    ).toBe(-34.6);
    expect(() => verifyAddress(token, 'company-b', address)).toThrow();
    expect(() =>
      verifyAddress(token, 'company-a', { ...address, number: '101' }),
    ).toThrow();
    expect(() => verifyAddress(token + 'x', 'company-a', address)).toThrow();
    expect(() =>
      verifyAddress(token, 'company-a', { ...address, confidential: true }),
    ).toThrow();
  });
  it('persists a verified selection and keeps phone normalization independent', () => {
    const entity = {
      companyId: 'company-a',
      contactAddress: address,
      phone: '01143215678',
      contactData: {} as ContactData,
      latitude: null as number | null,
      longitude: null as number | null,
    };
    applyContactNormalization(
      entity,
      { normalization: { addressToken: signAddress(candidate, 'company-a') } },
      'interested',
      { phone: entity.phone },
    );
    expect(entity.latitude).toBe(-34.6);
    expect(entity.contactData.address?.provider).toBe('nominatim');
    expect(entity.contactData.phones).toBeUndefined();
    applyContactNormalization(
      entity,
      { normalization: { phones: { phone: 'AR' } } },
      'interested',
      { phone: entity.phone },
    );
    expect(entity.contactData.phones?.phone.e164).toBe('+541143215678');
    expect(entity.latitude).toBe(-34.6);
  });
  it('clears geolocation after a street edit but preserves it for a unit edit', () => {
    const previous = {
      companyId: 'company-a',
      contactAddress: address,
      contactData: { address: candidate },
      latitude: -34.6,
      longitude: -58.4,
    };
    const unit = structuredClone(previous);
    applyContactNormalization(
      unit,
      { contactAddress: { ...address, apartment: 'C' } },
      'interested',
      {},
      previous,
    );
    expect(unit.latitude).toBe(-34.6);
    const changed = structuredClone(previous);
    applyContactNormalization(
      changed,
      { contactAddress: { ...address, street: 'Otra' } },
      'interested',
      {},
      previous,
    );
    expect(changed.latitude).toBeNull();
    expect(changed.contactData.address).toBeUndefined();
  });
  it('invalidates phone metadata on edit and never normalizes a stale accepted value', () => {
    const entity = { phone: '01143215678', contactData: {} as ContactData };
    applyContactNormalization(
      entity,
      { normalization: { phones: { phone: 'AR' } } },
      'user',
      { phone: entity.phone },
    );
    entity.phone = '01143215679';
    applyContactNormalization(entity, {}, 'user', { phone: entity.phone });
    expect(entity.contactData.phones).toBeUndefined();
    applyContactNormalization(
      entity,
      {
        normalization: {
          phones: { phone: 'AR' },
          phoneOriginals: { phone: '01143215678' },
        },
      },
      'user',
      { phone: entity.phone },
    );
    expect(entity.contactData.phones).toBeUndefined();
  });
  it('allows originals without normalization and rejects unsupported telephone fields', () => {
    const entity = { companyId: 'a', contactData: {} as ContactData };
    applyContactNormalization(entity, {}, 'user', { phone: 'incomplete' });
    expect(entity.contactData).toEqual({});
    expect(() =>
      applyContactNormalization(
        entity,
        { normalization: { phones: { ownerWhatsapp: 'AR' } } },
        'user',
        { phone: '01143215678' },
      ),
    ).toThrow();
  });
});
