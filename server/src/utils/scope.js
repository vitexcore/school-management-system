import { AppError } from './response.js';

/**
 * Build a Prisma where clause scoped to the authenticated admin's school.
 * The schoolId always comes from the authenticated user (session cookie),
 * never from request body or params, so an admin cannot reach another
 * school's records by guessing ids.
 */
export function schoolWhere(user, extra = {}) {
  if (user.role === 'ADMIN' && !user.schoolId) {
    throw new AppError('No school associated with this account', 403);
  }
  return user.schoolId ? { schoolId: user.schoolId, ...extra } : { ...extra };
}

export function assertSchoolAccess(user) {
  if (user.role === 'ADMIN' && !user.schoolId) {
    throw new AppError('No school associated with this account', 403);
  }
  return user.schoolId;
}
