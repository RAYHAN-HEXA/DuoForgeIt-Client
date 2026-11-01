import { getAnalytics, isSupported } from "firebase/analytics";
import { firebaseApp } from "./firebase";

/**
 * Optional analytics — browser only, lazily initialized, never required for
 * authentication. Call once from a client component effect.
 */
export async function initAnalytics(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID) return;
  try {
    if (await isSupported()) getAnalytics(firebaseApp);
  } catch {
    // Analytics must never break the app (ad blockers etc.)
  }
}
