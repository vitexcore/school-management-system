import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { csrfTokenHandler, csrfProtection } from '../middleware/csrf.js';
import { validate } from '../middleware/validate.js';
import { authLimiter, loginSlowDown } from '../middleware/rateLimiter.js';
import * as authController from '../controllers/auth.controller.js';
import { loginSchema, changePasswordSchema } from '../validators/auth.validators.js';

const router = Router();

router.get('/csrf-token', csrfTokenHandler);
router.post(
  '/login',
  authLimiter,
  loginSlowDown,
  csrfProtection,
  validate(loginSchema),
  authController.login
);
router.post('/refresh', authLimiter, csrfProtection, authController.refresh);
router.post('/logout', csrfProtection, authController.logout);
router.get('/me', authenticate, authController.me);
router.patch(
  '/change-password',
  authenticate,
  csrfProtection,
  validate(changePasswordSchema),
  authController.changePassword
);

export default router;
