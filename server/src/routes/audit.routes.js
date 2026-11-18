import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as auditController from '../controllers/audit.controller.js';
import { auditLogQuerySchema } from '../validators/school.validators.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('SUPERADMIN'));

router.get('/', validate({ query: auditLogQuerySchema }), auditController.getAuditLogs);

export default router;
