import { Router, raw } from 'express';
import { z } from 'zod';
import { ok } from '../utils/envelope.js';
import {
  hasDatabase,
  hasBlobStorage,
  firebaseCredentialSource,
  serviceMarketplaceEnabled,
  walletEnabled,
  UPSTASH_REDIS_REST_URL,
} from '../config/env.js';
import { getFirebaseAuth } from '../config/firebase.js';
import { prisma } from '../config/prisma.js';
import { mailTransport } from '../services/mail.service.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { apiLimiter, authLimiter, uploadRateLimiter, paymentSubmitRateLimiter, otpRateLimiter } from '../middleware/rate-limit.js';
import * as otpController from '../controllers/otp.controller.js';
import * as marketplaceController from '../controllers/marketplace.controller.js';
import * as paymentController from '../controllers/payment.controller.js';
import {
  adminServiceListQuerySchema,
  adminServiceStatusSchema,
  blobUploadTokenRequestSchema,
  marketplaceListQuerySchema,
  paymentAccountCreateSchema,
  paymentAccountReorderSchema,
  paymentAccountUpdateSchema,
  paymentReviewSchema,
  paymentSubmitV2Schema,
  requestFileRegisterSchema,
  serviceRequestCreateSchema,
  serviceUpsertSchema,
  quotationAcceptSchema,
  quotationCreateSchema,
  quotationDeclineSchema,
  requestListQuerySchema,
  requestStatusUpdateSchema,
  authSyncSchema,
  otpRequestSchema,
  otpVerifySchema,
} from '@tsh/shared';
import * as authController from '../controllers/auth.controller.js';
import * as catalogController from '../controllers/catalog.controller.js';
import * as userController from '../controllers/user.controller.js';
import * as cartController from '../controllers/cart.controller.js';
import * as orderController from '../controllers/order.controller.js';
import * as uploadController from '../controllers/upload.controller.js';
import * as contactController from '../controllers/contact.controller.js';
import * as notificationController from '../controllers/notification.controller.js';
import * as adminController from '../controllers/admin.controller.js';
import * as adminServiceController from '../controllers/adminService.controller.js';
import {
  cartItemAddSchema,
  checkoutSchema,
  contactSchema,
  paymentSubmitSchema,
  paginationQuerySchema,
  profileUpdateSchema,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
} from '@tsh/shared';

const orderListQuery = paginationQuerySchema.extend({
  status: z.string().trim().max(30).optional(),
});
const adminOrderQuery = paginationQuerySchema.extend({
  status: z.string().trim().max(30).optional(),
  founderId: z.uuid().optional(),
  search: z.string().trim().max(120).optional(),
});
const customerQuery = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
});
// Stage 6 admin payment queue: enum-validated status, method (enum value or
// custom rail key), free-text search, and whole-UTC-day / ISO date bounds.
const adminDateParam = z
  .string()
  .trim()
  .regex(
    /^(\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)$/,
    'Use YYYY-MM-DD or an ISO datetime',
  )
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date value');
const adminPaymentQuery = paginationQuerySchema.extend({
  status: z.enum(PAYMENT_STATUSES).optional(),
  method: z.string().trim().min(2).max(30).optional(),
  search: z.string().trim().max(120).optional(),
  from: adminDateParam.optional(),
  to: adminDateParam.optional(),
});

const router = Router();

// ─── Health ──────────────────────────────────────────────────

router.get('/health', async (_req, res, next) => {
  try {
    let db: 'ok' | 'unconfigured' | 'error' = hasDatabase ? 'error' : 'unconfigured';
    if (hasDatabase) {
      try {
        await prisma.$queryRaw`SELECT 1`;
        db = 'ok';
      } catch {
        db = 'error';
      }
    }
    res.json(
      ok({
        status: 'ok',
        db,
        firebase: getFirebaseAuth() ? 'ok' : 'unconfigured',
        firebaseCredentialSource,
        // Feature/config state for the deploy checklist — safe booleans/enums,
        // never secrets. `email` is the active transport ('none' ⇒ mail is
        // DB/log-only until RESEND_API_KEY or SMTP vars land).
        features: {
          serviceMarketplace: serviceMarketplaceEnabled,
          wallet: walletEnabled,
          blobStorage: hasBlobStorage,
          email: mailTransport,
          redisRateLimiting: Boolean(UPSTASH_REDIS_REST_URL),
        },
        time: new Date().toISOString(),
      }),
    );
  } catch (err) {
    next(err);
  }
});

// ─── Auth (Firebase ID tokens; sync provisions the Neon profile) ─────

const authRouter = Router();
// Email-OTP gate: a 6-digit code is mailed before an account may exist
// (REGISTER) or before a legacy account is un-gated (VERIFY). The tighter
// otpRateLimiter sits on top of authLimiter because every request sends mail.
authRouter.post('/otp/request', otpRateLimiter, validate({ body: otpRequestSchema }), otpController.requestOtpHandler);
authRouter.post('/otp/verify', otpRateLimiter, validate({ body: otpVerifySchema }), otpController.verifyOtpHandler);
authRouter.post('/sync', validate({ body: authSyncSchema }), authController.syncProfile);
authRouter.get('/me', authenticate, authController.me);
router.use('/auth', authLimiter, authRouter);

// ─── Public catalog ──────────────────────────────────────────

router.get(
  '/services',
  validate({
    query: z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(50).default(20),
      search: z.string().trim().max(120).optional(),
      category: z.string().trim().max(120).optional(),
      sort: z.enum(['popular', 'price_asc', 'price_desc', 'newest']).optional(),
    }),
  }),
  catalogController.listServices,
);
router.get('/services/:slug', catalogController.getService);
router.get('/categories', catalogController.listCategories);
router.get('/public/homepage', catalogController.homepage);

// ─── Marketplace v2 (flag-gated; PUBLISHED-only catalog) ─────

if (serviceMarketplaceEnabled) {
  const marketplaceRouter = Router();
  marketplaceRouter.get(
    '/services',
    validate({ query: marketplaceListQuerySchema }),
    marketplaceController.listServices,
  );
  marketplaceRouter.get('/services/:slug', marketplaceController.getService);
  marketplaceRouter.get(
    '/services/:slug/form',
    validate({ params: z.object({ slug: z.string().trim().min(1).max(160) }) }),
    marketplaceController.getServiceForm,
  );
  marketplaceRouter.post(
    '/services/:slug/requests',
    authenticate,
    authLimiter,
    validate({
      params: z.object({ slug: z.string().trim().min(1).max(160) }),
      body: serviceRequestCreateSchema,
    }),
    marketplaceController.createRequest,
  );
  marketplaceRouter.post(
    '/files',
    authenticate,
    authLimiter,
    validate({ body: requestFileRegisterSchema }),
    marketplaceController.registerFile,
  );
  marketplaceRouter.get('/categories', marketplaceController.listCategories);
  router.use('/marketplace', marketplaceRouter);
}

// ─── Marketplace payment bridge: request & quotation management ─────────────
// Deliberately OUTSIDE the flag gate: once a request exists the customer must
// always be able to view it, accept/decline its quotation, and cancel — the
// flag only gates the public catalog and NEW request submissions.

const requestManagementRouter = Router();
requestManagementRouter.get(
  '/',
  validate({ query: requestListQuerySchema }),
  marketplaceController.listMyRequests,
);
requestManagementRouter.get(
  '/:id',
  validate({ params: z.object({ id: z.uuid() }) }),
  marketplaceController.getMyRequest,
);
requestManagementRouter.post(
  '/:id/cancel',
  validate({ params: z.object({ id: z.uuid() }), body: z.object({ note: z.string().trim().max(2000).optional() }).optional() }),
  marketplaceController.cancelMyRequest,
);
requestManagementRouter.post(
  '/:id/quotations/accept',
  validate({ params: z.object({ id: z.uuid() }), body: quotationAcceptSchema }),
  marketplaceController.acceptQuotation,
);
requestManagementRouter.post(
  '/:id/quotations/decline',
  validate({ params: z.object({ id: z.uuid() }), body: quotationDeclineSchema }),
  marketplaceController.declineQuotation,
);
router.use('/marketplace/requests', authenticate, requestManagementRouter);

// ─── Users ───────────────────────────────────────────────────

const userRouter = Router();
userRouter.get('/me', authenticate, userController.getMe);
userRouter.patch('/me', authenticate, validate({ body: profileUpdateSchema }), userController.updateMe);
router.use('/users', userRouter);

// ─── Cart ────────────────────────────────────────────────────

const cartRouter = Router();
cartRouter.get('/', cartController.show);
cartRouter.post('/items', validate({ body: cartItemAddSchema }), cartController.add);
cartRouter.patch('/items/:itemId', validate({ params: z.object({ itemId: z.uuid() }) }), cartController.update);
cartRouter.delete('/items/:itemId', validate({ params: z.object({ itemId: z.uuid() }) }), cartController.remove);
router.use('/cart', authenticate, cartRouter);

// ─── Orders (checkout, tracking, payments, revisions, files) ──

const orderRouter = Router();
orderRouter.post('/', validate({ body: checkoutSchema }), orderController.create);
orderRouter.get('/', validate({ query: orderListQuery }), orderController.list);
orderRouter.get('/:id', validate({ params: z.object({ id: z.uuid() }) }), orderController.detail);
orderRouter.post('/:id/cancel', validate({ params: z.object({ id: z.uuid() }) }), orderController.cancel);
// Manual-payments v2 (account-driven submission) — a distinct sub-path so the
// live v1 endpoint keeps its exact validation and response semantics: old
// clients can never be routed into v2 validation, and Express 5's exact-path
// matching keeps the two contracts isolated. A dedicated per-user limiter
// (10 req/15 min) guards money-movement writes and founder email fan-out.
orderRouter.post(
  '/:id/payments/v2',
  paymentSubmitRateLimiter,
  validate({ params: z.object({ id: z.uuid() }), body: paymentSubmitV2Schema }),
  paymentController.submitPaymentV2,
);
orderRouter.post('/:id/payments', validate({ params: z.object({ id: z.uuid() }), body: paymentSubmitSchema }), orderController.submitPayment);
orderRouter.post('/:id/revisions', validate({ params: z.object({ id: z.uuid() }), body: z.object({ description: z.string().trim().min(10).max(4000) }) }), orderController.requestRevision);
orderRouter.post('/:id/review', validate({ params: z.object({ id: z.uuid() }), body: z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(2000).optional() }) }), orderController.submitReview);
orderRouter.post(
  '/:id/attachments',
  validate({
    params: z.object({ id: z.uuid() }),
    body: z.object({
      /** Server-minted Blob pathname from the upload ticket (ownership-checked). */
      pathname: z.string().trim().min(5).max(300),
      fileName: z.string().trim().min(1).max(255),
      mimeType: z.string().trim().min(3).max(120),
      sizeBytes: z.number().int().min(1),
      kind: z.enum(['REQUIREMENT', 'DELIVERABLE_FEEDBACK', 'OTHER']).default('REQUIREMENT'),
    }),
  }),
  orderController.addAttachment,
);
router.use('/orders', authenticate, orderRouter);

// ─── Uploads (scoped client-upload tickets for Vercel Blob) ──

router.post(
  '/uploads/blob/token',
  authenticate,
  uploadRateLimiter,
  validate({ body: blobUploadTokenRequestSchema }),
  uploadController.createTicket,
);

// Public image upload (avatars): raw bytes in → { url, pathname } out. The
// server creates the blob with access:'public' in one step; body capped at
// 2 MB by the raw parser (413) plus an explicit guard (400).
router.post(
  '/uploads/image',
  authenticate,
  uploadRateLimiter,
  raw({ type: 'image/*', limit: '2mb' }),
  uploadController.assertImageBody,
  uploadController.uploadAvatarImage,
);

// ─── Payment accounts (manual-payments v2) ───────────────────

router.get('/payment-accounts', authenticate, paymentController.listAccounts);

// ─── Contact (public) ────────────────────────────────────────

router.post('/contact', authLimiter, validate({ body: contactSchema }), contactController.submit);

// ─── Notifications ───────────────────────────────────────────

const notificationRouter = Router();
notificationRouter.get('/', notificationController.list);
notificationRouter.post('/read', validate({ body: z.object({ ids: z.array(z.uuid()).max(100).optional() }).optional() }), notificationController.markRead);
router.use('/notifications', authenticate, notificationRouter);

// ─── Admin (both co-founders; every action audited) ──────────

const adminRouter = Router();
adminRouter.get('/ping', (_req, res) => res.json(ok({ pong: true })));
adminRouter.get('/stats', adminController.stats);
adminRouter.get('/orders', validate({ query: adminOrderQuery }), adminController.listOrders);
adminRouter.get('/orders/:id', validate({ params: z.object({ id: z.uuid() }) }), adminController.getOrder);
adminRouter.patch(
  '/orders/:id/status',
  validate({ params: z.object({ id: z.uuid() }), body: z.object({ status: z.enum(ORDER_STATUSES), note: z.string().trim().max(2000).optional() }) }),
  adminController.updateOrderStatus,
);
adminRouter.patch(
  '/orders/:id/assignment',
  validate({ params: z.object({ id: z.uuid() }), body: z.object({ assignedFounderId: z.uuid().nullable() }) }),
  adminController.assignOrder,
);
adminRouter.post(
  '/orders/:id/deliverables',
  validate({
    params: z.object({ id: z.uuid() }),
    body: z.object({
      title: z.string().trim().min(2).max(160),
      description: z.string().trim().max(2000).optional(),
      /** Server-minted Blob pathname from the upload ticket (ownership-checked). */
      pathname: z.string().trim().min(5).max(300),
      fileName: z.string().trim().min(1).max(255),
      mimeType: z.string().trim().min(3).max(120),
      sizeBytes: z.number().int().min(1),
    }),
  }),
  adminController.addDeliverable,
);
// Stage 6 queue routes — `/stats` and `/:id/screenshot` are registered before
// any conflicting `/:id` usage (only PATCH exists below, but keep GETs first).
adminRouter.get('/payments/stats', adminController.paymentStats);
adminRouter.get('/payments', validate({ query: adminPaymentQuery }), adminController.listPayments);
adminRouter.get(
  '/payments/:id/screenshot',
  validate({ params: z.object({ id: z.uuid() }) }),
  adminController.paymentScreenshot,
);
adminRouter.patch(
  '/payments/:id',
  // Shared contract: decision + optional note, with a mandatory ≥5-character
  // reason when decision = REJECTED. Unknown client fields (amountPaid,
  // paymentStatus, reviewer id, …) are stripped by the schema.
  validate({ params: z.object({ id: z.uuid() }), body: paymentReviewSchema }),
  adminController.reviewPayment,
);

// ─── Receiving-account management (Stage 4) ──────────────────
// Literal routes (`/qr/sign`, `/reorder`) are registered before `/:id` so an
// account id can never swallow them. Every route is protected by the
// adminRouter-level authenticate + requireAdmin middleware below.
adminRouter.get('/payment-accounts', adminController.listPaymentAccounts);
adminRouter.post(
  '/payment-accounts/qr/sign',
  uploadRateLimiter,
  validate({ body: blobUploadTokenRequestSchema.omit({ folder: true, kind: true }) }),
  adminController.signPaymentAccountQr,
);
adminRouter.patch(
  '/payment-accounts/reorder',
  validate({ body: paymentAccountReorderSchema }),
  adminController.reorderPaymentAccounts,
);
adminRouter.post(
  '/payment-accounts',
  validate({ body: paymentAccountCreateSchema }),
  adminController.createPaymentAccount,
);
adminRouter.get(
  '/payment-accounts/:id',
  validate({ params: z.object({ id: z.uuid() }) }),
  adminController.getPaymentAccount,
);
adminRouter.patch(
  '/payment-accounts/:id/status',
  validate({ params: z.object({ id: z.uuid() }), body: z.object({ isActive: z.boolean() }) }),
  adminController.setPaymentAccountStatus,
);
adminRouter.patch(
  '/payment-accounts/:id',
  validate({ params: z.object({ id: z.uuid() }), body: paymentAccountUpdateSchema }),
  adminController.updatePaymentAccount,
);
adminRouter.delete(
  '/payment-accounts/:id',
  validate({ params: z.object({ id: z.uuid() }) }),
  adminController.deletePaymentAccount,
);

adminRouter.patch(
  '/revisions/:id',
  validate({ params: z.object({ id: z.uuid() }), body: z.object({ status: z.enum(['IN_PROGRESS', 'RESOLVED', 'DECLINED']), adminResponse: z.string().trim().max(4000).optional() }) }),
  adminController.respondRevision,
);
adminRouter.get('/customers', validate({ query: customerQuery }), adminController.listCustomers);
adminRouter.get('/founders', adminController.listFounders);
adminRouter.get('/messages', validate({ query: z.object({ page: z.coerce.number().int().min(1).default(1) }).optional() }), adminController.listMessages);
adminRouter.patch('/messages/:id', validate({ params: z.object({ id: z.uuid() }) }), adminController.markMessageRead);
adminRouter.patch('/reviews/:id', validate({ params: z.object({ id: z.uuid() }), body: z.object({ isPublic: z.boolean() }) }), adminController.curateReview);
adminRouter.get('/site-content', adminController.getSiteContent);
adminRouter.put('/site-content', validate({ body: z.object({ key: z.string().trim().min(2).max(80), value: z.unknown() }) }), adminController.putSiteContent);

// ─── Service catalog management (CRUD) ───────────────────────
// Literal `/service-categories` is registered before `/:id` so it can never be
// swallowed by the id route. PUT replaces the full editor payload; PATCH only
// changes lifecycle status. Every handler is audited.
adminRouter.get('/service-categories', adminServiceController.listCategories);
adminRouter.get(
  '/services',
  validate({ query: adminServiceListQuerySchema }),
  adminServiceController.listServices,
);
adminRouter.post(
  '/services',
  validate({ body: serviceUpsertSchema }),
  adminServiceController.createService,
);
adminRouter.get(
  '/services/:id',
  validate({ params: z.object({ id: z.uuid() }) }),
  adminServiceController.getService,
);
adminRouter.put(
  '/services/:id',
  validate({ params: z.object({ id: z.uuid() }), body: serviceUpsertSchema }),
  adminServiceController.updateService,
);
adminRouter.patch(
  '/services/:id/status',
  validate({ params: z.object({ id: z.uuid() }), body: adminServiceStatusSchema }),
  adminServiceController.setStatus,
);
adminRouter.delete(
  '/services/:id',
  validate({ params: z.object({ id: z.uuid() }) }),
  adminServiceController.deleteService,
);

// ─── Marketplace payment bridge (admin side) ─────────────────

adminRouter.get(
  '/requests',
  validate({ query: requestListQuerySchema }),
  marketplaceController.adminListRequests,
);
adminRouter.get(
  '/requests/:id',
  validate({ params: z.object({ id: z.uuid() }) }),
  marketplaceController.adminGetRequest,
);
adminRouter.patch(
  '/requests/:id/status',
  validate({ params: z.object({ id: z.uuid() }), body: requestStatusUpdateSchema }),
  marketplaceController.adminUpdateRequestStatus,
);
adminRouter.post(
  '/requests/:id/quotations',
  validate({ params: z.object({ id: z.uuid() }), body: quotationCreateSchema }),
  marketplaceController.adminCreateQuotation,
);
adminRouter.patch(
  '/quotations/:id/send',
  validate({ params: z.object({ id: z.uuid() }) }),
  marketplaceController.adminSendQuotation,
);

// Public service-media upload for the editor's Content tab (admins only —
// this router sits behind authenticate + requireAdmin).
adminRouter.post(
  '/uploads/image',
  uploadRateLimiter,
  raw({ type: 'image/*', limit: '2mb' }),
  uploadController.assertImageBody,
  uploadController.uploadServiceImage,
);

router.use('/admin', authenticate, requireAdmin, adminRouter);

export { router as apiRouter, apiLimiter };
