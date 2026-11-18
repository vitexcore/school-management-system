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

const attendanceSchema = z.object({
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
  note: z.string().optional()
});

const markSchema = z.object({
  classId: z.string().cuid('Invalid class'),
  date: z.string().datetime('Invalid date'),
  records: z.array(z.object({
    studentId: z.string().cuid('Invalid student'),
    status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
    note: z.string().optional()
  }))
});

const isNotFuture = (dateStr) => {
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return d <= now;
};

// Mark a whole class for a date (upsert per student)
router.post('/mark', csrfProtection, validate({ body: markSchema }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const { classId, date, records } = req.body;
    if (!isNotFuture(date)) throw new AppError('Cannot mark future dates', 400);
    const cls = await prisma.class.findFirst({ where: { id: classId, schoolId } });
    if (!cls) throw new AppError('Class not found', 404);
    const enrollments = await prisma.enrollment.findMany({ where: { classId, schoolId }, include: { student: { where: { deletedAt: null } } } });
    const enrolled = new Set(enrollments.map(e => e.studentId).filter(Boolean));
    for (const r of records) {
      if (!enrolled.has(r.studentId)) throw new AppError(`Student ${r.studentId} not enrolled in class`, 400);
      const existing = await prisma.attendance.findFirst({ where: { studentId: r.studentId, date: new Date(date), schoolId } });
      if (existing) {
        await prisma.attendance.update({ where: { id: existing.id }, data: { status: r.status, note: r.note || null, markedBy: req.user.id } });
      } else {
        await prisma.attendance.create({ data: { schoolId, studentId: r.studentId, classId, date: new Date(date), status: r.status, note: r.note || null, markedBy: req.user.id } });
      }
    }
    await logAction({ userId: req.user.id, schoolId, action: 'MARK_ATTENDANCE', entity: 'Attendance', entityId: classId, ip: req.ip });
    sendSuccess(res, { marked: records.length });
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const where = schoolWhere(req.user);
    if (req.query.classId) where.classId = req.query.classId;
    if (req.query.studentId) where.studentId = req.query.studentId;
    if (req.query.startDate) where.date = { ...(where.date || {}), gte: new Date(req.query.startDate) };
    if (req.query.endDate) where.date = { ...(where.date || {}), lte: new Date(req.query.endDate) };
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const [items, total] = await prisma.$transaction([
      prisma.attendance.findMany({
        where, skip: (page - 1) * limit, take: limit, orderBy: { date: 'desc' },
        include: { student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } } }
      }),
      prisma.attendance.count({ where })
    ]);
    sendSuccess(res, { items, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

router.get('/history/:studentId', async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const student = await prisma.student.findFirst({ where: { id: req.params.studentId, schoolId } });
    if (!student) throw new AppError('Student not found', 404);
    const attendances = await prisma.attendance.findMany({ where: { studentId: req.params.studentId, schoolId }, orderBy: { date: 'desc' }, take: 100 });
    sendSuccess(res, { attendances });
  } catch (err) { next(err); }
});

router.get('/summary', async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const { classId, startDate, endDate } = req.query;
    if (!classId) throw new AppError('classId is required', 400);
    const enrollments = await prisma.enrollment.findMany({ where: { classId, schoolId }, include: { student: true } });
    const where = { schoolId, classId };
    if (startDate) where.date = { ...(where.date || {}), gte: new Date(startDate) };
    if (endDate) where.date = { ...(where.date || {}), lte: new Date(endDate) };
    const attends = await prisma.attendance.findMany({ where });
    const byStudent = {};
    for (const e of enrollments) byStudent[e.studentId] = { student: e.student, total: 0, present: 0 };
    for (const a of attends) {
      if (byStudent[a.studentId]) {
        byStudent[a.studentId].total++;
        if (a.status === 'PRESENT') byStudent[a.studentId].present++;
      }
    }
    const summary = Object.values(byStudent).map(s => ({ ...s, percentage: s.total > 0 ? Math.round((s.present / s.total) * 100) : 0 }));
    summary.sort((a, b) => b.percentage - a.percentage);
    const overall = summary.length > 0 ? Math.round(summary.reduce((s, x) => s + x.percentage, 0) / summary.length) : 0;
    sendSuccess(res, { summary, overall, classId });
  } catch (err) { next(err); }
});

router.patch('/:id', csrfProtection, validate({ body: attendanceSchema.partial() }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const att = await prisma.attendance.findFirst({ where: { id: req.params.id, schoolId } });
    if (!att) throw new AppError('Attendance record not found', 404);
    const d = new Date(att.date); d.setHours(0, 0, 0, 0);
    const now = new Date(); now.setHours(0, 0, 0, 0);
    if (d > now) throw new AppError('Cannot edit future attendance', 400);
    const updated = await prisma.attendance.update({ where: { id: req.params.id }, data: req.body });
    await logAction({ userId: req.user.id, schoolId, action: 'EDIT_ATTENDANCE', entity: 'Attendance', entityId: att.id, ip: req.ip });
    sendSuccess(res, { attendance: updated });
  } catch (err) { next(err); }
});

export default router;
