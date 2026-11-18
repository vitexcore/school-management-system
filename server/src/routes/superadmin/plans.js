import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { validate, validateEmptyBody, validateQueryShape } from '../../middleware/validate.js';
import { globalLimiter } from '../../middleware/rateLimiter.js';
import { logAction } from '../../services/audit.service.js';
import { sendSuccess, AppError } from '../../utils/response.js';
import prisma from '../../utils/prisma.js';

const router = Router();
router.use(authenticate);
router.use(requireRole('SUPERADMIN'));
router.use(globalLimiter);
router.use(validateQueryShape);

const planSchema = z.object({
  name: z.string().min(1),
  maxStudents: z.number().int().positive(),
  maxTeachers: z.number().int().positive(),
  priceMonthly: z.number().int().safe().nonnegative(),
  features: z.record(z.unknown()).optional().default({}),
  isActive: z.boolean().optional().default(true),
});

const idParam = z.object({ id: z.string().cuid() });

router.get('/', async (req, res, next) => {
  try {
    const plans = await prisma.plan.findMany({ orderBy: { priceMonthly: 'asc' } });
    sendSuccess(res, { plans });
  } catch (err) { next(err); }
});

router.post('/', csrfProtection, validate({ body: planSchema }), async (req, res, next) => {
  try {
    const plan = await prisma.plan.create({ data: req.body });
    await logAction({ userId: req.user.id, action: 'CREATE_PLAN', entity: 'Plan', entityId: plan.id, ip: req.ip });
    sendSuccess(res, { plan }, 201);
  } catch (err) { next(err); }
});

router.get('/:id', validate({ params: idParam }), async (req, res, next) => {
  try {
    const plan = await prisma.plan.findUnique({ where: { id: req.params.id } });
    if (!plan) throw new AppError('Plan not found', 404);
    sendSuccess(res, { plan });
  } catch (err) { next(err); }
});

router.patch('/:id', csrfProtection, validate({ params: idParam }), validate({ body: planSchema.partial() }), async (req, res, next) => {
  try {
    const existing = await prisma.plan.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError('Plan not found', 404);
    const plan = await prisma.plan.update({ where: { id: req.params.id }, data: req.body });
    await logAction({ userId: req.user.id, action: 'UPDATE_PLAN', entity: 'Plan', entityId: plan.id, ip: req.ip });
    sendSuccess(res, { plan });
  } catch (err) { next(err); }
});

router.delete('/:id', csrfProtection, validate({ params: idParam }), validateEmptyBody, async (req, res, next) => {
  try {
    const existing = await prisma.plan.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError('Plan not found', 404);
    const inUse = await prisma.subscription.count({ where: { planId: req.params.id } });
    if (inUse > 0) throw new AppError('Cannot delete a plan that has active subscriptions', 409);
    await prisma.plan.delete({ where: { id: req.params.id } });
    await logAction({ userId: req.user.id, action: 'DELETE_PLAN', entity: 'Plan', entityId: req.params.id, ip: req.ip });
    sendSuccess(res, null, 204);
  } catch (err) { next(err); }
});

export default router;
