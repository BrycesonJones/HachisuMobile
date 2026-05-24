import { HachisuColors } from '@/constants/hachisu-colors';

export const COLORS = {
  background: HachisuColors.black,
  card: '#1f1f1f',
  cardAlt: '#151515',
  cardBorder: '#2a2a2a',
  primaryText: HachisuColors.white,
  secondaryText: HachisuColors.gray,
  mutedText: HachisuColors.gray,
  whiteButton: HachisuColors.white,
  darkButton: '#2a2a2a',
  primary: HachisuColors.primary,
  primaryDark: HachisuColors.primaryDark,
  primaryLight: HachisuColors.primaryLight,
  cream: HachisuColors.cream,
  /** @deprecated Use COLORS.primary */
  orange: HachisuColors.primary,
  disabled: '#2a2a2a',
  /** Onboarding progress pills — matches account type icon */
  progressActive: HachisuColors.primary,
  progressInactive: '#2a2a2a',
} as const;
