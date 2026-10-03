import {
  incomingPhoneCandidates,
  previewPhone,
  whatsappFromRecord,
  whatsappPhone,
} from './phone';
describe('optional phone normalization', () => {
  it.each([
    ['011 15 2345 6789', 'AR', '+5491123456789'],
    ['+54 9 11 2345-6789', 'AR', '+5491123456789'],
    ['011 4321 5678', 'AR', '+541143215678'],
    ['+54 11 4321 5678', 'US', '+541143215678'],
    ['202-555-0123', 'US', '+12025550123'],
    ['+34 612 345 678', 'AR', '+34612345678'],
  ])(
    'normalizes %s locally without replacing the original',
    (value, country, e164) => {
      expect(previewPhone(value, country)).toMatchObject({
        original: value,
        country,
        valid: true,
        possible: true,
        e164,
      });
    },
  );
  it('separates extensions from E.164', () => {
    expect(previewPhone('011 4321 5678 ext. 123')).toMatchObject({
      valid: true,
      e164: '+541143215678',
      extension: '123',
    });
    expect(whatsappPhone('+54 11 4321 5678 ext 123')).toBe('541143215678');
  });
  it('distinguishes possibility from validity and rejects incomplete numbers', () => {
    expect(previewPhone('011 1234 5678')).toMatchObject({
      possible: true,
      valid: true,
    });
    expect(previewPhone('1234')).toMatchObject({ valid: false, e164: null });
    expect(previewPhone('0000000000')).toMatchObject({
      possible: true,
      valid: false,
    });
    expect(previewPhone('2345-6789')).toMatchObject({
      valid: false,
      e164: null,
    });
    expect(previewPhone('hello')).toMatchObject({ valid: false, e164: null });
  });
  it('respects international prefixes and refuses unsupported regions', () => {
    expect(previewPhone('+12025550123', 'AR').e164).toBe('+12025550123');
    expect(previewPhone('01143215678', 'ZZ').valid).toBe(false);
  });
  it('does not infer a mobile 9 or match a fixed number to a mobile sender', () => {
    expect(whatsappPhone('541143215678')).toBe('541143215678');
    expect(incomingPhoneCandidates('5491123456789')).toEqual([
      '5491123456789',
      '0111523456789',
      '111523456789',
    ]);
    expect(incomingPhoneCandidates('5491123456789')).not.toContain(
      '541123456789',
    );
  });
  it('uses accepted country-specific E.164 only while the original still matches', () => {
    const data = { phone: { original: '2025550123', e164: '+12025550123' } };
    expect(
      whatsappFromRecord({
        phone: '2025550123',
        contact_data: { phones: data },
      }),
    ).toBe('12025550123');
    expect(
      whatsappFromRecord({ phone: '123', contact_data: { phones: data } }),
    ).toBe('');
  });
});

describe('shared account phone metadata', () => {
  it('uses an accepted foreign number from the linked user without confusing its national format with Argentina', () => {
    expect(
      whatsappFromRecord({
        phone: '2025550123',
        contact_data: {},
        account_contact_data: {
          phones: { phone: { original: '2025550123', e164: '+12025550123' } },
        },
      }),
    ).toBe('12025550123');
  });
  it('ignores accepted metadata after the shared original changes', () => {
    expect(
      whatsappFromRecord({
        phone: 'incomplete',
        account_contact_data: {
          phones: { phone: { original: '2025550123', e164: '+12025550123' } },
        },
      }),
    ).toBe('');
  });
});
