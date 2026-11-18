import * as schoolService from '../services/school.service.js';
import { sendSuccess } from '../utils/response.js';

export async function listSchools(req, res, next) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const result = await schoolService.listSchools({
      page,
      limit,
      search: req.query.search || undefined,
      status: req.query.status || undefined,
    });
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getSchool(req, res, next) {
  try {
    const school = await schoolService.getSchool(req.params.id, req.user.role, req.user.schoolId);
    sendSuccess(res, { school });
  } catch (err) {
    next(err);
  }
}

export async function createSchool(req, res, next) {
  try {
    const school = await schoolService.createSchool(req.body, req.user.id, req.ip);
    sendSuccess(res, { school }, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateSchool(req, res, next) {
  try {
    const school = await schoolService.updateSchool(req.params.id, req.body, req.user.id, req.user.role, req.user.schoolId, req.ip);
    sendSuccess(res, { school });
  } catch (err) {
    next(err);
  }
}

export async function deleteSchool(req, res, next) {
  try {
    await schoolService.deleteSchool(req.params.id, req.user.id, req.ip);
    sendSuccess(res, null, 204);
  } catch (err) {
    next(err);
  }
}

export async function suspendSchool(req, res, next) {
  try {
    const school = await schoolService.setSchoolStatus(req.params.id, 'SUSPENDED', req.user.id, req.ip);
    sendSuccess(res, { school });
  } catch (err) {
    next(err);
  }
}

export async function reactivateSchool(req, res, next) {
  try {
    const school = await schoolService.setSchoolStatus(req.params.id, 'ACTIVE', req.user.id, req.ip);
    sendSuccess(res, { school });
  } catch (err) {
    next(err);
  }
}

export async function listSchoolAdmins(req, res, next) {
  try {
    const admins = await schoolService.listSchoolAdmins(req.params.schoolId, req.user.role, req.user.schoolId);
    sendSuccess(res, { admins });
  } catch (err) {
    next(err);
  }
}

export async function createSchoolAdmin(req, res, next) {
  try {
    const admin = await schoolService.createSchoolAdmin(req.params.schoolId, req.body, req.user.id, req.ip);
    sendSuccess(res, { admin }, 201);
  } catch (err) {
    next(err);
  }
}

export async function resetAdminPassword(req, res, next) {
  try {
    const admin = await schoolService.resetAdminPassword(req.params.id, req.body.newPassword, req.user.id, req.user.schoolId, req.ip);
    sendSuccess(res, { admin });
  } catch (err) {
    next(err);
  }
}

export async function getMeAdmin(req, res, next) {
  try {
    if (!req.user.schoolId) throw new Error('No school associated');
    const school = await schoolService.getSchool(req.user.schoolId, req.user.role, req.user.schoolId);
    sendSuccess(res, { school });
  } catch (err) {
    next(err);
  }
}
