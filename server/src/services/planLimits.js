import prisma from '../utils/prisma.js';
import { AppError } from '../utils/response.js';

export async function enforceSchoolLimit(schoolId, resource) {
  const now = new Date();
  const subscription = await prisma.subscription.findFirst({
    where: { schoolId, status: { in: ['TRIAL', 'ACTIVE'] }, startsAt: { lte: now }, endsAt: { gte: now } },
    include: { plan: true },
    orderBy: { endsAt: 'desc' },
  });
  if (!subscription) return;

  const [students, teachers] = await Promise.all([
    prisma.student.count({ where: { schoolId, deletedAt: null } }),
    prisma.teacher.count({ where: { schoolId, deletedAt: null } }),
  ]);
  const [count, limit] = resource === 'students'
    ? [students, subscription.plan.maxStudents]
    : [teachers, subscription.plan.maxTeachers];
  if (count >= limit) throw new AppError(`The current plan allows up to ${limit} ${resource}`, 403);
}
