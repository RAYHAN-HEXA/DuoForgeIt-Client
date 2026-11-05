'use client';


import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
  verifyPasswordResetCode,
  confirmPasswordReset,
  sendEmailVerification,
  type User as FirebaseUser,
} from 'firebase/auth';
import type { PublicUser } from '@tsh/shared';
import { auth, googleProvider } from '@/lib/firebase';
import { api, setTokenProvider } from '@/lib/api';

/**
 * Firebase owns credentials; the Express API owns the profile (role, status).
 * Flow: firebase session → ID token → POST /auth/sync → Neon profile in state.
 * The token provider is registered so the API client can attach fresh tokens.
 */

export type AuthContextValue = {
  /** undefined = still resolving the initial session; null = signed out. */
  user: PublicUser | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  register: (fullName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  confirmPasswordReset: (code: string, newPassword: string) => Promise<void>;
  verifyResetCode: (code: string) => Promise<string>;
  changePassword: (newPassword: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  /** Tracks whether /auth/sync already ran for the current uid (avoid repeat syncs). */
  const syncedUid = useRef<string | null>(null);

  const syncProfile = useCallback(async (fb: FirebaseUser): Promise<PublicUser | null> => {
    try {
      const { user: profile } = await api.post<{ user: PublicUser; isNew: boolean }>('/auth/sync', {});
      syncedUid.current = fb.uid;
      setUser(profile);
      return profile;
    } catch (err) {
      // 503 = API is up but Firebase Admin isn't configured (dev) — surface via message toast at call sites
      console.warn('[auth] profile sync failed:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    setTokenProvider(() =>
      auth.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(null),
    );
    const unsub = onAuthStateChanged(auth, async (fb) => {
      setFirebaseUser(fb);
      if (!fb) {
        syncedUid.current = null;
        setUser(null);
        setLoading(false);
        return;
      }
      if (syncedUid.current !== fb.uid) await syncProfile(fb);
      setLoading(false);
    });
    return unsub;
  }, [syncProfile]);

  /** After registration Firebase doesn't auto-set displayName in the token — patch it. */
  const register = useCallback(
    async (fullName: string, email: string, password: string) => {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: fullName });
      if (!cred.user.emailVerified) {
        await sendEmailVerification(cred.user).catch(() => undefined);
      }
      await syncProfile(cred.user);
    },
    [syncProfile],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await syncProfile(cred.user);
    },
    [syncProfile],
  );

  const loginWithGoogle = useCallback(async () => {
    const cred = await signInWithPopup(auth, googleProvider);
    await syncProfile(cred.user);
  }, [syncProfile]);

  const logout = useCallback(async () => {
    await signOut(auth);
    syncedUid.current = null;
    setUser(null);
  }, []);

  const resetPassword = useCallback((email: string) => sendPasswordResetEmail(auth, email), []);

  const verifyResetCode = useCallback(
    async (code: string) => {
      const email = await verifyPasswordResetCode(auth, code);
      return email;
    },
    [],
  );

  const confirmPasswordResetWith = useCallback(
    async (code: string, newPassword: string) => {
      await confirmPasswordReset(auth, code, newPassword);
    },
    [],
  );

  const changePassword = useCallback(async (newPassword: string) => {
    if (!auth.currentUser) throw new Error('Not signed in');
    await updatePassword(auth.currentUser, newPassword);
  }, []);

  const resendVerification = useCallback(async () => {
    if (!auth.currentUser) throw new Error('Not signed in');
    await sendEmailVerification(auth.currentUser);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      const profile = await api.get<{ user: PublicUser }>('/auth/me');
      setUser(profile.user);
    } catch {
      // keep stale profile
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      firebaseUser,
      loading,
      isAdmin: user?.role === 'ADMIN',
      login,
      loginWithGoogle,
      register,
      logout,
      resetPassword,
      confirmPasswordReset: confirmPasswordResetWith,
      verifyResetCode,
      changePassword,
      resendVerification,
      refreshProfile,
    }),
    [
      user,
      firebaseUser,
      loading,
      login,
      loginWithGoogle,
      register,
      logout,
      resetPassword,
      confirmPasswordResetWith,
      verifyResetCode,
      changePassword,
      resendVerification,
      refreshProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}


