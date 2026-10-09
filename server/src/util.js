import crypto from 'node:crypto';

// Saat: tohum (seed) verisi geçmiş tarihli üretilebilsin diye kaydırılabilir.
let clockOffset = 0;
export const now = () => Date.now() + clockOffset;
export const setClock = (absoluteMs) => { clockOffset = absoluteMs - Date.now(); };
export const advanceClock = (ms) => { clockOffset += ms; };
export const resetClock = () => { clockOffset = 0; };

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const hmac = (key, s) => crypto.createHmac('sha256', key).update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');
export const uuid = () => crypto.randomUUID();

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
export const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };

export const parseJSON = (s, fallback) => {
  try { return JSON.parse(s); } catch { return fallback; }
};

/** Kırpılmış string; string değilse boş string. */
export const str = (v, max = 10_000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function ageOn(birthDate, at = now()) {
  const b = new Date(birthDate);
  const d = new Date(at);
  let age = d.getUTCFullYear() - b.getUTCFullYear();
  const m = d.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && d.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

/** Anahtarları sıralı, deterministik JSON (defter özetleri için). */
export function canonicalJSON(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(value[k])}`).join(',')}}`;
}

/** Türkçe metni küçük harfe çevirip kelimelere ayırır (yerel yapay zeka ve benzerlik için). */
export function tokenize(text) {
  return String(text || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[^a-zçğıöşü0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

const STOPWORDS = new Set(
  'bir bu şu ve ile için gibi daha çok olan olarak ama ancak fakat veya ya da de da ki mi mı mu mü ise her hem kadar sonra önce bence biz siz onlar ben sen o ne neden nasıl hangi tüm bütün olsun olmalı olur var yok değil diye üzere göre şey çünkü artık zaten sadece yani'.split(' ')
);

export function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
