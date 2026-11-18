import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { tenantScope } from '../../middleware/tenantScope.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { validate } from '../../middleware/validate.js';
import { globalLimiter } from '../../middleware/rateLimiter.js';
import { schoolWhere, assertSchoolAccess } from '../../utils/scope.js';
import { logAction } from '../../services/audit.service.js';
import prisma from '../../utils/prisma.js';
import { z } from 'zod';
import { sendSuccess, AppError } from '../../utils/response.js';

const router = Router();
router.use(authenticate);
router.use(requireRole('ADMIN'));
router.use(tenantScope);
router.use(globalLimiter);

const classSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  level: z.string().min(1, 'Level is required'),
  arm: z.string().min(1, 'Arm is required').optional(),
  capacity: z.number().int().positive('Capacity must be positive').optional()
});

// ---------- Classes ----------

router.get('/', async (req, res, next) => {
  try {
    const where = schoolWhere(req.user);
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const [items, total] = await prisma.$transaction([
      prisma.class.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { enrollments: { where: { student: { status: 'ACTIVE' } } } } } }
      }),
      prisma.class.count({ where })
    ]);
    sendSuccess(res, {
      items: items.map((c) => ({ ...c, studentCount: c._count.enrollments })),
      total, page, limit, pages: Math.ceil(total / limit)
    });
  } catch (err) { next(err); }
});

router.post('/', csrfProtection, validate({ body: classSchema }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const { name, level, arm, capacity } = req.body;
    const cls = await prisma.class.create({
      data: { schoolId, name, level, arm: arm || null, capacity: capacity || null }
    });
    await logAction({ userId: req.user.id, schoolId, action: 'CREATE_CLASS', entity: 'Class', entityId: cls.id, ip: req.ip });
    sendSuccess(res, { class: cls }, 201);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const where = schoolWhere(req.user, { id: req.params.id });
    const cls = await prisma.class.findFirst({
      where, include: { _count: { select: { enrollments: { where: { student: { status: 'ACTIVE' } } } } } }
    });
    if (!cls) throw new AppError('Class not found', 404);
    sendSuccess(res, { class: { ...cls, studentCount: cls._count.enrollments } });
  } catch (err) { next(err); }
});

router.patch('/:id', csrfProtection, validate({ body: classSchema.partial() }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const cls = await prisma.class.findFirst({ where: { id: req.params.id, schoolId } });
    if (!cls) throw new AppError('Class not found', 404);
    const { name, level, arm, capacity } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (level !== undefined) data.level = level;
    if (arm !== undefined) data.arm = arm || null;
    if (capacity !== undefined) data.capacity = capacity || null;
    const updated = await prisma.class.update({ where: { id: req.params.id }, data });
    await logAction({ userId: req.user.id, schoolId, action: 'UPDATE_CLASS', entity: 'Class', entityId: updated.id, ip: req.ip });
    sendSuccess(res, { class: updated });
  } catch (err) { next(err); }
});

router.delete('/:id', csrfProtection, async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const cls = await prisma.class.findFirst({ where: { id: req.params.id, schoolId } });
    if (!cls) throw new AppError('Class not found', 404);
    await prisma.class.delete({ where: { id: req.params.id } });
    await logAction({ userId: req.user.id, schoolId, action: 'DELETE_CLASS', entity: 'Class', entityId: req.params.id, ip: req.ip });
    sendSuccess(res, null, 204);
  } catch (err) { next(err); }
});

export default router;
