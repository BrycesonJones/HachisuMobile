export interface CompanyVerificationForm {
  companyName: string;
  businessAddress: string;
  businessWebsite: string;
  businessCountry: string;
  businessDescription: string;
  expectedMonthlyVolume: string;
}

export const INITIAL_COMPANY_VERIFICATION_FORM: CompanyVerificationForm = {
  companyName: '',
  businessAddress: '',
  businessWebsite: '',
  businessCountry: '',
  businessDescription: '',
  expectedMonthlyVolume: '',
};

/** Required fields: company name, address, country, description, monthly volume. Website is optional. */
export function isCompanyVerificationFormValid(form: CompanyVerificationForm): boolean {
  return (
    form.companyName.trim().length > 0 &&
    form.businessAddress.trim().length > 0 &&
    form.businessCountry.trim().length > 0 &&
    form.businessDescription.trim().length > 0 &&
    form.expectedMonthlyVolume.trim().length > 0
  );
}
