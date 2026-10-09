// Birincil düğüm tarafı: tanık düğümleri başlatır ve uzlaşı (consensus) durumunu raporlar.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { config, ROOT } from './config.js';
import { db } from './db.js';
import * as ledger from './ledger.js';

const children = [];
const urls = [...config.witnesses];

export function startAutoWitnesses(primaryUrl) {
  for (let i = 0; i < config.autoWitnesses; i++) {
    const port = config.witnessBasePort + i;
    const name = `tanik-${i + 1}`;
    const child = spawn(
      process.execPath,
      ['--disable-warning=ExperimentalWarning', path.join(ROOT, 'src', 'witness.js'), '--port', String(port), '--source', primaryUrl, '--name', name, '--data', path.dirname(config.dbPath)],
      { stdio: ['ignore', 'inherit', 'inherit'] }
    );
    child.on('exit', (code) => { if (code) console.error(`[${name}] çıkış kodu ${code}`); });
    children.push(child);
    urls.push(`http://127.0.0.1:${port}`);
  }
  const stop = () => children.forEach((c) => c.kill());
  process.on('exit', stop);
  process.on('SIGINT', () => { stop(); process.exit(0); });
  process.on('SIGTERM', () => { stop(); process.exit(0); });
}

export async function witnessStatus() {
  const local = ledger.info();
  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(`${url}/status`, { signal: AbortSignal.timeout(2000) });
        const s = await res.json();
        const oursAtHeight = s.uzunluk > 0 ? db.get('SELECT hash FROM ledger WHERE idx = ?', s.sonBlok)?.hash : ledger.ZERO_HASH;
        const ayni = s.basOzet === oursAtHeight;
        return { url, erisilebilir: true, ...s, uyumlu: ayni && s.durum !== 'tahrifat', geride: local.uzunluk - s.uzunluk };
      } catch (err) {
        return { url, erisilebilir: false, uyumlu: false, hata: err.message };
      }
    })
  );
  const selfCheck = ledger.verify();
  const agree = results.filter((r) => r.uyumlu).length + (selfCheck.ok ? 1 : 0);
  const total = results.length + 1;
  let durum = 'tek_dugum';
  if (results.length) durum = results.some((r) => r.durum === 'tahrifat') ? 'tahrifat' : agree === total ? 'uzlasi' : agree > total / 2 ? 'cogunluk_uzlasisi' : 'uzlasi_yok';
  return {
    birincil: { dugum: local.dugum, uzunluk: local.uzunluk, basOzet: local.basOzet, merkleKoku: local.merkleKoku, kendiDogrulamasi: selfCheck.ok },
    taniklar: results,
    uzlasi: { toplam: total, uyumlu: agree, durum },
  };
}
