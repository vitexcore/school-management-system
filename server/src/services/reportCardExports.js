import fs from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import prisma from '../utils/prisma.js';
import { applyGradeScale } from './gradeScale.js';

function buildPdf({ school, term, cards, assessments, gradeScale, attendanceByStudent }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    cards.forEach((card, cardIndex) => {
      if (cardIndex > 0) doc.addPage();
      doc.fontSize(18).font('Helvetica-Bold').text(school.name, { align: 'center' });
      doc.fontSize(10).font('Helvetica').text(school.address || '', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(14).font('Helvetica-Bold').text('STUDENT REPORT CARD', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).font('Helvetica');
      doc.text(`Student: ${card.student.firstName} ${card.student.lastName}`);
      doc.text(`Admission number: ${card.student.admissionNumber}`);
      doc.text(`Class: ${card.class.name}    Term: ${term.name}`);
      doc.text(`Average: ${Number(card.average).toFixed(1)}%    Position: ${card.position || '—'}`);
      const attendance = attendanceByStudent.get(card.studentId) || { present: 0, total: 0 };
      doc.text(`Attendance: ${attendance.present}/${attendance.total} days`);
      doc.moveDown();
      const headerY = doc.y;
      doc.font('Helvetica-Bold').text('Subject', 48, headerY, { width: 245 });
      doc.text('Score', 300, headerY, { width: 60 });
      doc.text('Grade', 365, headerY, { width: 60 });
      doc.text('Remark', 430, headerY, { width: 100 });
      doc.y = headerY + 15;
      doc.moveDown(0.5).moveTo(48, doc.y).lineTo(547, doc.y).stroke();

      const bySubject = new Map();
      for (const assessment of assessments) {
        const score = assessment.scores.find((entry) => entry.studentId === card.studentId);
        if (!score) continue;
        const name = assessment.classSubject.subject.name;
        const values = bySubject.get(name) || { total: 0, weight: 0 };
        const normalized = Number(assessment.maxScore) > 0 ? Number(score.value) / Number(assessment.maxScore) * 100 : 0;
        values.total += normalized * Number(assessment.weight);
        values.weight += Number(assessment.weight);
        bySubject.set(name, values);
      }
      for (const [subject, values] of bySubject) {
        if (doc.y > 700) doc.addPage();
        const score = values.weight ? values.total / values.weight : 0;
        const grade = applyGradeScale(score, gradeScale);
        const y = doc.y + 3;
        doc.font('Helvetica').text(subject, 48, y, { width: 245 });
        doc.text(score.toFixed(1), 300, y, { width: 60 });
        doc.text(grade.grade, 365, y, { width: 60 });
        doc.text(grade.remark || '—', 430, y, { width: 100 });
        doc.moveDown();
      }
      doc.moveDown();
      doc.font('Helvetica-Bold').text("Class teacher's comment");
      doc.font('Helvetica').text(card.classTeacherComment || '—', { width: 495 });
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text("Principal's comment");
      doc.font('Helvetica').text(card.principalComment || '—', { width: 495 });
    });
    doc.end();
  });
}

export async function runReportCardExport(jobId, schoolId) {
  let job;
  try {
    job = await prisma.reportCardExportJob.findFirst({ where: { id: jobId, schoolId } });
    if (!job || job.status !== 'QUEUED') return;
    await prisma.reportCardExportJob.update({ where: { id: job.id }, data: { status: 'PROCESSING', error: null } });
    const [school, term, cards, gradeScale] = await Promise.all([
      prisma.school.findUnique({ where: { id: schoolId } }),
      prisma.term.findFirst({ where: { id: job.termId, schoolId } }),
      prisma.reportCard.findMany({
        where: { schoolId, classId: job.classId, termId: job.termId },
        include: { student: true, class: true },
        orderBy: { position: 'asc' },
      }),
      prisma.gradeScale.findMany({ where: { schoolId }, orderBy: { minScore: 'asc' } }),
    ]);
    if (!school || !term || !cards.length) throw new Error('No report cards found for this class and term');
    const studentIds = cards.map((card) => card.studentId);
    const assessments = await prisma.assessment.findMany({
      where: { schoolId, termId: job.termId },
      include: { classSubject: { include: { subject: true } }, scores: { where: { studentId: { in: studentIds } } } },
    });
    const attendance = await prisma.attendance.groupBy({
      by: ['studentId', 'status'],
      where: { schoolId, classId: job.classId, studentId: { in: studentIds }, date: { gte: term.startDate, lte: term.endDate } },
      _count: { status: true },
    });
    const attendanceByStudent = new Map();
    for (const entry of attendance) {
      const current = attendanceByStudent.get(entry.studentId) || { present: 0, total: 0 };
      current.total += entry._count.status;
      if (entry.status === 'PRESENT') current.present += entry._count.status;
      attendanceByStudent.set(entry.studentId, current);
    }
    const pdf = await buildPdf({ school, term, cards, assessments, gradeScale, attendanceByStudent });
    const exportDirectory = path.resolve(process.env.REPORT_EXPORT_DIR || '/tmp/school-management-exports');
    await fs.mkdir(exportDirectory, { recursive: true });
    const filePath = path.join(exportDirectory, `${job.id}.pdf`);
    await fs.writeFile(filePath, pdf, { mode: 0o600 });
    await prisma.reportCardExportJob.update({ where: { id: job.id }, data: { status: 'COMPLETED', filePath, completedAt: new Date() } });
  } catch (error) {
    if (job) {
      try {
        await prisma.reportCardExportJob.update({
          where: { id: job.id },
          data: { status: 'FAILED', error: error.message.slice(0, 500), completedAt: new Date() },
        });
      } catch {}
    } else throw error;
  }
}
