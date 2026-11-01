import { PrismaClient } from '../generated/prisma/client.js';
import { hasDatabase } from './env.js';

export { hasDatabase };

/**
 * Constructing the client is safe without DATABASE_URL; the first query would
 * fail. Health checks `hasDatabase` first so the API can boot pre-configuration.
 */
export const prisma = new PrismaClient();
