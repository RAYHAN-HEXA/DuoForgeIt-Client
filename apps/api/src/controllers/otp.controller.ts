import type { Request, Response, NextFunction } from 'express';
import type { OtpRequestInput, OtpVerifyInput } from '@tsh/shared';
import { ok } from '../utils/envelope.js';
import { ApiError } from '../utils/ApiError.js';
import { prisma } from '../config/prisma.js';
import { requestOtp, verifyOtp } from '../services/otp.service.js';
import { validated } from '../middleware/validate.js';

/**
 * POST /api/auth/otp/request — email a 6-digit code.
 * REGISTER pre-checks the address isn't already linked to an account (a
 * friendlier 409 than letting the later sync fail); strict syntax +
 * disposable-domain rejection comes from the shared schema in validate().
 */
export async function requestOtpHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, purpose, fullName } = validated<OtpRequestInput>(req, 'body');
    if (purpose === 'REGISTER') {
      const existing = await prisma.user.findUnique({
        where: { email },
        select: { firebaseUid: true },
      });
      if (existing?.firebaseUid) {
        throw new ApiError(
          409,
          'EMAIL_ALREADY_REGISTERED',
          'This email is already registered — sign in instead',
        );
      }
    }
    res.json(ok(await requestOtp(email, purpose, fullName)));
  } catch (err) {
    next(err);
  }
}

/** POST /api/auth/otp/verify — check the code, return a single-use grant token. */
export async function verifyOtpHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, purpose, code } = validated<OtpVerifyInput>(req, 'body');
    const grantToken = await verifyOtp(email, purpose, code);
    res.json(ok({ grantToken, email }));
  } catch (err) {
    next(err);
  }
}
