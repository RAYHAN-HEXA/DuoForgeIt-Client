import type { Request, Response, NextFunction } from 'express';
import { ok } from '../utils/envelope.js';
import { validated } from '../middleware/validate.js';
import * as marketplace from '../services/marketplace.service.js';
import type { MarketplaceListQuery, RequestFileRegister, ServiceRequestCreate } from '@tsh/shared';

/** GET /api/marketplace/services — public, PUBLISHED-only. */
export async function listServices(req: Request, res: Response, next: NextFunction) {
  try {
    const query = validated<MarketplaceListQuery>(req, 'query');
    res.json(ok(await marketplace.listServices(query)));
  } catch (err) {
    next(err);
  }
}

/** GET /api/marketplace/services/:slug — public detail (404 unless PUBLISHED). */
export async function getService(req: Request, res: Response, next: NextFunction) {
  try {
    const slugParam = req.params.slug;
    const slug = Array.isArray(slugParam) ? (slugParam[0] ?? '') : (slugParam ?? '');
    res.json(ok(await marketplace.getServiceBySlug(slug)));
  } catch (err) {
    next(err);
  }
}

/** GET /api/marketplace/categories — public, derived from published services. */
export async function listCategories(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(ok(await marketplace.listCategories()));
  } catch (err) {
    next(err);
  }
}

/** GET /api/marketplace/services/:slug/form — data-driven request-form fields (M4). */
export async function getServiceForm(req: Request, res: Response, next: NextFunction) {
  try {
    const slugParam = req.params.slug;
    const slug = Array.isArray(slugParam) ? (slugParam[0] ?? '') : (slugParam ?? '');
    res.json(ok(await marketplace.getServiceForm(slug)));
  } catch (err) {
    next(err);
  }
}

/** POST /api/marketplace/services/:slug/requests — authenticated submission (R1). */
export async function createRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const slugParam = req.params.slug;
    const slug = Array.isArray(slugParam) ? (slugParam[0] ?? '') : (slugParam ?? '');
    const body = validated<ServiceRequestCreate>(req, 'body');
    const user = req.authUser!;
    res.json(
      ok(
        await marketplace.createRequest({
          ...body,
          userId: user.id,
          userName: user.fullName,
          userEmail: user.email,
          slug,
        }),
      ),
    );
  } catch (err) {
    next(err);
  }
}

/** POST /api/marketplace/files — register a staged upload (type/size re-checked). */
export async function registerFile(req: Request, res: Response, next: NextFunction) {
  try {
    const body = validated<RequestFileRegister>(req, 'body');
    const user = req.authUser!;
    res.json(ok(await marketplace.registerRequestFile({ ...body, userId: user.id })));
  } catch (err) {
    next(err);
  }
}
