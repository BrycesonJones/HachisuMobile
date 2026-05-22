/**
 * Post-email personal onboarding: 5 screens, 5 progress bars (indices 0–4).
 * Email, email confirmation, phone confirmation, and KYC screens have no progress bar.
 */
export const PERSONAL_ONBOARDING_STEP_COUNT = 5;

export const PERSONAL_ONBOARDING_PROGRESS = {
  username: 0,
  pushNotifications: 1,
  twoFactor: 2,
  country: 3,
  phone: 4,
} as const;
