import { Stack, useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { LANDING_ROUTE, resolvePostAuthRoute } from '@/lib/auth/onboarding-routing';

/**
 * Routes a launch whose entire navigation stack is a single auth screen.
 *
 * Two paths produce that state. The landing screen resumes a signed-in user
 * with `replace`, which swaps itself for their resume point rather than pushing
 * onto it; and Expo Router builds the initial state from the launch URL, so a
 * restored URL (a development reload, a deep link) makes that route the whole
 * stack — there, the landing screen never mounts at all, so the startup routing
 * it owns never runs. Either way there is no history behind the screen, and
 * onboarding answers live in memory, so a signed-out user has nothing to
 * continue from.
 *
 * So: send a signed-out launch back to the landing screen, and hold a signed-in
 * one at the resume point their profile actually names. Reaching a screen
 * normally always leaves history behind it (the flow is pushed from the landing
 * screen), so this only fires on such a launch, and only once.
 */
function useAuthEntryRecovery() {
  const router = useRouter();
  const rootState = useRootNavigationState();
  const { isAuthenticated, isLoading, profile } = useAuth();
  const hasRecovered = useRef(false);
  const isNavigationReady = rootState?.key != null;

  useEffect(() => {
    // Wait for the navigator to mount and the session to be restored: routing a
    // signed-in user needs their profile.
    if (hasRecovered.current || !isNavigationReady || isLoading) return;

    hasRecovered.current = true;

    if (router.canGoBack()) return;

    router.replace(isAuthenticated ? resolvePostAuthRoute(profile) : LANDING_ROUTE);
  }, [isAuthenticated, isLoading, isNavigationReady, profile, router]);
}

export default function AuthLayout() {
  useAuthEntryRecovery();

  return <Stack screenOptions={{ headerShown: false }} />;
}
