/**
 * Server-side role management — the ONLY way roles change.
 * Customers can never elevate themselves; Firebase tokens carry no role claims.
 *
 * Usage: npm run promote:admin -- <email> <CUSTOMER|ADMIN>
 */
import 'dotenv/config';
import { prisma } from '../src/config/prisma.js';

async function main() {
  const [email, role] = process.argv.slice(2);
  if (!email || !role || !['CUSTOMER', 'ADMIN'].includes(role)) {
    console.error('Usage: npm run promote:admin -- <email> <CUSTOMER|ADMIN>');
    process.exit(1);
  }
  const user = await prisma.user.update({
    where: { email: email.toLowerCase().trim() },
    data: { role: role as 'CUSTOMER' | 'ADMIN' },
    select: { id: true, email: true, role: true },
  });
  console.log('Updated:', user);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
