import { describe, expect, it } from 'vitest';
import { emailShell, escapeHtml } from '../services/mail.service.js';

describe('email shell', () => {
  it('escapes untrusted values before rendering', () => {
    const html = emailShell(
      '<b>Hi</b>',
      [
        ['Name', '<script>alert(1)</script>'],
        ['Message', 'line one\nline two'],
      ],
      'Open "inbox"',
      'https://example.com/?a=1&b=2',
    );

    expect(html).toContain('&lt;b&gt;Hi&lt;/b&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('line one<br/>line two');
    expect(html).toContain('href="https://example.com/?a=1&amp;b=2"');
    expect(html).toContain('Open &quot;inbox&quot;');
  });

  it('escapes ampersands exactly once', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });
});
