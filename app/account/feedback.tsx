import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { COLORS } from '@/constants/colors';
import { USERJOT_PROJECT_ID } from '@/constants/userjot';
import { useAuth } from '@/contexts/auth-context';
import { resolveLeaveAction } from '@/lib/feedback/feedback-navigation';
import {
  buildUserJotFeedbackHtml,
  buildUserJotIdentity,
  isAllowedUserJotUrl,
  resolveTerminationRecovery,
  USERJOT_PAGE_BASE_URL,
} from '@/lib/feedback/userjot-page';

// Dev-environment note (investigated 2026-09-02): in Expo Go on the iOS
// simulator with the Mac hardware keyboard connected, pressing "r" RELOADS
// the whole JS app — even while typing inside this WebView, because WKWebView
// (unlike RN TextInput) does not suppress the dev-menu key command while a
// web text field is focused. That is Expo dev tooling, not a bug here; it
// cannot happen in release builds or with the on-screen keyboard. Test typing
// with I/O → Keyboard → Connect Hardware Keyboard off, or tap the soft keys.

// If UserJot hasn't reported the widget open by then, treat the load as failed.
const LOAD_TIMEOUT_MS = 20_000;

type LoadState = 'loading' | 'ready' | 'error';

export default function FeedbackScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  // Remounts the WebView on retry so it starts from a clean document.
  const [attempt, setAttempt] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Automatic reloads consumed after iOS killed the WebView content process.
  const autoRecoveriesRef = useRef(0);
  // True once a native leave (back/replace) has been dispatched. Duplicate or
  // late uj:close messages must not dispatch a second navigation action.
  const isLeavingRef = useRef(false);

  // The one place a native navigation action may be dispatched. Pops when a
  // back route exists; when this screen is the first route in the stack (cold
  // deep link, dev reload) GO_BACK would be unhandled, so replace to the
  // canonical landing route instead — it routes the signed-in user onward.
  const leaveFeedback = useCallback(() => {
    const action = resolveLeaveAction({
      canGoBack: router.canGoBack(),
      alreadyLeaving: isLeavingRef.current,
    });
    if (!action) return;
    isLeavingRef.current = true;
    if (action.type === 'back') {
      router.back();
    } else {
      router.replace(action.route);
    }
  }, [router]);

  // Only the auth user ID and email — never profile/store/payment data. The
  // WebView below runs incognito, so this identity lives only for this screen
  // instance and can never leak to a later Hachisu session's user.
  //
  // Keyed on the id/email primitives, not the user object: Supabase token
  // refreshes replace the session/user object identity, and a focused editor
  // must never lose its document because unrelated auth state churned.
  const userId = user?.id ?? null;
  const userEmail = user?.email ?? null;
  const source = useMemo(
    () => ({
      html: buildUserJotFeedbackHtml({
        projectId: USERJOT_PROJECT_ID,
        identity: buildUserJotIdentity({ id: userId, email: userEmail }),
        backgroundColor: COLORS.background,
      }),
      baseUrl: USERJOT_PAGE_BASE_URL,
    }),
    [userId, userEmail],
  );

  useEffect(() => {
    if (loadState !== 'loading') return;
    timeoutRef.current = setTimeout(() => setLoadState('error'), LOAD_TIMEOUT_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [loadState, attempt]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let type: unknown;
      let detail: unknown;
      try {
        const parsed = JSON.parse(event.nativeEvent.data) as { type?: unknown; detail?: unknown };
        type = parsed.type;
        detail = parsed.detail;
      } catch {
        return;
      }
      if (type === 'uj:identify-failed') {
        // Non-fatal: the widget continues anonymously (posting/voting still
        // work; commenting is disabled for anonymous viewers). Known cause:
        // UserJot rejects unsigned identify for privileged workspace members.
        if (__DEV__) {
          console.warn(
            `[feedback] UserJot identify failed (${typeof detail === 'string' ? detail : 'unknown'}); feedback continues anonymously`,
          );
        }
        return;
      }
      if (type === 'uj:open') {
        setLoadState('ready');
      } else if (type === 'uj:close') {
        // The widget's own X: the widget is this screen's entire content, so
        // closing it leaves the screen. Internal widget navigation (board,
        // compose, back arrows) never posts uj:close and never reaches here.
        leaveFeedback();
      } else if (type === 'uj:error') {
        // Fatal only while loading; once the widget is open, don't tear the
        // screen down over a transient SDK error.
        setLoadState((current) => (current === 'ready' ? current : 'error'));
      }
    },
    [leaveFeedback],
  );

  const handleLoadFailure = useCallback(() => setLoadState('error'), []);

  // iOS killed the WebView's content process (memory pressure or a WebKit
  // fault). Reload once with a fresh document + identity; if it dies again
  // this visit, fail visibly instead of reload-looping.
  const handleContentProcessTerminated = useCallback(() => {
    if (resolveTerminationRecovery(autoRecoveriesRef.current) === 'reload') {
      autoRecoveriesRef.current += 1;
      if (__DEV__) {
        console.warn('[feedback] UserJot WebView content process terminated; reloading once');
      }
      setLoadState('loading');
      setAttempt((n) => n + 1);
    } else {
      if (__DEV__) {
        console.warn('[feedback] UserJot WebView content process terminated repeatedly');
      }
      setLoadState('error');
    }
  }, []);

  const handleRetry = useCallback(() => {
    autoRecoveriesRef.current = 0;
    setLoadState('loading');
    setAttempt((n) => n + 1);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.headerRow}>
        <Pressable
          onPress={leaveFeedback}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <MaterialIcons name="chevron-left" size={24} color={COLORS.primaryText} />
        </Pressable>
        <Text style={styles.title}>Feedback</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loadState === 'error' ? (
        <View style={styles.stateContainer}>
          <MaterialIcons name="chat-bubble-outline" size={32} color={COLORS.secondaryText} />
          <Text style={styles.stateTitle}>Feedback is unavailable</Text>
          <Text style={styles.stateText}>
            We couldn&apos;t load the feedback board. Check your connection and try again.
          </Text>
          <Pressable
            onPress={handleRetry}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Retry loading feedback">
            <Text style={styles.retryLabel}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.webviewWrap}>
          <WebView
            key={attempt}
            source={source}
            style={styles.webview}
            // Ephemeral storage: nothing UserJot persists (identity, cookies,
            // localStorage) survives this screen, so a later signed-in user
            // cannot inherit the previous user's UserJot identity.
            incognito
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={(request) => isAllowedUserJotUrl(request.url)}
            onMessage={handleMessage}
            onError={handleLoadFailure}
            onHttpError={handleLoadFailure}
            onContentProcessDidTerminate={handleContentProcessTerminated}
          />
          {loadState === 'loading' ? (
            <View style={styles.loadingOverlay} pointerEvents="none">
              <ActivityIndicator color={COLORS.secondaryText} />
            </View>
          ) : null}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  webviewWrap: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  stateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  stateText: {
    fontSize: 14,
    color: COLORS.secondaryText,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: COLORS.card,
  },
  retryLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  pressed: {
    opacity: 0.7,
  },
});
