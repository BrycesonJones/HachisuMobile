import { COLORS } from '@/constants/colors';
import { HachisuColors } from '@/constants/hachisu-colors';

export const DASHBOARD_COLORS = {
  background: COLORS.background,
  primaryText: COLORS.primaryText,
  secondaryText: COLORS.secondaryText,
  mutedText: COLORS.mutedText,
  divider: COLORS.cardBorder,
  avatarBackground: HachisuColors.cream,
  bitcoinGreen: '#22c55e',
  bitcoinOrange: HachisuColors.primary,
  failedText: '#71717a',
  statusComplete: COLORS.primaryText,
  iconBackground: COLORS.card,
  profileIcon: HachisuColors.cream,
  /** Degraded-state (partial/failed enrichment) banner — amber, non-alarming. */
  warningText: '#eab308',
  warningBackground: '#26210f',
  warningBorder: '#3d3413',
} as const;
