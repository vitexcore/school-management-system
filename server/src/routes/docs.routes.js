import { Router } from 'express';

const router = Router();

const spec = {
  openapi: '3.0.3',
  info: { title: 'School Management API', version: '3.0.0' },
  servers: [{ url: '/api' }],
  components: {
    securitySchemes: {
      sessionCookie: { type: 'apiKey', in: 'cookie', name: 'access_token' },
      csrfHeader: { type: 'apiKey', in: 'header', name: 'X-CSRF-Token' },
    },
    schemas: {
      ApiError: { type: 'object', required: ['success', 'error'], properties: { success: { type: 'boolean', example: false }, error: { type: 'string' }, requestId: { type: 'string' } } },
      MoneyKobo: { type: 'integer', minimum: 0, description: 'Whole kobo. Never send a floating point naira amount.' },
    },
  },
  paths: {
    '/health': { get: { summary: 'Health check', responses: { 200: { description: 'Healthy' } } } },
    '/school/fees/items': { get: { security: [{ sessionCookie: [] }], summary: 'List fee items', responses: { 200: { description: 'Fee items' } } }, post: { security: [{ sessionCookie: [], csrfHeader: [] }], summary: 'Create fee item', responses: { 201: { description: 'Created' } } } },
    '/school/fees/invoices/generate': { post: { security: [{ sessionCookie: [], csrfHeader: [] }], summary: 'Generate invoices for a class or school', responses: { 200: { description: 'Created/skipped counts' } } } },
    '/school/fees/invoices': { get: { security: [{ sessionCookie: [] }], summary: 'List invoices', responses: { 200: { description: 'Invoices' } } } },
    '/school/fees/debtors': { get: { security: [{ sessionCookie: [] }], summary: 'List debtors or export CSV', responses: { 200: { description: 'Debtors' } } } },
    '/school/fees/summary': { get: { security: [{ sessionCookie: [] }], summary: 'Expected, collected, outstanding totals', responses: { 200: { description: 'Summary' } } } },
    '/school/fees/discounts': { get: { security: [{ sessionCookie: [] }], summary: 'List scholarships and discounts', responses: { 200: { description: 'Discounts' } } }, post: { security: [{ sessionCookie: [], csrfHeader: [] }], summary: 'Apply a scholarship or discount', responses: { 201: { description: 'Created' } } } },
    '/school/payments/record': { post: { security: [{ sessionCookie: [], csrfHeader: [] }], summary: 'Record a cash, transfer, card, or online payment', responses: { 201: { description: 'Confirmed payment and receipt number' } } } },
    '/school/payments/list': { get: { security: [{ sessionCookie: [] }], summary: 'List payments', responses: { 200: { description: 'Payments' } } } },
    '/school/payments/{id}/reverse': { post: { security: [{ sessionCookie: [], csrfHeader: [] }], summary: 'Reverse payment with required reason', responses: { 200: { description: 'Reversed payment' } } } },
    '/school/payments/{id}/receipt': { get: { security: [{ sessionCookie: [] }], summary: 'Download a payment receipt PDF', responses: { 200: { description: 'PDF receipt' } } } },
    '/school/payments/paystack/initialize': { post: { security: [{ sessionCookie: [], csrfHeader: [] }], summary: 'Initialize Paystack transaction', responses: { 200: { description: 'Authorization URL' } } } },
    '/school/payments/paystack/webhook': { post: { summary: 'Paystack signed webhook', responses: { 200: { description: 'Acknowledged' } } } },
    '/school/report-cards': { get: { security: [{ sessionCookie: [] }], summary: 'List report cards', responses: { 200: { description: 'Cards' } } } },
    '/school/report-cards/generate': { post: { security: [{ sessionCookie: [], csrfHeader: [] }], summary: 'Build draft report cards from scores', responses: { 200: { description: 'Generation counts' } } } },
    '/school/report-cards/publish': { post: { security: [{ sessionCookie: [], csrfHeader: [] }], summary: 'Publish draft report cards', responses: { 200: { description: 'Publish counts' } } } },
    '/school/report-cards/{id}/pdf': { get: { security: [{ sessionCookie: [] }], summary: 'Generate report card PDF', responses: { 200: { description: 'PDF report card' } } } },
    '/school/report-cards/bulk-pdf': { post: { security: [{ sessionCookie: [], csrfHeader: [] }], summary: 'Queue class PDF generation in the background', responses: { 202: { description: 'Export job queued' } } } },
    '/school/report-cards/bulk-pdf/{id}': { get: { security: [{ sessionCookie: [] }], summary: 'Check class PDF export status', responses: { 200: { description: 'Job status' } } } },
    '/school/report-cards/bulk-pdf/{id}/download': { get: { security: [{ sessionCookie: [] }], summary: 'Download completed class PDF', responses: { 200: { description: 'Class report card PDF' } } } },
    '/school/timetable': { get: { security: [{ sessionCookie: [] }], summary: 'List class or teacher timetable', responses: { 200: { description: 'Slots' } } }, post: { security: [{ sessionCookie: [], csrfHeader: [] }], summary: 'Create timetable slot with clash detection', responses: { 201: { description: 'Created slot' }, 409: { description: 'Schedule conflict' } } } },
    '/school/announcements': { get: { security: [{ sessionCookie: [] }], summary: 'List announcements', responses: { 200: { description: 'Announcements' } } }, post: { security: [{ sessionCookie: [], csrfHeader: [] }], summary: 'Create sanitized announcement', responses: { 201: { description: 'Created' } } } },
    '/school/search': { get: { security: [{ sessionCookie: [] }], summary: 'Search students and teachers', responses: { 200: { description: 'Search results' } } } },
    '/superadmin/dashboard': { get: { security: [{ sessionCookie: [] }], summary: 'Platform counts, revenue, and school growth', responses: { 200: { description: 'Dashboard data' } } } },
    '/superadmin/plans': { get: { security: [{ sessionCookie: [] }], summary: 'List plans', responses: { 200: { description: 'Plans' } } }, post: { security: [{ sessionCookie: [], csrfHeader: [] }], summary: 'Create plan', responses: { 201: { description: 'Created' } } } },
    '/superadmin/subscriptions': { get: { security: [{ sessionCookie: [] }], summary: 'List subscriptions', responses: { 200: { description: 'Subscriptions' } } }, post: { security: [{ sessionCookie: [], csrfHeader: [] }], summary: 'Assign subscription', responses: { 201: { description: 'Assigned' } } } },
    '/superadmin/system-settings': { get: { security: [{ sessionCookie: [] }], summary: 'Read platform settings', responses: { 200: { description: 'Settings' } } }, patch: { security: [{ sessionCookie: [], csrfHeader: [] }], summary: 'Update platform settings', responses: { 200: { description: 'Saved settings' } } } },
    '/superadmin/audit-logs': { get: { security: [{ sessionCookie: [] }], summary: 'Filter audit log and export CSV', responses: { 200: { description: 'Audit events' } } } },
  },
};

router.get('/openapi.json', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json(spec);
});

export default router;
