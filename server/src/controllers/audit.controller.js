import * as auditService from '../services/audit.service.js';
import { sendSuccess } from '../utils/response.js';

export async function getAuditLogs(req, res, next) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const result = await auditService.getAuditLogs({
      filter: {
        userId: req.query.userId || undefined,
        schoolId: req.query.schoolId || undefined,
        action: req.query.action || undefined,
        entity: req.query.entity || undefined,
        from: req.query.from ? new Date(req.query.from) : undefined,
        to: req.query.to ? new Date(req.query.to) : undefined,
      },
      page,
      limit: req.query.format === 'csv' ? 5000 : Math.min(100, limit),
    });
    if (req.query.format === 'csv') {
      const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
      const header = ['createdAt', 'school', 'user', 'action', 'entity', 'entityId', 'ip'].join(',');
      const lines = result.items.map((item) => [item.createdAt.toISOString(), item.school?.name, item.user?.email, item.action, item.entity, item.entityId, item.ip].map(quote).join(','));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.csv"');
      return res.send([header, ...lines].join('\n'));
    }
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
