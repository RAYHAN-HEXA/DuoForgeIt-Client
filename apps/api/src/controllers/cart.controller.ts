import type { Request, Response, NextFunction } from 'express';
import type { z } from 'zod';
import type { cartItemAddSchema } from '@tsh/shared';
import { ok } from '../utils/envelope.js';
import { validated } from '../middleware/validate.js';
import * as cart from '../services/cart.service.js';

/** GET /api/cart */
export async function show(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(ok(await cart.getCart(_req.authUser!.id)));
  } catch (err) {
    next(err);
  }
}

/** POST /api/cart/items */
export async function add(req: Request, res: Response, next: NextFunction) {
  try {
    const body = validated<z.infer<typeof cartItemAddSchema>>(req, 'body');
    res.status(201).json(ok(await cart.addItem(req.authUser!.id, body)));
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/cart/items/:itemId */
export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const itemId = validated<{ itemId: string }>(req, 'params').itemId;
    const body = validated<{ quantity?: number; optionIds?: string[]; requirements?: string | null }>(req, 'body');
    res.json(ok(await cart.updateItem(req.authUser!.id, itemId, body)));
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/cart/items/:itemId */
export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const itemId = validated<{ itemId: string }>(req, 'params').itemId;
    res.json(ok(await cart.removeItem(req.authUser!.id, itemId)));
  } catch (err) {
    next(err);
  }
}
