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

const subscriptionFields = z.object({
  schoolId: z.string().cuid(),
  planId: z.string().cuid(),
  status: z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED']),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});
const createSubSchema = subscriptionFields.refine((value) => new Date(value.endsAt) > new Date(value.startsAt), { message: 'End date must be after start date' });
const updateSubSchema = subscriptionFields.partial().refine((value) => !value.startsAt || !value.endsAt || new Date(value.endsAt) > new Date(value.startsAt), { message: 'End date must be after start date' });

const idParam = z.object({ id: z.string().cuid() });

router.get('/', async (req, res, next) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const where = {};
    if (req.query.schoolId) where.schoolId = req.query.schoolId;
    if (req.query.status) where.status = req.query.status;
    const [items, total] = await prisma.$transaction([
      prisma.subscription.findMany({
        where, skip: (page - 1) * limit, take: limit,
        include: { school: { select: { id: true, name: true, slug: true } }, plan: true },
        orderBy: { startsAt: 'desc' },
      }),
      prisma.subscription.count({ where }),
    ]);
    sendSuccess(res, { items, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

router.post('/', csrfProtection, validate({ body: createSubSchema }), async (req, res, next) => {
  try {
    const { schoolId, planId, status, startsAt, endsAt } = req.body;
    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new AppError('School not found', 404);
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new AppError('Plan not found', 404);
    const sub = await prisma.subscription.create({
      data: { schoolId, planId, status, startsAt, endsAt },
      include: { plan: true },
    });
    if (status === 'ACTIVE' || status === 'TRIAL') await prisma.school.update({ where: { id: schoolId }, data: { status: 'ACTIVE' } });
    await logAction({ userId: req.user.id, schoolId, action: 'CREATE_SUBSCRIPTION', entity: 'Subscription', entityId: sub.id, ip: req.ip });
    sendSuccess(res, { subscription: sub }, 201);
  } catch (err) { next(err); }
});

router.patch('/:id', csrfProtection, validate({ params: idParam }), validate({ body: updateSubSchema }), async (req, res, next) => {
  try {
    const existing = await prisma.subscription.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError('Subscription not found', 404);
    const sub = await prisma.subscription.update({
      where: { id: req.params.id }, data: req.body,
      include: { plan: true, school: { select: { id: true, name: true } } },
    });
    if (sub.status === 'ACTIVE' || sub.status === 'TRIAL') await prisma.school.update({ where: { id: sub.schoolId }, data: { status: 'ACTIVE' } });
    await logAction({ userId: req.user.id, schoolId: existing.schoolId, action: 'UPDATE_SUBSCRIPTION', entity: 'Subscription', entityId: sub.id, ip: req.ip });
    sendSuccess(res, { subscription: sub });
  } catch (err) { next(err); }
});

router.delete('/:id', csrfProtection, validate({ params: idParam }), validateEmptyBody, async (req, res, next) => {
  try {
    const existing = await prisma.subscription.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError('Subscription not found', 404);
    await prisma.subscription.delete({ where: { id: existing.id } });
    await logAction({ userId: req.user.id, schoolId: existing.schoolId, action: 'DELETE_SUBSCRIPTION', entity: 'Subscription', entityId: existing.id, ip: req.ip });
    sendSuccess(res, null, 204);
  } catch (err) { next(err); }
});

export default router;
