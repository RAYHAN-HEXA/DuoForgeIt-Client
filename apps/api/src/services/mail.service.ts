import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Founder email notifications — best-effort like notifyUser: a mail failure
 * must never fail the API request that triggered it.
 *
 * Transports (first match wins):
 *   1. Resend   — RESEND_API_KEY (+ MAIL_FROM, default onboarding@resend.dev)
 *   2. SMTP     — SMTP_HOST/PORT/USER/PASS (works with a Gmail app password)
 *   3. none     — logged and skipped, so the API runs fine before creds exist.
 *
 * Recipients: FOUNDER_NOTIFY_EMAILS (comma-separated) or the two founders.
 */

export const founderEmails: string[] = (env.FOUNDER_NOTIFY_EMAILS ?? 'md.rayhanx617@gmail.com,mdmursalinahmedzamzam2004@gmail.com')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const mailFrom = env.MAIL_FROM ?? 'TechService Hub <onboarding@resend.dev>';

export const mailTransport: 'resend' | 'smtp' | 'none' = env.RESEND_API_KEY
  ? 'resend'
  : env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS
    ? 'smtp'
    : 'none';

/** Send one email to one address. Returns true when the provider accepted it. */
async function sendOne(to: string, subject: string, html: string): Promise<boolean> {
  try {
    if (mailTransport === 'resend') {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: mailFrom, to, subject, html }),
      });
      if (!res.ok) {
        logger.error({ to, status: res.status, body: (await res.text()).slice(0, 300) }, 'Resend send failed');
        return false;
      }
      return true;
    }

    if (mailTransport === 'smtp') {
      // Dynamic import keeps nodemailer out of the cold-start path when unused.
      const nodemailer = (await import('nodemailer')).default;
      const transport = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT ?? 587,
        secure: (env.SMTP_PORT ?? 587) === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      });
      await transport.sendMail({ from: mailFrom, to, subject, html });
      return true;
    }

    return false;
  } catch (err) {
    logger.error({ err, to }, 'Email send failed');
    return false;
  }
}

/** Fan an email out to both founders. Never throws. */
export async function notifyFounders(subject: string, html: string): Promise<void> {
  if (mailTransport === 'none') {
    logger.info({ subject, recipients: founderEmails }, 'Email skipped — no mail transport configured');
    return;
  }
  const results = await Promise.all(founderEmails.map((to) => sendOne(to, subject, html)));
  logger.info({ subject, sent: results.filter(Boolean).length, of: results.length }, 'Founder notification');
}

/**
 * Send one customer email. Best-effort like notifyUser: a missing transport or
 * provider failure is logged and returns false — it must never roll back or
 * fail an already-committed payment review.
 */
export async function sendCustomerEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (mailTransport === 'none') {
    logger.info({ to, subject }, 'Customer email skipped — no mail transport configured');
    return false;
  }
  return sendOne(to, subject, html);
}

/** Escape untrusted text before interpolating it into email HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape text and keep line breaks visible in the HTML email. */
function emailText(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br/>');
}

/** Minimal inline-styled email shell — renders fine in Gmail/Outlook. */
export function emailShell(title: string, rows: Array<[string, string]>, ctaText?: string, ctaUrl?: string): string {
  const rowHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px;color:#64748b;font-size:13px;white-space:nowrap">${emailText(k)}</td>` +
        `<td style="padding:6px 12px;color:#0f172a;font-size:14px;font-weight:600">${emailText(v)}</td></tr>`,
    )
    .join('');
  const cta =
    ctaText && ctaUrl
      ? `<p style="margin:18px 0 0"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600">${escapeHtml(ctaText)}</a></p>`
      : '';
  return (
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto">` +
    `<div style="background:#0f2b5b;color:#ffffff;padding:16px 20px;border-radius:10px 10px 0 0">` +
    `<span style="font-size:15px;font-weight:700;letter-spacing:2px">TECHSERVICE HUB</span></div>` +
    `<div style="border:1px solid #e2e8f0;border-top:0;padding:20px;border-radius:0 0 10px 10px">` +
    `<h2 style="margin:0 0 12px;font-size:17px;color:#0f2b5b">${escapeHtml(title)}</h2>` +
    `<table style="width:100%;border-collapse:collapse">${rowHtml}</table>${cta}` +
    `<p style="margin:16px 0 0;color:#94a3b8;font-size:12px">Automated notification — TechService Hub admin console.</p>` +
    `</div></div>`
  );
}
