import type { Request, Response, NextFunction } from 'express';
import { ok } from '../utils/envelope.js';
import { validated } from '../middleware/validate.js';
import * as marketplace from '../services/marketplace.service.js';
import type {
  MarketplaceListQuery,
  QuotationAccept,
  QuotationCreate,
  QuotationDecline,
  RequestFileRegister,
  RequestListQuery,
  RequestStatusUpdate,
  ServiceRequestCreate,
} from '@tsh/shared';

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


// ─── Marketplace payment bridge: requests & quotations ────────────────────

/** GET /api/marketplace/requests — the customer's own requests. */
export async function listMyRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const query = validated<RequestListQuery>(req, 'query');
    res.json(ok(await marketplace.listOwnRequests(req.authUser!.id, query)));
  } catch (err) {
    next(err);
  }
}

/** GET /api/marketplace/requests/:id — owner-only detail. */
export async function getMyRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const id = validated<{ id: string }>(req, 'params').id;
    res.json(ok(await marketplace.getOwnRequest(req.authUser!.id, id)));
  } catch (err) {
    next(err);
  }
}

/** POST /api/marketplace/requests/:id/cancel — customer cancels pre-payment. */
export async function cancelMyRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const id = validated<{ id: string }>(req, 'params').id;
    const body = validated<{ note?: string }>(req, 'body');
    res.json(ok(await marketplace.cancelOwnRequest(req.authUser!.id, id, body.note)));
  } catch (err) {
    next(err);
  }
}

/** POST /api/marketplace/quotations/:id/accept — creates the order (idempotent). */
export async function acceptQuotation(req: Request, res: Response, next: NextFunction) {
  try {
    const id = validated<{ id: string }>(req, 'params').id;
    const body = validated<QuotationAccept>(req, 'body');
    const result = await marketplace.acceptQuotation(id, req.authUser!.id, body);
    res.status(result.replayed ? 200 : 201).json(ok(result));
  } catch (err) {
    next(err);
  }
}

/** POST /api/marketplace/quotations/:id/decline — customer declines a sent quote. */
export async function declineQuotation(req: Request, res: Response, next: NextFunction) {
  try {
    const id = validated<{ id: string }>(req, 'params').id;
    const body = validated<QuotationDecline>(req, 'body');
    res.json(ok(await marketplace.declineQuotation(id, req.authUser!.id, body.reason)));
  } catch (err) {
    next(err);
  }
}

// ─── Admin side of the bridge ───────────────────────────────────────────────

/** GET /api/admin/requests — paginated queue. */
export async function adminListRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const query = validated<RequestListQuery>(req, 'query');
    res.json(ok(await marketplace.adminListRequests(query)));
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/requests/:id — full detail incl. answers + customer. */
export async function adminGetRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const id = validated<{ id: string }>(req, 'params').id;
    res.json(ok(await marketplace.adminGetRequest(id)));
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/requests/:id/status — transition-validated. */
export async function adminUpdateRequestStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const id = validated<{ id: string }>(req, 'params').id;
    const body = validated<RequestStatusUpdate>(req, 'body');
    res.json(ok(await marketplace.adminUpdateRequestStatus(id, req.authUser!.id, body)));
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/requests/:id/quotations — draft a new version. */
export async function adminCreateQuotation(req: Request, res: Response, next: NextFunction) {
  try {
    const id = validated<{ id: string }>(req, 'params').id;
    const body = validated<QuotationCreate>(req, 'body');
    res.status(201).json(ok(await marketplace.createQuotation(id, req.authUser!.id, body)));
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/quotations/:id/send — DRAFT → SENT, request → QUOTATION_SENT. */
export async function adminSendQuotation(req: Request, res: Response, next: NextFunction) {
  try {
    const id = validated<{ id: string }>(req, 'params').id;
    res.json(ok(await marketplace.sendQuotation(id, req.authUser!.id)));
  } catch (err) {
    next(err);
  }
}