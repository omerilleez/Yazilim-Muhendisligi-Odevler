// Paylaşılan istemci durumu ve gezinme yardımcıları.
import { get, setToken } from './api.js';

export const state = { me: null, meta: null, unread: 0 };
const listeners = new Set();

export const onChange = (fn) => listeners.add(fn);
export const emit = () => listeners.forEach((fn) => fn(state));

export async function refreshMe() {
  try {
    state.me = await get('/me');
  } catch {
    state.me = null;
  }
  emit();
  return state.me;
}

export function logoutLocal() {
  setToken(null);
  state.me = null;
  state.unread = 0;
  emit();
}

export const navigate = (hash) => {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
};

/** Giriş gerektiren sayfalarda kullanılır; giriş yoksa giriş sayfasına yönlendirir. */
export function requireLogin() {
  if (state.me) return true;
  navigate(`#/giris?next=${encodeURIComponent(location.hash || '#/')}`);
  return false;
}

export const domainLabel = (id) => state.meta?.alanlar.find((d) => d.id === id)?.label ?? id;
