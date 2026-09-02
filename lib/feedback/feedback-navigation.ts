// Leaving the Feedback screen (app/account/feedback.tsx).
//
// The screen is normally pushed from the Account sheet, so back pops to the
// previous Hachisu screen. But it can also be the FIRST route in the stack —
// a cold deep link, or a dev reload landing directly on the route. Dispatching
// GO_BACK there is invalid ("The action 'GO_BACK' was not handled by any
// navigator"), so leaving must check for a back route and otherwise replace to
// the canonical landing route, which routes the signed-in user onward via
// resolvePostAuthRoute — the same convention as logout/close-account.

/** Where to land when the Feedback route has no native back history. */
export const FEEDBACK_FALLBACK_ROUTE = '/';

export type FeedbackLeaveAction =
  | { type: 'back' }
  | { type: 'replace'; route: typeof FEEDBACK_FALLBACK_ROUTE };

/**
 * Decide how to leave the Feedback screen. Returns null when a leave is
 * already in flight — a second uj:close from the widget, or a bridge message
 * arriving mid-unmount, must never dispatch a second navigation action.
 */
export function resolveLeaveAction(input: {
  canGoBack: boolean;
  alreadyLeaving: boolean;
}): FeedbackLeaveAction | null {
  if (input.alreadyLeaving) return null;
  if (input.canGoBack) return { type: 'back' };
  return { type: 'replace', route: FEEDBACK_FALLBACK_ROUTE };
}
