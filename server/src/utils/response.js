export class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function sendSuccess(res, data = null, status = 200) {
  const body = { success: true };
  if (data !== null) body.data = data;
  return res.status(status).json(body);
}

export function sendError(res, message, status = 400) {
  return res.status(status).json({ success: false, error: message });
}
