import express from 'express';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config, ROOT } from './config.js';
import { initDb, db } from './db.js';
import { initLedger } from './ledger.js';
import { api } from './routes.js';
import { HttpError } from './util.js';
import { tick } from './polls.js';
import { startAutoWitnesses } from './witnesses.js';
import { seedDemo, removeDataFiles, removeWitnessFiles } from './seed.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '200kb' }));
  // Android uygulaması ve başka kökenlerden erişim için CORS
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use('/api', api);
  app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'], maxAge: 0 }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Geçersiz JSON gövdesi' });
    console.error(err);
    res.status(500).json({ error: `Sunucu hatası: ${err.message}` });
  });
  return app;
}

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

export function start() {
  const isNew = process.argv.includes('--reset');
  if (isNew) removeDataFiles(config.dbPath);
  initDb(config.dbPath);
  const fresh = !db.get('SELECT 1 FROM ledger LIMIT 1');
  if (fresh) removeWitnessFiles(path.dirname(config.dbPath));
  if (fresh && config.seedOnEmpty) {
    console.log('İlk çalıştırma: demo verisi yükleniyor…');
    seedDemo();
  }
  initLedger();

  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    console.log('\n  Ortak Akıl çalışıyor');
    console.log(`  • Web:      http://localhost:${config.port}`);
    for (const ip of lanAddresses()) console.log(`  • Ağ:       http://${ip}:${config.port}   (Android cihazdan bu adresi kullanın)`);
    console.log('  • Emülatör: http://10.0.2.2:' + config.port);
    if (config.demoFast) console.log('  • DEMO modu: oylama süreleri kısaltıldı');
    console.log('');
    if (config.autoWitnesses > 0) startAutoWitnesses(`http://127.0.0.1:${config.port}`);
  });
  const timer = setInterval(() => {
    try {
      tick();
    } catch (err) {
      console.error('Zamanlayıcı hatası:', err);
    }
  }, 5000);
  tick();
  return { app, server, stop: () => { clearInterval(timer); server.close(); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start();
