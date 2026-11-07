import type { Request, Response, NextFunction } from 'express';
import type {
  AdminServiceListQuery,
  AdminServiceStatusInput,
  ServiceUpsertInput,
} from '@tsh/shared';
import { ok } from '../utils/envelope.js';
import { validated } from '../middleware/validate.js';
import { audit } from '../utils/audit.js';
import * as adminServices from '../services/adminService.service.js';

/** All request validation happens in routes/index.ts — these are the shapes. */
type IdParams = { id: string };
const paramId = (req: Request) => validated<IdParams>(req, 'params').id;

/** GET /api/admin/service-categories — every category, including inactive. */
export async function listCategories(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(ok(await adminServices.listCategories()));
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/services — management list (all lifecycle statuses). */
export async function listServices(req: Request, res: Response, next: NextFunction) {
  try {
    const query = validated<AdminServiceListQuery>(req, 'query');
    res.json(ok(await adminServices.listServices(query)));
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/services/:id — full editor payload. */
export async function getService(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(ok(await adminServices.getService(paramId(req))));
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/services — create a service (nested options + form fields). */
export async function createService(req: Request, res: Response, next: NextFunction) {
  try {
    const body = validated<ServiceUpsertInput>(req, 'body');
    const service = await adminServices.createService(body);

    await audit({
      actorId: req.authUser!.id,
      action: 'SERVICE.CREATE',
      entityType: 'Service',
      entityId: service.id,
      metadata: {
        slug: service.slug,
        name: service.name,
        status: service.status,
        categoryId: service.category.id,
      },
      ip: req.ip,
    });

    res.status(201).json(ok(service));
  } catch (err) {
    next(err);
  }
}

/** PUT /api/admin/services/:id — replace the full editor payload. */
export async function updateService(req: Request, res: Response, next: NextFunction) {
  try {
    const id = paramId(req);
    const body = validated<ServiceUpsertInput>(req, 'body');
    const service = await adminServices.updateService(id, body);

    await audit({
      actorId: req.authUser!.id,
      action: 'SERVICE.UPDATE',
      entityType: 'Service',
      entityId: service.id,
      metadata: {
        slug: service.slug,
        name: service.name,
        status: service.status,
        categoryId: service.category.id,
        isFeatured: service.isFeatured,
        isPopular: service.isPopular,
        optionCount: service.options.length,
        formFieldCount: service.formFields.length,
      },
      ip: req.ip,
    });

    res.json(ok(service));
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/services/:id/status — publish / unpublish / archive. */
export async function setStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const id = paramId(req);
    const body = validated<AdminServiceStatusInput>(req, 'body');
    const service = await adminServices.setServiceStatus(id, body.status);

    await audit({
      actorId: req.authUser!.id,
      action: 'SERVICE.STATUS',
      entityType: 'Service',
      entityId: service.id,
      metadata: { slug: service.slug, status: service.status },
      ip: req.ip,
    });

    res.json(ok(service));
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/admin/services/:id — 409 SERVICE_IN_USE when history references it. */
export async function deleteService(req: Request, res: Response, next: NextFunction) {
  try {
    const id = paramId(req);
    await adminServices.deleteService(id);

    await audit({
      actorId: req.authUser!.id,
      action: 'SERVICE.DELETE',
      entityType: 'Service',
      entityId: id,
      ip: req.ip,
    });

    res.json(ok({ id, deleted: true }));
  } catch (err) {
    next(err);
  }
}
