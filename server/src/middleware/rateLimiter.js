import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';

const WINDOW_MS = 15 * 60 * 1000;

export const globalLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later' },
});

export const authLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many attempts, please try again later' },
});

export const loginSlowDown = slowDown({
  windowMs: WINDOW_MS,
  delayAfter: 3,
  delayMs: () => 700,
});
