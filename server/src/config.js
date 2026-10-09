import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

const argv = process.argv.slice(2);
const DEMO = argv.includes('--demo') || process.env.DEMO_FAST === '1';
const arg = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const num = (name, def) => (process.env[name] !== undefined && process.env[name] !== '' ? Number(process.env[name]) : def);

// Süreler dakika cinsindendir. --demo (npm run demo) sınıf içi sunum için süreleri kısaltır.
export const config = {
  port: Number(arg('port')) || num('PORT', 3000),
  host: process.env.HOST || '0.0.0.0',
  dbPath: arg('db') || process.env.DB_PATH || path.join(ROOT, 'data', 'ortak-akil.db'),
  demoFast: DEMO,

  // Oylama süresi: genel konular / yönetmelik konuları
  pollMinutes: num('POLL_MINUTES', DEMO ? 15 : 72 * 60),
  regulationPollMinutes: num('REGULATION_POLL_MINUTES', DEMO ? 20 : 120 * 60),
  // Asgari müzakere süresi: bu süre dolmadan (herkes oy vermedikçe) erken karar verilmez.
  minDeliberationMinutes: num('MIN_DELIBERATION_MINUTES', DEMO ? 2 : 24 * 60),
  // Kabul edilen kararlarda azınlığın itiraz edebileceği süre
  appealMinutes: num('APPEAL_MINUTES', DEMO ? 5 : 24 * 60),
  // Bilirkişinin itirazı incelemesi için süre; dolarsa karar kendiliğinden kesinleşir
  reviewMinutes: num('REVIEW_MINUTES', DEMO ? 10 : 48 * 60),

  quorum: num('QUORUM', 0.3), // katılım yeter sayısı (seçmen kütüğüne oranla)
  minAge: num('MIN_AGE', 18),
  minorityShare: 1 / 3, // itiraz hakkı doğuran azınlık oranı

  // Dağıtık defter tanık düğümleri
  witnesses: (process.env.WITNESSES || '').split(',').map((s) => s.trim()).filter(Boolean),
  autoWitnesses: num('AUTO_WITNESSES', 2),
  witnessBasePort: num('WITNESS_BASE_PORT', 4101),

  seedOnEmpty: process.env.SEED !== '0',
  showDemoAccounts: process.env.SHOW_DEMO_ACCOUNTS !== '0',

  // Yapay zeka: ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / ANTHROPIC_PROFILE tanımlıysa Claude, yoksa yerel çözümleyici
  aiMode: process.env.AI_MODE || 'auto', // auto | claude | yerel
  aiModel: process.env.AI_MODEL || 'claude-opus-5-5',
};
