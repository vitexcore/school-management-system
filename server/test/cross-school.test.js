import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/index.js';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:4999';

let server;
let cookieA, cookieB;

async function startServer() {
  server = app.listen(4999);
  await new Promise((resolve) => server.once('listening', resolve));
}

async function stopServer() {
  await new Promise((resolve) => server.close(resolve));
}

async function login(email, password) {
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf-token`, {
    credentials: 'include',
  });
  const csrfCookie = csrfRes.headers.get('set-cookie') || '';
  const token = (await csrfRes.json()).csrfToken;

  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': token,
      Cookie: csrfCookie,
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  return { status: res.status, data, cookie: res.headers.get('set-cookie') || '' };
}

test('cross-school access returns 404', async (t) => {
  await startServer();
  try {
    const ts = Date.now().toString(36);
    const schoolA = await prisma.school.create({
      data: { name: 'School A', slug: `school-a-${ts}`, email: `school-a-${ts}@test.com`, status: 'ACTIVE' },
    });
    const schoolB = await prisma.school.create({
      data: { name: 'School B', slug: `school-b-${ts}`, email: `school-b-${ts}@test.com`, status: 'ACTIVE' },
    });

    const adminA = await prisma.user.create({
      data: {
        name: 'Admin A',
        email: `admin-a-${ts}@school-a.com`,
        passwordHash: await argon2.hash('password123'),
        role: 'ADMIN',
        schoolId: schoolA.id,
        isActive: true,
      },
    });

    const adminB = await prisma.user.create({
      data: {
        name: 'Admin B',
        email: `admin-b-${ts}@school-b.com`,
        passwordHash: await argon2.hash('password456'),
        role: 'ADMIN',
        schoolId: schoolB.id,
        isActive: true,
      },
    });

    const classA = await prisma.class.create({
      data: { schoolId: schoolA.id, name: 'Class A-1', level: 'JSS1', arm: 'A', capacity: 30 },
    });
    const classB = await prisma.class.create({
      data: { schoolId: schoolB.id, name: 'Class B-1', level: 'JSS1', arm: 'B', capacity: 30 },
    });
    const yearB = await prisma.academicYear.create({
      data: { schoolId: schoolB.id, name: '2026', startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') },
    });
    const termB = await prisma.term.create({
      data: { schoolId: schoolB.id, academicYearId: yearB.id, name: 'Term 1', startDate: new Date('2026-01-01'), endDate: new Date('2026-04-30') },
    });
    const studentB = await prisma.student.create({
      data: { schoolId: schoolB.id, admissionNumber: `B-${ts}`, firstName: 'Student', lastName: 'B' },
    });
    const invoiceB = await prisma.invoice.create({
      data: { schoolId: schoolB.id, studentId: studentB.id, termId: termB.id, totalAmount: 10000, amountPaid: 0, dueDate: new Date('2026-12-31'), status: 'UNPAID' },
    });
    await prisma.feeItem.create({ data: { schoolId: schoolB.id, name: 'School B fee', amount: 10000, termId: termB.id } });
    const paymentB = await prisma.payment.create({
      data: { schoolId: schoolB.id, invoiceId: invoiceB.id, amount: 1000, method: 'CASH', reference: `REF-${ts}`, receiptNumber: `RCP-${ts}`, paidAt: new Date(), recordedBy: adminB.id, status: 'CONFIRMED' },
    });

    const loginA = await login(`admin-a-${ts}@school-a.com`, 'password123');
    const loginB = await login(`admin-b-${ts}@school-b.com`, 'password456');

    assert.ok(loginA.status === 200, `Admin A login should succeed`);
    assert.ok(loginB.status === 200, `Admin B login should succeed`);

    cookieA = loginA.cookie;
    cookieB = loginB.cookie;

    const res1 = await fetch(`${BASE_URL}/api/school/classes/${classB.id}`, {
      headers: { 'Cookie': cookieA },
    });
    assert.ok(res1.status === 404, `Admin A accessing School B's class: expected 404, got ${res1.status}`);

    const res2 = await fetch(`${BASE_URL}/api/school/classes/${classA.id}`, {
      headers: { 'Cookie': cookieB },
    });
    assert.ok(res2.status === 404, `Admin B accessing School A's class: expected 404, got ${res2.status}`);

    const foreignInvoice = await fetch(`${BASE_URL}/api/school/fees/invoices/${invoiceB.id}`, { headers: { Cookie: cookieA } });
    assert.equal(foreignInvoice.status, 404, 'Admin A should receive 404 for School B invoice');
    const foreignReceipt = await fetch(`${BASE_URL}/api/school/payments/${paymentB.id}/receipt`, { headers: { Cookie: cookieA } });
    assert.equal(foreignReceipt.status, 404, 'Admin A should receive 404 for School B payment receipt');
    const foreignFeeFilter = await fetch(`${BASE_URL}/api/school/fees/items?termId=${termB.id}`, { headers: { Cookie: cookieA } });
    assert.equal(foreignFeeFilter.status, 200, 'Foreign term filtering must remain a successful scoped list request');
    const foreignFeeData = await foreignFeeFilter.json();
    assert.equal(foreignFeeData.data.items.length, 0, 'Admin A must not see fee items for School B term');

    const listRes = await fetch(`${BASE_URL}/api/school/classes`, {
      headers: { 'Cookie': cookieA },
    });
    assert.ok(listRes.status === 200, 'Listing classes should succeed');
    const listData = await listRes.json();
    const schoolBClassesInListA = (listData.data?.items || []).filter((c) => c.schoolId === schoolB.id);
    assert.ok(schoolBClassesInListA.length === 0, 'Admin A should not see School B classes in list');

    const res4 = await fetch(`${BASE_URL}/api/school/classes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieA,
      },
      body: JSON.stringify({ name: 'Class X', level: 'JSS1', arm: 'Z', schoolId: schoolB.id }),
    });
    assert.ok(res4.status === 400 || res4.status === 403 || res4.status === 404,
      `Admin A creating class in School B should fail, got ${res4.status}`);

    const res5 = await fetch(`${BASE_URL}/api/school/students`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieA,
      },
      body: JSON.stringify({
        firstName: 'Hacker',
        lastName: 'Student',
        email: 'hacker@school-b.com',
        admissionNumber: 'HACK001',
        classId: classB.id,
      }),
    });
    assert.ok(res5.status === 400 || res5.status === 403 || res5.status === 404,
      `Admin A creating student in School B class should fail, got ${res5.status}`);

    console.log('All cross-school access tests passed!');
  } finally {
    await stopServer();
  }
});
