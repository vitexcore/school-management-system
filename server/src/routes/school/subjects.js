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

const subjectSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().min(1, 'Code is required')
});

const classSubjectSchema = z.object({
  classId: z.string().cuid('Invalid class'),
  subjectId: z.string().cuid('Invalid subject'),
  teacherId: z.string().cuid('Invalid teacher').optional().nullable()
});

// ---------- Subjects ----------

router.get('/subjects', async (req, res, next) => {
  try {
    const where = schoolWhere(req.user);
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const [items, total] = await prisma.$transaction([
      prisma.subject.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { createdAt: 'desc' },
        include: { classSubjects: { include: { class: { select: { id: true, name: true, level: true, arm: true } } } } }
      }),
      prisma.subject.count({ where })
    ]);
    sendSuccess(res, { items, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

router.post('/subjects', csrfProtection, validate({ body: subjectSchema }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const { name, code } = req.body;
    const subject = await prisma.subject.create({ data: { schoolId, name, code } });
    await logAction({ userId: req.user.id, schoolId, action: 'CREATE_SUBJECT', entity: 'Subject', entityId: subject.id, ip: req.ip });
    sendSuccess(res, { subject }, 201);
  } catch (err) { next(err); }
});

router.get('/subjects/:id', async (req, res, next) => {
  try {
    const where = schoolWhere(req.user, { id: req.params.id });
    const subject = await prisma.subject.findFirst({
      where, include: { classSubjects: { include: { class: { select: { id: true, name: true, level: true, arm: true } }, teacher: { select: { id: true, name: true, staffId: true } } } } }
    });
    if (!subject) throw new AppError('Subject not found', 404);
    sendSuccess(res, { subject });
  } catch (err) { next(err); }
});

router.patch('/subjects/:id', csrfProtection, validate({ body: subjectSchema.partial() }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const subject = await prisma.subject.findFirst({ where: { id: req.params.id, schoolId } });
    if (!subject) throw new AppError('Subject not found', 404);
    const { name, code } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (code !== undefined) data.code = code;
    const updated = await prisma.subject.update({ where: { id: req.params.id }, data });
    await logAction({ userId: req.user.id, schoolId, action: 'UPDATE_SUBJECT', entity: 'Subject', entityId: updated.id, ip: req.ip });
    sendSuccess(res, { subject: updated });
  } catch (err) { next(err); }
});

router.delete('/subjects/:id', csrfProtection, async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const subject = await prisma.subject.findFirst({ where: { id: req.params.id, schoolId } });
    if (!subject) throw new AppError('Subject not found', 404);
    await prisma.subject.delete({ where: { id: req.params.id } });
    await logAction({ userId: req.user.id, schoolId, action: 'DELETE_SUBJECT', entity: 'Subject', entityId: req.params.id, ip: req.ip });
    sendSuccess(res, null, 204);
  } catch (err) { next(err); }
});

// ---------- Class-subject assignments ----------

router.get('/class-subjects', async (req, res, next) => {
  try {
    const where = schoolWhere(req.user);
    if (req.query.classId) where.classId = req.query.classId;
    if (req.query.subjectId) where.subjectId = req.query.subjectId;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const [items, total] = await prisma.$transaction([
      prisma.classSubject.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          class: { select: { id: true, name: true, level: true, arm: true } },
          subject: { select: { id: true, name: true, code: true } },
          teacher: { select: { id: true, name: true, staffId: true, email: true } }
        }
      }),
      prisma.classSubject.count({ where })
    ]);
    sendSuccess(res, { items, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

router.post('/class-subjects', csrfProtection, validate({ body: classSubjectSchema }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const { classId, subjectId, teacherId } = req.body;
    const cls = await prisma.class.findFirst({ where: { id: classId, schoolId } });
    if (!cls) throw new AppError('Class not found', 404);
    const subject = await prisma.subject.findFirst({ where: { id: subjectId, schoolId } });
    if (!subject) throw new AppError('Subject not found', 404);
    if (teacherId) {
      const teacher = await prisma.teacher.findFirst({ where: { id: teacherId, schoolId } });
      if (!teacher) throw new AppError('Teacher not found', 404);
    }
    const existing = await prisma.classSubject.findFirst({ where: { classId, subjectId } });
    if (existing) throw new AppError('Subject already assigned to this class', 409);
    const cs = await prisma.classSubject.create({ data: { schoolId, classId, subjectId, teacherId: teacherId || null } });
    await logAction({ userId: req.user.id, schoolId, action: 'CREATE_CLASS_SUBJECT', entity: 'ClassSubject', entityId: cs.id, ip: req.ip });
    sendSuccess(res, { classSubject: cs }, 201);
  } catch (err) { next(err); }
});

router.patch('/class-subjects/:id', csrfProtection, validate({ body: classSubjectSchema.partial() }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const cs = await prisma.classSubject.findFirst({ where: { id: req.params.id, schoolId } });
    if (!cs) throw new AppError('Class subject assignment not found', 404);
    const { classId, subjectId, teacherId } = req.body;
    const data = {};
    if (classId !== undefined) {
      const cls = await prisma.class.findFirst({ where: { id: classId, schoolId } });
      if (!cls) throw new AppError('Class not found', 404);
      data.classId = classId;
    }
    if (subjectId !== undefined) {
      const subject = await prisma.subject.findFirst({ where: { id: subjectId, schoolId } });
      if (!subject) throw new AppError('Subject not found', 404);
      data.subjectId = subjectId;
    }
    if (teacherId !== undefined) data.teacherId = teacherId || null;
    const updated = await prisma.classSubject.update({ where: { id: req.params.id }, data });
    await logAction({ userId: req.user.id, schoolId, action: 'UPDATE_CLASS_SUBJECT', entity: 'ClassSubject', entityId: updated.id, ip: req.ip });
    sendSuccess(res, { classSubject: updated });
  } catch (err) { next(err); }
});

router.delete('/class-subjects/:id', csrfProtection, async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const cs = await prisma.classSubject.findFirst({ where: { id: req.params.id, schoolId } });
    if (!cs) throw new AppError('Class subject assignment not found', 404);
    await prisma.classSubject.delete({ where: { id: req.params.id } });
    await logAction({ userId: req.user.id, schoolId, action: 'DELETE_CLASS_SUBJECT', entity: 'ClassSubject', entityId: req.params.id, ip: req.ip });
    sendSuccess(res, null, 204);
  } catch (err) { next(err); }
});

export default router;
