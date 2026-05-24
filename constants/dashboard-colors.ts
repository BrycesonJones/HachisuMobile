import { COLORS } from '@/constants/colors';
import { HachisuColors } from '@/constants/hachisu-colors';

export const DASHBOARD_COLORS = {
  background: COLORS.background,
  primaryText: COLORS.primaryText,
  secondaryText: COLORS.secondaryText,
  mutedText: COLORS.mutedText,
  divider: COLORS.cardBorder,
  avatarBackground: '#14b8a6',
  bitcoinGreen: '#22c55e',
  bitcoinOrange: HachisuColors.primary,
  failedText: '#71717a',
  statusComplete: COLORS.primaryText,
  iconBackground: COLORS.card,
  profileBlue: '#3b82f6',
} as const;
