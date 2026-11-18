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

const yearSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  startDate: z.string().datetime('Invalid start date'),
  endDate: z.string().datetime('Invalid end date'),
  isCurrent: z.boolean().optional()
});

const termSchema = z.object({
  academicYearId: z.string().cuid('Invalid academic year'),
  name: z.string().min(1, 'Name is required'),
  startDate: z.string().datetime('Invalid start date'),
  endDate: z.string().datetime('Invalid end date'),
  isCurrent: z.boolean().optional()
});

// ---------- Academic Years ----------

router.get('/years', async (req, res, next) => {
  try {
    const where = schoolWhere(req.user);
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const [items, total] = await prisma.$transaction([
      prisma.academicYear.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { terms: true, enrollments: true } } }
      }),
      prisma.academicYear.count({ where })
    ]);
    sendSuccess(res, { items, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

router.post('/years', csrfProtection, validate({ body: yearSchema }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const { name, startDate, endDate, isCurrent } = req.body;
    if (isCurrent === true) {
      await prisma.academicYear.updateMany({ where: { schoolId, isCurrent: true }, data: { isCurrent: false } });
    }
    const year = await prisma.academicYear.create({
      data: { schoolId, name, startDate: new Date(startDate), endDate: new Date(endDate), isCurrent: isCurrent === true }
    });
    await logAction({ userId: req.user.id, schoolId, action: 'CREATE_ACADEMIC_YEAR', entity: 'AcademicYear', entityId: year.id, ip: req.ip });
    sendSuccess(res, { year }, 201);
  } catch (err) { next(err); }
});

router.get('/years/:id', async (req, res, next) => {
  try {
    const where = schoolWhere(req.user, { id: req.params.id });
    const year = await prisma.academicYear.findFirst({ where });
    if (!year) throw new AppError('Academic year not found', 404);
    sendSuccess(res, { year });
  } catch (err) { next(err); }
});

router.patch('/years/:id', csrfProtection, validate({ body: yearSchema.partial() }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const year = await prisma.academicYear.findFirst({ where: { id: req.params.id, schoolId } });
    if (!year) throw new AppError('Academic year not found', 404);
    const { name, startDate, endDate, isCurrent } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (startDate !== undefined) data.startDate = new Date(startDate);
    if (endDate !== undefined) data.endDate = new Date(endDate);
    if (isCurrent === true) {
      await prisma.academicYear.updateMany({ where: { schoolId, isCurrent: true }, data: { isCurrent: false } });
      data.isCurrent = true;
    } else if (isCurrent === false) data.isCurrent = false;
    const updated = await prisma.academicYear.update({ where: { id: req.params.id }, data });
    await logAction({ userId: req.user.id, schoolId, action: 'UPDATE_ACADEMIC_YEAR', entity: 'AcademicYear', entityId: updated.id, ip: req.ip });
    sendSuccess(res, { year: updated });
  } catch (err) { next(err); }
});

router.delete('/years/:id', csrfProtection, async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const year = await prisma.academicYear.findFirst({ where: { id: req.params.id, schoolId } });
    if (!year) throw new AppError('Academic year not found', 404);
    await prisma.academicYear.delete({ where: { id: req.params.id } });
    await logAction({ userId: req.user.id, schoolId, action: 'DELETE_ACADEMIC_YEAR', entity: 'AcademicYear', entityId: req.params.id, ip: req.ip });
    sendSuccess(res, null, 204);
  } catch (err) { next(err); }
});

router.post('/years/:id/set-current', csrfProtection, async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const year = await prisma.academicYear.findFirst({ where: { id: req.params.id, schoolId } });
    if (!year) throw new AppError('Academic year not found', 404);
    await prisma.academicYear.updateMany({ where: { schoolId }, data: { isCurrent: false } });
    const updated = await prisma.academicYear.update({ where: { id: req.params.id }, data: { isCurrent: true } });
    await logAction({ userId: req.user.id, schoolId, action: 'SET_CURRENT_ACADEMIC_YEAR', entity: 'AcademicYear', entityId: updated.id, ip: req.ip });
    sendSuccess(res, { year: updated });
  } catch (err) { next(err); }
});

// ---------- Terms ----------

router.get('/terms', async (req, res, next) => {
  try {
    const where = schoolWhere(req.user);
    if (req.query.academicYearId) where.academicYearId = req.query.academicYearId;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const [items, total] = await prisma.$transaction([
      prisma.term.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { createdAt: 'desc' },
        include: { academicYear: { select: { id: true, name: true } } }
      }),
      prisma.term.count({ where })
    ]);
    sendSuccess(res, { items, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

router.post('/terms', csrfProtection, validate({ body: termSchema }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const { academicYearId, name, startDate, endDate, isCurrent } = req.body;
    const year = await prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId } });
    if (!year) throw new AppError('Academic year not found', 404);
    if (isCurrent === true) {
      await prisma.term.updateMany({ where: { schoolId, isCurrent: true }, data: { isCurrent: false } });
    }
    const term = await prisma.term.create({
      data: { schoolId, academicYearId, name, startDate: new Date(startDate), endDate: new Date(endDate), isCurrent: isCurrent === true }
    });
    await logAction({ userId: req.user.id, schoolId, action: 'CREATE_TERM', entity: 'Term', entityId: term.id, ip: req.ip });
    sendSuccess(res, { term }, 201);
  } catch (err) { next(err); }
});

router.get('/terms/:id', async (req, res, next) => {
  try {
    const where = schoolWhere(req.user, { id: req.params.id });
    const term = await prisma.term.findFirst({ where, include: { academicYear: true } });
    if (!term) throw new AppError('Term not found', 404);
    sendSuccess(res, { term });
  } catch (err) { next(err); }
});

router.patch('/terms/:id', csrfProtection, validate({ body: termSchema.partial() }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const term = await prisma.term.findFirst({ where: { id: req.params.id, schoolId } });
    if (!term) throw new AppError('Term not found', 404);
    const { academicYearId, name, startDate, endDate, isCurrent } = req.body;
    const data = {};
    if (academicYearId !== undefined) {
      const year = await prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId } });
      if (!year) throw new AppError('Academic year not found', 404);
      data.academicYearId = academicYearId;
    }
    if (name !== undefined) data.name = name;
    if (startDate !== undefined) data.startDate = new Date(startDate);
    if (endDate !== undefined) data.endDate = new Date(endDate);
    if (isCurrent === true) {
      await prisma.term.updateMany({ where: { schoolId, isCurrent: true }, data: { isCurrent: false } });
      data.isCurrent = true;
    } else if (isCurrent === false) data.isCurrent = false;
    const updated = await prisma.term.update({ where: { id: req.params.id }, data });
    await logAction({ userId: req.user.id, schoolId, action: 'UPDATE_TERM', entity: 'Term', entityId: updated.id, ip: req.ip });
    sendSuccess(res, { term: updated });
  } catch (err) { next(err); }
});

router.delete('/terms/:id', csrfProtection, async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const term = await prisma.term.findFirst({ where: { id: req.params.id, schoolId } });
    if (!term) throw new AppError('Term not found', 404);
    await prisma.term.delete({ where: { id: req.params.id } });
    await logAction({ userId: req.user.id, schoolId, action: 'DELETE_TERM', entity: 'Term', entityId: req.params.id, ip: req.ip });
    sendSuccess(res, null, 204);
  } catch (err) { next(err); }
});

router.post('/terms/:id/set-current', csrfProtection, async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const term = await prisma.term.findFirst({ where: { id: req.params.id, schoolId } });
    if (!term) throw new AppError('Term not found', 404);
    await prisma.term.updateMany({ where: { schoolId }, data: { isCurrent: false } });
    const updated = await prisma.term.update({ where: { id: req.params.id }, data: { isCurrent: true } });
    await logAction({ userId: req.user.id, schoolId, action: 'SET_CURRENT_TERM', entity: 'Term', entityId: updated.id, ip: req.ip });
    sendSuccess(res, { term: updated });
  } catch (err) { next(err); }
});

export default router;
