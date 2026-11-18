import { AppError } from '../utils/response.js';
import { logger } from '../utils/logger.js';

export default function errorHandler(err, req, res, next) {
  logger.error({ err, requestId: req.id }, 'Request failed');

  const statusCode = err.statusCode || 500;
  const message = err.statusCode ? err.message : 'Internal server error';

  const body = { success: false, error: message, requestId: req.id };
  if (process.env.NODE_ENV !== 'production') {
    body.stack = err.stack;
  }

  return res.status(statusCode).json(body);
}

export { AppError };
