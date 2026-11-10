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
export declare const EMAIL_SYNTAX_REGEX: RegExp;
export declare const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string>;
/** True when `domain` is (or is a subdomain of) a known disposable provider. */
export declare function isDisposableEmailDomain(domain: string): boolean;
/** True when the email's domain part is a known disposable provider. */
export declare function isDisposableEmail(email: string): boolean;
/**
 * Sign-up email field: strict syntax + disposable-domain rejection with
 * distinct messages so the form can explain *why* an address was rejected.
 * Trimmed and lowercased (matching the server-side sync normalization).
 */
export declare const emailFieldSchema: z.ZodString;
