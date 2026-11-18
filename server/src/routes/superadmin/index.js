import { Router } from 'express';
import plansRoutes from './plans.js';
import subscriptionsRoutes from './subscriptions.js';
import dashboardRoutes from './dashboard.js';
import systemSettingsRoutes from './systemSettings.js';

const router = Router();

router.use('/plans', plansRoutes);
router.use('/subscriptions', subscriptionsRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/system-settings', systemSettingsRoutes);

export default router;
