import { AppError } from '../utils/response.js';
import prisma from '../utils/prisma.js';

/**
 * Middleware that binds the request to the authenticated admin's school.
 * School-scoped routes are ADMIN-only; the SUPERADMIN does not access them
 * unless an explicit "view as school" feature is added later.
 */
export async function tenantScope(req, res, next) {
  if (req.user.role === 'ADMIN' && !req.user.schoolId) {
    return res.status(403).json({ success: false, error: 'No school associated with this account' });
  }
  req.schoolId = req.user.schoolId || null;
  if (!req.schoolId) return next();
  try {
    const school = await prisma.school.findUnique({ where: { id: req.schoolId }, select: { status: true } });
    if (!school || school.status !== 'ACTIVE') {
      return res.status(403).json({ success: false, error: 'School access is suspended' });
    }
    next();
  } catch (err) { next(err); }
}
