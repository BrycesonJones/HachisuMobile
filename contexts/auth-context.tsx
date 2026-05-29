import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  fetchUserProfile,
  signOut as authSignOut,
} from '@/lib/auth/auth-service';
import { isProfileDebugEnabled } from '@/lib/auth/config';
import {
  activateDevAuth,
  clearDevAuth,
  getDevSession,
} from '@/lib/auth/dev-session';
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

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      isLoading,
      isAuthenticated,
      isDevSession,
      signOut,
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
