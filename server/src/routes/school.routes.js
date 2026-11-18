import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import { validate } from '../middleware/validate.js';
import * as schoolController from '../controllers/school.controller.js';
import {
  createSchoolSchema,
  updateSchoolSchema,
  createAdminSchema,
  resetPasswordSchema,
  auditLogQuerySchema,
  idParamSchema,
  schoolIdParamSchema,
} from '../validators/school.validators.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('SUPERADMIN'));

// Schools
router.get('/schools', validate({ query: auditLogQuerySchema }), schoolController.listSchools);
router.post('/schools', csrfProtection, validate({ body: createSchoolSchema }), schoolController.createSchool);
router.get('/schools/:id', validate({ params: idParamSchema }), schoolController.getSchool);
router.patch('/schools/:id', csrfProtection, validate({ params: idParamSchema }), validate({ body: updateSchoolSchema }), schoolController.updateSchool);
router.delete('/schools/:id', csrfProtection, validate({ params: idParamSchema }), schoolController.deleteSchool);
router.post('/schools/:id/suspend', csrfProtection, validate({ params: idParamSchema }), schoolController.suspendSchool);
router.post('/schools/:id/reactivate', csrfProtection, validate({ params: idParamSchema }), schoolController.reactivateSchool);

// Admins (per school)
router.get('/schools/:schoolId/admins', validate({ params: schoolIdParamSchema }), schoolController.listSchoolAdmins);
router.post('/schools/:schoolId/admins', csrfProtection, validate({ params: schoolIdParamSchema }), validate({ body: createAdminSchema }), schoolController.createSchoolAdmin);

// Reset admin password (top-level, not school-scoped in the URL)
router.post('/admins/:id/reset-password', csrfProtection, validate({ params: idParamSchema }), validate({ body: resetPasswordSchema }), schoolController.resetAdminPassword);

export default router;
