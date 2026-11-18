import { Router } from 'express';
import academicRoutes from './academic.js';
import classRoutes from './classes.js';
import subjectRoutes from './subjects.js';
import teacherRoutes from './teachers.js';
import studentRoutes from './students.js';
import attendanceRoutes from './attendance.js';
import gradeRoutes from './grades.js';
import settingRoutes from './settings.js';
import feeRoutes from './fees.js';
import paymentRoutes from './payments.js';
import reportCardRoutes from './reportCards.js';
import timetableRoutes from './timetable.js';
import announcementRoutes from './announcements.js';
import searchRoutes from './search.js';

const router = Router();

router.use('/academic', academicRoutes);
router.use('/classes', classRoutes);
router.use('/subjects', subjectRoutes);
router.use('/teachers', teacherRoutes);
router.use('/students', studentRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/grades', gradeRoutes);
router.use('/settings', settingRoutes);
router.use('/fees', feeRoutes);
router.use('/payments', paymentRoutes);
router.use('/report-cards', reportCardRoutes);
router.use('/timetable', timetableRoutes);
router.use('/announcements', announcementRoutes);
router.use('/search', searchRoutes);

export default router;
