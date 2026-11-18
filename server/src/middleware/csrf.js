import { doubleCsrf } from 'csrf-csrf';

const csrf = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET,
  cookieName: 'csrf_token',
  getTokenFromRequest: (req) => req.headers['x-csrf-token'],
  cookieOptions: {
    sameSite: 'strict',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    httpOnly: true,
  },
});

export function csrfTokenHandler(req, res) {
  const token = csrf.generateToken(req, res);
  return res.json({ csrfToken: token });
}

export function csrfProtection(req, res, next) {
  if (csrf.validateRequest(req)) {
    return next();
  }
  return res.status(403).json({ success: false, error: 'Forbidden: invalid CSRF token' });
}
