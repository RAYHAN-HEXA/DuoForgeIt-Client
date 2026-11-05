/**
 * One-off purge: removes all service catalog data plus the carts and
 * (test) orders that reference it. FK-safe order inside a transaction:
 *   cartItemOption → cartItem → orderItemOptionSnapshot → orderItem →
 *   order (cascades attachments/payments/deliverables/revisions/history/reviews)
 *   → serviceOption → service → serviceCategory (PortfolioProject FK is SetNull)
 *
 * Run: npx tsx scripts/purge-service-data.ts
 */
import { PrismaClient } from '../src/generated/prisma/client.js';

// Interactive transactions break on Neon's PgBouncer pooler (P2028);
// the direct endpoint keeps the session stable for $transaction.
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  const before = {
    categories: await prisma.serviceCategory.count(),
    services: await prisma.service.count(),
    options: await prisma.serviceOption.count(),
    cartItems: await prisma.cartItem.count(),
    orders: await prisma.order.count(),
  };
  console.log('Before:', before);

  const result = await prisma.$transaction(
    async (tx) => {
    const cartItemOptions = await tx.cartItemOption.deleteMany({});
    const cartItems = await tx.cartItem.deleteMany({});
    const snapshots = await tx.orderItemOptionSnapshot.deleteMany({});
    const orderItems = await tx.orderItem.deleteMany({});
    const orders = await tx.order.deleteMany({});
    const options = await tx.serviceOption.deleteMany({});
    const services = await tx.service.deleteMany({});
    const categories = await tx.serviceCategory.deleteMany({});
      return { cartItemOptions, cartItems, snapshots, orderItems, orders, options, services, categories };
    },
    // Neon direct endpoint latency (us-east-2) makes 8 sequential deletes
    // exceed the 5s default interactive-transaction timeout.
    { timeout: 30_000, maxWait: 10_000 },
  );

  console.log('Deleted:', Object.fromEntries(
    Object.entries(result).map(([k, v]) => [k, v.count]),
  ));

  const after = {
    categories: await prisma.serviceCategory.count(),
    services: await prisma.service.count(),
    options: await prisma.serviceOption.count(),
    cartItems: await prisma.cartItem.count(),
    orders: await prisma.order.count(),
    portfolioProjects: await prisma.portfolioProject.count(),
  };
  console.log('After:', after);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
