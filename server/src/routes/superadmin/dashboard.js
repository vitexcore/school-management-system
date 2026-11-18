import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { globalLimiter } from '../../middleware/rateLimiter.js';
import { validateQueryShape } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/response.js';
import prisma from '../../utils/prisma.js';

const router = Router();
router.use(authenticate);
router.use(requireRole('SUPERADMIN'));
router.use(globalLimiter);
router.use(validateQueryShape);

router.get('/', async (req, res, next) => {
  try {
    const [
      totalSchools,
      activeSchools,
      totalStudents,
      totalTeachers,
      newSchoolsRaw,
      revenueRaw,
      schoolCollectionsRaw,
    ] = await prisma.$transaction([
      prisma.school.count(),
      prisma.school.count({ where: { status: 'ACTIVE' } }),
      prisma.student.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      prisma.teacher.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      prisma.$queryRaw`
        SELECT date_trunc('month', "createdAt") AS month, COUNT(*)::int AS count
        FROM "School"
        WHERE "createdAt" >= NOW() - INTERVAL '12 months'
        GROUP BY month ORDER BY month ASC
      `,
      prisma.$queryRaw`
        SELECT SUM(pl."priceMonthly") AS total
        FROM "Subscription" s
        JOIN "Plan" pl ON pl.id = s."planId"
        WHERE s.status IN ('ACTIVE', 'TRIAL')
          AND s."startsAt" <= NOW()
          AND s."endsAt" >= NOW()
      `,
      prisma.$queryRaw`
        SELECT SUM(p.amount) AS total
        FROM "Payment" p
        WHERE p.status = 'CONFIRMED'
      `,
    ]);

    const newSchoolsPerMonth = newSchoolsRaw.map((r) => ({
      month: r.month,
      count: r.count,
    }));

    const totalRevenue = revenueRaw[0]?.total ? Number(revenueRaw[0].total) : 0;
    const schoolCollections = schoolCollectionsRaw[0]?.total ? Number(schoolCollectionsRaw[0].total) : 0;

    sendSuccess(res, {
      totalSchools,
      activeSchools,
      totalStudents,
      totalTeachers,
      totalRevenue,
      schoolCollections,
      newSchoolsPerMonth,
    });
  } catch (err) { next(err); }
});

export default router;
