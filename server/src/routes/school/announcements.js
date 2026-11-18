import { Router } from 'express';
import { z } from 'zod';
import sanitizeHtml from 'sanitize-html';
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

const announcementSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  audience: z.enum(['ALL', 'TEACHERS', 'STUDENTS', 'CLASS']),
  classId: z.string().cuid().optional().nullable(),
  pinned: z.boolean().optional().default(false),
  publishAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional().nullable(),
});

const ALLOWED_HTML = {
  allowedTags: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'a'],
  allowedAttributes: { a: ['href', 'target'] },
};

router.get('/', async (req, res, next) => {
  try {
    const where = schoolWhere(req.user);
    if (req.query.audience) where.audience = req.query.audience;
    const now = new Date();
    if (req.query.active === 'true') {
      where.publishAt = { lte: now };
      where.OR = [{ expiresAt: null }, { expiresAt: { gte: now } }];
    }
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const [items, total] = await prisma.$transaction([
      prisma.announcement.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: [{ pinned: 'desc' }, { publishAt: 'desc' }],
        include: { class: { select: { id: true, name: true } } },
      }),
      prisma.announcement.count({ where }),
    ]);
    sendSuccess(res, { items, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

router.post('/', csrfProtection, validate({ body: announcementSchema }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const data = { ...req.body, body: sanitizeHtml(req.body.body, ALLOWED_HTML) };

    if (data.audience === 'CLASS' && !data.classId) {
      throw new AppError('classId is required for CLASS audience', 400);
    }
    if (data.audience !== 'CLASS') data.classId = null;
    if (data.classId) {
      const schoolClass = await prisma.class.findFirst({ where: { id: data.classId, schoolId }, select: { id: true } });
      if (!schoolClass) throw new AppError('Class not found', 404);
    }

    const announcement = await prisma.announcement.create({
      data: { schoolId, ...data, createdBy: req.user.id },
    });
    await logAction({ userId: req.user.id, schoolId, action: 'CREATE_ANNOUNCEMENT', entity: 'Announcement', entityId: announcement.id, ip: req.ip });
    sendSuccess(res, { announcement }, 201);
  } catch (err) { next(err); }
});

router.patch('/:id', csrfProtection, validate({ params: idParam }), validate({ body: announcementSchema.partial() }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const existing = await prisma.announcement.findFirst({ where: { id: req.params.id, schoolId } });
    if (!existing) throw new AppError('Announcement not found', 404);
    const data = { ...req.body };
    const audience = data.audience ?? existing.audience;
    const classId = data.classId === undefined ? existing.classId : data.classId;
    if (audience === 'CLASS' && !classId) throw new AppError('classId is required for CLASS audience', 400);
    if (audience !== 'CLASS') data.classId = null;
    else if (data.classId === undefined) data.classId = classId;
    if (data.body) data.body = sanitizeHtml(data.body, ALLOWED_HTML);
    if (data.classId) {
      const schoolClass = await prisma.class.findFirst({ where: { id: data.classId, schoolId }, select: { id: true } });
      if (!schoolClass) throw new AppError('Class not found', 404);
    }
    const announcement = await prisma.announcement.update({ where: { id: req.params.id }, data });
    sendSuccess(res, { announcement });
  } catch (err) { next(err); }
});

router.delete('/:id', csrfProtection, validate({ params: idParam }), validateEmptyBody, async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const existing = await prisma.announcement.findFirst({ where: { id: req.params.id, schoolId } });
    if (!existing) throw new AppError('Announcement not found', 404);
    await prisma.announcement.delete({ where: { id: req.params.id } });
    sendSuccess(res, null, 204);
  } catch (err) { next(err); }
});

export default router;
