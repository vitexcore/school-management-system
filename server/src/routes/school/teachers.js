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
import { enforceSchoolLimit } from '../../services/planLimits.js';

const router = Router();
router.use(authenticate);
router.use(requireRole('ADMIN'));
router.use(tenantScope);
router.use(globalLimiter);

const teacherSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email').optional().nullable(),
  phone: z.string().optional().nullable(),
  staffId: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  qualification: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional()
});

// ---------- Teachers ----------

router.get('/', async (req, res, next) => {
  try {
    const where = { ...schoolWhere(req.user), deletedAt: null };
    if (req.query.search) {
      where.OR = [
        { name: { contains: req.query.search } },
        { staffId: { contains: req.query.search } },
        { email: { contains: req.query.search } }
      ];
    }
    if (req.query.status) where.status = req.query.status;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const [items, total] = await prisma.$transaction([
      prisma.teacher.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          classSubjects: {
            include: { class: { select: { id: true, name: true, level: true, arm: true } }, subject: { select: { id: true, name: true, code: true } } }
          }
        }
      }),
      prisma.teacher.count({ where })
    ]);
    sendSuccess(res, { items, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

router.post('/', csrfProtection, validate({ body: teacherSchema }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    await enforceSchoolLimit(schoolId, 'teachers');
    const { name, email, phone, staffId, gender, qualification, status } = req.body;
    if (email) {
      const existing = await prisma.teacher.findFirst({ where: { schoolId, email } });
      if (existing) throw new AppError('Email already in use', 409);
    }
    const teacher = await prisma.teacher.create({
      data: { schoolId, name, email: email || null, phone: phone || null, staffId: staffId || null, gender: gender || null, qualification: qualification || null, status: status || 'ACTIVE' }
    });
    await logAction({ userId: req.user.id, schoolId, action: 'CREATE_TEACHER', entity: 'Teacher', entityId: teacher.id, ip: req.ip });
    sendSuccess(res, { teacher }, 201);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const where = { ...schoolWhere(req.user, { id: req.params.id }), deletedAt: null };
    const teacher = await prisma.teacher.findFirst({
      where, include: {
        classSubjects: { include: { class: { select: { id: true, name: true, level: true, arm: true } }, subject: { select: { id: true, name: true, code: true } } } }
      }
    });
    if (!teacher) throw new AppError('Teacher not found', 404);
    sendSuccess(res, { teacher });
  } catch (err) { next(err); }
});

router.patch('/:id', csrfProtection, validate({ body: teacherSchema.partial() }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const teacher = await prisma.teacher.findFirst({ where: { id: req.params.id, schoolId, deletedAt: null } });
    if (!teacher) throw new AppError('Teacher not found', 404);
    const { email, ...rest } = req.body;
    if (email !== undefined && email !== teacher.email) {
      const existing = await prisma.teacher.findFirst({ where: { schoolId, email } });
      if (existing) throw new AppError('Email already in use', 409);
    }
    const data = { ...rest };
    if (email !== undefined) data.email = email || null;
    const updated = await prisma.teacher.update({ where: { id: req.params.id }, data });
    await logAction({ userId: req.user.id, schoolId, action: 'UPDATE_TEACHER', entity: 'Teacher', entityId: updated.id, ip: req.ip });
    sendSuccess(res, { teacher: updated });
  } catch (err) { next(err); }
});

router.delete('/:id', csrfProtection, async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const teacher = await prisma.teacher.findFirst({ where: { id: req.params.id, schoolId } });
    if (!teacher) throw new AppError('Teacher not found', 404);
    await prisma.teacher.update({ where: { id: req.params.id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
    await logAction({ userId: req.user.id, schoolId, action: 'DELETE_TEACHER', entity: 'Teacher', entityId: req.params.id, ip: req.ip });
    sendSuccess(res, null, 204);
  } catch (err) { next(err); }
});

export default router;
