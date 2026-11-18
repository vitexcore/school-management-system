import crypto from 'crypto';
import prisma from '../utils/prisma.js';
import argon2 from 'argon2';
import { hashToken } from '../utils/tokens.js';
import { logAction } from './audit.service.js';
import { AppError } from '../middleware/errorHandler.js';

export async function listSchools({ page, limit, search, status }) {
  const where = {};
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { slug: { contains: search } },
      { email: { contains: search } },
    ];
  }
  if (status) where.status = status;

  const [items, total] = await prisma.$transaction([
    prisma.school.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { _count: { select: { users: true } } },
    }),
    prisma.school.count({ where }),
  ]);

  return { items, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getSchool(id, actorRole, actorSchoolId) {
  const school = await prisma.school.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });
  if (!school) throw new AppError('School not found', 404);
  if (actorRole === 'ADMIN' && actorSchoolId !== id) {
    throw new AppError('Forbidden', 403);
  }
  return school;
}

export async function createSchool(data, actorId, ip) {
  const school = await prisma.school.create({ data });
  await logAction({ userId: actorId, schoolId: school.id, action: 'CREATE_SCHOOL', entity: 'School', entityId: school.id, ip });
  return school;
}

export async function updateSchool(id, data, actorId, actorRole, actorSchoolId, ip) {
  await getSchool(id, actorRole, actorSchoolId);
  const school = await prisma.school.update({ where: { id }, data });
  await logAction({ userId: actorId, schoolId: id, action: 'UPDATE_SCHOOL', entity: 'School', entityId: id, ip });
  return school;
}

export async function deleteSchool(id, actorId, ip) {
  const school = await prisma.school.findUnique({ where: { id } });
  if (!school) throw new AppError('School not found', 404);
  await prisma.school.delete({ where: { id } });
  await logAction({ userId: actorId, schoolId: id, action: 'DELETE_SCHOOL', entity: 'School', entityId: id, ip });
}

export async function setSchoolStatus(id, status, actorId, ip) {
  const school = await prisma.school.findUnique({ where: { id } });
  if (!school) throw new AppError('School not found', 404);
  const updated = await prisma.school.update({ where: { id }, data: { status } });
  await logAction({ userId: actorId, schoolId: id, action: status === 'SUSPENDED' ? 'SUSPEND_SCHOOL' : 'REACTIVATE_SCHOOL', entity: 'School', entityId: id, ip });
  return updated;
}

export async function listSchoolAdmins(schoolId, actorRole, actorSchoolId) {
  if (actorRole === 'ADMIN' && actorSchoolId !== schoolId) {
    throw new AppError('Forbidden', 403);
  }
  return prisma.user.findMany({
    where: { schoolId, role: 'ADMIN' },
    select: { id: true, name: true, email: true, isActive: true, failedLogins: true, lockedUntil: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createSchoolAdmin(schoolId, data, actorId, ip) {
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) throw new AppError('School not found', 404);

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new AppError('Email already in use', 409);

  const passwordHash = await argon2.hash(data.password);
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash,
      role: 'ADMIN',
      schoolId,
      isActive: true,
    },
  });
  await logAction({ userId: actorId, schoolId, action: 'CREATE_ADMIN', entity: 'User', entityId: user.id, ip });
  return { id: user.id, name: user.name, email: user.email, isActive: user.isActive };
}

export async function resetAdminPassword(userId, newPassword, actorId, actorSchoolId, ip) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== 'ADMIN') throw new AppError('Admin not found', 404);
  if (actorSchoolId && user.schoolId !== actorSchoolId) throw new AppError('Forbidden', 403);

  const passwordHash = await argon2.hash(newPassword);
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, failedLogins: 0, lockedUntil: null },
  });
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await logAction({ userId: actorId, schoolId: user.schoolId, action: 'RESET_ADMIN_PASSWORD', entity: 'User', entityId: userId, ip });
  return { id: updated.id, email: updated.email };
}

export async function getAdminForToken(userId, ip) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, schoolId: true },
  });
  if (!user) throw new AppError('User not found', 404);
  return user;
}
