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

const studentSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  gender: z.string().optional().nullable(),
  dateOfBirth: z.string().datetime().optional().nullable(),
  address: z.string().optional().nullable(),
  photoUrl: z.string().url().optional().nullable(),
  status: z.enum(['ACTIVE', 'GRADUATED', 'TRANSFERRED', 'SUSPENDED']).optional()
});

const guardianSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  relationship: z.string().min(1, 'Relationship is required'),
  phone: z.string().min(1, 'Phone is required'),
  email: z.string().email('Invalid email').optional().nullable()
});

const enrollSchema = z.object({
  classId: z.string().cuid('Invalid class'),
  academicYearId: z.string().cuid('Invalid academic year')
});

// ---------- Students ----------

router.get('/', async (req, res, next) => {
  try {
    const where = { ...schoolWhere(req.user), deletedAt: null };
    if (req.query.search) {
      where.OR = [
        { firstName: { contains: req.query.search } },
        { lastName: { contains: req.query.search } },
        { admissionNumber: { contains: req.query.search } }
      ];
    }
    if (req.query.classId) where.classId = req.query.classId;
    if (req.query.status) where.status = req.query.status;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const [items, total] = await prisma.$transaction([
      prisma.student.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { createdAt: 'desc' },
        include: { guardians: true, enrollments: { orderBy: { createdAt: 'desc' }, take: 1, include: { class: true } } }
      }),
      prisma.student.count({ where })
    ]);
    sendSuccess(res, { items, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

router.post('/', csrfProtection, validate({ body: studentSchema }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    await enforceSchoolLimit(schoolId, 'students');
    const { firstName, lastName, gender, dateOfBirth, address, photoUrl, status } = req.body;
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { admissionPrefix: true } });
    const prefix = (school && school.admissionPrefix) ? school.admissionPrefix : 'S';
    const count = await prisma.student.count({ where: { schoolId } });
    const seq = count + 1;
    const admissionNumber = `${prefix}-${seq.toString().padStart(4, '0')}`;
    const student = await prisma.student.create({
      data: {
        schoolId, admissionNumber, firstName, lastName,
        gender: gender || null, dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        address: address || null, photoUrl: photoUrl || null,
        status: status || 'ACTIVE'
      }
    });
    await logAction({ userId: req.user.id, schoolId, action: 'CREATE_STUDENT', entity: 'Student', entityId: student.id, ip: req.ip });
    sendSuccess(res, { student }, 201);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const where = { ...schoolWhere(req.user, { id: req.params.id }), deletedAt: null };
    const student = await prisma.student.findFirst({
      where, include: { guardians: true, enrollments: { orderBy: { createdAt: 'desc' }, include: { class: true, academicYear: true } } }
    });
    if (!student) throw new AppError('Student not found', 404);
    sendSuccess(res, { student });
  } catch (err) { next(err); }
});

router.patch('/:id', csrfProtection, validate({ body: studentSchema.partial() }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const student = await prisma.student.findFirst({ where: { id: req.params.id, schoolId, deletedAt: null } });
    if (!student) throw new AppError('Student not found', 404);
    const { firstName, lastName, gender, dateOfBirth, address, photoUrl, status } = req.body;
    const data = {};
    if (firstName !== undefined) data.firstName = firstName;
    if (lastName !== undefined) data.lastName = lastName;
    if (gender !== undefined) data.gender = gender || null;
    if (dateOfBirth !== undefined) data.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
    if (address !== undefined) data.address = address || null;
    if (photoUrl !== undefined) data.photoUrl = photoUrl || null;
    if (status !== undefined) data.status = status;
    const updated = await prisma.student.update({ where: { id: req.params.id }, data });
    await logAction({ userId: req.user.id, schoolId, action: 'UPDATE_STUDENT', entity: 'Student', entityId: updated.id, ip: req.ip });
    sendSuccess(res, { student: updated });
  } catch (err) { next(err); }
});

router.delete('/:id', csrfProtection, async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const student = await prisma.student.findFirst({ where: { id: req.params.id, schoolId } });
    if (!student) throw new AppError('Student not found', 404);
    await prisma.student.update({ where: { id: req.params.id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
    await logAction({ userId: req.user.id, schoolId, action: 'DELETE_STUDENT', entity: 'Student', entityId: req.params.id, ip: req.ip });
    sendSuccess(res, null, 204);
  } catch (err) { next(err); }
});

// ---------- Guardians ----------

router.get('/:studentId/guardians', async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const student = await prisma.student.findFirst({ where: { id: req.params.studentId, schoolId } });
    if (!student) throw new AppError('Student not found', 404);
    const guardians = await prisma.guardian.findMany({ where: { studentId: req.params.studentId }, orderBy: { createdAt: 'desc' } });
    sendSuccess(res, { guardians });
  } catch (err) { next(err); }
});

router.post('/:studentId/guardians', csrfProtection, validate({ body: guardianSchema }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const student = await prisma.student.findFirst({ where: { id: req.params.studentId, schoolId } });
    if (!student) throw new AppError('Student not found', 404);
    const { name, relationship, phone, email } = req.body;
    const guardian = await prisma.guardian.create({
      data: { schoolId, studentId: req.params.studentId, name, relationship, phone, email: email || null }
    });
    await logAction({ userId: req.user.id, schoolId, action: 'CREATE_GUARDIAN', entity: 'Guardian', entityId: guardian.id, ip: req.ip });
    sendSuccess(res, { guardian }, 201);
  } catch (err) { next(err); }
});

router.patch('/guardians/:id', csrfProtection, validate({ body: guardianSchema.partial() }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const guardian = await prisma.guardian.findFirst({ where: { id: req.params.id, schoolId } });
    if (!guardian) throw new AppError('Guardian not found', 404);
    const updated = await prisma.guardian.update({ where: { id: req.params.id }, data: req.body });
    await logAction({ userId: req.user.id, schoolId, action: 'UPDATE_GUARDIAN', entity: 'Guardian', entityId: guardian.id, ip: req.ip });
    sendSuccess(res, { guardian: updated });
  } catch (err) { next(err); }
});

router.delete('/guardians/:id', csrfProtection, async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const guardian = await prisma.guardian.findFirst({ where: { id: req.params.id, schoolId } });
    if (!guardian) throw new AppError('Guardian not found', 404);
    await prisma.guardian.delete({ where: { id: req.params.id } });
    await logAction({ userId: req.user.id, schoolId, action: 'DELETE_GUARDIAN', entity: 'Guardian', entityId: req.params.id, ip: req.ip });
    sendSuccess(res, null, 204);
  } catch (err) { next(err); }
});

// ---------- Enrollment ----------

router.post('/:id/enroll', csrfProtection, validate({ body: enrollSchema }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const { classId, academicYearId } = req.body;
    const student = await prisma.student.findFirst({ where: { id: req.params.id, schoolId, deletedAt: null } });
    if (!student) throw new AppError('Student not found', 404);
    const cls = await prisma.class.findFirst({ where: { id: classId, schoolId } });
    if (!cls) throw new AppError('Class not found', 404);
    const year = await prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId } });
    if (!year) throw new AppError('Academic year not found', 404);
    const existing = await prisma.enrollment.findFirst({ where: { studentId: req.params.id, classId, academicYearId } });
    if (existing) throw new AppError('Student already enrolled in this class/year', 409);
    const enrollment = await prisma.enrollment.create({ data: { schoolId, studentId: req.params.id, classId, academicYearId } });
    await logAction({ userId: req.user.id, schoolId, action: 'ENROLL_STUDENT', entity: 'Enrollment', entityId: enrollment.id, ip: req.ip });
    sendSuccess(res, { enrollment }, 201);
  } catch (err) { next(err); }
});

export default router;
