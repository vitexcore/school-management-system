import { AppError } from '../utils/response.js';
import { verifyAccessToken } from '../utils/jwt.js';

export function authenticate(req, res, next) {
  const token = req.cookies.access_token;
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  try {
    const decoded = verifyAccessToken(token);
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      schoolId: decoded.schoolId || null,
    };
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    next();
  };
}

export function tenantGuard(param = 'schoolId') {
  return (req, res, next) => {
    if (req.user.role === 'SUPERADMIN') {
      return next();
    }
    const target = req.params[param] || req.body.schoolId;
    if (!target || req.user.schoolId !== target) {
      return res.status(403).json({ success: false, error: 'Forbidden: cannot access other school data' });
    }
    next();
  };
}
