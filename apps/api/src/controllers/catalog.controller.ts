import type { Request, Response, NextFunction } from 'express';
import { ok } from '../utils/envelope.js';
import { ApiError } from '../utils/ApiError.js';
import * as catalog from '../repositories/catalog.repository.js';
import { validated } from '../middleware/validate.js';

type ServiceListQuery = {
  search?: string;
  category?: string;
  sort?: 'popular' | 'price_asc' | 'price_desc' | 'newest';
  page: number;
  pageSize: number;
};

/** GET /api/public/homepage */
export async function homepage(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(ok(await catalog.getHomepage()));
  } catch (err) {
    next(err);
  }
}

/** GET /api/services */
export async function listServices(req: Request, res: Response, next: NextFunction) {
  try {
    const q = validated<ServiceListQuery>(req, 'query');
    const result = await catalog.listServices({
      search: q.search,
      categorySlug: q.category,
      sort: q.sort,
      page: q.page,
      pageSize: q.pageSize,
    });
    res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

/** GET /api/services/:slug */
export async function getService(req: Request, res: Response, next: NextFunction) {
  try {
    const slugParam = req.params.slug;
    const slug = Array.isArray(slugParam) ? (slugParam[0] ?? '') : (slugParam ?? '');
    const service = await catalog.findServiceBySlug(slug);
    if (!service) throw ApiError.notFound('Service not found');
    res.json(ok(service));
  } catch (err) {
    next(err);
  }
}

/** GET /api/categories */
export async function listCategories(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(ok(await catalog.listActiveCategories()));
  } catch (err) {
    next(err);
  }
}
