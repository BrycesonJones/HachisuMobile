import type { UpsertProfileInput } from '@/lib/auth/auth-service';
import type { CompanyVerificationForm } from '@/lib/company-verification';

/**
 * Onboarding answers collected *before* the user authenticates.
 *
 * Business sign-up now asks for the email (and OTP) at the very end of the
 * questionnaire, so the answers given on the way there cannot be written to
 * `user_profiles` yet — there is no `auth.uid()` to own the row. They are held
 * here in memory and applied in a single upsert once the session exists
 * (see `applyOnboardingDraft` in auth-service), so no duplicate or orphaned
 * rows are created.
 *
 * Deliberately module-level (not a context): nothing renders from it, and it
 * mirrors the existing dev-session store.
 */
let draftProfile: UpsertProfileInput = {};
let draftCompletesOnboarding = false;
let draftCompanyForm: CompanyVerificationForm | null = null;

/** Merges profile fields into the draft. Later answers win over earlier ones. */
export function stageOnboardingProfile(
  input: UpsertProfileInput,
  completesOnboarding = false,
): void {
  draftProfile = { ...draftProfile, ...input };
  draftCompletesOnboarding = draftCompletesOnboarding || completesOnboarding;
}

export function getOnboardingDraft(): UpsertProfileInput {
  return draftProfile;
}

export function hasOnboardingDraft(): boolean {
  return Object.keys(draftProfile).length > 0;
}

/** True when the staged answers finish onboarding (last questionnaire screen). */
export function doesDraftCompleteOnboarding(): boolean {
  return draftCompletesOnboarding;
}

/**
 * Raw Company information form values, kept so the screen can restore what the
 * user typed if it is remounted after navigating on to the email step.
 */
export function stageCompanyVerificationForm(form: CompanyVerificationForm): void {
  draftCompanyForm = { ...form };
}

export function getStagedCompanyVerificationForm(): CompanyVerificationForm | null {
  return draftCompanyForm;
}

export function clearOnboardingDraft(): void {
  draftProfile = {};
  draftCompletesOnboarding = false;
  draftCompanyForm = null;
}
