import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { fetchUserProfile, signOut as authSignOut } from '@/lib/auth/auth-service';
import { supabase } from '@/lib/supabase';
import type { UserProfile } from '@/types/user-profile';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession();

      if (!isMounted) return;

      setSession(initialSession);

      if (initialSession?.user.id) {
        await loadProfile(initialSession.user.id);
      }

      setIsLoading(false);
    }

    initSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);

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
    await authSignOut();
    setProfile(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      isLoading,
      signOut,
      refreshProfile,
    }),
    [session, profile, isLoading, signOut, refreshProfile],
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
