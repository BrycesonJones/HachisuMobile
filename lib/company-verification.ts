export interface CompanyVerificationForm {
  companyName: string;
  streetAddress: string;
  suite: string;
  city: string;
  state: string;
  zipCode: string;
  ein: string;
}

function digitCount(value: string): number {
  return value.replace(/\D/g, '').length;
}

export function formatEinInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

export function isCompanyVerificationFormValid(form: CompanyVerificationForm): boolean {
  const einDigits = digitCount(form.ein);
  const zipDigits = digitCount(form.zipCode);

  return (
    form.companyName.trim().length > 0 &&
    form.streetAddress.trim().length > 0 &&
    form.city.trim().length > 0 &&
    form.state.trim().length > 0 &&
    zipDigits >= 5 &&
    einDigits === 9
  );
}
