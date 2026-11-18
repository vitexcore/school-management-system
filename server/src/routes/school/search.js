import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { tenantScope } from '../../middleware/tenantScope.js';
import { validate } from '../../middleware/validate.js';
import { globalLimiter } from '../../middleware/rateLimiter.js';
import { schoolWhere } from '../../utils/scope.js';
import { sendSuccess, AppError } from '../../utils/response.js';
import prisma from '../../utils/prisma.js';

const router = Router();
router.use(authenticate);
router.use(requireRole('ADMIN'));
router.use(tenantScope);
router.use(globalLimiter);

const searchQuery = z.object({
  q: z.string().min(1).max(100),
});

router.get('/', validate({ query: searchQuery }), async (req, res, next) => {
  try {
    const where = schoolWhere(req.user);
    const q = req.query.q;
    const term = { contains: q, mode: 'insensitive' };

    const [students, teachers] = await Promise.all([
      prisma.student.findMany({
        where: {
          ...where,
          deletedAt: null,
          OR: [
            { firstName: term },
            { lastName: term },
            { admissionNumber: term },
          ],
        },
        select: { id: true, firstName: true, lastName: true, admissionNumber: true, photoUrl: true },
        take: 10,
      }),
      prisma.teacher.findMany({
        where: {
          ...where,
          deletedAt: null,
          OR: [
            { name: term },
            { email: term },
            { staffId: term },
          ],
        },
        select: { id: true, name: true, email: true, staffId: true },
        take: 10,
      }),
    ]);

    sendSuccess(res, { students, teachers });
  } catch (err) { next(err); }
});

export default router;
