import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { createHmac, timingSafeEqual, randomBytes } from 'crypto';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { tenantScope } from '../../middleware/tenantScope.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { validate, validateQueryShape } from '../../middleware/validate.js';
import { globalLimiter } from '../../middleware/rateLimiter.js';
import { schoolWhere, assertSchoolAccess } from '../../utils/scope.js';
import { logAction } from '../../services/audit.service.js';
import { sendSuccess, AppError } from '../../utils/response.js';
import prisma from '../../utils/prisma.js';
import { generateReceiptPdf } from '../../utils/pdf.js';

const router = Router();
router.use(validateQueryShape);

const idParam = z.object({ id: z.string().cuid() });

const recordPaymentSchema = z.object({
  invoiceId: z.string().cuid(),
  amount: z.number().int().safe().positive(),
  method: z.enum(['CASH', 'TRANSFER']),
  reference: z.string().min(1).max(100),
  paidAt: z.string().datetime().optional(),
});

const reversalSchema = z.object({
  reason: z.string().min(5, 'Reason must be at least 5 characters'),
});

const initPaystackSchema = z.object({
  invoiceId: z.string().cuid(),
  email: z.string().email(),
});

const paystackEventSchema = z.object({
  event: z.string().max(100),
  data: z.object({
    reference: z.string().min(1).max(100),
    metadata: z.object({ invoiceId: z.string().cuid(), schoolId: z.string().cuid() }).passthrough().optional(),
  }).passthrough(),
}).passthrough();

// All school-scoped payment routes require ADMIN + tenant scope
router.use('/record', authenticate, requireRole('ADMIN'), tenantScope, globalLimiter);
router.use('/list', authenticate, requireRole('ADMIN'), tenantScope, globalLimiter);
router.use('/:id/reverse', authenticate, requireRole('ADMIN'), tenantScope, globalLimiter);
router.use('/:id/receipt', authenticate, requireRole('ADMIN'), tenantScope, globalLimiter);
router.use('/paystack/initialize', authenticate, requireRole('ADMIN'), tenantScope, globalLimiter);

// ---- Record manual payment ----

router.post('/record',
  csrfProtection,
  validate({ body: recordPaymentSchema }),
  async (req, res, next) => {
    try {
      const schoolId = assertSchoolAccess(req.user);
      const { invoiceId, amount, method, reference, paidAt } = req.body;

      const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, schoolId } });
      if (!invoice) throw new AppError('Invoice not found', 404);
      if (invoice.status === 'PAID') throw new AppError('Invoice is already fully paid', 409);

      const outstanding = Number(invoice.totalAmount) - Number(invoice.amountPaid);
      if (amount > outstanding) throw new AppError(`Amount exceeds outstanding balance of ${outstanding}`, 422);

      const dupRef = await prisma.payment.findFirst({ where: { reference, schoolId } });
      if (dupRef) throw new AppError('Duplicate payment reference', 409);

      const receiptNumber = `RCP-${randomBytes(8).toString('hex').toUpperCase()}`;

      const payment = await prisma.$transaction(async (tx) => {
        const current = await tx.invoice.findFirst({ where: { id: invoiceId, schoolId } });
        if (!current) throw new AppError('Invoice not found', 404);
        const currentOutstanding = Number(current.totalAmount) - Number(current.amountPaid);
        if (amount > currentOutstanding) throw new AppError(`Amount exceeds outstanding balance of ${currentOutstanding}`, 422);
        const p = await tx.payment.create({
          data: {
            schoolId, invoiceId, amount, method, reference, receiptNumber,
            paidAt: paidAt ? new Date(paidAt) : new Date(),
            recordedBy: req.user.id,
            status: 'CONFIRMED',
          },
        });
        const newPaid = Number(current.amountPaid) + amount;
        const newStatus = newPaid >= Number(current.totalAmount) ? 'PAID' : 'PARTIAL';
        await tx.invoice.update({
          where: { id: invoiceId },
          data: { amountPaid: newPaid, status: newStatus },
        });
        return p;
      }, { isolationLevel: 'Serializable' });

      await logAction({ userId: req.user.id, schoolId, action: 'RECORD_PAYMENT', entity: 'Payment', entityId: payment.id, ip: req.ip });
      sendSuccess(res, { payment }, 201);
    } catch (err) { next(err); }
  }
);

// ---- List payments ----

router.get('/list',
  authenticate, requireRole('ADMIN'), tenantScope, globalLimiter,
  async (req, res, next) => {
    try {
      const where = schoolWhere(req.user);
      if (req.query.invoiceId) where.invoiceId = req.query.invoiceId;
      if (req.query.status) where.status = req.query.status;
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;
      const [items, total] = await prisma.$transaction([
        prisma.payment.findMany({
          where, skip: (page - 1) * limit, take: limit,
          include: {
            invoice: {
              include: { student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } } },
            },
          },
          orderBy: { paidAt: 'desc' },
        }),
        prisma.payment.count({ where }),
      ]);
      sendSuccess(res, { items, total, page, pages: Math.ceil(total / limit) });
    } catch (err) { next(err); }
  }
);

// ---- Reverse payment ----

router.post('/:id/reverse',
  authenticate, requireRole('ADMIN'), tenantScope, globalLimiter,
  csrfProtection,
  validate({ params: idParam }),
  validate({ body: reversalSchema }),
  async (req, res, next) => {
    try {
      const schoolId = assertSchoolAccess(req.user);
      const payment = await prisma.payment.findFirst({ where: { id: req.params.id, schoolId } });
      if (!payment) throw new AppError('Payment not found', 404);
      if (payment.status === 'REVERSED') throw new AppError('Payment already reversed', 409);
      if (payment.status !== 'CONFIRMED') throw new AppError('Only confirmed payments can be reversed', 422);

      const updated = await prisma.$transaction(async (tx) => {
        const changed = await tx.payment.updateMany({
          where: { id: payment.id, schoolId, status: 'CONFIRMED' },
          data: { status: 'REVERSED', reverseReason: req.body.reason },
        });
        if (!changed.count) throw new AppError('Payment was already changed', 409);
        const invoice = await tx.invoice.findFirst({ where: { id: payment.invoiceId, schoolId } });
        if (!invoice) throw new AppError('Invoice not found', 404);
        const newPaid = Math.max(0, Number(invoice.amountPaid) - Number(payment.amount));
        const newStatus = newPaid === 0 ? 'UNPAID' : 'PARTIAL';
        await tx.invoice.update({
          where: { id: payment.invoiceId },
          data: { amountPaid: newPaid, status: newStatus },
        });
        return tx.payment.findFirst({ where: { id: payment.id, schoolId } });
      }, { isolationLevel: 'Serializable' });

      await logAction({
        userId: req.user.id, schoolId,
        action: `REVERSE_PAYMENT: ${req.body.reason}`,
        entity: 'Payment', entityId: payment.id, ip: req.ip,
      });
      sendSuccess(res, { payment: updated });
    } catch (err) { next(err); }
  }
);

// ---- PDF Receipt ----

router.get('/:id/receipt',
  authenticate, requireRole('ADMIN'), tenantScope, globalLimiter,
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      const schoolId = assertSchoolAccess(req.user);
      const payment = await prisma.payment.findFirst({
        where: { id: req.params.id, schoolId },
        include: {
          invoice: {
            include: {
              student: true,
              term: true,
              lines: true,
            },
          },
        },
      });
      if (!payment) throw new AppError('Payment not found', 404);

      const school = await prisma.school.findUnique({ where: { id: schoolId } });
      const pdfBuffer = await generateReceiptPdf({ payment, school });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="receipt-${payment.receiptNumber}.pdf"`);
      res.send(pdfBuffer);
    } catch (err) { next(err); }
  }
);

// ---- Paystack initialize (school-scoped) ----

router.post('/paystack/initialize',
  authenticate, requireRole('ADMIN'), tenantScope, globalLimiter,
  csrfProtection,
  validate({ body: initPaystackSchema }),
  async (req, res, next) => {
    try {
      const schoolId = assertSchoolAccess(req.user);
      const { invoiceId, email } = req.body;

      const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, schoolId } });
      if (!invoice) throw new AppError('Invoice not found', 404);
      if (invoice.status === 'PAID') throw new AppError('Invoice already paid', 409);

      const outstanding = Number(invoice.totalAmount) - Number(invoice.amountPaid);
      const amountKobo = outstanding;

      const reference = `PS-${schoolId.slice(-6)}-${randomUUID().slice(0, 8)}`;

      const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          amount: amountKobo,
          reference,
          metadata: { invoiceId, schoolId },
        }),
      });

      const paystackData = await paystackRes.json();
      if (!paystackData.status) throw new AppError('Paystack initialization failed', 502);

      sendSuccess(res, {
        authorizationUrl: paystackData.data.authorization_url,
        reference: paystackData.data.reference,
      });
    } catch (err) { next(err); }
  }
);

// ---- Paystack webhook (unauthenticated, verified by signature) ----
// Must be mounted at the application level before JSON body parser for raw body verification
// We handle it here but the raw body signature check uses the express.raw middleware

router.post('/paystack/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    const secret = process.env.PAYSTACK_WEBHOOK_SECRET;

    if (!secret || !req.rawBody || typeof signature !== 'string') {
      return res.status(401).json({ success: false, error: 'Invalid signature' });
    }

    const hash = createHmac('sha512', secret)
      .update(req.rawBody)
      .digest('hex');

    const expected = Buffer.from(hash, 'hex');
    const received = Buffer.from(signature, 'hex');
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      return res.status(401).json({ success: false, error: 'Invalid signature' });
    }

    const parsedEvent = paystackEventSchema.safeParse(req.body);
    if (!parsedEvent.success) return res.status(400).json({ success: false, error: 'Invalid event payload', requestId: req.id });
    const event = parsedEvent.data;
    if (event.event !== 'charge.success') return res.sendStatus(200);

    const { reference, metadata } = event.data;
    const { invoiceId, schoolId } = metadata || {};
    if (!invoiceId || !schoolId) return res.sendStatus(200);

    const existing = await prisma.payment.findFirst({ where: { reference, schoolId } });
    if (existing) return res.sendStatus(200);

    const paystackVerify = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    });
    const verifyData = await paystackVerify.json();

    if (!verifyData.status || verifyData.data.status !== 'success' || verifyData.data.reference !== reference || verifyData.data.currency !== 'NGN') return res.sendStatus(200);
    const verifiedMetadata = verifyData.data.metadata || {};
    if (verifiedMetadata.invoiceId !== invoiceId || verifiedMetadata.schoolId !== schoolId) return res.sendStatus(200);

    const amountKobo = verifyData.data.amount;

    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, schoolId } });
    if (!invoice) return res.sendStatus(200);
    const expectedAmount = Number(invoice.totalAmount) - Number(invoice.amountPaid);
    if (!Number.isSafeInteger(amountKobo) || amountKobo < 1 || amountKobo !== expectedAmount) return res.sendStatus(200);

    const receiptNumber = `ONL-${randomBytes(8).toString('hex').toUpperCase()}`;

    await prisma.$transaction(async (tx) => {
      const duplicate = await tx.payment.findFirst({ where: { reference, schoolId } });
      if (duplicate) return;
      const current = await tx.invoice.findFirst({ where: { id: invoiceId, schoolId } });
      if (!current || amountKobo > Number(current.totalAmount) - Number(current.amountPaid)) return;
      await tx.payment.create({
        data: {
          schoolId, invoiceId, amount: amountKobo,
          method: 'ONLINE', reference, receiptNumber,
          paidAt: new Date(),
          status: 'CONFIRMED',
        },
      });
      const newPaid = Number(current.amountPaid) + amountKobo;
      const newStatus = newPaid >= Number(current.totalAmount) ? 'PAID' : 'PARTIAL';
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { amountPaid: newPaid, status: newStatus },
      });
    }, { isolationLevel: 'Serializable' });

    await logAction({ schoolId, action: 'PAYSTACK_PAYMENT_CONFIRMED', entity: 'Payment', ip: 'paystack-webhook' });
    res.sendStatus(200);
  } catch {
    res.sendStatus(500);
  }
});

export default router;
