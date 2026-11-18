import { z } from 'zod';

const slugSchema = z.string().min(1, 'Slug is required').max(100, 'Slug too long').regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers and hyphens only');

export const createSchoolSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name too long'),
  slug: slugSchema,
  email: z.string().email('Invalid email address'),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  logoUrl: z.string().url('Invalid logo URL').optional().nullable(),
});

export const updateSchoolSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: slugSchema.optional(),
  email: z.string().email('Invalid email address').optional(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  logoUrl: z.string().url('Invalid logo URL').optional().nullable(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});

export const createAdminSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name too long'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

export const auditLogQuerySchema = z.object({
  userId: z.string().cuid().optional(),
  schoolId: z.string().cuid().optional(),
  action: z.string().optional(),
  entity: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  format: z.enum(['json', 'csv']).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

export const idParamSchema = z.object({
  id: z.string().cuid('Invalid ID'),
});

export const schoolIdParamSchema = z.object({
  schoolId: z.string().cuid('Invalid school ID'),
});
