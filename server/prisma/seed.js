import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || 'Super Administrator';

  if (!email || !password) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in .env');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Superadmin already exists: ${email}`);
  } else {
    const passwordHash = await argon2.hash(password);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: 'SUPERADMIN',
        schoolId: null,
        isActive: true,
      },
    });
    console.log(`Created superadmin: ${user.id} (${user.email})`);
  }

  if (process.env.SEED_DEMO_PASSWORD && process.env.NODE_ENV !== 'production') {
    const demoPasswordHash = await argon2.hash(process.env.SEED_DEMO_PASSWORD);
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const yearEnd = new Date(new Date().getFullYear(), 11, 31);
    for (const [suffix, label] of [['north', 'Northside'], ['south', 'Southside']]) {
      const school = await prisma.school.upsert({
        where: { slug: `demo-${suffix}` },
        create: { name: `${label} Demo School`, slug: `demo-${suffix}`, email: `demo-${suffix}@example.test` },
        update: {},
      });
      const adminEmail = `admin-${suffix}@example.test`;
      await prisma.user.upsert({
        where: { email: adminEmail },
        create: { schoolId: school.id, name: `${label} Admin`, email: adminEmail, passwordHash: demoPasswordHash, role: 'ADMIN' },
        update: { schoolId: school.id, passwordHash: demoPasswordHash },
      });

      let academicYear = await prisma.academicYear.findFirst({ where: { schoolId: school.id, name: String(yearStart.getFullYear()) } });
      if (!academicYear) academicYear = await prisma.academicYear.create({ data: { schoolId: school.id, name: String(yearStart.getFullYear()), startDate: yearStart, endDate: yearEnd, isCurrent: true } });
      let term = await prisma.term.findFirst({ where: { schoolId: school.id, academicYearId: academicYear.id, name: 'First Term' } });
      if (!term) term = await prisma.term.create({ data: { schoolId: school.id, academicYearId: academicYear.id, name: 'First Term', startDate: yearStart, endDate: new Date(yearStart.getFullYear(), 3, 30), isCurrent: true } });

      let schoolClass = await prisma.class.findFirst({ where: { schoolId: school.id, name: 'JSS 1 A' } });
      if (!schoolClass) schoolClass = await prisma.class.create({ data: { schoolId: school.id, name: 'JSS 1 A', level: 'JSS1', arm: 'A', capacity: 40 } });
      let subject = await prisma.subject.findFirst({ where: { schoolId: school.id, code: 'MTH' } });
      if (!subject) subject = await prisma.subject.create({ data: { schoolId: school.id, name: 'Mathematics', code: 'MTH' } });
      let teacher = await prisma.teacher.findFirst({ where: { schoolId: school.id, staffId: `T-${suffix}` } });
      if (!teacher) teacher = await prisma.teacher.create({ data: { schoolId: school.id, name: `${label} Mathematics Teacher`, email: `teacher-${suffix}@example.test`, staffId: `T-${suffix}` } });
      let classSubject = await prisma.classSubject.findFirst({ where: { schoolId: school.id, classId: schoolClass.id, subjectId: subject.id } });
      if (!classSubject) classSubject = await prisma.classSubject.create({ data: { schoolId: school.id, classId: schoolClass.id, subjectId: subject.id, teacherId: teacher.id } });
      let student = await prisma.student.findFirst({ where: { schoolId: school.id, admissionNumber: `DEMO-${suffix.toUpperCase()}-001` } });
      if (!student) student = await prisma.student.create({ data: { schoolId: school.id, admissionNumber: `DEMO-${suffix.toUpperCase()}-001`, firstName: 'Demo', lastName: `${label} Student` } });
      const enrollment = await prisma.enrollment.findFirst({ where: { schoolId: school.id, studentId: student.id, termId: term.id } });
      if (!enrollment) await prisma.enrollment.create({ data: { schoolId: school.id, studentId: student.id, classId: schoolClass.id, termId: term.id, academicYearId: academicYear.id } });
      let assessment = await prisma.assessment.findFirst({ where: { schoolId: school.id, classSubjectId: classSubject.id, termId: term.id, name: 'Midterm Test' } });
      if (!assessment) assessment = await prisma.assessment.create({ data: { schoolId: school.id, classSubjectId: classSubject.id, termId: term.id, name: 'Midterm Test', type: 'TEST', maxScore: 100 } });
      await prisma.score.upsert({ where: { assessmentId_studentId: { assessmentId: assessment.id, studentId: student.id } }, create: { schoolId: school.id, assessmentId: assessment.id, studentId: student.id, value: 78 }, update: { value: 78 } });
      let feeItem = await prisma.feeItem.findFirst({ where: { schoolId: school.id, termId: term.id, name: 'Tuition' } });
      if (!feeItem) feeItem = await prisma.feeItem.create({ data: { schoolId: school.id, termId: term.id, name: 'Tuition', amount: 2500000 } });
      let invoice = await prisma.invoice.findFirst({ where: { schoolId: school.id, studentId: student.id, termId: term.id } });
      if (!invoice) {
        invoice = await prisma.invoice.create({ data: { schoolId: school.id, studentId: student.id, termId: term.id, totalAmount: 2500000, amountPaid: 0, dueDate: new Date(yearStart.getFullYear(), 2, 31), status: 'UNPAID' } });
        await prisma.invoiceLine.create({ data: { schoolId: school.id, invoiceId: invoice.id, feeItemId: feeItem.id, description: feeItem.name, amount: feeItem.amount } });
      }
      console.log(`Seeded demo school ${school.slug}; admin ${adminEmail}`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
