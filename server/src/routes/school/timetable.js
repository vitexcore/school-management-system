import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { tenantScope } from '../../middleware/tenantScope.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { validate, validateEmptyBody, validateQueryShape } from '../../middleware/validate.js';
import { globalLimiter } from '../../middleware/rateLimiter.js';
import { schoolWhere, assertSchoolAccess } from '../../utils/scope.js';
import { logAction } from '../../services/audit.service.js';
import { sendSuccess, AppError } from '../../utils/response.js';
import prisma from '../../utils/prisma.js';

const router = Router();
router.use(authenticate);
router.use(requireRole('ADMIN'));
router.use(tenantScope);
router.use(globalLimiter);
router.use(validateQueryShape);

const idParam = z.object({ id: z.string().cuid() });

const slotSchema = z.object({
  classId: z.string().cuid(),
  classSubjectId: z.string().cuid(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a valid HH:MM time'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a valid HH:MM time'),
  room: z.string().max(50).optional().nullable(),
});

export function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export function findSlotClashes(slot, existingSlots, teacherId = null) {
  const startMins = timeToMinutes(slot.startTime);
  const endMins = timeToMinutes(slot.endTime);
  if (startMins >= endMins) return ['Start time must be before end time'];
  const clashes = [];
  for (const existing of existingSlots) {
    if (!overlaps(startMins, endMins, timeToMinutes(existing.startTime), timeToMinutes(existing.endTime))) continue;
    if (existing.classId === slot.classId) clashes.push(`Class is already booked at this time (${existing.startTime}–${existing.endTime})`);
    if (teacherId && existing.classSubject?.teacherId === teacherId) clashes.push(`Teacher is already scheduled at this time (${existing.startTime}–${existing.endTime})`);
    if (slot.room && existing.room && existing.room === slot.room) clashes.push(`Room "${slot.room}" is already booked at this time (${existing.startTime}–${existing.endTime})`);
  }
  return clashes;
}

async function detectClashes(schoolId, slot, excludeId) {
  const { classId, classSubjectId, dayOfWeek, startTime, endTime } = slot;
  const targetSubject = await prisma.classSubject.findFirst({
    where: { id: classSubjectId, schoolId, classId },
    select: { teacherId: true },
  });
  if (!targetSubject) return ['Class subject assignment not found'];

  const existing = await prisma.timetableSlot.findMany({
    where: { schoolId, dayOfWeek, id: excludeId ? { not: excludeId } : undefined },
    include: { classSubject: { include: { teacher: true } } },
  });

  return findSlotClashes(slot, existing, targetSubject.teacherId);
}

router.get('/', async (req, res, next) => {
  try {
    const where = schoolWhere(req.user);
    if (req.query.classId) where.classId = req.query.classId;
    if (req.query.teacherId) {
      where.classSubject = { teacherId: req.query.teacherId };
    }
    const slots = await prisma.timetableSlot.findMany({
      where,
      include: {
        class: { select: { id: true, name: true } },
        classSubject: {
          include: {
            subject: { select: { id: true, name: true } },
            teacher: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
    sendSuccess(res, { slots });
  } catch (err) { next(err); }
});

router.post('/', csrfProtection, validate({ body: slotSchema }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const [schoolClass, classSubject] = await Promise.all([
      prisma.class.findFirst({ where: { id: req.body.classId, schoolId }, select: { id: true } }),
      prisma.classSubject.findFirst({ where: { id: req.body.classSubjectId, schoolId }, select: { id: true, classId: true } }),
    ]);
    if (!schoolClass || !classSubject || classSubject.classId !== req.body.classId) throw new AppError('Class or subject assignment not found', 404);
    const clashes = await detectClashes(schoolId, req.body, null);
    if (clashes.length > 0) throw new AppError(clashes.join('; '), 409);

    const slot = await prisma.timetableSlot.create({
      data: { schoolId, ...req.body },
    });
    await logAction({ userId: req.user.id, schoolId, action: 'CREATE_TIMETABLE_SLOT', entity: 'TimetableSlot', entityId: slot.id, ip: req.ip });
    sendSuccess(res, { slot }, 201);
  } catch (err) { next(err); }
});

router.patch('/:id', csrfProtection, validate({ params: idParam }), validate({ body: slotSchema.partial() }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const existing = await prisma.timetableSlot.findFirst({ where: { id: req.params.id, schoolId } });
    if (!existing) throw new AppError('Timetable slot not found', 404);

    const merged = { ...existing, ...req.body };
    const classSubject = await prisma.classSubject.findFirst({ where: { id: merged.classSubjectId, schoolId, classId: merged.classId }, select: { id: true } });
    if (!classSubject) throw new AppError('Class subject assignment not found', 404);
    const clashes = await detectClashes(schoolId, merged, req.params.id);
    if (clashes.length > 0) throw new AppError(clashes.join('; '), 409);

    const slot = await prisma.timetableSlot.update({ where: { id: req.params.id }, data: req.body });
    await logAction({ userId: req.user.id, schoolId, action: 'UPDATE_TIMETABLE_SLOT', entity: 'TimetableSlot', entityId: slot.id, ip: req.ip });
    sendSuccess(res, { slot });
  } catch (err) { next(err); }
});

router.delete('/:id', csrfProtection, validate({ params: idParam }), validateEmptyBody, async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const existing = await prisma.timetableSlot.findFirst({ where: { id: req.params.id, schoolId } });
    if (!existing) throw new AppError('Timetable slot not found', 404);
    await prisma.timetableSlot.delete({ where: { id: req.params.id } });
    await logAction({ userId: req.user.id, schoolId, action: 'DELETE_TIMETABLE_SLOT', entity: 'TimetableSlot', entityId: req.params.id, ip: req.ip });
    sendSuccess(res, null, 204);
  } catch (err) { next(err); }
});

export default router;
