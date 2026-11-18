import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { validate, validateQueryShape } from '../../middleware/validate.js';
import { globalLimiter } from '../../middleware/rateLimiter.js';
import { logAction } from '../../services/audit.service.js';
import { sendSuccess } from '../../utils/response.js';
import prisma from '../../utils/prisma.js';

const router = Router();
router.use(authenticate);
router.use(requireRole('SUPERADMIN'));
router.use(globalLimiter);
router.use(validateQueryShape);

const defaultSettings = {
  maintenanceMode: false,
  gracePeriodDays: 7,
  defaultPlanId: null,
  defaultGradeScale: [],
};

const settingsSchema = z.object({
  maintenanceMode: z.boolean().optional(),
  gracePeriodDays: z.number().int().min(0).max(90).optional(),
  defaultPlanId: z.string().cuid().nullable().optional(),
  defaultGradeScale: z.array(z.object({ minScore: z.number().min(0).max(100), maxScore: z.number().min(0).max(100), grade: z.string().min(1).max(5), remark: z.string().max(100).nullable().optional() })).optional(),
});

async function readSettings() {
  const records = await prisma.systemSetting.findMany({ where: { schoolId: 'platform' } });
  return records.reduce((settings, record) => ({ ...settings, [record.key]: record.value }), { ...defaultSettings });
}

router.get('/', async (req, res, next) => {
  try { sendSuccess(res, { settings: await readSettings() }); }
  catch (err) { next(err); }
});

router.patch('/', csrfProtection, validate({ body: settingsSchema }), async (req, res, next) => {
  try {
    await prisma.$transaction(Object.entries(req.body).map(([key, value]) => prisma.systemSetting.upsert({
      where: { key },
      create: { key, schoolId: 'platform', value },
      update: { value },
    })));
    await logAction({ userId: req.user.id, action: 'UPDATE_SYSTEM_SETTINGS', entity: 'SystemSettings', ip: req.ip });
    sendSuccess(res, { settings: await readSettings() });
  } catch (err) { next(err); }
});

export { readSettings as getSystemSettings };
export default router;
