// REST API istemcisi. Oturum anahtarı localStorage'da tutulur (erişilemezse bellekte).
let memoryToken = null;

export function getToken() {
  try {
    return localStorage.getItem('oa_token') || memoryToken;
  } catch {
    return memoryToken;
  }
}

export function setToken(t) {
  memoryToken = t;
  try {
    if (t) localStorage.setItem('oa_token', t);
    else localStorage.removeItem('oa_token');
  } catch {
    /* gizli pencere vb. */
  }
}

export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, 'Sunucuya ulaşılamadı');
  }
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && token && path !== '/auth/login') setToken(null);
    throw new ApiError(res.status, (data && data.error) || `Hata ${res.status}`, data);
  }
  return data;
}

export const get = (p) => api(p);
export const post = (p, body = {}) => api(p, { method: 'POST', body });
export const put = (p, body = {}) => api(p, { method: 'PUT', body });
export const del = (p) => api(p, { method: 'DELETE' });
