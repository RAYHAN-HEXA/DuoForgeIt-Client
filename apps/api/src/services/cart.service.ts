import type { CartDto, CartItemDto } from '@tsh/shared';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { estimateDays, lineTotal, sumMoney, unitPrice } from '../utils/money.js';

/**
 * Cart rules:
 *  - One cart per user (unique userId), created lazily on first read/add.
 *  - Add-to-cart MERGES duplicates (unique [cartId, serviceId]) instead of
 *    stacking rows — same service twice updates options/requirements and
 *    tops up quantity.
 *  - Option groups: at most one option per groupKey, EXCEPT the "extras"
 *    group which is multi-select (matches the catalog's radio/checkbox
 *    rendering contract).
 *  - Totals are ALWAYS computed server-side from the live catalog; the
 *    client never sends money values.
 */

async function getOrCreateCart(userId: string) {
  return prisma.cart.upsert({
    where: { userId },
    update: {},
    create: { userId },
    include: {
      items: {
        include: {
          service: { include: { options: { orderBy: { displayOrder: 'asc' } } } },
          optionLinks: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
}

async function serializeCart(cart: Awaited<ReturnType<typeof getOrCreateCart>>): Promise<CartDto> {
  const items: CartItemDto[] = cart.items.map((item) => {
    const selected = item.optionLinks
      .map((link) => item.service.options.find((o) => o.id === link.serviceOptionId))
      .filter((o): o is (typeof item.service.options)[number] => Boolean(o))
      .sort((a, b) => a.displayOrder - b.displayOrder);

    const perUnit = unitPrice(
      item.service.basePrice.toString(),
      selected.map((o) => o.priceDelta.toString()),
    );
    const days = estimateDays(
      item.service.deliveryDays,
      selected.map((o) => o.daysDelta),
    );

    return {
      id: item.id,
      quantity: item.quantity,
      requirements: item.requirements,
      service: {
        id: item.service.id,
        slug: item.service.slug,
        name: item.service.name,
        imageUrl: item.service.imageUrl,
        basePrice: item.service.basePrice.toString(),
        deliveryDays: item.service.deliveryDays,
      },
      options: selected.map((o) => ({
        id: o.id,
        groupKey: o.groupKey,
        label: o.label,
        priceDelta: o.priceDelta.toString(),
        daysDelta: o.daysDelta,
        isDefault: o.isDefault,
        displayOrder: o.displayOrder,
      })),
      unitPrice: perUnit,
      lineTotal: lineTotal(perUnit, item.quantity),
      estimatedDays: days,
    };
  });

  const subtotal = sumMoney(items.map((i) => i.lineTotal));
  return {
    id: cart.id,
    items,
    subtotal,
    total: subtotal, // no fees/charges in v1
    estimatedDays: items.length ? Math.max(...items.map((i) => i.estimatedDays)) : 0,
  };
}

/** Validate optionIds belong to the service and respect the group rules. */
async function resolveOptions(serviceId: string, optionIds: string[]) {
  if (optionIds.length === 0) return [];
  const options = await prisma.serviceOption.findMany({
    where: { id: { in: optionIds }, serviceId },
  });
  if (options.length !== optionIds.length) {
    throw ApiError.badRequest('One or more selected options are invalid for this service', 'INVALID_OPTIONS');
  }
  const perGroup = new Map<string, number>();
  for (const o of options) perGroup.set(o.groupKey, (perGroup.get(o.groupKey) ?? 0) + 1);
  for (const [group, count] of perGroup) {
    if (group !== 'extras' && count > 1) {
      throw ApiError.badRequest(`Only one option per "${group}" group can be selected`, 'INVALID_OPTIONS');
    }
  }
  return options.sort((a, b) => a.displayOrder - b.displayOrder);
}

export async function getCart(userId: string): Promise<CartDto> {
  return serializeCart(await getOrCreateCart(userId));
}

export async function addItem(
  userId: string,
  input: { serviceId: string; quantity: number; optionIds: string[]; requirements?: string },
): Promise<CartDto> {
  const service = await prisma.service.findFirst({
    where: { id: input.serviceId, isActive: true },
    select: { id: true },
  });
  if (!service) throw ApiError.notFound('Service not found');
  await resolveOptions(input.serviceId, input.optionIds);

  const cart = await getOrCreateCart(userId);
  const existing = cart.items.find((i) => i.serviceId === input.serviceId);

  await prisma.$transaction(async (tx) => {
    const base = {
      requirements: input.requirements ?? null,
    };
    const item = existing
      ? await tx.cartItem.update({
          where: { id: existing.id },
          data: {
            ...base,
            quantity: Math.min(10, existing.quantity + input.quantity),
          },
        })
      : await tx.cartItem.create({
          data: {
            cartId: cart.id,
            serviceId: input.serviceId,
            quantity: input.quantity,
            ...base,
          },
        });

    await tx.cartItemOption.deleteMany({ where: { cartItemId: item.id } });
    if (input.optionIds.length) {
      await tx.cartItemOption.createMany({
        data: input.optionIds.map((serviceOptionId) => ({ cartItemId: item.id, serviceOptionId })),
      });
    }
  });

  return getCart(userId);
}

export async function updateItem(
  userId: string,
  itemId: string,
  patch: { quantity?: number; optionIds?: string[]; requirements?: string | null },
): Promise<CartDto> {
  const cart = await getOrCreateCart(userId);
  const item = cart.items.find((i) => i.id === itemId);
  if (!item) throw ApiError.notFound('Cart item not found');

  const optionIds =
    patch.optionIds ?? item.optionLinks.map((l) => l.serviceOptionId);
  if (patch.optionIds) await resolveOptions(item.serviceId, optionIds);
  const quantity = patch.quantity ?? item.quantity;

  await prisma.$transaction(async (tx) => {
    await tx.cartItem.update({
      where: { id: item.id },
      data: {
        quantity,
        ...(patch.requirements !== undefined ? { requirements: patch.requirements } : {}),
      },
    });
    if (patch.optionIds) {
      await tx.cartItemOption.deleteMany({ where: { cartItemId: item.id } });
      if (optionIds.length) {
        await tx.cartItemOption.createMany({
          data: optionIds.map((serviceOptionId) => ({ cartItemId: item.id, serviceOptionId })),
        });
      }
    }
  });

  return getCart(userId);
}

export async function removeItem(userId: string, itemId: string): Promise<CartDto> {
  const cart = await getOrCreateCart(userId);
  const item = cart.items.find((i) => i.id === itemId);
  if (!item) throw ApiError.notFound('Cart item not found');
  await prisma.cartItem.delete({ where: { id: item.id } });
  return getCart(userId);
}

/** Remove the cart lines covered by a just-submitted order. */
export async function clearServices(userId: string, serviceIds: string[]) {
  if (!serviceIds.length) return;
  const cart = await prisma.cart.findUnique({ where: { userId } });
  if (!cart) return;
  await prisma.cartItem.deleteMany({
    where: { cartId: cart.id, serviceId: { in: serviceIds } },
  });
}
