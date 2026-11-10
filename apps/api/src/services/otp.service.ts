import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { OtpPurpose } from '@tsh/shared';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { escapeHtml, mailTransport, sendCustomerEmail } from './mail.service.js';

/**
 * Email OTP — the registration gate.
 *
 * Codes are never stored in plaintext (sha256 of `code:email`), and a
 * successful verify mints a single-use opaque grant token — stored hashed with
 * its own expiry — that POST /auth/sync consumes to prove the address. So an
 * account cannot exist before its email was demonstrated deliverable, and
 * legacy unverified accounts remediate through the same grant (purpose VERIFY).
 */

const CODE_TTL_MS = 10 * 60 * 1000;
const GRANT_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
/** Max simultaneously live (unconsumed, unexpired) challenges per email+purpose. */
const MAX_ACTIVE_CHALLENGES = 3;
/** Challenges older than this are garbage-collected on the next request. */
const PRUNE_OLDER_THAN_MS = 24 * 60 * 60 * 1000;

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const hashCode = (code: string, email: string): string => sha256(`${code}:${email.toLowerCase().trim()}`);

/** Verification email — same shell styling as emailShell, big centered code. */
function otpEmailHtml(code: string, purpose: OtpPurpose, email: string, fullName?: string): string {
  const name = escapeHtml(fullName?.trim() || 'there');
  const goal =
    purpose === 'REGISTER'
      ? 'finish creating your TechService Hub account'
      : 'verify your email address';
  const address = escapeHtml(email);
  return (
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto">` +
    `<div style="background:#0f2b5b;color:#ffffff;padding:16px 20px;border-radius:10px 10px 0 0">` +
    `<span style="font-size:15px;font-weight:700;letter-spacing:2px">TECHSERVICE HUB</span></div>` +
    `<div style="border:1px solid #e2e8f0;border-top:0;padding:24px;border-radius:0 0 10px 10px">` +
    `<h2 style="margin:0 0 10px;font-size:17px;color:#0f2b5b">Your verification code</h2>` +
    `<p style="margin:0 0 16px;color:#334155;font-size:14px">Hi ${name}, use this code to ${goal}:</p>` +
    `<div style="margin:0 0 18px;padding:18px 16px;background:#f1f5f9;border-radius:8px;text-align:center">` +
    `<span style="font-size:32px;font-weight:700;letter-spacing:10px;color:#0f2b5b">${escapeHtml(code)}</span></div>` +
    `<table style="width:100%;border-collapse:collapse">` +
    `<tr><td style="padding:6px 12px;color:#64748b;font-size:13px;white-space:nowrap">Email</td>` +
    `<td style="padding:6px 12px;color:#0f172a;font-size:14px;font-weight:600">${address}</td></tr>` +
    `<tr><td style="padding:6px 12px;color:#64748b;font-size:13px;white-space:nowrap">Expires in</td>` +
    `<td style="padding:6px 12px;color:#0f172a;font-size:14px;font-weight:600">10 minutes</td></tr>` +
    `</table>` +
    `<p style="margin:16px 0 0;color:#334155;font-size:13px">Never share this code — anyone who has it can use your email on TechService Hub.</p>` +
    `<p style="margin:10px 0 0;color:#94a3b8;font-size:12px">If you didn't request this code, you can safely ignore this email — no account will be created.</p>` +
    `</div></div>`
  );
}

/**
 * Email a fresh 6-digit code to `email`. Fails loudly (503) when no mail
 * transport is configured or the provider rejects the send — unlike founder
 * notifications, the code MUST arrive or registration is impossible.
 */
export async function requestOtp(
  email: string,
  purpose: OtpPurpose,
  fullName?: string,
): Promise<{ sent: true; transport: typeof mailTransport }> {
  if (mailTransport === 'none') {
    throw ApiError.unavailable(
      'Email delivery is not configured — set RESEND_API_KEY or SMTP credentials',
      'EMAIL_NOT_CONFIGURED',
    );
  }

  const now = Date.now();
  await prisma.otpChallenge.deleteMany({
    where: { email, createdAt: { lt: new Date(now - PRUNE_OLDER_THAN_MS) } },
  });
  const liveCount = await prisma.otpChallenge.count({
    where: { email, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
  });
  if (liveCount >= MAX_ACTIVE_CHALLENGES) {
    throw new ApiError(
      429,
      'OTP_TOO_MANY_REQUESTS',
      'Too many codes requested — try again later or use the most recent email',
    );
  }

  const code = String(randomInt(100000, 1000000));
  const challenge = await prisma.otpChallenge.create({
    data: {
      email,
      purpose,
      codeHash: hashCode(code, email),
      expiresAt: new Date(now + CODE_TTL_MS),
    },
  });

  const delivered = await sendCustomerEmail(
    email,
    'Your TechService Hub verification code',
    otpEmailHtml(code, purpose, email, fullName),
  );
  if (!delivered) {
    // Dead code — drop it so the live-cap slot isn't stuck until expiry.
    await prisma.otpChallenge.delete({ where: { id: challenge.id } }).catch(() => undefined);
    throw ApiError.unavailable('Could not send the verification email — try again shortly', 'OTP_SEND_FAILED');
  }

  logger.info({ email, purpose }, 'OTP code emailed');
  return { sent: true, transport: mailTransport };
}

/** Check a 6-digit code; on success consume the challenge and mint a grant token. */
export async function verifyOtp(email: string, purpose: OtpPurpose, code: string): Promise<string> {
  const now = new Date();
  const challenge = await prisma.otpChallenge.findFirst({
    where: { email, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!challenge) {
    throw new ApiError(400, 'OTP_NOT_FOUND', 'No active code for this email — request a new one');
  }
  if (challenge.expiresAt.getTime() <= now.getTime()) {
    throw new ApiError(400, 'OTP_EXPIRED', 'This code has expired — request a new one');
  }

  const stored = Buffer.from(challenge.codeHash, 'hex');
  const given = Buffer.from(hashCode(code, email), 'hex');
  const matches = stored.length === given.length && timingSafeEqual(stored, given);
  if (!matches) {
    const attempts = challenge.attempts + 1;
    const locked = attempts >= MAX_ATTEMPTS;
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts, ...(locked ? { consumedAt: now } : {}) },
    });
    if (locked) {
      throw new ApiError(400, 'OTP_LOCKED', 'Too many wrong attempts — request a new code');
    }
    throw new ApiError(400, 'OTP_INVALID', `Wrong code — ${MAX_ATTEMPTS - attempts} attempt${MAX_ATTEMPTS - attempts === 1 ? '' : 's'} left`, {
      attemptsLeft: MAX_ATTEMPTS - attempts,
    });
  }

  const grantToken = randomBytes(32).toString('hex');
  await prisma.otpChallenge.update({
    where: { id: challenge.id },
    data: {
      consumedAt: now,
      grantHash: sha256(grantToken),
      grantExpiresAt: new Date(now.getTime() + GRANT_TTL_MS),
    },
  });
  logger.info({ email, purpose }, 'OTP verified — grant issued');
  return grantToken;
}

/**
 * Atomically consume a grant token. `updateMany` matching on the hash makes
 * the grant strictly single-use: a second consume finds `grantHash` already
 * cleared and returns false. Used by /auth/sync to prove the address.
 */
export async function consumeGrant(
  email: string,
  purpose: OtpPurpose,
  grantToken?: string,
): Promise<boolean> {
  if (!grantToken) return false;
  const result = await prisma.otpChallenge.updateMany({
    where: {
      email,
      purpose,
      grantHash: sha256(grantToken),
      grantExpiresAt: { gt: new Date() },
    },
    data: { grantHash: null, grantExpiresAt: null },
  });
  return result.count > 0;
}
