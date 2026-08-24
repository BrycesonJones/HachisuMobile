import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * The top safe-area inset, corrected for iOS modal presentations.
 *
 * Why this exists: on iOS, a screen presented with `presentation: 'fullScreenModal'`
 * reports a top inset of **0** from `useSafeAreaInsets()`. A header that trusts
 * that value is drawn under the status bar / Dynamic Island, where its controls
 * are partly or entirely untappable — which can strand the user on the screen.
 * (The same failure is why the `account` and `payments` stacks in app/_layout.tsx
 * are plain pushes rather than modals.)
 *
 * `initialWindowMetrics` is captured natively from the ROOT WINDOW at startup, so
 * it is unaffected by how a screen is presented. Taking the larger of the two
 * keeps the live value wherever it is trustworthy (Android, pushed screens, and
 * any future inset change) while restoring a real, measured inset inside a modal.
 * Nothing here is a hardcoded pixel guess — both operands are device-reported.
 *
 * Returns 0 only when the platform genuinely reports no top inset (e.g. an older
 * iPhone with no notch, or an Android device without a status-bar inset), which
 * is the correct value for those devices.
 */
export function useSafeTopInset(): number {
  const insets = useSafeAreaInsets();
  const windowTop = initialWindowMetrics?.insets.top ?? 0;
  return Math.max(insets.top, windowTop);
}
