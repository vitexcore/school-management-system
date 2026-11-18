import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { tenantScope } from '../../middleware/tenantScope.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { validate } from '../../middleware/validate.js';
import { globalLimiter } from '../../middleware/rateLimiter.js';
import { schoolWhere, assertSchoolAccess } from '../../utils/scope.js';
import { logAction } from '../../services/audit.service.js';
import prisma from '../../utils/prisma.js';
import { z } from 'zod';
import { sendSuccess, AppError } from '../../utils/response.js';

const router = Router();
router.use(authenticate);
router.use(requireRole('ADMIN'));
router.use(tenantScope);
router.use(globalLimiter);

const assessmentSchema = z.object({
  classSubjectId: z.string().cuid('Invalid class subject'),
  termId: z.string().cuid('Invalid term'),
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['CA', 'TEST', 'EXAM']),
  maxScore: z.number().positive('Max score must be positive'),
  weight: z.number().positive('Weight must be positive').optional()
});

const bulkScoreSchema = z.object({
  assessmentId: z.string().cuid('Invalid assessment'),
  scores: z.array(z.object({
    studentId: z.string().cuid('Invalid student'),
    value: z.number()
  }))
});

const scoreSchema = z.object({
  value: z.number()
});

// ---------- Assessments ----------

router.get('/assessments', async (req, res, next) => {
  try {
    const where = schoolWhere(req.user);
    if (req.query.classSubjectId) where.classSubjectId = req.query.classSubjectId;
    if (req.query.termId) where.termId = req.query.termId;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const [items, total] = await prisma.$transaction([
      prisma.assessment.findMany({
        where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' },
        include: { classSubject: { include: { class: true, subject: true } }, term: true }
      }),
      prisma.assessment.count({ where })
    ]);
    sendSuccess(res, { items, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

router.post('/assessments', csrfProtection, validate({ body: assessmentSchema }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const { classSubjectId, termId, name, type, maxScore, weight } = req.body;
    const cs = await prisma.classSubject.findFirst({ where: { id: classSubjectId, schoolId } });
    if (!cs) throw new AppError('Class subject not found', 404);
    const term = await prisma.term.findFirst({ where: { id: termId, schoolId } });
    if (!term) throw new AppError('Term not found', 404);
    const assessment = await prisma.assessment.create({ data: { schoolId, classSubjectId, termId, name, type, maxScore, weight: weight || 1 } });
    await logAction({ userId: req.user.id, schoolId, action: 'CREATE_ASSESSMENT', entity: 'Assessment', entityId: assessment.id, ip: req.ip });
    sendSuccess(res, { assessment }, 201);
  } catch (err) { next(err); }
});

router.get('/assessments/:id', async (req, res, next) => {
  try {
    const where = schoolWhere(req.user, { id: req.params.id });
    const assessment = await prisma.assessment.findFirst({ where, include: { classSubject: { include: { class: true, subject: true } }, term: true } });
    if (!assessment) throw new AppError('Assessment not found', 404);
    sendSuccess(res, { assessment });
  } catch (err) { next(err); }
});

router.patch('/assessments/:id', csrfProtection, validate({ body: assessmentSchema.partial() }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const assessment = await prisma.assessment.findFirst({ where: { id: req.params.id, schoolId } });
    if (!assessment) throw new AppError('Assessment not found', 404);
    const { classSubjectId, termId, name, type, maxScore, weight } = req.body;
    const data = {};
    if (classSubjectId !== undefined) { const cs = await prisma.classSubject.findFirst({ where: { id: classSubjectId, schoolId } }); if (!cs) throw new AppError('Class subject not found', 404); data.classSubjectId = classSubjectId; }
    if (termId !== undefined) { const t = await prisma.term.findFirst({ where: { id: termId, schoolId } }); if (!t) throw new AppError('Term not found', 404); data.termId = termId; }
    if (name !== undefined) data.name = name;
    if (type !== undefined) data.type = type;
    if (maxScore !== undefined) data.maxScore = maxScore;
    if (weight !== undefined) data.weight = weight;
    const updated = await prisma.assessment.update({ where: { id: req.params.id }, data });
    await logAction({ userId: req.user.id, schoolId, action: 'UPDATE_ASSESSMENT', entity: 'Assessment', entityId: updated.id, ip: req.ip });
    sendSuccess(res, { assessment: updated });
  } catch (err) { next(err); }
});

router.delete('/assessments/:id', csrfProtection, async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const assessment = await prisma.assessment.findFirst({ where: { id: req.params.id, schoolId } });
    if (!assessment) throw new AppError('Assessment not found', 404);
    await prisma.score.deleteMany({ where: { assessmentId: req.params.id } });
    await prisma.assessment.delete({ where: { id: req.params.id } });
    await logAction({ userId: req.user.id, schoolId, action: 'DELETE_ASSESSMENT', entity: 'Assessment', entityId: req.params.id, ip: req.ip });
    sendSuccess(res, null, 204);
  } catch (err) { next(err); }
});

// ---------- Scores ----------

router.get('/scores', async (req, res, next) => {
  try {
    const where = schoolWhere(req.user);
    if (req.query.assessmentId) where.assessmentId = req.query.assessmentId;
    if (req.query.studentId) where.studentId = req.query.studentId;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const [items, total] = await prisma.$transaction([
      prisma.score.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' }, include: { student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } } } }),
      prisma.score.count({ where })
    ]);
    sendSuccess(res, { items, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
});

router.post('/scores/bulk', csrfProtection, validate({ body: bulkScoreSchema }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const { assessmentId, scores } = req.body;
    const assessment = await prisma.assessment.findFirst({ where: { id: assessmentId, schoolId } });
    if (!assessment) throw new AppError('Assessment not found', 404);
    for (const s of scores) {
      if (s.value > assessment.maxScore) throw new AppError(`Score for ${s.studentId} exceeds max score ${assessment.maxScore}`, 400);
      const student = await prisma.student.findFirst({ where: { id: s.studentId, schoolId } });
      if (!student) throw new AppError(`Student ${s.studentId} not found`, 404);
    }
    const results = [];
    for (const s of scores) {
      const score = await prisma.score.upsert({
        where: { assessmentId_studentId: { assessmentId, studentId: s.studentId } },
        update: { value: s.value, enteredBy: req.user.id },
        create: { schoolId, assessmentId, studentId: s.studentId, value: s.value, enteredBy: req.user.id }
      });
      results.push(score);
    }
    await logAction({ userId: req.user.id, schoolId, action: 'BULK_ENTER_SCORES', entity: 'Score', entityId: assessmentId, ip: req.ip });
    sendSuccess(res, { scores: results }, 201);
  } catch (err) { next(err); }
});

router.patch('/scores/:id', csrfProtection, validate({ body: scoreSchema }), async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const score = await prisma.score.findFirst({ where: { id: req.params.id, schoolId }, include: { assessment: true } });
    if (!score) throw new AppError('Score not found', 404);
    if (req.body.value > score.assessment.maxScore) throw new AppError(`Score exceeds max score ${score.assessment.maxScore}`, 400);
    const updated = await prisma.score.update({ where: { id: req.params.id }, data: { value: req.body.value, enteredBy: req.user.id } });
    await logAction({ userId: req.user.id, schoolId, action: 'UPDATE_SCORE', entity: 'Score', entityId: score.id, ip: req.ip });
    sendSuccess(res, { score: updated });
  } catch (err) { next(err); }
});

// ---------- Term results & ranking ----------

router.get('/results/:classId/:termId', async (req, res, next) => {
  try {
    const schoolId = assertSchoolAccess(req.user);
    const { classId, termId } = req.params;
    const cls = await prisma.class.findFirst({ where: { id: classId, schoolId } });
    if (!cls) throw new AppError('Class not found', 404);
    const term = await prisma.term.findFirst({ where: { id: termId, schoolId } });
    if (!term) throw new AppError('Term not found', 404);
    const classSubjects = await prisma.classSubject.findMany({ where: { classId, schoolId }, include: { subject: { select: { id: true, name: true, code: true } } } });
    const classSubjectIds = classSubjects.map(cs => cs.id);
    const assessments = await prisma.assessment.findMany({
      where: { classSubjectId: { in: classSubjectIds }, termId, schoolId },
      include: { classSubject: { include: { subject: { select: { name: true, code: true } } } } }
    });
    const assessmentIds = assessments.map(a => a.id);
    const scores = await prisma.score.findMany({ where: { assessmentId: { in: assessmentIds }, schoolId }, include: { student: true } });
    const byStudent = {};
    for (const s of scores) {
      if (!byStudent[s.studentId]) byStudent[s.studentId] = { student: s.student, weightedTotal: 0, maxTotal: 0, subjects: {} };
      const a = assessments.find(x => x.id === s.assessmentId);
      if (!a) continue;
      byStudent[s.studentId].weightedTotal += s.value * a.weight;
      byStudent[s.studentId].maxTotal += a.maxScore * a.weight;
      if (!byStudent[s.studentId].subjects[a.classSubject.subject.name]) byStudent[s.studentId].subjects[a.classSubject.subject.name] = [];
      byStudent[s.studentId].subjects[a.classSubject.subject.name].push({ assessment: a.name, value: s.value, maxScore: a.maxScore, type: a.type });
    }
    const gradeScale = await prisma.gradeScale.findMany({ where: { schoolId } });
    const result = Object.values(byStudent).map(st => {
      const percentage = st.maxTotal > 0 ? (st.weightedTotal / st.maxTotal) * 100 : 0;
      let grade = 'N/A', remark = '';
      for (const g of gradeScale) { if (percentage >= g.minScore && percentage <= g.maxScore) { grade = g.grade; remark = g.remark || ''; break; } }
      return { student: st.student, weightedTotal: st.weightedTotal, maxTotal: st.maxTotal, percentage: Math.round(percentage * 100) / 100, grade, remark, subjects: st.subjects };
    });
    result.sort((a, b) => b.weightedTotal - a.weightedTotal);
    result.forEach((r, i) => { r.rank = i + 1; });
    sendSuccess(res, { class: cls, term, results: result });
  } catch (err) { next(err); }
});

export default router;
