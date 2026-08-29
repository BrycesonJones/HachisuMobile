/**
 * Post-email personal onboarding: 3 screens, 3 progress bars (indices 0–2).
 * Email, email confirmation, and KYC screens have no progress bar.
 */
export const PERSONAL_ONBOARDING_STEP_COUNT = 3;

export const PERSONAL_ONBOARDING_PROGRESS = {
  username: 0,
  country: 1,
  phone: 2,
} as const;
