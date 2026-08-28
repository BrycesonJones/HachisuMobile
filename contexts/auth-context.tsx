import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { clearLocalAccountData } from '@/lib/auth/account-cleanup';
import {
  deleteAccount as authDeleteAccount,
  fetchUserProfile,
  signOut as authSignOut,
} from '@/lib/auth/auth-service';
import { isProfileDebugEnabled } from '@/lib/auth/config';
import {
  activateDevAuth,
  clearDevAuth,
  getDevSession,
} from '@/lib/auth/dev-session';
import { clearDevStores } from '@/lib/btcpay/dev-stores';
import { supabase } from '@/lib/supabase';
import type { AccountType, OnboardingStatus, UserProfile } from '@/types/user-profile';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isDevSession: boolean;
  signOut: () => Promise<void>;
  /**
   * Permanently deletes the account server-side, then clears every piece of
   * local session/user state. On error the session is left fully intact so the
   * user can retry; local state is only discarded after the server confirms
   * the deletion.
   */
  closeAccount: () => Promise<{ error: string | null }>;
  devSignIn: (
    email: string,
    accountType: AccountType,
    onboardingStatus?: OnboardingStatus,
  ) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supabaseSession, setSupabaseSession] = useState<Session | null>(null);
  const [devSession, setDevSession] = useState<Session | null>(() => getDevSession());
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const session = devSession ?? supabaseSession;
  const isDevSession = devSession != null;
  const isAuthenticated = session != null;

  const loadProfile = useCallback(async (userId: string) => {
    try {
      const nextProfile = await fetchUserProfile(userId);
      setProfile(nextProfile);
    } catch {
      setProfile(null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const userId = session?.user.id;

    if (!userId) {
      setProfile(null);
      return;
    }

    await loadProfile(userId);
  }, [loadProfile, session?.user.id]);

  const devSignIn = useCallback(
    async (
      email: string,
      accountType: AccountType,
      onboardingStatus: OnboardingStatus = 'email_verified',
    ) => {
      const { session: nextSession, profile: nextProfile } = activateDevAuth(
        email,
        accountType,
        onboardingStatus,
      );
      setDevSession(nextSession);
      setProfile(nextProfile);
    },
    [],
  );

  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      const existingDevSession = getDevSession();

      if (existingDevSession) {
        if (!isMounted) return;

        setDevSession(existingDevSession);

        if (existingDevSession.user.id) {
          await loadProfile(existingDevSession.user.id);
        }

        setIsLoading(false);
        return;
      }

      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession();

      if (isProfileDebugEnabled) {
        console.log('[auth-session-check]', {
          hasSession: initialSession != null,
          userId: initialSession?.user?.id,
          email: initialSession?.user?.email,
        });
      }

      if (!isMounted) return;

      setSupabaseSession(initialSession);

      if (initialSession?.user.id) {
        await loadProfile(initialSession.user.id);
      }

      setIsLoading(false);
    }

    initSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (getDevSession()) {
        return;
      }

      setSupabaseSession(nextSession);

      if (nextSession?.user.id) {
        await loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
      }

      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    if (isDevSession) {
      clearDevAuth();
      setDevSession(null);
      setProfile(null);
      return;
    }

    await authSignOut();
    setProfile(null);
  }, [isDevSession]);

  const closeAccount = useCallback(async (): Promise<{ error: string | null }> => {
    if (isDevSession) {
      // Dev bypass has no real Supabase account: simulate by tearing down the
      // in-memory dev session, dev stores, and any persisted local data.
      clearDevAuth();
      clearDevStores();
      await clearLocalAccountData();
      setDevSession(null);
      setProfile(null);
      return { error: null };
    }

    const { error } = await authDeleteAccount();
    if (error) {
      // The account was NOT deleted — keep the session and all local state.
      return { error: error.message };
    }

    // The server confirmed the account is gone. Drop the (now dead) session
    // locally; the sign-out endpoint may reject the deleted user's token, which
    // is fine — the storage purge below removes any session it left behind.
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Ignored: cleanup below is the guarantee.
    }
    await clearLocalAccountData();
    setSupabaseSession(null);
    setProfile(null);
    return { error: null };
  }, [isDevSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      isLoading,
      isAuthenticated,
      isDevSession,
      signOut,
      closeAccount,
      devSignIn,
      refreshProfile,
    }),
    [
      session,
      profile,
      isLoading,
      isAuthenticated,
      isDevSession,
      signOut,
      closeAccount,
      devSignIn,
      refreshProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
