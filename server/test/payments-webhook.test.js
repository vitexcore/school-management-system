import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/index.js';
import { PrismaClient } from '@prisma/client';
import { createHmac, randomUUID } from 'node:crypto';

const prisma = new PrismaClient();

test('Paystack webhook rejects an invalid signature before looking up payment records', async (t) => {
  process.env.PAYSTACK_WEBHOOK_SECRET = 'webhook-test-secret';
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/school/payments/paystack/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-paystack-signature': '00' },
    body: JSON.stringify({ event: 'charge.success', data: { reference: 'untrusted' } }),
  });
  assert.equal(response.status, 401);
});

test('verified Paystack webhook is idempotent and updates the invoice once', async (t) => {
  const previousSecret = process.env.PAYSTACK_WEBHOOK_SECRET;
  const originalFetch = global.fetch;
  const secret = 'webhook-idempotency-secret';
  process.env.PAYSTACK_WEBHOOK_SECRET = secret;
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const school = await prisma.school.create({ data: { name: `Webhook ${suffix}`, slug: `webhook-${suffix}`, email: `webhook-${suffix}@test.invalid` } });
  const year = await prisma.academicYear.create({ data: { schoolId: school.id, name: suffix, startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') } });
  const term = await prisma.term.create({ data: { schoolId: school.id, academicYearId: year.id, name: 'Term', startDate: new Date('2026-01-01'), endDate: new Date('2026-04-30') } });
  const student = await prisma.student.create({ data: { schoolId: school.id, admissionNumber: suffix, firstName: 'Webhook', lastName: 'Student' } });
  const invoice = await prisma.invoice.create({ data: { schoolId: school.id, studentId: student.id, termId: term.id, totalAmount: 50000, amountPaid: 0, dueDate: new Date('2026-12-31'), status: 'UNPAID' } });
  const reference = `PS-${suffix}`;
  const event = { event: 'charge.success', data: { reference, metadata: { invoiceId: invoice.id, schoolId: school.id } } };
  const raw = JSON.stringify(event);
  const signature = createHmac('sha512', secret).update(raw).digest('hex');
  global.fetch = async (url, options) => {
    if (String(url).startsWith('https://api.paystack.co/')) {
      return { json: async () => ({ status: true, data: { status: 'success', reference, currency: 'NGN', amount: 50000, metadata: event.data.metadata } }) };
    }
    return originalFetch(url, options);
  };
  const server = app.listen(0);
  t.after(async () => {
    global.fetch = originalFetch;
    if (previousSecret === undefined) delete process.env.PAYSTACK_WEBHOOK_SECRET;
    else process.env.PAYSTACK_WEBHOOK_SECRET = previousSecret;
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/school/payments/paystack/webhook`;
  for (let i = 0; i < 2; i++) {
    const response = await originalFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-paystack-signature': signature }, body: raw });
    assert.equal(response.status, 200);
  }
  const [payments, updatedInvoice] = await Promise.all([
    prisma.payment.count({ where: { schoolId: school.id, reference } }),
    prisma.invoice.findFirst({ where: { schoolId: school.id, id: invoice.id } }),
  ]);
  assert.equal(payments, 1);
  assert.equal(Number(updatedInvoice.amountPaid), 50000);
});
