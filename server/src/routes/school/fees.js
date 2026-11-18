import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { tenantScope } from '../../middleware/tenantScope.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { validate, validateEmptyBody, validateQueryShape } from '../../middleware/validate.js';
import { globalLimiter } from '../../middleware/rateLimiter.js';
import { schoolWhere, assertSchoolAccess } from '../../utils/scope.js';
import { logAction } from '../../services/audit.service.js';
import { sendSuccess, AppError } from '../../utils/response.js';
import prisma from '../../utils/prisma.js';

const router = Router();
router.use(authenticate);
router.use(requireRole('ADMIN'));
router.use(tenantScope);
router.use(globalLimiter);
router.use(validateQueryShape);

const feeItemSchema = z.object({
  name: z.string().min(1),
  amount: z.number().int().safe().positive('Amount must be a positive integer (kobo)'),
  classId: z.string().cuid().nullable().optional(),
  termId: z.string().cuid(),
  isOptional: z.boolean().optional().default(false),
});

const idParam = z.object({ id: z.string().cuid() });

const generateInvoiceSchema = z.object({
  termId: z.string().cuid(),
  classId: z.string().cuid().optional(),
  optionalFeeItemIds: z.array(z.string().cuid()).optional().default([]),
  dueDate: z.string().datetime(),
});

const discountSchema = z.object({
  studentId: z.string().cuid(),
  termId: z.string().cuid(),
  reason: z.string().min(1),
  amount: z.number().int().safe().positive(),
});

async function assertFeeItemRelations(schoolId, { classId, termId }) {
  const [term, targetClass] = await Promise.all([
    prisma.term.findFirst({ where: { id: termId, schoolId }, select: { id: true } }),
    classId ? prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true } }) : Promise.resolve(true),
  ]);
  if (!term) throw new AppError('Term not found', 404);
  if (!targetClass) throw new AppError('Class not found', 404);
}

// ---- Fee items ----

router.get('/items', async (req, res, next) => {
  try {
    const where = schoolWhere(req.user);
    if (req.query.termId) where.termId = req.query.termId;
    if (req.query.classId) where.classId = req.query.classId;
    const items = await prisma.feeItem.findMany({
      where, orderBy: { createdAt: 'asc' },
      include: { class: { select: { id: true, name: true } }, term: { select: { id: true, name: true } } },
    });
    sendSuccess(res, { items });
  } catch (err) { next(err); }
});

router.post('/items', csrfProtection, validate({ body: feeItemSchema }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    await assertFeeItemRelations(schoolId, req.body);
    const item = await prisma.feeItem.create({ data: { schoolId, ...req.body } });
    await logAction({ userId: req.user.id, schoolId, action: 'CREATE_FEE_ITEM', entity: 'FeeItem', entityId: item.id, ip: req.ip });
    sendSuccess(res, { item }, 201);
  } catch (err) { next(err); }
});

router.patch('/items/:id', csrfProtection, validate({ params: idParam }), validate({ body: feeItemSchema.partial() }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const existing = await prisma.feeItem.findFirst({ where: { id: req.params.id, schoolId } });
    if (!existing) throw new AppError('Fee item not found', 404);
    if (await prisma.invoiceLine.count({ where: { schoolId, feeItemId: existing.id } })) {
      throw new AppError('Fee item is already included in an invoice and cannot be deleted', 409);
    }
    await assertFeeItemRelations(schoolId, { classId: req.body.classId === undefined ? existing.classId : req.body.classId, termId: req.body.termId ?? existing.termId });
    const item = await prisma.feeItem.update({ where: { id: req.params.id }, data: req.body });
    await logAction({ userId: req.user.id, schoolId, action: 'UPDATE_FEE_ITEM', entity: 'FeeItem', entityId: item.id, ip: req.ip });
    sendSuccess(res, { item });
  } catch (err) { next(err); }
});

router.delete('/items/:id', csrfProtection, validate({ params: idParam }), validateEmptyBody, async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const existing = await prisma.feeItem.findFirst({ where: { id: req.params.id, schoolId } });
    if (!existing) throw new AppError('Fee item not found', 404);
    await prisma.feeItem.delete({ where: { id: req.params.id } });
    await logAction({ userId: req.user.id, schoolId, action: 'DELETE_FEE_ITEM', entity: 'FeeItem', entityId: req.params.id, ip: req.ip });
    sendSuccess(res, null, 204);
  } catch (err) { next(err); }
});

// ---- Generate invoices ----
// Safe to run multiple times (upsert pattern — skips existing invoices)

router.post('/invoices/generate', csrfProtection, validate({ body: generateInvoiceSchema }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const { termId, classId, dueDate, optionalFeeItemIds } = req.body;

    const term = await prisma.term.findFirst({ where: { id: termId, schoolId } });
    if (!term) throw new AppError('Term not found', 404);
    if (classId) {
      const schoolClass = await prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true } });
      if (!schoolClass) throw new AppError('Class not found', 404);
    }

    const feeItemsWhere = { schoolId, termId };
    if (!classId) {
      feeItemsWhere.isOptional = false;
    }

    const enrollmentWhere = { schoolId, termId };
    if (classId) enrollmentWhere.classId = classId;

    const [enrollments, allFeeItems] = await Promise.all([
      prisma.enrollment.findMany({
        where: enrollmentWhere,
        include: { student: true },
      }),
      prisma.feeItem.findMany({ where: { schoolId, termId, OR: [{ isOptional: false }, { id: { in: optionalFeeItemIds } }] } }),
    ]);

    let created = 0;
    let skipped = 0;

    for (const enrollment of enrollments) {
      const { studentId } = enrollment;

      const applicableItems = allFeeItems.filter(
        (fi) => !fi.classId || fi.classId === enrollment.classId,
      );

      const existing = await prisma.invoice.findFirst({
        where: { schoolId, studentId, termId },
      });

      if (existing) { skipped++; continue; }

      const discounts = await prisma.discount.aggregate({
        where: { schoolId, studentId, termId },
        _sum: { amount: true },
      });

      const totalAmount = applicableItems.reduce((s, fi) => s + Number(fi.amount), 0);
      const discountTotal = Number(discounts._sum.amount || 0);
      const netTotal = Math.max(0, totalAmount - discountTotal);

      try {
        await prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.create({
          data: {
            schoolId, studentId, termId,
            totalAmount: netTotal,
            amountPaid: 0,
            status: 'UNPAID',
            dueDate: new Date(dueDate),
          },
        });
        await tx.invoiceLine.createMany({
          data: [
            ...applicableItems.map((fi) => ({
              schoolId, invoiceId: invoice.id, feeItemId: fi.id,
              description: fi.name, amount: Number(fi.amount),
            })),
            ...(discountTotal > 0 ? [{ schoolId, invoiceId: invoice.id, description: 'Scholarship or discount', amount: -Math.min(discountTotal, totalAmount) }] : []),
          ],
        });
        });
        created++;
      } catch (err) {
        if (err.code === 'P2002') skipped++;
        else throw err;
      }
    }

    await logAction({ userId: req.user.id, schoolId, action: 'GENERATE_INVOICES', entity: 'Invoice', ip: req.ip });
    sendSuccess(res, { created, skipped });
  } catch (err) { next(err); }
});

// ---- List invoices ----

router.get('/invoices', async (req, res, next) => {
  try {
    const where = schoolWhere(req.user);
    if (req.query.termId) where.termId = req.query.termId;
    if (req.query.status) where.status = req.query.status;
    if (req.query.studentId) where.studentId = req.query.studentId;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const [items, total] = await prisma.$transaction([
      prisma.invoice.findMany({
        where, skip: (page - 1) * limit, take: limit,
        include: {
          student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } },
          term: { select: { id: true, name: true } },
          lines: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.invoice.count({ where }),
    ]);
    sendSuccess(res, { items, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

router.get('/invoices/:id', validate({ params: idParam }), async (req, res, next) => {
  try {
    const where = schoolWhere(req.user, { id: req.params.id });
    const invoice = await prisma.invoice.findFirst({
      where,
      include: {
        student: true,
        term: true,
        lines: { include: { feeItem: true } },
        payments: true,
      },
    });
    if (!invoice) throw new AppError('Invoice not found', 404);
    sendSuccess(res, { invoice });
  } catch (err) { next(err); }
});

// ---- Debtors list ----

router.get('/debtors', async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const { termId, classId } = req.query;
    if (!termId) throw new AppError('termId is required', 400);

    const enrollmentWhere = { schoolId, termId };
    if (classId) enrollmentWhere.classId = classId;

    const enrollments = await prisma.enrollment.findMany({
        where: enrollmentWhere,
        include: { class: { select: { id: true, name: true } } },
      });
    const invoicesWhere = {
      schoolId, termId, status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
      ...(classId ? { studentId: { in: enrollments.map((enrollment) => enrollment.studentId) } } : {}),
    };
    const debtorInvoices = await prisma.invoice.findMany({
      where: invoicesWhere,
      include: {
        student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } },
      },
    });

    const enrollmentMap = new Map(enrollments.map((e) => [e.studentId, e.class]));

    const debtors = debtorInvoices.map((inv) => ({
      studentId: inv.studentId,
      admissionNumber: inv.student.admissionNumber,
      name: `${inv.student.firstName} ${inv.student.lastName}`,
      class: enrollmentMap.get(inv.studentId) || null,
      invoiceId: inv.id,
      totalAmount: Number(inv.totalAmount),
      amountPaid: Number(inv.amountPaid),
      outstanding: Number(inv.totalAmount) - Number(inv.amountPaid),
      status: inv.status,
    }));

    if (req.query.format === 'csv') {
      const header = 'AdmissionNumber,Name,Class,TotalAmount,AmountPaid,Outstanding,Status\n';
      const csv = (value) => {
        const string = String(value ?? '');
        return `"${/^[=+@-]/.test(string) ? `'${string}` : string.replaceAll('"', '""')}"`;
      };
      const rows = debtors.map((d) =>
        [d.admissionNumber, d.name, d.class?.name, d.totalAmount, d.amountPaid, d.outstanding, d.status].map(csv).join(',')
      ).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="debtors.csv"');
      return res.send(header + rows);
    }

    sendSuccess(res, { debtors });
  } catch (err) { next(err); }
});

// ---- Fee summary ----

router.get('/summary', async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const { termId } = req.query;
    if (!termId) throw new AppError('termId is required', 400);

    const invoices = await prisma.invoice.findMany({
      where: { schoolId, termId },
      include: { student: { include: { enrollments: { where: { termId }, include: { class: true } } } } },
    });

    const summary = {
      expected: 0, collected: 0, outstanding: 0, byClass: {},
    };

    for (const inv of invoices) {
      const className = inv.student.enrollments[0]?.class?.name || 'Unknown';
      if (!summary.byClass[className]) {
        summary.byClass[className] = { expected: 0, collected: 0, outstanding: 0 };
      }
      const total = Number(inv.totalAmount);
      const paid = Number(inv.amountPaid);
      summary.expected += total;
      summary.collected += paid;
      summary.outstanding += (total - paid);
      summary.byClass[className].expected += total;
      summary.byClass[className].collected += paid;
      summary.byClass[className].outstanding += (total - paid);
    }

    sendSuccess(res, { summary });
  } catch (err) { next(err); }
});

// ---- Discounts ----

router.get('/discounts', async (req, res, next) => {
  try {
    const where = schoolWhere(req.user);
    if (req.query.studentId) where.studentId = req.query.studentId;
    if (req.query.termId) where.termId = req.query.termId;
    const items = await prisma.discount.findMany({
      where,
      include: { student: { select: { id: true, firstName: true, lastName: true } } },
    });
    sendSuccess(res, { items });
  } catch (err) { next(err); }
});

router.post('/discounts', csrfProtection, validate({ body: discountSchema }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const { studentId, termId, reason, amount } = req.body;
    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
    if (!student) throw new AppError('Student not found', 404);
    const term = await prisma.term.findFirst({ where: { id: termId, schoolId } });
    if (!term) throw new AppError('Term not found', 404);
    const invoice = await prisma.invoice.findFirst({ where: { schoolId, studentId, termId } });
    if (invoice && amount > Number(invoice.totalAmount) - Number(invoice.amountPaid)) {
      throw new AppError('Discount cannot exceed the outstanding balance', 422);
    }
    const discount = await prisma.$transaction(async (tx) => {
      const created = await tx.discount.create({ data: { schoolId, studentId, termId, reason, amount } });
      if (invoice) {
        const newTotal = Number(invoice.totalAmount) - amount;
        await tx.invoice.update({ where: { id: invoice.id }, data: { totalAmount: newTotal } });
        await tx.invoiceLine.create({ data: { schoolId, invoiceId: invoice.id, description: `Discount: ${reason}`, amount: -amount } });
      }
      return created;
    }, { isolationLevel: 'Serializable' });
    await logAction({ userId: req.user.id, schoolId, action: 'CREATE_DISCOUNT', entity: 'Discount', entityId: discount.id, ip: req.ip });
    sendSuccess(res, { discount }, 201);
  } catch (err) { next(err); }
});

export default router;
