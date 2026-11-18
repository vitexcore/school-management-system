import prisma from '../utils/prisma.js';

export async function logAction({ userId, schoolId, action, entity, entityId, ip }) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        schoolId: schoolId || null,
        action,
        entity,
        entityId: entityId || null,
        ip: ip || null,
      },
    });
  } catch {
    // Audit logging must never break the primary request
  }
}

export async function getAuditLogs({ filter, page, limit }) {
  const where = {};
  if (filter.userId) where.userId = filter.userId;
  if (filter.schoolId) where.schoolId = filter.schoolId;
  if (filter.action) where.action = { contains: filter.action };
  if (filter.entity) where.entity = { contains: filter.entity };
  if (filter.from || filter.to) where.createdAt = {
    ...(filter.from ? { gte: filter.from } : {}),
    ...(filter.to ? { lte: filter.to } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        school: { select: { id: true, name: true, slug: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, total, page, limit, pages: Math.ceil(total / limit) };
}
