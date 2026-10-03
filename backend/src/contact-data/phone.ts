import { PhoneNumberUtil, PhoneNumberFormat } from 'google-libphonenumber';
const util = PhoneNumberUtil.getInstance();
export function previewPhone(value: string, country = 'AR') {
  const result = {
    original: value,
    country,
    possible: false,
    valid: false,
    e164: null as string | null,
    international: null as string | null,
    extension: null as string | null,
  };
  if (
    !util.getSupportedRegions().some((region) => region === country) ||
    !value.trim()
  )
    return result;
  try {
    const number = util.parseAndKeepRawInput(value, country);
    result.possible = util.isPossibleNumber(number);
    result.valid = util.isValidNumber(number);
    if (result.valid) {
      result.e164 = util.format(number, PhoneNumberFormat.E164);
      result.international = util.format(
        number,
        PhoneNumberFormat.INTERNATIONAL,
      );
      result.extension = number.getExtension() || null;
    }
  } catch {
    /* A failed optional normalization does not replace the original. */
  }
  return result;
}
export function whatsappPhone(value: string, country = 'AR'): string {
  // Meta webhook numbers are international digits without '+'. Never infer a mobile 9.
  const international =
    /^\d{11,15}$/.test(value) && !value.startsWith('0') ? `+${value}` : value;
  return previewPhone(international, country).e164?.slice(1) ?? '';
}
type PhoneMetadata = {
  phones?: Record<string, { original: string; e164: string | null }>;
};
export function whatsappFromRecord(record: {
  phone?: string | null;
  contact_data?: PhoneMetadata;
  account_contact_data?: PhoneMetadata;
}): string {
  for (const data of [record.contact_data, record.account_contact_data]) {
    const stored = data?.phones?.phone;
    if (stored?.original === record.phone && stored?.e164) {
      const phone = whatsappPhone(stored.e164);
      if (phone) return phone;
    }
  }
  return whatsappPhone(record.phone ?? '');
}
export function incomingPhoneCandidates(value: string): string[] {
  const international = whatsappPhone(value);
  if (!international) return [];
  const number = util.parse(`+${international}`, 'AR');
  const national = util
    .format(number, PhoneNumberFormat.NATIONAL)
    .replace(/\D/g, '');
  return [
    ...new Set([
      international,
      national,
      ...(national.startsWith('0') ? [national.slice(1)] : []),
    ]),
  ];
}
