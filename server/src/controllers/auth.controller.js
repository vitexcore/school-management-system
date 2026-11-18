import * as authService from '../services/auth.service.js';
import { sendSuccess } from '../utils/response.js';
import { setAuthCookies, clearAuthCookies } from '../utils/cookies.js';

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authService.login({ email, password, ip: req.ip });
    setAuthCookies(res, result.accessToken, result.refreshToken);
    sendSuccess(res, { user: result.user });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req, res, next) {
  try {
    const refreshToken = req.cookies.refresh_token;
    const result = await authService.refresh({ refreshToken, ip: req.ip });
    setAuthCookies(res, result.accessToken, result.refreshToken);
    sendSuccess(res, { user: result.user });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    const refreshToken = req.cookies.refresh_token;
    await authService.logout({ refreshToken, userId: req.user && req.user.id, ip: req.ip });
    clearAuthCookies(res);
    sendSuccess(res, null, 204);
  } catch (err) {
    next(err);
  }
}

export async function me(req, res, next) {
  try {
    const user = await authService.me(req.user.id);
    sendSuccess(res, { user });
  } catch (err) {
    next(err);
  }
}

export async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword({ userId: req.user.id, currentPassword, newPassword, ip: req.ip });
    clearAuthCookies(res);
    sendSuccess(res, { message: 'Password changed. Please log in again.' });
  } catch (err) {
    next(err);
  }
}
