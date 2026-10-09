// Dağıtık defter: her işlem, önceki bloğun özetine bağlanan ve düğüm anahtarıyla (Ed25519)
// imzalanan bir bloğa yazılır. Tanık düğümler (witness.js) zinciri kopyalayıp bağımsız doğrular.
// Kişisel veriler deftere asla yazılmaz; yalnızca özetler ve takma kimlikler yazılır.
import crypto from 'node:crypto';
import { db, getMeta, setMeta } from './db.js';
import { now, sha256, canonicalJSON, randomToken } from './util.js';

export const ZERO_HASH = '0'.repeat(64);
let keys = null;

export function initLedger() {
  let privPem = getMeta('ledger_private_key');
  if (!privPem) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    setMeta('ledger_private_key', privPem);
    setMeta('ledger_public_key', publicKey.export({ type: 'spki', format: 'pem' }));
    setMeta('node_id', `ortak-akil-${randomToken(4)}`);
  }
  keys = { privateKey: crypto.createPrivateKey(privPem), publicPem: getMeta('ledger_public_key') };
  if (!db.get('SELECT 1 FROM ledger LIMIT 1')) {
    append('baslangic', 'sistem', { mesaj: 'Ortak Akıl defteri başlatıldı', dugum: getMeta('node_id') });
  }
}

export const nodeId = () => getMeta('node_id');
export const publicKeyPem = () => keys.publicPem;

export const blockHash = (b) => sha256(`${b.idx}|${b.ts}|${b.type}|${b.actor}|${b.payload}|${b.prev_hash}`);

export function append(type, actor, payload = {}) {
  return db.tx(() => {
    const last = db.get('SELECT idx, hash, ts FROM ledger ORDER BY idx DESC LIMIT 1');
    const block = {
      idx: last ? last.idx + 1 : 0,
      ts: Math.max(now(), last ? last.ts : 0),
      type,
      actor: actor || 'sistem',
      payload: canonicalJSON(payload),
      prev_hash: last ? last.hash : ZERO_HASH,
    };
    block.hash = blockHash(block);
    block.signature = crypto.sign(null, Buffer.from(block.hash, 'hex'), keys.privateKey).toString('base64');
    db.run(
      'INSERT INTO ledger (idx, ts, type, actor, payload, prev_hash, hash, signature) VALUES (?,?,?,?,?,?,?,?)',
      block.idx, block.ts, block.type, block.actor, block.payload, block.prev_hash, block.hash, block.signature
    );
    return block;
  });
}

/** Bir blok dizisini (tamamı ya da bir kesiti) doğrular. Tanık düğümler de bunu kullanır. */
export function verifyChain(blocks, pubPem, { expectedPrev = ZERO_HASH, startIdx = 0 } = {}) {
  const pub = crypto.createPublicKey(pubPem);
  const errors = [];
  let prev = expectedPrev;
  let expectedIdx = startIdx;
  for (const b of blocks) {
    if (b.idx !== expectedIdx) errors.push({ idx: b.idx, hata: `Sıra numarası hatalı (beklenen ${expectedIdx})` });
    if (b.prev_hash !== prev) errors.push({ idx: b.idx, hata: 'Önceki blok özeti uyuşmuyor (zincir kırık)' });
    if (blockHash(b) !== b.hash) errors.push({ idx: b.idx, hata: 'Blok içeriği özetiyle uyuşmuyor (kurcalanmış)' });
    let sigOk = false;
    try {
      sigOk = crypto.verify(null, Buffer.from(b.hash, 'hex'), pub, Buffer.from(b.signature, 'base64'));
    } catch {
      sigOk = false;
    }
    if (!sigOk) errors.push({ idx: b.idx, hata: 'Düğüm imzası geçersiz' });
    prev = b.hash;
    expectedIdx = b.idx + 1;
    if (errors.length >= 50) break;
  }
  return { ok: errors.length === 0, length: blocks.length, head: prev, errors };
}

export function verify() {
  const blocks = db.all('SELECT * FROM ledger ORDER BY idx');
  return verifyChain(blocks, keys.publicPem);
}

export function merkleRoot(hashes) {
  if (!hashes.length) return ZERO_HASH;
  let level = hashes;
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(sha256(level[i] + (level[i + 1] ?? level[i])));
    level = next;
  }
  return level[0];
}

export function info() {
  const hashes = db.all('SELECT hash FROM ledger ORDER BY idx').map((r) => r.hash);
  const last = db.get('SELECT idx, ts, hash FROM ledger ORDER BY idx DESC LIMIT 1');
  const types = db.all('SELECT type, COUNT(*) AS adet FROM ledger GROUP BY type ORDER BY adet DESC');
  return {
    dugum: nodeId(),
    algoritma: 'SHA-256 zincir + Ed25519 imza',
    publicKey: keys.publicPem,
    uzunluk: hashes.length,
    sonBlok: last ? last.idx : -1,
    basOzet: last ? last.hash : ZERO_HASH,
    sonZaman: last ? last.ts : null,
    merkleKoku: merkleRoot(hashes),
    turler: types,
  };
}

export function getBlocks(from = 0, limit = 100) {
  return db.all('SELECT * FROM ledger WHERE idx >= ? ORDER BY idx LIMIT ?', from, Math.min(limit, 1000));
}

export function hashesUpTo(upto) {
  return db.all('SELECT hash FROM ledger WHERE idx < ? ORDER BY idx', upto).map((r) => r.hash);
}

export function latestBlocks(limit = 50, type = null) {
  return type
    ? db.all('SELECT * FROM ledger WHERE type = ? ORDER BY idx DESC LIMIT ?', type, limit)
    : db.all('SELECT * FROM ledger ORDER BY idx DESC LIMIT ?', limit);
}

/** Bir oylamanın sonucunu yalnızca defterdeki oy bloklarından yeniden sayar (bağımsız sayım). */
export function tallyFromLedger(pollId) {
  const rows = db.all(
    "SELECT payload FROM ledger WHERE type = 'oy' AND json_extract(payload, '$.poll_id') = ? ORDER BY idx",
    pollId
  );
  const byVoter = new Map();
  for (const r of rows) {
    const p = JSON.parse(r.payload);
    byVoter.set(p.secmen, p.secim);
  }
  const t = { evet: 0, hayir: 0, cekimser: 0, toplam: byVoter.size, blokSayisi: rows.length };
  for (const c of byVoter.values()) if (t[c] !== undefined) t[c]++;
  const result = db.get(
    "SELECT payload FROM ledger WHERE type = 'oylama_sonuclandi' AND json_extract(payload, '$.poll_id') = ? ORDER BY idx DESC LIMIT 1",
    pollId
  );
  return { ...t, kayitliSonuc: result ? JSON.parse(result.payload) : null };
}
