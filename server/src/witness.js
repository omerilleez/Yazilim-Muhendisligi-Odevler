// Tanık düğüm (witness node): birincil düğümün defterini kopyalar, her bloğun özetini, zincir
// bağını ve Ed25519 imzasını bağımsız olarak doğrular. Birincil düğüm geçmişi değiştirirse
// (kendi anahtarıyla yeniden imzalasa bile) Merkle kökü uyuşmazlığından tahrifatı tespit eder.
//
// Kullanım: node src/witness.js --port 4101 --source http://127.0.0.1:3000 --name tanik-1
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { verifyChain, merkleRoot, ZERO_HASH } from './ledger.js';
import { ROOT } from './config.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]?.startsWith('--') ? true : arr[i + 1] ?? true]] : acc), [])
);
const PORT = Number(args.port || 4101);
const SOURCE = String(args.source || 'http://127.0.0.1:3000').replace(/\/$/, '');
const NAME = String(args.name || `tanik-${PORT}`);
const INTERVAL = Number(args.interval || 2000);
const dataDir = String(args.data || path.join(ROOT, 'data'));
fs.mkdirSync(dataDir, { recursive: true });
const dbFile = path.join(dataDir, `${NAME}.db`);
if (args.reset && fs.existsSync(dbFile)) fs.rmSync(dbFile);

const db = new DatabaseSync(dbFile);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS blocks (idx INTEGER PRIMARY KEY, ts INTEGER, type TEXT, actor TEXT, payload TEXT, prev_hash TEXT, hash TEXT, signature TEXT);
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
`);
const getMeta = (k) => db.prepare('SELECT value FROM meta WHERE key = ?').get(k)?.value ?? null;
const setMeta = (k, v) => db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(k, v);
const insert = db.prepare('INSERT OR REPLACE INTO blocks (idx, ts, type, actor, payload, prev_hash, hash, signature) VALUES (?,?,?,?,?,?,?,?)');

const state = {
  durum: getMeta('tahrifat') ? 'tahrifat' : 'baslatiliyor',
  sonSenkron: null,
  hatalar: getMeta('tahrifat') ? [JSON.parse(getMeta('tahrifat'))] : [],
  senkronSayisi: 0,
};

function flagTamper(detay) {
  const rec = { zaman: Date.now(), detay };
  state.durum = 'tahrifat';
  state.hatalar.unshift(rec);
  setMeta('tahrifat', JSON.stringify(rec));
  console.error(`[${NAME}] TAHRİFAT TESPİT EDİLDİ: ${detay}`);
}

async function getJSON(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

const lastBlock = () => db.prepare('SELECT * FROM blocks ORDER BY idx DESC LIMIT 1').get();
const allHashes = () => db.prepare('SELECT hash FROM blocks ORDER BY idx').all().map((r) => r.hash);

async function sync() {
  if (state.durum === 'tahrifat') return; // çatallanmış zinciri takip etmeyi bırak
  try {
    const info = await getJSON(`${SOURCE}/api/ledger/info`);
    const pinned = getMeta('publicKey');
    if (!pinned) setMeta('publicKey', info.publicKey);
    else if (pinned !== info.publicKey) return flagTamper('Birincil düğümün imza anahtarı değişti');

    // 1) Elimizdeki geçmiş hâlâ birincildekiyle aynı mı? (Merkle kökü karşılaştırması)
    const local = lastBlock();
    if (local) {
      const remote = await getJSON(`${SOURCE}/api/ledger/merkle?upto=${local.idx + 1}`);
      const mine = merkleRoot(allHashes());
      if (remote.merkleKoku !== mine) {
        const hashes = await getJSON(`${SOURCE}/api/ledger/hashes?upto=${local.idx + 1}`);
        const ours = db.prepare('SELECT idx, hash FROM blocks ORDER BY idx').all();
        const diff = ours.find((b, i) => hashes[i] !== b.hash);
        return flagTamper(`Birincil düğümün geçmişi değişmiş: blok #${diff ? diff.idx : '?'} tanıktaki kopyayla uyuşmuyor`);
      }
    }

    // 2) Yeni blokları çek ve doğrula
    let from = local ? local.idx + 1 : 0;
    let prev = local ? local.hash : ZERO_HASH;
    for (;;) {
      const blocks = await getJSON(`${SOURCE}/api/ledger/blocks?from=${from}&limit=500`);
      if (!blocks.length) break;
      const check = verifyChain(blocks, getMeta('publicKey'), { expectedPrev: prev, startIdx: from });
      if (!check.ok) return flagTamper(`Doğrulanamayan blok: #${check.errors[0].idx} — ${check.errors[0].hata}`);
      db.exec('BEGIN');
      for (const b of blocks) insert.run(b.idx, b.ts, b.type, b.actor, b.payload, b.prev_hash, b.hash, b.signature);
      db.exec('COMMIT');
      from = blocks[blocks.length - 1].idx + 1;
      prev = blocks[blocks.length - 1].hash;
      if (blocks.length < 500) break;
    }
    state.durum = 'senkron';
    state.sonSenkron = Date.now();
    state.senkronSayisi++;
  } catch (err) {
    state.durum = state.durum === 'tahrifat' ? 'tahrifat' : 'baglanti_yok';
    state.sonHata = err.message;
  }
}

function status() {
  const last = lastBlock();
  const count = db.prepare('SELECT COUNT(*) AS c FROM blocks').get().c;
  return {
    ad: NAME,
    kaynak: SOURCE,
    durum: state.durum,
    uzunluk: count,
    sonBlok: last ? last.idx : -1,
    basOzet: last ? last.hash : ZERO_HASH,
    merkleKoku: merkleRoot(allHashes()),
    sonSenkron: state.sonSenkron,
    senkronSayisi: state.senkronSayisi,
    sonHata: state.sonHata || null,
    hatalar: state.hatalar.slice(0, 10),
  };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (url.pathname === '/status') return res.end(JSON.stringify(status()));
  if (url.pathname === '/verify') {
    const blocks = db.prepare('SELECT * FROM blocks ORDER BY idx').all();
    return res.end(JSON.stringify(verifyChain(blocks, getMeta('publicKey') || '')));
  }
  if (url.pathname === '/blocks') {
    const from = Number(url.searchParams.get('from') || 0);
    return res.end(JSON.stringify(db.prepare('SELECT * FROM blocks WHERE idx >= ? ORDER BY idx LIMIT 500').all(from)));
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'bulunamadı' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[${NAME}] tanık düğüm http://127.0.0.1:${PORT} — kaynak: ${SOURCE}`);
  sync();
  setInterval(sync, INTERVAL);
});
