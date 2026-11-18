import cron from 'node-cron';
import prisma from './prisma.js';
import { logger } from './logger.js';

export function startScheduler() {
  // Mark invoices overdue — runs daily at 00:05
  cron.schedule('5 0 * * *', async () => {
    try {
      const result = await prisma.invoice.updateMany({
        where: {
          dueDate: { lt: new Date() },
          status: { in: ['UNPAID', 'PARTIAL'] },
        },
        data: { status: 'OVERDUE' },
      });
      logger.info(`Marked ${result.count} invoices as OVERDUE`);
    } catch (err) {
      logger.error({ err }, 'Failed to mark invoices overdue');
    }
  });

  // Suspend schools with expired subscriptions — runs daily at 00:10
  cron.schedule('10 0 * * *', async () => {
    try {
      const configuredGrace = await prisma.systemSetting.findUnique({ where: { key: 'gracePeriodDays' } });
      const gracePeriodDays = Number(configuredGrace?.value ?? process.env.SUBSCRIPTION_GRACE_DAYS ?? 7);
      const cutoff = new Date(Date.now() - gracePeriodDays * 24 * 60 * 60 * 1000);

      const expired = await prisma.subscription.findMany({
        where: {
          endsAt: { lt: cutoff },
          status: { in: ['ACTIVE', 'TRIAL'] },
        },
        select: { schoolId: true, id: true },
      });

      for (const sub of expired) {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'PAST_DUE' },
        });
        await prisma.school.update({
          where: { id: sub.schoolId },
          data: { status: 'SUSPENDED' },
        });
        logger.info(`Suspended school ${sub.schoolId} — subscription expired`);
      }
    } catch (err) {
      logger.error({ err }, 'Failed to process expired subscriptions');
    }
  });

  logger.info('Scheduler started');
}
