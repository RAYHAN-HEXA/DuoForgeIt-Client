import { z } from 'zod';
/**
 * Strict email validation for account sign-up.
 *
 * Three layers, cheapest first:
 *   1. Syntax regex — rejects `a@b`, `x@y..com`, `a@-x.com`, `.dot@x.com`, …
 *   2. Disposable-domain blocklist — known throwaway providers (Mailinator,
 *      YOPmail, 10minutemail, GuerrillaMail, …), matched on the domain and
 *      any parent suffix so `foo.mailinator.com` is caught too.
 *   3. (Server-side, elsewhere) an emailed OTP code — the real gate: a fake
 *      address can never receive the code, so it can never create an account.
 *
 * The blocklist is a hand-curated set of widely-documented providers. It can
 * never be exhaustive (rotating generator domains exist), which is exactly why
 * layer 3 exists — keep entries here conservative to avoid false positives.
 */
/**
 * Pragmatic strict pattern: alphanumeric local part where `._%+-` may only
 * appear *between* alphanumeric runs (no leading/trailing/doubled dots),
 * domain labels may contain inner hyphens only, and a 2–63 letter TLD is
 * mandatory. Unicode/IDN addresses are deliberately rejected.
 */
export const EMAIL_SYNTAX_REGEX = /^[A-Za-z0-9]+(?:[._%+-][A-Za-z0-9]+)*@[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*(?:\.[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)*\.[A-Za-z]{2,63}$/;
export const DISPOSABLE_EMAIL_DOMAINS = new Set([
    // Mailinator + its public alias domains
    'mailinator.com', 'mailinator.net', 'mailinator.org', 'mailinator2.com',
    'binkmail.com', 'bobmail.info', 'champagnevida.com', 'letthemeatspam.com',
    'mailin8r.com', 'mailinater.com', 'notmailinator.com', 'reallymymail.com',
    'sogetthis.com', 'spamherelots.com', 'suremail.info', 'thisisnotmyrealemail.com',
    'tradermail.info', 'veryrealemail.com', 'zippymail.info', 'mailtothis.com',
    // GuerrillaMail + aliases
    'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamail.biz',
    'guerrillamail.de', 'guerrillamail.info', 'guerrillamailblock.com', 'grr.la',
    'sharklasers.com', 'spam4.me', 'pokemail.net',
    // 10MinuteMail family
    '10minutemail.com', '10minutemail.net', '10minutemail.co.uk', '10minutemail.pro',
    '20minutemail.com', 'tempinbox.com', 'dontreg.com',
    // Temp-Mail family
    'temp-mail.org', 'temp-mail.io', 'temp-mail.net', 'tempmailo.com', 'tempmail.plus',
    'tempmailaddress.com', 'tempr.email', 'mail.tm', 'mail.gw',
    // 1SecMail (API domains)
    '1secmail.com', '1secmail.net', '1secmail.org', 'esiix.com', 'wwjmp.com',
    'xojxe.com', 'yoggm.com',
    // YOPmail + aliases
    'yopmail.com', 'yopmail.net', 'yopmail.fr', 'cool.fr.nf', 'jetable.fr.nf',
    'nospam.ze.tc', 'nomail.xl.cx',
    // TrashMail + aliases
    'trashmail.com', 'trashmail.de', 'trashmail.net', 'trashmail.me',
    'trash-mail.com', 'trash-mail.de', 'wegwerfmail.de',
    // Other well-documented throwaway providers
    'getnada.com', 'nada.email', 'dispostable.com', 'maildrop.cc', 'mailnesia.com',
    'mohmal.com', 'emailondeck.com', 'fakeinbox.com', 'mailcatch.com', 'spambog.com',
    'mytemp.email', 'anonbox.net', 'discard.email', 'discard.cf', 'throwawaymail.com',
    'mintemail.com', 'mailnull.com', 'moakt.com', 'disbox.net', 'tmails.net',
    'mvrht.net', 'mytrashmail.com', 'no-spam.ws', 'spamavert.com', 'spamgourmet.com',
    'spamhole.com', 'temporaryinbox.com', 'thankyou2010.com', 'mailsac.com',
    'inboxkitten.com', 'linshiyouxiang.net', 'fake-mail.net', 'burnermail.io',
    '33mail.com', 'email-fake.com', 'tempemail.net', 'tmpmail.org',
]);
/** True when `domain` is (or is a subdomain of) a known disposable provider. */
export function isDisposableEmailDomain(domain) {
    const d = domain.toLowerCase().trim();
    if (DISPOSABLE_EMAIL_DOMAINS.has(d))
        return true;
    // Any parent suffix — e.g. `foo.mailinator.com` must match `mailinator.com`.
    const labels = d.split('.');
    for (let i = 1; i < labels.length - 1; i++) {
        if (DISPOSABLE_EMAIL_DOMAINS.has(labels.slice(i).join('.')))
            return true;
    }
    return false;
}
/** True when the email's domain part is a known disposable provider. */
export function isDisposableEmail(email) {
    const at = email.lastIndexOf('@');
    if (at === -1)
        return false;
    return isDisposableEmailDomain(email.slice(at + 1));
}
/**
 * Sign-up email field: strict syntax + disposable-domain rejection with
 * distinct messages so the form can explain *why* an address was rejected.
 * Trimmed and lowercased (matching the server-side sync normalization).
 */
export const emailFieldSchema = z
    .string()
    .trim()
    .toLowerCase()
    .max(254, 'Email address is too long')
    .regex(EMAIL_SYNTAX_REGEX, 'Enter a valid email address — e.g. you@example.com')
    .refine((value) => !isDisposableEmail(value), {
    message: 'This email provider isn’t accepted — please use a permanent email address',
});
