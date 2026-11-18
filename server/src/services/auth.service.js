import crypto from 'crypto';
import prisma from '../utils/prisma.js';
import argon2 from 'argon2';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { hashToken, verifyTokenHash } from '../utils/tokens.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAction } from './audit.service.js';

const MAX_FAILED_LOGINS = Number(process.env.MAX_FAILED_LOGINS || 5);
const LOCKOUT_MINUTES = Number(process.env.LOCKOUT_MINUTES || 15);
const REFRESH_TTL_DAYS = 7;

function nowPlusDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function dummyHash() {
  await argon2.hash('x');
}

async function recordFailure(user) {
  const failedLogins = (user.failedLogins || 0) + 1;
  const data = { failedLogins };
  if (failedLogins >= MAX_FAILED_LOGINS) {
    data.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
  }
  await prisma.user.update({ where: { id: user.id }, data });
}

export async function login({ email, password, ip, userAgent }) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { school: true },
  });

  if (user) {
    const passwordValid = await argon2.verify(user.passwordHash, password);
    if (!passwordValid) {
      await recordFailure(user);
      throw new AppError('Invalid email or password', 401);
    }
  } else {
    await dummyHash();
    throw new AppError('Invalid email or password', 401);
  }

  if (!user.isActive) {
    throw new AppError('Invalid email or password', 401);
  }

  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    throw new AppError('Invalid email or password', 401);
  }

  if (user.school && user.school.status === 'SUSPENDED') {
    throw new AppError('Invalid email or password', 401);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null },
  });

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    schoolId: user.schoolId,
  });
  const refreshToken = signRefreshToken({ sub: user.id, jti: crypto.randomUUID() });
  const tokenHash = await hashToken(refreshToken);
  await prisma.refreshToken.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: nowPlusDays(REFRESH_TTL_DAYS),
    },
  });

  await logAction({ userId: user.id, schoolId: user.schoolId, action: 'LOGIN', entity: 'User', entityId: user.id, ip });

  return { user: publicUser(user), accessToken, refreshToken };
}

export async function refresh({ refreshToken, ip }) {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError('Unauthorized', 401);
  }

  const existing = await prisma.refreshToken.findFirst({
    where: { userId: decoded.sub, revokedAt: null },
    include: { user: true },
  });

  if (!existing || new Date(existing.expiresAt) < new Date()) {
    await prisma.refreshToken.updateMany({
      where: { userId: decoded.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new AppError('Unauthorized', 401);
  }

  const valid = await verifyTokenHash(refreshToken, existing.tokenHash);
  if (!valid) {
    await prisma.refreshToken.updateMany({
      where: { userId: decoded.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new AppError('Unauthorized', 401);
  }

  const user = existing.user;
  if (!user.isActive || (user.school && user.school.status === 'SUSPENDED')) {
    await prisma.refreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
    throw new AppError('Unauthorized', 401);
  }

  await prisma.refreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    schoolId: user.schoolId,
  });
  const newRefreshToken = signRefreshToken({ sub: user.id, jti: crypto.randomUUID() });
  const newHash = await hashToken(newRefreshToken);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: newHash,
      expiresAt: nowPlusDays(REFRESH_TTL_DAYS),
    },
  });

  await logAction({ userId: user.id, schoolId: user.schoolId, action: 'TOKEN_REFRESH', entity: 'User', entityId: user.id, ip });

  return { user: publicUser(user), accessToken, refreshToken: newRefreshToken };
}

export async function logout({ refreshToken, userId, ip }) {
  if (refreshToken) {
    try {
      const decoded = verifyRefreshToken(refreshToken);
      const tokenHash = await hashToken(refreshToken);
      await prisma.refreshToken.updateMany({
        where: { userId: decoded.sub, tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // ignore invalid token on logout
    }
  }
  if (userId) {
    await logAction({ userId, action: 'LOGOUT', entity: 'User', entityId: userId, ip });
  }
}

export async function me(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, schoolId: true, isActive: true, createdAt: true, school: { select: { id: true, name: true, slug: true, status: true } } },
  });
  if (!user) throw new AppError('User not found', 404);
  return user;
}

export async function changePassword({ userId, currentPassword, newPassword, ip }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);

  const passwordValid = await argon2.verify(user.passwordHash, currentPassword);
  if (!passwordValid) {
    await recordFailure(user);
    throw new AppError('Invalid current password', 401);
  }

  const passwordHash = await argon2.hash(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, failedLogins: 0, lockedUntil: null },
  });

  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });

  await logAction({ userId, schoolId: user.schoolId, action: 'PASSWORD_CHANGE', entity: 'User', entityId: userId, ip });
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    schoolId: user.schoolId,
    isActive: user.isActive,
    school: user.school ? { id: user.school.id, name: user.school.name, slug: user.school.slug, status: user.school.status } : null,
  };
}

