import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { tenantScope } from '../../middleware/tenantScope.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { validate, validateQueryShape } from '../../middleware/validate.js';
import { globalLimiter } from '../../middleware/rateLimiter.js';
import { schoolWhere, assertSchoolAccess } from '../../utils/scope.js';
import { logAction } from '../../services/audit.service.js';
import { sendSuccess, AppError } from '../../utils/response.js';
import { generateReportCardPdf } from '../../utils/pdf.js';
import prisma from '../../utils/prisma.js';
import { applyGradeScale } from '../../services/gradeScale.js';
import { runReportCardExport } from '../../services/reportCardExports.js';
import fs from 'node:fs/promises';
import { logger } from '../../utils/logger.js';

const router = Router();
router.use(authenticate);
router.use(requireRole('ADMIN'));
router.use(tenantScope);
router.use(globalLimiter);
router.use(validateQueryShape);

const idParam = z.object({ id: z.string().cuid() });

const generateSchema = z.object({
  classId: z.string().cuid(),
  termId: z.string().cuid(),
});

const commentSchema = z.object({
  classTeacherComment: z.string().max(500).optional().nullable(),
  principalComment: z.string().max(500).optional().nullable(),
});

const bulkCommentSchema = z.object({
  classId: z.string().cuid(),
  termId: z.string().cuid(),
  classTeacherComment: z.string().max(500).optional().nullable(),
  principalComment: z.string().max(500).optional().nullable(),
});

const publishSchema = z.object({
  classId: z.string().cuid(),
  termId: z.string().cuid(),
  blockUnpaid: z.boolean().optional().default(false),
});

const unlockSchema = z.object({
  reason: z.string().min(5),
});

const exportSchema = z.object({ classId: z.string().cuid(), termId: z.string().cuid() });

async function computeStudentScores(schoolId, studentId, termId) {
  const assessments = await prisma.assessment.findMany({
    where: { schoolId, termId },
    include: {
      classSubject: { include: { subject: true } },
      scores: { where: { studentId } },
    },
  });

  const bySubject = {};
  for (const assessment of assessments) {
    const subjectName = assessment.classSubject.subject.name;
    if (!bySubject[subjectName]) bySubject[subjectName] = { scores: [], weights: [] };
    const score = assessment.scores[0];
    if (score) {
      const normalizedScore = Number(assessment.maxScore) > 0
        ? (Number(score.value) / Number(assessment.maxScore)) * 100
        : 0;
      bySubject[subjectName].scores.push(normalizedScore);
      bySubject[subjectName].weights.push(Number(assessment.weight));
    }
  }

  return Object.entries(bySubject).map(([subjectName, data]) => {
    const totalWeight = data.weights.reduce((s, w) => s + w, 0);
    const weightedScore = data.scores.reduce((s, v, i) => s + v * data.weights[i], 0);
    const totalScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
    return { subjectName, totalScore };
  });
}

// ---- Generate report cards for a class/term ----

router.post('/generate', csrfProtection, validate({ body: generateSchema }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const { classId, termId } = req.body;

    const [enrollments, gradeScale] = await Promise.all([
      prisma.enrollment.findMany({
        where: { schoolId, classId, termId },
        include: { student: true },
      }),
      prisma.gradeScale.findMany({ where: { schoolId }, orderBy: { minScore: 'asc' } }),
    ]);

    if (enrollments.length === 0) throw new AppError('No enrollments found for this class and term', 404);

    const allScores = [];
    for (const enrollment of enrollments) {
      const scores = await computeStudentScores(schoolId, enrollment.studentId, termId);
      const avg = scores.length > 0
        ? scores.reduce((s, sc) => s + sc.totalScore, 0) / scores.length
        : 0;
      allScores.push({ studentId: enrollment.studentId, avg, scores });
    }

    const ranked = [...allScores].sort((a, b) => b.avg - a.avg);

    let created = 0;
    let updated = 0;

    for (let index = 0; index < ranked.length; index++) {
      const entry = ranked[index];
      const position = index > 0 && entry.avg === ranked[index - 1].avg
        ? ranked[index - 1].position
        : index + 1;
      entry.position = position;
      const totalScore = entry.scores.reduce((s, sc) => s + sc.totalScore, 0);
      const existing = await prisma.reportCard.findFirst({
        where: { schoolId, studentId: entry.studentId, termId },
      });

      if (existing && existing.status === 'PUBLISHED') {
        continue;
      }

      const data = {
        schoolId, studentId: entry.studentId, termId, classId,
        totalScore, average: entry.avg, position,
        status: 'DRAFT',
      };

      if (existing) {
        await prisma.reportCard.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.reportCard.create({ data });
        created++;
      }
    }

    await logAction({ userId: req.user.id, schoolId, action: 'GENERATE_REPORT_CARDS', entity: 'ReportCard', ip: req.ip });
    sendSuccess(res, { created, updated });
  } catch (err) { next(err); }
});

// ---- List report cards ----

router.get('/', async (req, res, next) => {
  try {
    const where = schoolWhere(req.user);
    if (req.query.classId) where.classId = req.query.classId;
    if (req.query.termId) where.termId = req.query.termId;
    if (req.query.status) where.status = req.query.status;
    if (req.query.studentId) where.studentId = req.query.studentId;

    const cards = await prisma.reportCard.findMany({
      where,
      include: {
        student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true, photoUrl: true } },
        term: { select: { id: true, name: true } },
        class: { select: { id: true, name: true } },
      },
      orderBy: [{ position: 'asc' }],
    });
    sendSuccess(res, { cards });
  } catch (err) { next(err); }
});

// ---- Update comments on a single card ----

router.patch('/:id/comment', csrfProtection, validate({ params: idParam }), validate({ body: commentSchema }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const card = await prisma.reportCard.findFirst({ where: { id: req.params.id, schoolId } });
    if (!card) throw new AppError('Report card not found', 404);
    if (card.status === 'PUBLISHED') throw new AppError('Cannot edit a published report card. Unlock it first.', 409);
    const updated = await prisma.reportCard.update({
      where: { id: req.params.id },
      data: req.body,
    });
    sendSuccess(res, { card: updated });
  } catch (err) { next(err); }
});

// ---- Bulk principal comment for a class ----

router.patch('/bulk-comment', csrfProtection, validate({ body: bulkCommentSchema }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const { classId, termId, classTeacherComment, principalComment } = req.body;
    const comments = {};
    if (classTeacherComment !== undefined) comments.classTeacherComment = classTeacherComment;
    if (principalComment !== undefined) comments.principalComment = principalComment;
    if (Object.keys(comments).length === 0) throw new AppError('At least one comment is required', 400);
    const result = await prisma.reportCard.updateMany({
      where: { schoolId, classId, termId, status: 'DRAFT' },
      data: comments,
    });
    sendSuccess(res, { updated: result.count });
  } catch (err) { next(err); }
});

// ---- Publish a class's report cards ----

router.post('/publish', csrfProtection, validate({ body: publishSchema }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const { classId, termId, blockUnpaid } = req.body;
    const schoolSettings = await prisma.school.findUnique({ where: { id: schoolId }, select: { blockReportCardsForUnpaid: true } });
    const requirePaidFees = Boolean(schoolSettings?.blockReportCardsForUnpaid || blockUnpaid);

    const cards = await prisma.reportCard.findMany({
      where: { schoolId, classId, termId, status: 'DRAFT' },
    });

    let blocked = 0;
    const toPublish = [];

    for (const card of cards) {
      if (requirePaidFees) {
        const invoice = await prisma.invoice.findFirst({
          where: { schoolId, studentId: card.studentId, termId, status: { notIn: ['PAID'] } },
        });
        if (invoice) { blocked++; continue; }
      }
      toPublish.push(card.id);
    }

    if (toPublish.length > 0) {
      await prisma.reportCard.updateMany({
        where: { id: { in: toPublish } },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
    }

    await logAction({ userId: req.user.id, schoolId, action: 'PUBLISH_REPORT_CARDS', entity: 'ReportCard', ip: req.ip });
    sendSuccess(res, { published: toPublish.length, blocked });
  } catch (err) { next(err); }
});

// ---- Unlock a published report card ----

router.post('/:id/unlock', csrfProtection, validate({ params: idParam }), validate({ body: unlockSchema }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const card = await prisma.reportCard.findFirst({ where: { id: req.params.id, schoolId } });
    if (!card) throw new AppError('Report card not found', 404);
    if (card.status !== 'PUBLISHED') throw new AppError('Report card is not published', 409);
    const updated = await prisma.reportCard.update({
      where: { id: req.params.id },
      data: { status: 'DRAFT', publishedAt: null },
    });
    await logAction({
      userId: req.user.id, schoolId,
      action: `UNLOCK_REPORT_CARD: ${req.body.reason}`,
      entity: 'ReportCard', entityId: req.params.id, ip: req.ip,
    });
    sendSuccess(res, { card: updated });
  } catch (err) { next(err); }
});

// ---- PDF report card for a student ----

router.post('/bulk-pdf', csrfProtection, validate({ body: exportSchema }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const { classId, termId } = req.body;
    const [schoolClass, term] = await Promise.all([
      prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true } }),
      prisma.term.findFirst({ where: { id: termId, schoolId }, select: { id: true } }),
    ]);
    if (!schoolClass || !term) throw new AppError('Class or term not found', 404);
    const job = await prisma.reportCardExportJob.create({ data: { schoolId, classId, termId } });
    setImmediate(() => runReportCardExport(job.id, schoolId).catch((err) => logger.error({ err, jobId: job.id, requestId: req.id }, 'Failed to start report card export')));
    sendSuccess(res, { job }, 202);
  } catch (err) { next(err); }
});

router.get('/bulk-pdf/:id', validate({ params: idParam }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const job = await prisma.reportCardExportJob.findFirst({ where: { id: req.params.id, schoolId } });
    if (!job) throw new AppError('Export job not found', 404);
    sendSuccess(res, {
      job: { id: job.id, status: job.status, error: job.status === 'FAILED' ? 'PDF generation failed' : null, createdAt: job.createdAt, completedAt: job.completedAt },
      downloadUrl: job.status === 'COMPLETED' ? `/api/school/report-cards/bulk-pdf/${job.id}/download` : null,
    });
  } catch (err) { next(err); }
});

router.get('/bulk-pdf/:id/download', validate({ params: idParam }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const job = await prisma.reportCardExportJob.findFirst({ where: { id: req.params.id, schoolId } });
    if (!job) throw new AppError('Export job not found', 404);
    if (job.status !== 'COMPLETED' || !job.filePath) throw new AppError('Report card PDF is not ready', 409);
    const file = await fs.readFile(job.filePath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="class-report-cards-${job.classId}-${job.termId}.pdf"`);
    res.send(file);
  } catch (err) { next(err); }
});

router.get('/:id/pdf', validate({ params: idParam }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const card = await prisma.reportCard.findFirst({
      where: { id: req.params.id, schoolId },
      include: {
        student: true,
        term: true,
        class: true,
      },
    });
    if (!card) throw new AppError('Report card not found', 404);

    const [school, gradeScale, scores] = await Promise.all([
      prisma.school.findUnique({ where: { id: schoolId } }),
      prisma.gradeScale.findMany({ where: { schoolId }, orderBy: { minScore: 'asc' } }),
      computeStudentScores(schoolId, card.studentId, card.termId),
    ]);
    const previousTerm = card.term?.academicYearId
      ? await prisma.term.findFirst({
        where: { schoolId, academicYearId: card.term.academicYearId, endDate: { lt: card.term.startDate } },
        orderBy: { endDate: 'desc' },
      })
      : null;
    const previousCard = previousTerm ? await prisma.reportCard.findFirst({
      where: { schoolId, studentId: card.studentId, termId: previousTerm.id, status: 'PUBLISHED' },
      select: { average: true },
    }) : null;

    const attendanceSummary = await prisma.attendance.groupBy({
      by: ['status'],
      where: {
        schoolId,
        studentId: card.studentId,
        classId: card.classId,
        date: { gte: card.term.startDate, lte: card.term.endDate },
      },
      _count: { status: true },
    });
    const present = attendanceSummary.find((a) => a.status === 'PRESENT')?._count?.status || 0;
    const total = attendanceSummary.reduce((s, a) => s + a._count.status, 0);

    const enrichedScores = scores.map((sc) => ({
      ...sc,
      ...applyGradeScale(sc.totalScore, gradeScale),
    }));

    const pdfBuffer = await generateReportCardPdf({
      reportCard: card,
      student: card.student,
      school,
      scores: enrichedScores,
      gradeScale,
      attendance: { present, total },
      termName: card.term?.name,
      previousTerm: previousTerm ? { name: previousTerm.name, average: previousCard ? Number(previousCard.average) : null } : null,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="report-card-${card.student.admissionNumber}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

export default router;
