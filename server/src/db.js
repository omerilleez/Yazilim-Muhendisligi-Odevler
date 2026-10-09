import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { randomToken } from './util.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- Üyeler: kimlik bilgileri zorunlu, kamuya yalnızca takma ad (nickname) gösterilir.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL UNIQUE COLLATE NOCASE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  birth_date TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone TEXT NOT NULL,
  city TEXT NOT NULL,
  district TEXT NOT NULL,
  address TEXT NOT NULL,
  postal_code TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  identity_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'uye',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER REFERENCES topics(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  domain TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'genel',
  status TEXT NOT NULL DEFAULT 'oylamada',
  articles TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  decided_at INTEGER,
  poll_id INTEGER,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS topic_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id),
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  proposal_id INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS edit_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id),
  proposer TEXT NOT NULL REFERENCES users(id),
  new_title TEXT NOT NULL,
  new_description TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'oylamada',
  poll_id INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS polls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  topic_id INTEGER,
  title TEXT NOT NULL,
  threshold REAL NOT NULL,
  strict INTEGER NOT NULL DEFAULT 1,
  quorum REAL NOT NULL,
  eligible INTEGER NOT NULL,
  opens_at INTEGER NOT NULL,
  early_after INTEGER NOT NULL,
  closes_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'acik',
  decided_at INTEGER,
  outcome TEXT,
  reason TEXT,
  result TEXT,
  minority_alert INTEGER NOT NULL DEFAULT 0,
  appeal_until INTEGER,
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS votes (
  poll_id INTEGER NOT NULL REFERENCES polls(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  choice TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (poll_id, user_id)
);

-- Tartışma mesajları: silinemez, değiştirilemez (aşağıdaki tetikleyiciler).
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  reply_to INTEGER REFERENCES messages(id),
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  hidden_poll_id INTEGER,
  wiped INTEGER NOT NULL DEFAULT 0,
  ai_flags TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS deletion_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES messages(id),
  topic_id INTEGER NOT NULL,
  requester TEXT NOT NULL,
  category TEXT NOT NULL,
  explanation TEXT NOT NULL,
  ai_assessment TEXT,
  status TEXT NOT NULL DEFAULT 'oylamada',
  poll_id INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS minority_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  side TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (poll_id, user_id)
);

CREATE TABLE IF NOT EXISTS appeals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'inceleniyor',
  review_deadline INTEGER NOT NULL,
  reviewer_id TEXT,
  review_note TEXT,
  revote_poll_id INTEGER,
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);

CREATE TABLE IF NOT EXISTS expert_domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  credentials TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'oylamada',
  poll_id INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS expert_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL,
  requester TEXT NOT NULL,
  domain TEXT NOT NULL,
  question TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'acik',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS expert_opinions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL,
  request_id INTEGER,
  expert_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  stance TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- İnsan grafı: takip ve güven kenarları (oy benzerliği ve yanıtlaşmalar hesaplanarak eklenir)
CREATE TABLE IF NOT EXISTS edges (
  from_user TEXT NOT NULL,
  to_user TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_user, to_user, type)
);

-- Zincirleme özetli, imzalı defter
CREATE TABLE IF NOT EXISTS ledger (
  idx INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,
  actor TEXT NOT NULL,
  payload TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  signature TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  link TEXT NOT NULL DEFAULT '',
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, created_at INTEGER NOT NULL);

CREATE INDEX IF NOT EXISTS idx_topics_parent ON topics(parent_id);
CREATE INDEX IF NOT EXISTS idx_topics_status ON topics(status);
CREATE INDEX IF NOT EXISTS idx_messages_topic ON messages(topic_id);
CREATE INDEX IF NOT EXISTS idx_polls_status ON polls(status);
CREATE INDEX IF NOT EXISTS idx_votes_user ON votes(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_type ON ledger(type);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);

-- Yönetmelik Madde 7: tartışmalar silinmez. Tek istisna, 2/3 kabul görmüş "kişisel veri"
-- gerekçeli gizleme oylamasından sonra içeriğin boşaltılmasıdır (özet defterde kalır).
CREATE TRIGGER IF NOT EXISTS messages_no_delete BEFORE DELETE ON messages
BEGIN SELECT RAISE(ABORT, 'Yönetmelik Madde 7: tartışma mesajları silinemez'); END;

CREATE TRIGGER IF NOT EXISTS messages_immutable
BEFORE UPDATE OF content, content_hash, user_id, topic_id, created_at, reply_to ON messages
WHEN NOT (NEW.content = '' AND NEW.wiped = 1 AND OLD.wiped = 0 AND NEW.hidden = 1
          AND NEW.hidden_poll_id IS NOT NULL AND NEW.content_hash = OLD.content_hash
          AND NEW.user_id = OLD.user_id AND NEW.topic_id = OLD.topic_id
          AND NEW.created_at = OLD.created_at AND NEW.reply_to IS OLD.reply_to)
BEGIN SELECT RAISE(ABORT, 'Yönetmelik Madde 7: tartışma mesajları değiştirilemez'); END;

CREATE TRIGGER IF NOT EXISTS messages_hide_needs_poll BEFORE UPDATE OF hidden ON messages
WHEN NEW.hidden = 1 AND NEW.hidden_poll_id IS NULL
BEGIN SELECT RAISE(ABORT, 'Yönetmelik Madde 8: gizleme yalnızca oylamayla yapılabilir'); END;

CREATE TRIGGER IF NOT EXISTS ledger_no_update BEFORE UPDATE ON ledger
BEGIN SELECT RAISE(ABORT, 'Defter kayıtları değiştirilemez'); END;
CREATE TRIGGER IF NOT EXISTS ledger_no_delete BEFORE DELETE ON ledger
BEGIN SELECT RAISE(ABORT, 'Defter kayıtları silinemez'); END;
CREATE TRIGGER IF NOT EXISTS votes_no_delete BEFORE DELETE ON votes
BEGIN SELECT RAISE(ABORT, 'Oylar silinemez'); END;
`;

const bind = (params) => params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

function wrap(raw) {
  const cache = new Map();
  let depth = 0;
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) {
      s = raw.prepare(sql);
      cache.set(sql, s);
    }
    return s;
  };
  return {
    raw,
    all: (sql, ...p) => stmt(sql).all(...bind(p)),
    get: (sql, ...p) => stmt(sql).get(...bind(p)),
    run: (sql, ...p) => stmt(sql).run(...bind(p)),
    exec: (sql) => raw.exec(sql),
    /** İç içe çağrılabilen işlem (transaction). */
    tx(fn) {
      if (depth > 0) return fn();
      depth++;
      raw.exec('BEGIN IMMEDIATE');
      try {
        const result = fn();
        raw.exec('COMMIT');
        return result;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      } finally {
        depth--;
      }
    },
    close: () => raw.close(),
  };
}

/** Modül genelinde paylaşılan veritabanı (ESM canlı bağlama ile güncellenir). */
export let db = null;

export function initDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  raw.exec(SCHEMA);
  db = wrap(raw);
  return db;
}

export function closeDb() {
  if (db) db.close();
  db = null;
}

export function getMeta(key) {
  return db.get('SELECT value FROM meta WHERE key = ?', key)?.value ?? null;
}

export function setMeta(key, value) {
  db.run('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}

/** Uygulama sırrı: oy takma adları ve kimlik özetleri için HMAC anahtarı. */
export function appSecret() {
  if (process.env.APP_SECRET) return process.env.APP_SECRET;
  let s = getMeta('app_secret');
  if (!s) {
    s = randomToken(32);
    setMeta('app_secret', s);
  }
  return s;
}
