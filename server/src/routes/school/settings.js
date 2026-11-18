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

const gradeScaleSchema = z.object({
  minScore: z.number(),
  maxScore: z.number(),
  grade: z.string().min(1, 'Grade is required'),
  remark: z.string().optional().nullable()
});

const schoolProfileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email('Invalid email').optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  logoUrl: z.string().url().optional().nullable(),
  admissionPrefix: z.string().min(1).max(10).optional(),
  blockReportCardsForUnpaid: z.boolean().optional()
});

// ---------- Grade scale ----------

router.get('/grade-scale', async (req, res, next) => {
  try {
    const where = schoolWhere(req.user);
    const rows = await prisma.gradeScale.findMany({ where, orderBy: { minScore: 'asc' } });
    sendSuccess(res, { gradeScale: rows });
  } catch (err) { next(err); }
});

router.post('/grade-scale', csrfProtection, validate({ body: gradeScaleSchema }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const { minScore, maxScore, grade, remark } = req.body;
    if (minScore > maxScore) throw new AppError('minScore must be <= maxScore', 400);
    const row = await prisma.gradeScale.create({ data: { schoolId, minScore, maxScore, grade, remark: remark || null } });
    await logAction({ userId: req.user.id, schoolId, action: 'CREATE_GRADE_SCALE', entity: 'GradeScale', entityId: row.id, ip: req.ip });
    sendSuccess(res, { gradeScale: row }, 201);
  } catch (err) { next(err); }
});

router.patch('/grade-scale/:id', csrfProtection, validate({ body: gradeScaleSchema.partial() }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const row = await prisma.gradeScale.findFirst({ where: { id: req.params.id, schoolId } });
    if (!row) throw new AppError('Grade scale not found', 404);
    const { minScore, maxScore, grade, remark } = req.body;
    const data = {};
    if (minScore !== undefined) data.minScore = minScore;
    if (maxScore !== undefined) data.maxScore = maxScore;
    if (data.minScore !== undefined && data.maxScore !== undefined && data.minScore > data.maxScore) throw new AppError('minScore must be <= maxScore', 400);
    if (minScore === undefined && maxScore !== undefined && maxScore < row.minScore) throw new AppError('maxScore must be >= minScore', 400);
    if (maxScore === undefined && minScore !== undefined && minScore > row.maxScore) throw new AppError('minScore must be <= maxScore', 400);
    if (grade !== undefined) data.grade = grade;
    if (remark !== undefined) data.remark = remark || null;
    const updated = await prisma.gradeScale.update({ where: { id: req.params.id }, data });
    await logAction({ userId: req.user.id, schoolId, action: 'UPDATE_GRADE_SCALE', entity: 'GradeScale', entityId: updated.id, ip: req.ip });
    sendSuccess(res, { gradeScale: updated });
  } catch (err) { next(err); }
});

router.delete('/grade-scale/:id', csrfProtection, async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const row = await prisma.gradeScale.findFirst({ where: { id: req.params.id, schoolId } });
    if (!row) throw new AppError('Grade scale not found', 404);
    await prisma.gradeScale.delete({ where: { id: req.params.id } });
    await logAction({ userId: req.user.id, schoolId, action: 'DELETE_GRADE_SCALE', entity: 'GradeScale', entityId: req.params.id, ip: req.ip });
    sendSuccess(res, null, 204);
  } catch (err) { next(err); }
});

router.post('/grade-scale/seed-default', csrfProtection, async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const existing = await prisma.gradeScale.findFirst({ where: { schoolId } });
    if (existing) throw new AppError('Grade scale already exists', 409);
    const defaults = [
      { minScore: 70, maxScore: 100, grade: 'A', remark: 'Excellent' },
      { minScore: 60, maxScore: 69, grade: 'B', remark: 'Very Good' },
      { minScore: 50, maxScore: 59, grade: 'C', remark: 'Good' },
      { minScore: 45, maxScore: 49, grade: 'D', remark: 'Fair' },
      { minScore: 40, maxScore: 44, grade: 'E', remark: 'Pass' },
      { minScore: 0, maxScore: 39, grade: 'F', remark: 'Fail' }
    ];
    const rows = await prisma.gradeScale.createMany({ data: defaults.map(d => ({ ...d, schoolId })) });
    await logAction({ userId: req.user.id, schoolId, action: 'SEED_GRADE_SCALE', entity: 'GradeScale', entityId: null, ip: req.ip });
    sendSuccess(res, { gradeScale: rows }, 201);
  } catch (err) { next(err); }
});

// ---------- School profile ----------

router.get('/school', async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new AppError('School not found', 404);
    sendSuccess(res, { school });
  } catch (err) { next(err); }
});

router.patch('/school', csrfProtection, validate({ body: schoolProfileSchema }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const { name, email, phone, address, logoUrl, admissionPrefix, blockReportCardsForUnpaid } = req.body;
    if (email) {
      const existing = await prisma.school.findFirst({ where: { email, NOT: { id: schoolId } } });
      if (existing) throw new AppError('Email already in use', 409);
    }
    const data = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email || null;
    if (phone !== undefined) data.phone = phone || null;
    if (address !== undefined) data.address = address || null;
    if (logoUrl !== undefined) data.logoUrl = logoUrl || null;
    if (admissionPrefix !== undefined) data.admissionPrefix = admissionPrefix;
    if (blockReportCardsForUnpaid !== undefined) data.blockReportCardsForUnpaid = blockReportCardsForUnpaid;
    const updated = await prisma.school.update({ where: { id: schoolId }, data });
    await logAction({ userId: req.user.id, schoolId, action: 'UPDATE_SCHOOL_PROFILE', entity: 'School', entityId: schoolId, ip: req.ip });
    sendSuccess(res, { school: updated });
  } catch (err) { next(err); }
});

export default router;
