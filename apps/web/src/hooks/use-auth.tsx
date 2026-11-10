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
  type User as FirebaseUser,
} from 'firebase/auth';
import type { PublicUser } from '@tsh/shared';
import { auth, googleProvider } from '@/lib/firebase';
import { api, setTokenProvider, ApiClientError } from '@/lib/api';

export class AuthSyncError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AuthSyncError';
  }
}

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
  /** registrationGrant = single-use token from POST /auth/otp/verify. */
  register: (fullName: string, email: string, password: string, registrationGrant: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  confirmPasswordReset: (code: string, newPassword: string) => Promise<void>;
  verifyResetCode: (code: string) => Promise<string>;
  changePassword: (newPassword: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  /** Tracks whether /auth/sync already ran for the current uid (avoid repeat syncs). */
  const syncedUid = useRef<string | null>(null);

  const syncProfile = useCallback(
    async (fb: FirebaseUser, throwOnError = false, registrationGrant?: string): Promise<PublicUser | null> => {
      try {
        const { user: profile } = await api.post<{ user: PublicUser; isNew: boolean }>(
          '/auth/sync',
          registrationGrant ? { registrationGrant } : {},
        );
        syncedUid.current = fb.uid;
        setUser(profile);
        return profile;
      } catch (err) {
        console.warn('[auth] profile sync failed:', err);
        if (throwOnError) {
          if (err instanceof ApiClientError) {
            throw new AuthSyncError(err.status, err.code, err.message);
          }
          throw new AuthSyncError(
            0,
            'SYNC_FAILED',
            err instanceof Error ? err.message : 'Could not synchronize user profile',
          );
        }
        return null;
      }
    },
    [],
  );

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

  /**
   * Create the Firebase account only AFTER the emailed OTP was verified (the
   * registrationGrant is the proof) — a fake email can never produce an
   * account. Firebase's sendEmailVerification is superseded by the OTP flow.
   */
  const register = useCallback(
    async (fullName: string, email: string, password: string, registrationGrant: string) => {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: fullName });
      // Claim the uid before our grant-carrying sync so onAuthStateChanged
      // doesn't fire a duplicate no-grant sync mid-registration.
      syncedUid.current = cred.user.uid;
      try {
        await syncProfile(cred.user, true, registrationGrant);
      } catch (err) {
        await signOut(auth).catch(() => undefined);
        syncedUid.current = null;
        setUser(null);
        setFirebaseUser(null);
        throw err;
      }
    },
    [syncProfile],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      try {
        await syncProfile(cred.user, true);
      } catch (err) {
        await signOut(auth).catch(() => undefined);
        syncedUid.current = null;
        setUser(null);
        setFirebaseUser(null);
        throw err;
      }
    },
    [syncProfile],
  );

  const loginWithGoogle = useCallback(async () => {
    const cred = await signInWithPopup(auth, googleProvider);
    try {
      await syncProfile(cred.user, true);
    } catch (err) {
      await signOut(auth).catch(() => undefined);
      syncedUid.current = null;
      setUser(null);
      setFirebaseUser(null);
      throw err;
    }
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


