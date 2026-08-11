import {
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';

export function normalizePhone(
  value: string,
  defaultCountry: CountryCode = 'TR',
): string {
  const input = value.trim();

  const phone = parsePhoneNumberFromString(input, defaultCountry);

  if (!phone || !phone.isValid()) {
    throw new Error('Geçersiz telefon numarası.');
  }

  return phone.number;
}

export function isValidE164Phone(value: string): boolean {
  const phone = parsePhoneNumberFromString(value);

  return Boolean(phone?.isValid() && phone.number === value);
}
