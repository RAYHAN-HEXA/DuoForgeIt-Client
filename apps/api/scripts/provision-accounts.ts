/**
 * Provision login accounts end-to-end: creates the Firebase Authentication
 * user (email + password, verified) and links it to the matching Neon row so
 * the first sign-in lands in the app immediately — no email verification
 * round-trip needed.
 *
 * Dev/test bootstrapping only. Change these passwords before production
 * (Firebase Console → Authentication → Users → reset password, or reuse this
 * script — it overwrites the password on existing accounts).
 *
 * Usage: npm run provision:accounts -w @tsh/api
 */
import 'dotenv/config';
import { getFirebaseAuth } from '../src/config/firebase.js';
import { prisma } from '../src/config/prisma.js';

const ACCOUNTS = [
  {
    email: process.env.SEED_FOUNDER_A_EMAIL ?? 'founder.a@techservicehub.test',
    password: 'FounderA!2026',
    displayName: 'Founder A',
    role: 'ADMIN' as const,
  },
  {
    email: process.env.SEED_FOUNDER_B_EMAIL ?? 'founder.b@techservicehub.test',
    password: 'FounderB!2026',
    displayName: 'Founder B',
    role: 'ADMIN' as const,
  },
  {
    email: 'customer@techservicehub.test',
    password: 'Customer!2026',
    displayName: 'Demo Customer',
    role: 'CUSTOMER' as const,
  },
];

const EMAIL_ALREADY_EXISTS = 'auth/email-already-exists';

async function main() {
  const auth = getFirebaseAuth();
  if (!auth) {
    console.error('Firebase Admin not configured — set FIREBASE_SERVICE_ACCOUNT_BASE64 first.');
    process.exit(1);
  }

  for (const account of ACCOUNTS) {
    let uid: string;
    let existed = false;
    try {
      const user = await auth.createUser({
        email: account.email,
        password: account.password,
        displayName: account.displayName,
        emailVerified: true,
      });
      uid = user.uid;
      console.log(`✓ Firebase user created: ${account.email}`);
    } catch (err) {
      if ((err as { code?: string }).code === EMAIL_ALREADY_EXISTS) {
        // Account already exists (previous attempt) — reset to the known
        // password so the credentials below always work.
        const existing = await auth.getUserByEmail(account.email);
        await auth.updateUser(existing.uid, {
          password: account.password,
          emailVerified: true,
          displayName: account.displayName,
        });
        uid = existing.uid;
        existed = true;
        console.log(`• Firebase user already existed — password reset: ${account.email}`);
      } else {
        throw err;
      }
    }

    // Link (or create) the Neon profile. Roles are only ever written here —
    // never from client traffic.
    const dbUser = await prisma.user.upsert({
      where: { email: account.email },
      update: { firebaseUid: uid, emailVerified: true, role: account.role },
      create: {
        firebaseUid: uid,
        email: account.email,
        fullName: account.displayName,
        emailVerified: true,
        role: account.role,
      },
      select: { id: true, email: true, role: true },
    });
    console.log(`  → Neon profile ${existed ? 'linked' : 'ready'}: ${dbUser.id} (${dbUser.role})`);
  }

  console.log('\nAll accounts provisioned — sign in at /login with the printed credentials.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
