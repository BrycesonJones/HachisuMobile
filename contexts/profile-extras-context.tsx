// Display helpers for profile fields. Persistence lives in user_profiles via auth-service.

export interface NameAndAddress {
  fullName: string;
  streetAddress: string;
  apartment: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export const EMPTY_NAME_AND_ADDRESS: NameAndAddress = {
  fullName: '',
  streetAddress: '',
  apartment: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'United States',
};

export function hasNameAndAddress(value: NameAndAddress): boolean {
  return (
    value.fullName.trim().length > 0 &&
    value.streetAddress.trim().length > 0 &&
    value.city.trim().length > 0 &&
    value.state.trim().length > 0 &&
    value.postalCode.trim().length > 0
  );
}

export function formatNameAndAddressLines(value: NameAndAddress): string[] {
  if (!hasNameAndAddress(value)) return [];

  const streetLine = [value.streetAddress.trim(), value.apartment.trim()]
    .filter(Boolean)
    .join(', ');
  const cityStateZip = `${value.city.trim()} ${value.state.trim()} ${value.postalCode.trim()}`
    .toUpperCase()
    .trim();

  return [
    value.fullName.trim(),
    streetLine,
    cityStateZip,
    value.country.trim() || 'United States',
  ].filter(Boolean);
}

export function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+1 ${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 ${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone.trim();
}

/** Joins NameAndAddress into a single street/city/state/zip string for the personal_address column. */
export function nameAndAddressToPersonalAddress(value: NameAndAddress): string {
  const line1 = [value.streetAddress.trim(), value.apartment.trim()].filter(Boolean).join(', ');
  const cityStateZip = [
    value.city.trim(),
    [value.state.trim(), value.postalCode.trim()].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');
  return [line1, cityStateZip].filter(Boolean).join(', ');
}
