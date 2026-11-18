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
  const csrfToken = (await csrfRes.json()).csrfToken;

  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
      Cookie: csrfCookie,
    },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.get('set-cookie') || '';
  return { status: res.status, cookie: setCookie };
}

test('auth: login, logout, and access control', async (t) => {
  await startServer();
  try {
    // Create two schools
    const ts = Date.now().toString(36);
    const schoolA = await prisma.school.create({
      data: { name: 'School A', slug: `school-a-${ts}`, email: `school-a-${ts}@test.com`, status: 'ACTIVE' },
    });
    const schoolB = await prisma.school.create({
      data: { name: 'School B', slug: `school-b-${ts}`, email: `school-b-${ts}@test.com`, status: 'ACTIVE' },
    });

    // Create admins for each school
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

    // Login as superadmin (schoolA admin)
    const loginA = await login(`admin-a-${ts}@school-a.com`, 'password123');
    const loginB = await login(`admin-b-${ts}@school-b.com`, 'password456');

    assert.ok(loginA.status === 200, `Superadmin login should succeed, got ${loginA.status}`);
    assert.ok(loginB.status === 200, `Admin B login should succeed`);

    cookieA = loginA.cookie;
    cookieB = loginB.cookie;

    // Create classes in both schools
    const classA = await prisma.class.create({
      data: { schoolId: schoolA.id, name: 'Class A-1', level: 'JSS1', arm: 'A', capacity: 30 },
    });
    const classB = await prisma.class.create({
      data: { schoolId: schoolB.id, name: 'Class B-1', level: 'JSS1', arm: 'B', capacity: 30 },
    });

    // Test 1: Admin A cannot access School B's class
    const res1 = await fetch(`${BASE_URL}/api/school/classes/${classB.id}`, {
      headers: { 'Cookie': cookieA },
    });
    assert.ok(res1.status === 404, `Admin A accessing School B's class: expected 404, got ${res1.status}`);

    // Test 2: Admin B cannot access School A's class
    const res2 = await fetch(`${BASE_URL}/api/school/classes/${classA.id}`, {
      headers: { 'Cookie': cookieB },
    });
    assert.ok(res2.status === 404, `Admin B accessing School A's class: expected 404, got ${res2.status}`);

    // Test 3: Admin A cannot list School B's classes
    const listRes = await fetch(`${BASE_URL}/api/school/classes`, {
      headers: { 'Cookie': cookieA },
    });
    assert.ok(listRes.status === 200, 'Listing classes should succeed');
    const listData = await listRes.json();
    const schoolBClassesInListA = (listData.data?.items || []).filter((c) => c.schoolId === schoolB.id);
    assert.ok(schoolBClassesInListA.length === 0, 'Admin A should not see School B classes in list');

    // Test 4: Admin A cannot create a class in School B (schoolId mismatch)
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

    // Test 5: Admin A cannot create a student in School B's class
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
