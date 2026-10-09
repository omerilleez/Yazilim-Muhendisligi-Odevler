// İş kuralları: üyelik, konular, tartışmalar, düzenleme teklifleri, gizleme talepleri, bilirkişilik,
// insan grafı kenarları, bildirimler ve görünümler. HTTP katmanı (routes.js), tohum verisi (seed.js)
// ve testler aynı fonksiyonları kullanır.
import { db, appSecret } from './db.js';
import * as ledger from './ledger.js';
import * as polls from './polls.js';
import * as ai from './ai.js';
import { config } from './config.js';
import { now, DAY, sha256, hmac, fail, str, parseJSON, ageOn, hashPassword, verifyPassword, randomToken, uuid } from './util.js';
import { DOMAIN_IDS, TOPIC_KINDS, DELETION_CATEGORIES, ARTICLES, POLL_KINDS, domainLabel } from './ontology.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NICK = /^[A-Za-z0-9_.çğıöşüÇĞİÖŞÜ]{3,24}$/u;
const SESSION_DAYS = 30;
const STANCES = ['destek', 'karsi', 'notr', 'sartli'];

// =============================================================== üyelik
export function register(body = {}) {
  const d = {
    first_name: str(body.first_name, 60),
    last_name: str(body.last_name, 60),
    birth_date: str(body.birth_date, 10),
    email: str(body.email, 120).toLowerCase(),
    phone: str(body.phone, 30),
    city: str(body.city, 60),
    district: str(body.district, 60),
    address: str(body.address, 300),
    postal_code: str(body.postal_code, 10),
    nickname: str(body.nickname, 24),
    bio: str(body.bio, 500),
  };
  const password = typeof body.password === 'string' ? body.password : '';
  const errors = {};
  const labels = { first_name: 'Ad', last_name: 'Soyad', birth_date: 'Doğum tarihi', email: 'E-posta', phone: 'Telefon', city: 'İl', district: 'İlçe', address: 'Açık adres', nickname: 'Takma ad' };
  for (const [k, label] of Object.entries(labels)) if (!d[k]) errors[k] = `${label} zorunludur`;
  if (d.nickname && !NICK.test(d.nickname)) errors.nickname = 'Takma ad 3-24 karakter olmalı; harf, rakam, _ ve . içerebilir';
  if (d.birth_date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.birth_date) || Number.isNaN(Date.parse(d.birth_date))) errors.birth_date = 'Doğum tarihi YYYY-AA-GG biçiminde olmalı';
    else if (ageOn(d.birth_date) < config.minAge) errors.birth_date = `${config.minAge} yaşından küçükler üye olamaz (Madde 16)`;
    else if (ageOn(d.birth_date) > 120) errors.birth_date = 'Geçersiz doğum tarihi';
  }
  if (d.email && !EMAIL.test(d.email)) errors.email = 'Geçerli bir e-posta adresi girin';
  const digits = d.phone.replace(/\D/g, '');
  if (d.phone && (digits.length < 10 || digits.length > 13)) errors.phone = 'Geçerli bir telefon numarası girin';
  if (d.address && d.address.length < 10) errors.address = 'Açık adres en az 10 karakter olmalı';
  if (password.length < 8) errors.password = 'Parola en az 8 karakter olmalı';
  if (!errors.nickname && db.get('SELECT 1 FROM users WHERE nickname = ?', d.nickname)) errors.nickname = 'Bu takma ad kullanılıyor';
  if (!errors.email && db.get('SELECT 1 FROM users WHERE email = ?', d.email)) errors.email = 'Bu e-posta ile kayıtlı bir üye var';
  if (Object.keys(errors).length) fail(400, 'Kayıt formunda hatalar var', { errors });

  const id = uuid();
  const identityHash = hmac(appSecret(), [d.first_name, d.last_name, d.birth_date, d.email].join('|').toLocaleLowerCase('tr-TR'));
  db.tx(() => {
    db.run(
      `INSERT INTO users (id, nickname, first_name, last_name, birth_date, email, phone, city, district, address, postal_code, bio, password_hash, identity_hash, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, d.nickname, d.first_name, d.last_name, d.birth_date, d.email, d.phone, d.city, d.district, d.address, d.postal_code, d.bio, hashPassword(password), identityHash, now()
    );
    // Deftere kişisel veri değil, yalnızca kimlik özeti yazılır (Madde 2).
    ledger.append('uye_kaydi', id, { user_id: id, takmaAd: d.nickname, kimlikOzeti: identityHash.slice(0, 32) });
  });
  return { token: createSession(id), user: privateUser(getUser(id)) };
}

export function login(identifier, password) {
  const id = str(identifier, 120);
  const u = db.get('SELECT * FROM users WHERE email = ? OR nickname = ?', id.toLowerCase(), id);
  if (!u || typeof password !== 'string' || !verifyPassword(password, u.password_hash)) fail(401, 'E-posta/takma ad veya parola hatalı');
  return { token: createSession(u.id), user: privateUser(u) };
}

export function createSession(userId) {
  const token = randomToken(32);
  db.run('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)', token, userId, Date.now(), Date.now() + SESSION_DAYS * DAY);
  return token;
}

export function userFromToken(token) {
  if (!token) return null;
  return db.get('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?', token, Date.now()) || null;
}

export const logout = (token) => db.run('DELETE FROM sessions WHERE token = ?', token);
export const getUser = (id) => db.get('SELECT * FROM users WHERE id = ?', id);

export function expertiseOf(userId) {
  return db.all("SELECT domain, status FROM expert_domains WHERE user_id = ? AND status IN ('onayli','oylamada','itiraz_suresi','askida')", userId)
    .map((e) => ({ ...e, label: domainLabel(e.domain) }));
}

export function privateUser(u) {
  if (!u) return null;
  const { password_hash, identity_hash, ...rest } = u;
  return { ...rest, age: ageOn(u.birth_date), uzmanlik: expertiseOf(u.id) };
}

export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, nickname: u.nickname, bio: u.bio, created_at: u.created_at, uzmanlik: expertiseOf(u.id).filter((e) => e.status === 'onayli') };
}

export function updateProfile(user, body = {}) {
  const fields = { phone: 30, city: 60, district: 60, address: 300, postal_code: 10, bio: 500 };
  const changes = {};
  for (const [k, max] of Object.entries(fields)) if (typeof body[k] === 'string') changes[k] = str(body[k], max);
  for (const k of ['phone', 'city', 'district', 'address']) if (k in changes && !changes[k]) fail(400, 'Telefon, il, ilçe ve adres boş bırakılamaz');
  if ('address' in changes && changes.address.length < 10) fail(400, 'Açık adres en az 10 karakter olmalı');
  const keys = Object.keys(changes);
  if (!keys.length) return privateUser(user);
  db.tx(() => {
    db.run(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => changes[k]), user.id);
    ledger.append('profil_guncellendi', user.id, { user_id: user.id, alanlar: keys });
  });
  return privateUser(getUser(user.id));
}

export function userProfile(id, viewer) {
  const u = getUser(id) || db.get('SELECT * FROM users WHERE nickname = ?', id);
  if (!u) fail(404, 'Üye bulunamadı');
  const edgeCount = (sql) => db.get(sql, u.id).c;
  return {
    ...publicUser(u),
    istatistik: {
      konu: db.get('SELECT COUNT(*) AS c FROM topics WHERE created_by = ?', u.id).c,
      mesaj: db.get('SELECT COUNT(*) AS c FROM messages WHERE user_id = ?', u.id).c,
      oy: db.get('SELECT COUNT(*) AS c FROM votes WHERE user_id = ?', u.id).c,
      takipci: edgeCount("SELECT COUNT(*) AS c FROM edges WHERE to_user = ? AND type = 'takip'"),
      takip: edgeCount("SELECT COUNT(*) AS c FROM edges WHERE from_user = ? AND type = 'takip'"),
      guvenen: edgeCount("SELECT COUNT(*) AS c FROM edges WHERE to_user = ? AND type = 'guven'"),
    },
    takipEdiyorum: !!viewer && !!db.get("SELECT 1 FROM edges WHERE from_user = ? AND to_user = ? AND type = 'takip'", viewer.id, u.id),
    guveniyorum: !!viewer && !!db.get("SELECT 1 FROM edges WHERE from_user = ? AND to_user = ? AND type = 'guven'", viewer.id, u.id),
    konular: db.all('SELECT id, title, status, domain, created_at FROM topics WHERE created_by = ? ORDER BY created_at DESC LIMIT 20', u.id),
  };
}

export function searchUsers(q) {
  const term = `%${str(q, 40)}%`;
  return db.all('SELECT * FROM users WHERE nickname LIKE ? ORDER BY nickname LIMIT 30', term).map(publicUser);
}

export function setEdge(user, targetId, type, on) {
  if (!['takip', 'guven'].includes(type)) fail(400, 'Geçersiz ilişki türü');
  if (targetId === user.id) fail(400, 'Kendinizle ilişki kuramazsınız');
  if (!getUser(targetId)) fail(404, 'Üye bulunamadı');
  db.tx(() => {
    if (on) db.run('INSERT OR IGNORE INTO edges (from_user, to_user, type, created_at) VALUES (?,?,?,?)', user.id, targetId, type, now());
    else db.run('DELETE FROM edges WHERE from_user = ? AND to_user = ? AND type = ?', user.id, targetId, type);
    ledger.append('iliski', user.id, { kimden: user.id, kime: targetId, tur: type, durum: on ? 'eklendi' : 'kaldirildi' });
  });
}

// =============================================================== konular
function validArticles(list) {
  const valid = new Set(ARTICLES.map((a) => a.no));
  return [...new Set((Array.isArray(list) ? list : []).map(Number).filter((n) => valid.has(n)))].sort((a, b) => a - b);
}

export function createTopic(user, body = {}) {
  const title = str(body.title, 140);
  const description = str(body.description, 5000);
  const parentId = body.parent_id ? Number(body.parent_id) : null;
  const parent = parentId ? db.get('SELECT * FROM topics WHERE id = ?', parentId) : null;
  if (parentId && !parent) fail(404, 'Üst konu bulunamadı');
  if (parent && parent.status !== 'kabul') fail(409, 'Alt konu yalnızca kabul edilmiş bir konunun altında önerilebilir (Madde 5)');
  const domain = str(body.domain, 30) || parent?.domain;
  const kind = str(body.kind, 20) || parent?.kind || 'genel';
  if (title.length < 5) fail(400, 'Başlık en az 5 karakter olmalı');
  if (description.length < 20) fail(400, 'Açıklama en az 20 karakter olmalı');
  if (!DOMAIN_IDS.includes(domain)) fail(400, 'Geçerli bir alan seçin (ontoloji)');
  if (!TOPIC_KINDS[kind]) fail(400, 'Geçersiz konu türü');
  if (db.get("SELECT 1 FROM topics WHERE title = ? COLLATE NOCASE AND status != 'red'", title)) fail(409, 'Aynı başlıkta bir konu zaten var');
  const open = db.get("SELECT COUNT(*) AS c FROM topics WHERE created_by = ? AND status = 'oylamada'", user.id).c;
  if (open >= 5) fail(429, 'Aynı anda en fazla 5 konunuz oylamada olabilir');

  const local = ai.classifyLocal(title, description);
  let articles = validArticles(body.articles);
  if (!articles.length) articles = local.articles;
  for (const n of [3, 4, 6]) if (!articles.includes(n)) articles.push(n);
  if (parent && !articles.includes(5)) articles.push(5);
  if (kind === 'yonetmelik' && !articles.includes(11)) articles.push(11);
  articles.sort((a, b) => a - b);
  const tags = (Array.isArray(body.tags) && body.tags.length ? body.tags : local.tags).map((t) => str(t, 30)).filter(Boolean).slice(0, 6);
  const rule = TOPIC_KINDS[kind];

  const topicId = db.tx(() => {
    const info = db.run(
      'INSERT INTO topics (parent_id, title, description, domain, kind, articles, tags, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      parentId, title, description, domain, kind, JSON.stringify(articles), JSON.stringify(tags), user.id, now()
    );
    const id = Number(info.lastInsertRowid);
    db.run('INSERT INTO topic_versions (topic_id, version, title, description, created_at) VALUES (?,?,?,?,?)', id, 1, title, description, now());
    ledger.append('konu_onerildi', user.id, {
      topic_id: id, baslik: title, alan: domain, tur: kind, ust: parentId, maddeler: articles, icerikOzeti: sha256(`${title}\n${description}`),
    });
    const poll = polls.createPoll({
      kind: parentId ? 'altkonu' : 'konu',
      targetId: id,
      topicId: id,
      title: parentId ? `Alt konu: ${title}` : title,
      threshold: rule.threshold,
      strict: rule.strict,
      minutes: kind === 'yonetmelik' ? config.regulationPollMinutes : config.pollMinutes,
      createdBy: user.id,
    });
    db.run('UPDATE topics SET poll_id = ? WHERE id = ?', poll.id, id);
    return id;
  });
  return topicDetail(topicId, user);
}

function topicRow(t) {
  return {
    ...t,
    articles: parseJSON(t.articles, []),
    tags: parseJSON(t.tags, []),
    domainLabel: domainLabel(t.domain),
    kindLabel: TOPIC_KINDS[t.kind]?.label ?? t.kind,
  };
}

export function listTopics(filter = {}) {
  const where = [];
  const params = [];
  if (filter.status) { where.push('t.status = ?'); params.push(filter.status); }
  if (filter.domain) { where.push('t.domain = ?'); params.push(filter.domain); }
  if (filter.parent === 'root') where.push('t.parent_id IS NULL');
  else if (filter.parent) { where.push('t.parent_id = ?'); params.push(Number(filter.parent)); }
  if (filter.q) { where.push('(t.title LIKE ? OR t.description LIKE ?)'); params.push(`%${filter.q}%`, `%${filter.q}%`); }
  if (filter.user) { where.push('t.created_by = ?'); params.push(filter.user); }
  const rows = db.all(
    `SELECT t.*, u.nickname,
       (SELECT COUNT(*) FROM messages m WHERE m.topic_id = t.id) AS mesajSayisi,
       (SELECT COUNT(*) FROM topics c WHERE c.parent_id = t.id) AS altKonuSayisi,
       p.status AS pollStatus, p.closes_at, p.eligible
     FROM topics t JOIN users u ON u.id = t.created_by LEFT JOIN polls p ON p.id = t.poll_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY t.created_at DESC LIMIT ?`,
    ...params, Math.min(Number(filter.limit) || 200, 500)
  );
  return rows.map((t) => {
    const poll = t.poll_id ? polls.getPoll(t.poll_id) : null;
    return { ...topicRow(t), tally: poll ? polls.tally(poll) : null };
  });
}

export function topicTree() {
  const rows = db.all(
    `SELECT t.*, u.nickname, (SELECT COUNT(*) FROM messages m WHERE m.topic_id = t.id) AS mesajSayisi
     FROM topics t JOIN users u ON u.id = t.created_by WHERE t.status != 'red' ORDER BY t.created_at`
  ).map(topicRow);
  const byParent = new Map();
  for (const t of rows) {
    const k = t.parent_id ?? 0;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(t);
  }
  const build = (pid) => (byParent.get(pid) || []).map((t) => ({ ...t, children: build(t.id) }));
  return build(0);
}

export function getTopic(id) {
  const t = db.get('SELECT * FROM topics WHERE id = ?', Number(id));
  if (!t) fail(404, 'Konu bulunamadı');
  return t;
}

export function topicDetail(id, viewer = null) {
  const t = getTopic(id);
  const creator = getUser(t.created_by);
  const poll = t.poll_id ? polls.getPoll(t.poll_id) : null;
  const children = db.all('SELECT t.*, u.nickname FROM topics t JOIN users u ON u.id = t.created_by WHERE t.parent_id = ? ORDER BY t.created_at', t.id)
    .map((c) => ({ ...topicRow(c), tally: c.poll_id ? polls.tally(polls.getPoll(c.poll_id)) : null }));
  const proposals = db.all('SELECT p.*, u.nickname FROM edit_proposals p JOIN users u ON u.id = p.proposer WHERE p.topic_id = ? ORDER BY p.created_at DESC', t.id)
    .map((p) => ({ ...p, tally: p.poll_id ? polls.tally(polls.getPoll(p.poll_id)) : null }));
  const ancestors = [];
  let cur = t.parent_id ? db.get('SELECT id, title, parent_id FROM topics WHERE id = ?', t.parent_id) : null;
  while (cur) {
    ancestors.unshift({ id: cur.id, title: cur.title });
    cur = cur.parent_id ? db.get('SELECT id, title, parent_id FROM topics WHERE id = ?', cur.parent_id) : null;
  }
  const relatedPolls = db.all('SELECT id FROM polls WHERE topic_id = ? ORDER BY opens_at DESC', t.id).map((r) => polls.getPoll(r.id));
  const reports = db.all(
    `SELECT r.*, u.nickname, p.title AS poll_title FROM minority_reports r JOIN users u ON u.id = r.user_id JOIN polls p ON p.id = r.poll_id
     WHERE p.topic_id = ? ORDER BY r.created_at`, t.id
  );
  const isExpert = viewer ? !!db.get("SELECT 1 FROM expert_domains WHERE user_id = ? AND domain = ? AND status = 'onayli'", viewer.id, t.domain) : false;
  const articleSet = new Set(parseJSON(t.articles, []));
  return {
    ...topicRow(t),
    creator: publicUser(creator),
    ancestors,
    poll: poll ? polls.pollView(poll, viewer) : null,
    children,
    proposals,
    versions: db.all('SELECT * FROM topic_versions WHERE topic_id = ? ORDER BY version DESC', t.id),
    expertOpinions: db.all(
      'SELECT o.*, u.nickname FROM expert_opinions o JOIN users u ON u.id = o.expert_id WHERE o.topic_id = ? ORDER BY o.created_at DESC', t.id
    ),
    expertRequests: db.all('SELECT r.*, u.nickname FROM expert_requests r JOIN users u ON u.id = r.requester WHERE r.topic_id = ? ORDER BY r.created_at DESC', t.id),
    deletionRequests: db.all(
      `SELECT d.id, d.message_id, d.category, d.explanation, d.status, d.poll_id, d.created_at, u.nickname FROM deletion_requests d
       JOIN users u ON u.id = d.requester WHERE d.topic_id = ? ORDER BY d.created_at DESC`, t.id
    ).map((d) => ({ ...d, categoryLabel: DELETION_CATEGORIES[d.category] })),
    minorityReports: reports,
    polls: relatedPolls.map((p) => ({ id: p.id, kind: p.kind, turEtiketi: POLL_KINDS[p.kind], title: p.title, status: p.status, outcome: p.outcome, opens_at: p.opens_at })),
    articleDetails: ARTICLES.filter((a) => articleSet.has(a.no)),
    messageCount: db.get('SELECT COUNT(*) AS c FROM messages WHERE topic_id = ?', t.id).c,
    canPropose: !!viewer && t.status === 'kabul',
    canSubtopic: !!viewer && t.status === 'kabul',
    isExpert,
    similar: ai.similarTopics(`${t.title} ${t.description}`, t.id),
  };
}

// =============================================================== tartışma
function messageView(m, viewer) {
  const hidden = !!m.hidden;
  const req = hidden && m.hidden_poll_id ? db.get('SELECT d.category FROM polls p JOIN deletion_requests d ON d.id = p.target_id WHERE p.id = ?', m.hidden_poll_id) : null;
  const pending = db.get("SELECT id, poll_id, category FROM deletion_requests WHERE message_id = ? AND status IN ('oylamada','itiraz_suresi','askida')", m.id);
  return {
    id: m.id,
    topic_id: m.topic_id,
    user_id: m.user_id,
    nickname: m.nickname,
    reply_to: m.reply_to,
    content: hidden ? null : m.content,
    content_hash: m.content_hash,
    created_at: m.created_at,
    hidden,
    wiped: !!m.wiped,
    hiddenInfo: hidden ? { poll_id: m.hidden_poll_id, category: req?.category, categoryLabel: DELETION_CATEGORIES[req?.category] } : null,
    pendingDeletion: pending ? { ...pending, categoryLabel: DELETION_CATEGORIES[pending.category] } : null,
    aiFlags: parseJSON(m.ai_flags, []),
    mine: !!viewer && viewer.id === m.user_id,
  };
}

export function listMessages(topicId, viewer) {
  getTopic(topicId);
  return db.all('SELECT m.*, u.nickname FROM messages m JOIN users u ON u.id = m.user_id WHERE m.topic_id = ? ORDER BY m.created_at, m.id', Number(topicId))
    .map((m) => messageView(m, viewer));
}

export function postMessage(user, topicId, body = {}) {
  const topic = getTopic(topicId);
  const content = str(body.content, 4000);
  if (!content) fail(400, 'Mesaj boş olamaz');
  const replyTo = body.reply_to ? Number(body.reply_to) : null;
  if (replyTo && !db.get('SELECT 1 FROM messages WHERE id = ? AND topic_id = ?', replyTo, topic.id)) fail(400, 'Yanıtlanan mesaj bu konuda değil');
  const last = db.get('SELECT created_at FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', user.id);
  if (last && now() - last.created_at < 3000 && !body._seed) fail(429, 'Çok hızlı mesaj gönderiyorsunuz, birkaç saniye bekleyin');
  const flags = ai.moderateLocal(content).riskler;
  const hash = sha256(content);
  const id = db.tx(() => {
    const info = db.run(
      'INSERT INTO messages (topic_id, user_id, reply_to, content, content_hash, created_at, ai_flags) VALUES (?,?,?,?,?,?,?)',
      topic.id, user.id, replyTo, content, hash, now(), JSON.stringify(flags)
    );
    const mid = Number(info.lastInsertRowid);
    ledger.append('mesaj', user.id, { message_id: mid, topic_id: topic.id, yanit: replyTo, icerikOzeti: hash });
    if (replyTo) {
      const parent = db.get('SELECT user_id FROM messages WHERE id = ?', replyTo);
      if (parent.user_id !== user.id) polls.notify(parent.user_id, `${user.nickname} mesajınızı yanıtladı: “${topic.title}”`, `#/konu/${topic.id}`);
    }
    return mid;
  });
  if (ai.aiStatus().mod === 'claude' && !body._seed) {
    ai.moderate(content)
      .then((r) => { if (r?.riskler && !r._uyari) db.run('UPDATE messages SET ai_flags = ? WHERE id = ?', JSON.stringify(r.riskler), id); })
      .catch(() => {});
  }
  return messageView(db.get('SELECT m.*, u.nickname FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?', id), user);
}

// =============================================================== düzenleme teklifleri
export function createProposal(user, topicId, body = {}) {
  const topic = getTopic(topicId);
  if (topic.status !== 'kabul') fail(409, 'Düzenleme teklifi yalnızca kabul edilmiş konulara verilebilir');
  const newTitle = str(body.new_title, 140) || topic.title;
  const newDescription = str(body.new_description, 5000) || topic.description;
  const reason = str(body.reason, 2000);
  if (newTitle.length < 5 || newDescription.length < 20) fail(400, 'Yeni başlık en az 5, açıklama en az 20 karakter olmalı');
  if (newTitle === topic.title && newDescription === topic.description) fail(400, 'Teklif mevcut metinle aynı');
  if (reason.length < 10) fail(400, 'Gerekçe en az 10 karakter olmalı');
  if (db.get("SELECT 1 FROM edit_proposals WHERE topic_id = ? AND proposer = ? AND status = 'oylamada'", topic.id, user.id)) {
    fail(409, 'Bu konuda oylamada olan bir teklifiniz zaten var');
  }
  const rule = TOPIC_KINDS[topic.kind];
  return db.tx(() => {
    const info = db.run(
      'INSERT INTO edit_proposals (topic_id, proposer, new_title, new_description, reason, created_at) VALUES (?,?,?,?,?,?)',
      topic.id, user.id, newTitle, newDescription, reason, now()
    );
    const pid = Number(info.lastInsertRowid);
    ledger.append('duzenleme_teklifi', user.id, { proposal_id: pid, topic_id: topic.id, icerikOzeti: sha256(`${newTitle}\n${newDescription}`) });
    const poll = polls.createPoll({
      kind: 'duzenleme', targetId: pid, topicId: topic.id, title: `Düzenleme teklifi: ${topic.title}`,
      threshold: rule.threshold, strict: rule.strict, createdBy: user.id,
    });
    db.run('UPDATE edit_proposals SET poll_id = ? WHERE id = ?', poll.id, pid);
    return db.get('SELECT * FROM edit_proposals WHERE id = ?', pid);
  });
}

// =============================================================== gizleme talepleri
export function requestDeletion(user, messageId, body = {}) {
  const m = db.get('SELECT * FROM messages WHERE id = ?', Number(messageId));
  if (!m) fail(404, 'Mesaj bulunamadı');
  if (m.hidden) fail(409, 'Mesaj zaten gizlenmiş');
  const category = str(body.category, 30);
  if (!DELETION_CATEGORIES[category]) fail(400, 'Geçersiz gerekçe. Görüş ayrılığı gizleme gerekçesi olamaz (Madde 8).');
  const explanation = str(body.explanation, 2000);
  if (explanation.length < 10) fail(400, 'Açıklama en az 10 karakter olmalı');
  if (db.get("SELECT 1 FROM deletion_requests WHERE message_id = ? AND status IN ('oylamada','itiraz_suresi','askida')", m.id)) {
    fail(409, 'Bu mesaj için zaten açık bir gizleme oylaması var');
  }
  // Susturma koruması: bir üyenin mesajlarına aynı anda en fazla 2 açık gizleme talebi olabilir.
  const openOnAuthor = db.get(
    "SELECT COUNT(*) AS c FROM deletion_requests d JOIN messages x ON x.id = d.message_id WHERE x.user_id = ? AND d.status IN ('oylamada','itiraz_suresi','askida')",
    m.user_id
  ).c;
  if (openOnAuthor >= 2) fail(429, 'Bu üyenin mesajlarına yönelik zaten 2 açık gizleme talebi var (susturma koruması)');
  const assessment = ai.assessDeletionLocal(m.content, category);
  const id = db.tx(() => {
    const info = db.run(
      'INSERT INTO deletion_requests (message_id, topic_id, requester, category, explanation, ai_assessment, created_at) VALUES (?,?,?,?,?,?,?)',
      m.id, m.topic_id, user.id, category, explanation, JSON.stringify({ ...assessment, _kaynak: 'yerel' }), now()
    );
    const rid = Number(info.lastInsertRowid);
    ledger.append('gizleme_talebi', user.id, { request_id: rid, message_id: m.id, gerekce: category });
    const poll = polls.createPoll({
      kind: 'silme', targetId: rid, topicId: m.topic_id, title: `Mesaj #${m.id} gizlensin mi? (${DELETION_CATEGORIES[category]})`,
      threshold: 2 / 3, strict: false, createdBy: user.id,
    });
    db.run('UPDATE deletion_requests SET poll_id = ? WHERE id = ?', poll.id, rid);
    if (m.user_id !== user.id) polls.notify(m.user_id, `Mesajınız #${m.id} için gizleme oylaması açıldı. Oylamada savunma mesajı yazabilir, şerh düşebilirsiniz.`, `#/oylama/${poll.id}`);
    return rid;
  });
  if (ai.aiStatus().mod === 'claude' && !body._seed) {
    ai.assessDeletion(m.content, category, explanation)
      .then((r) => { if (r && !r._uyari) db.run('UPDATE deletion_requests SET ai_assessment = ? WHERE id = ?', JSON.stringify(r), id); })
      .catch(() => {});
  }
  return db.get('SELECT * FROM deletion_requests WHERE id = ?', id);
}

// =============================================================== bilirkişilik
export function applyExpert(user, body = {}) {
  const domain = str(body.domain, 30);
  const credentials = str(body.credentials, 3000);
  if (!DOMAIN_IDS.includes(domain)) fail(400, 'Geçerli bir alan seçin');
  if (credentials.length < 30) fail(400, 'Uzmanlık açıklaması en az 30 karakter olmalı (eğitim, deneyim, belgeler)');
  if (db.get("SELECT 1 FROM expert_domains WHERE user_id = ? AND domain = ? AND status IN ('onayli','oylamada','itiraz_suresi','askida')", user.id, domain)) {
    fail(409, 'Bu alanda zaten onaylı ya da değerlendirmede bir başvurunuz var');
  }
  return db.tx(() => {
    const info = db.run('INSERT INTO expert_domains (user_id, domain, credentials, created_at) VALUES (?,?,?,?)', user.id, domain, credentials, now());
    const eid = Number(info.lastInsertRowid);
    ledger.append('bilirkisi_basvurusu', user.id, { basvuru_id: eid, alan: domain });
    const poll = polls.createPoll({ kind: 'bilirkisi', targetId: eid, title: `${user.nickname} — ${domainLabel(domain)} bilirkişiliği`, createdBy: user.id });
    db.run('UPDATE expert_domains SET poll_id = ? WHERE id = ?', poll.id, eid);
    return db.get('SELECT * FROM expert_domains WHERE id = ?', eid);
  });
}

export function listExperts() {
  const rows = db.all(
    `SELECT e.*, u.nickname, u.bio FROM expert_domains e JOIN users u ON u.id = e.user_id
     WHERE e.status IN ('onayli','oylamada','itiraz_suresi','askida') ORDER BY e.domain, u.nickname`
  ).map((e) => ({ ...e, domainLabel: domainLabel(e.domain), gorusSayisi: db.get('SELECT COUNT(*) AS c FROM expert_opinions WHERE expert_id = ? AND domain = ?', e.user_id, e.domain).c }));
  return { onayli: rows.filter((r) => r.status === 'onayli'), basvurular: rows.filter((r) => r.status !== 'onayli') };
}

export function createExpertRequest(user, topicId, body = {}) {
  const topic = getTopic(topicId);
  const question = str(body.question, 2000);
  if (question.length < 10) fail(400, 'Soru en az 10 karakter olmalı');
  return db.tx(() => {
    const info = db.run('INSERT INTO expert_requests (topic_id, requester, domain, question, created_at) VALUES (?,?,?,?,?)', topic.id, user.id, topic.domain, question, now());
    const rid = Number(info.lastInsertRowid);
    ledger.append('bilirkisi_talebi', user.id, { request_id: rid, topic_id: topic.id, alan: topic.domain });
    const experts = db.all("SELECT user_id FROM expert_domains WHERE domain = ? AND status = 'onayli'", topic.domain).map((r) => r.user_id).filter((id) => id !== user.id);
    polls.notifyMany(experts, `Bilirkişi görüşü isteniyor: “${topic.title}”`, `#/konu/${topic.id}`);
    return db.get('SELECT * FROM expert_requests WHERE id = ?', rid);
  });
}

export function addExpertOpinion(user, topicId, body = {}) {
  const topic = getTopic(topicId);
  if (!db.get("SELECT 1 FROM expert_domains WHERE user_id = ? AND domain = ? AND status = 'onayli'", user.id, topic.domain)) {
    fail(403, `Bu konuya görüş vermek için ${domainLabel(topic.domain)} alanında onaylı bilirkişi olmalısınız (Madde 12)`);
  }
  const stance = str(body.stance, 10);
  const content = str(body.content, 5000);
  if (!STANCES.includes(stance)) fail(400, 'Duruş destek, karsi, notr ya da sartli olmalı');
  if (content.length < 30) fail(400, 'Görüş en az 30 karakter olmalı');
  const requestId = body.request_id ? Number(body.request_id) : null;
  return db.tx(() => {
    const info = db.run(
      'INSERT INTO expert_opinions (topic_id, request_id, expert_id, domain, stance, content, created_at) VALUES (?,?,?,?,?,?,?)',
      topic.id, requestId, user.id, topic.domain, stance, content, now()
    );
    const oid = Number(info.lastInsertRowid);
    if (requestId) {
      db.run("UPDATE expert_requests SET status = 'yanitlandi' WHERE id = ? AND topic_id = ?", requestId, topic.id);
      const req = db.get('SELECT requester FROM expert_requests WHERE id = ?', requestId);
      if (req) polls.notify(req.requester, `Bilirkişi ${user.nickname} talebinizi yanıtladı`, `#/konu/${topic.id}`);
    }
    ledger.append('bilirkisi_gorusu', user.id, { opinion_id: oid, topic_id: topic.id, durus: stance, icerikOzeti: sha256(content) });
    return db.get('SELECT * FROM expert_opinions WHERE id = ?', oid);
  });
}

export function expertInbox(user) {
  const domains = db.all("SELECT domain FROM expert_domains WHERE user_id = ? AND status = 'onayli'", user.id).map((r) => r.domain);
  const requests = domains.length
    ? db.all(
      `SELECT r.*, t.title AS topic_title, u.nickname FROM expert_requests r JOIN topics t ON t.id = r.topic_id JOIN users u ON u.id = r.requester
       WHERE r.status = 'acik' AND r.domain IN (${domains.map(() => '?').join(',')}) ORDER BY r.created_at DESC`, ...domains
    )
    : [];
  const appeals = db.all(
    `SELECT a.*, p.title AS poll_title, u.nickname FROM appeals a JOIN polls p ON p.id = a.poll_id JOIN users u ON u.id = a.user_id
     WHERE a.status = 'inceleniyor' ORDER BY a.created_at`
  ).filter((a) => polls.reviewersFor(polls.getPoll(a.poll_id)).experts.includes(user.id));
  return { alanlar: domains.map((d) => ({ id: d, label: domainLabel(d) })), talepler: requests, itirazlar: appeals };
}

// =============================================================== oylama görünümleri
export function pollSubject(poll) {
  switch (poll.kind) {
    case 'konu':
    case 'altkonu': {
      const t = db.get('SELECT id, title, description, domain, kind, parent_id FROM topics WHERE id = ?', poll.target_id);
      return { tur: 'konu', link: `#/konu/${t.id}`, ...t, domainLabel: domainLabel(t.domain) };
    }
    case 'duzenleme': {
      const p = db.get('SELECT p.*, u.nickname FROM edit_proposals p JOIN users u ON u.id = p.proposer WHERE p.id = ?', poll.target_id);
      const t = db.get('SELECT id, title, description FROM topics WHERE id = ?', p.topic_id);
      const base = db.get('SELECT title, description FROM topic_versions WHERE topic_id = ? AND created_at <= ? ORDER BY version DESC LIMIT 1', t.id, p.created_at) || t;
      return { tur: 'duzenleme', link: `#/konu/${t.id}`, topic_id: t.id, oneren: p.nickname, gerekce: p.reason, eski: { title: base.title, description: base.description }, yeni: { title: p.new_title, description: p.new_description } };
    }
    case 'silme': {
      const d = db.get('SELECT * FROM deletion_requests WHERE id = ?', poll.target_id);
      const m = db.get('SELECT m.*, u.nickname FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?', d.message_id);
      const requester = getUser(d.requester);
      return {
        tur: 'silme', link: `#/konu/${d.topic_id}`, topic_id: d.topic_id, message_id: m.id, yazar: m.nickname, talepEden: requester?.nickname,
        mesaj: m.hidden ? null : m.content, mesajGizli: !!m.hidden, gerekce: d.category, gerekceEtiketi: DELETION_CATEGORIES[d.category],
        aciklama: d.explanation, yzDegerlendirmesi: parseJSON(d.ai_assessment, null),
      };
    }
    case 'bilirkisi': {
      const e = db.get('SELECT e.*, u.nickname, u.bio FROM expert_domains e JOIN users u ON u.id = e.user_id WHERE e.id = ?', poll.target_id);
      return { tur: 'bilirkisi', link: `#/uye/${e.user_id}`, basvuran: e.nickname, user_id: e.user_id, alan: e.domain, alanEtiketi: domainLabel(e.domain), yeterlilik: e.credentials };
    }
    case 'itiraz': {
      const original = polls.getPoll(poll.target_id);
      const appeal = db.get('SELECT a.*, u.nickname, r.nickname AS reviewer FROM appeals a JOIN users u ON u.id = a.user_id LEFT JOIN users r ON r.id = a.reviewer_id WHERE a.revote_poll_id = ?', poll.id);
      return { tur: 'itiraz', link: `#/oylama/${original.id}`, asilOylama: { id: original.id, title: original.title, reason: original.reason }, itiraz: appeal };
    }
    default:
      return null;
  }
}

export function pollDetail(id, viewer) {
  const poll = polls.getPoll(Number(id));
  if (!poll) fail(404, 'Oylama bulunamadı');
  return { ...polls.pollView(poll, viewer), subject: pollSubject(poll), defterSayimi: ledger.tallyFromLedger(poll.id) };
}

export function listPolls(filter = {}, viewer = null) {
  const where = [];
  const params = [];
  if (filter.status === 'acik') where.push("status = 'acik'");
  else if (filter.status === 'sonuclanan') where.push("status != 'acik'");
  else if (filter.status) { where.push('status = ?'); params.push(filter.status); }
  if (filter.kind) { where.push('kind = ?'); params.push(filter.kind); }
  const rows = db.all(`SELECT * FROM polls ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY opens_at DESC LIMIT ?`, ...params, Math.min(Number(filter.limit) || 100, 300));
  return rows.map((p) => {
    const myVote = viewer ? db.get('SELECT choice FROM votes WHERE poll_id = ? AND user_id = ?', p.id, viewer.id)?.choice ?? null : null;
    return { ...p, strict: !!p.strict, turEtiketi: POLL_KINDS[p.kind], tally: polls.tally(p), myVote, link: pollSubject(p)?.link, canVote: !!viewer && p.status === 'acik' && viewer.created_at <= p.opens_at };
  });
}

// =============================================================== bildirimler, istatistik, akış
export function notificationsFor(user) {
  return {
    okunmamis: db.get('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0', user.id).c,
    liste: db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', user.id),
  };
}
export const markNotificationsRead = (user) => db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', user.id);

export function stats() {
  const c = (sql, ...p) => db.get(sql, ...p).c;
  return {
    uye: c('SELECT COUNT(*) AS c FROM users'),
    konu: c('SELECT COUNT(*) AS c FROM topics'),
    kabulKonu: c("SELECT COUNT(*) AS c FROM topics WHERE status = 'kabul'"),
    acikOylama: c("SELECT COUNT(*) AS c FROM polls WHERE status = 'acik'"),
    mesaj: c('SELECT COUNT(*) AS c FROM messages'),
    oy: c('SELECT COUNT(*) AS c FROM votes'),
    bilirkisi: c("SELECT COUNT(DISTINCT user_id) AS c FROM expert_domains WHERE status = 'onayli'"),
    defterBlok: c('SELECT COUNT(*) AS c FROM ledger'),
    bekleyenItiraz: c("SELECT COUNT(*) AS c FROM appeals WHERE status = 'inceleniyor'"),
  };
}

export function feed(viewer) {
  return {
    istatistik: stats(),
    acikOylamalar: listPolls({ status: 'acik', limit: 8 }, viewer),
    sonKabuller: listTopics({ status: 'kabul', limit: 6 }),
    sonMesajlar: db.all(
      `SELECT m.id, m.topic_id, m.created_at, m.hidden, CASE WHEN m.hidden = 1 THEN NULL ELSE substr(m.content, 1, 160) END AS content, u.nickname, t.title AS topic_title
       FROM messages m JOIN users u ON u.id = m.user_id JOIN topics t ON t.id = m.topic_id ORDER BY m.created_at DESC LIMIT 8`
    ),
    itirazlar: db.all(
      `SELECT a.id, a.poll_id, a.status, a.created_at, a.review_deadline, p.title AS poll_title, u.nickname FROM appeals a
       JOIN polls p ON p.id = a.poll_id JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC LIMIT 5`
    ),
  };
}

export function ontologyInstances() {
  return {
    topics: db.all('SELECT t.*, u.nickname FROM topics t JOIN users u ON u.id = t.created_by').map((t) => ({ ...t, articles: parseJSON(t.articles, []) })),
    experts: db.all("SELECT u.nickname, e.domain FROM expert_domains e JOIN users u ON u.id = e.user_id WHERE e.status = 'onayli'"),
  };
}
