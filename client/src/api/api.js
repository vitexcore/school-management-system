const API_BASE = import.meta.env.VITE_API_BASE || '/api';
let csrfToken = null;

async function ensureCsrf() {
  try {
    const res = await fetch(`${API_BASE}/auth/csrf-token`, { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    csrfToken = data.csrfToken;
    return csrfToken;
  } catch {
    return null;
  }
}

async function request(path, opts = {}) {
  const { method = 'GET', body, headers: extra = {} } = opts;
  const headers = {};
  if (!(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && method !== 'HEAD') {
    if (!csrfToken) await ensureCsrf();
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  }
  Object.assign(headers, extra);
  const res = await fetch(`${API_BASE}${path}`, {
    method, headers, credentials: 'include',
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined
  });
  if (res.status === 401) {
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    return { ok: false, status: 401, data: { error: 'Unauthorized' } };
  }
  let data = null;
  try {
    const payload = await res.json();
    data = payload?.success === true && Object.hasOwn(payload, 'data') ? payload.data : payload;
  } catch {}
  return { ok: res.ok, status: res.status, data };
}

export const api = {
  get: (p) => request(p),
  post: (p, b) => request(p, { method: 'POST', body: b }),
  patch: (p, b) => request(p, { method: 'PATCH', body: b }),
  delete: (p) => request(p, { method: 'DELETE' })
};
export { ensureCsrf, API_BASE };
