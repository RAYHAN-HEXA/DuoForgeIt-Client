import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('config/env', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('applies defaults for optional values', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATABASE_URL', 'postgresql://placeholder');
    const { env } = await import('../config/env.js');
    expect(env.PORT).toBe(5000);
    expect(env.CORS_ORIGINS).toBe('http://localhost:3000');
  });

  it('rejects an invalid PORT', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATABASE_URL', 'postgresql://placeholder');
    vi.stubEnv('PORT', 'not-a-port');
    await expect(import('../config/env.js')).rejects.toThrow(/Invalid environment/);
  });

  it('derives the firebase credential source correctly', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATABASE_URL', 'postgresql://placeholder');
    vi.stubEnv('FIREBASE_PROJECT_ID', 'demo');
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT_BASE64', 'eyJhIjoxfQ==');
    const { firebaseCredentialSource } = await import('../config/env.js');
    expect(firebaseCredentialSource).toBe('base64');
  });
});
