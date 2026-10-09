import express from 'express';
import * as svc from './services.js';
import * as polls from './polls.js';
import * as ledger from './ledger.js';
import * as ai from './ai.js';
import { runAudit, auditTopic } from './audit.js';
import { buildGraph, analyzePoll, toGraphML } from './graph.js';
import { ontologyJSON, toTurtle, DOMAINS, DELETION_CATEGORIES } from './ontology.js';
import { config } from './config.js';
import { fail, str } from './util.js';
import { witnessStatus } from './witnesses.js';
import { DEMO_PASSWORD } from './seed-data.js';

export const api = express.Router();

// --------------------------------------------------------------- kimlik doğrulama
api.use((req, _res, next) => {
  const h = req.headers.authorization || '';
  req.token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
  req.user = svc.userFromToken(req.token);
  next();
});

const auth = (req, _res, next) => {
  if (!req.user) fail(401, 'Bu işlem için giriş yapmalısınız');
  next();
};

// Basit hız sınırlayıcı (kayıt / giriş için)
const hits = new Map();
const limit = (max, windowMs) => (req, _res, next) => {
  const key = `${req.ip}:${req.path}`;
  const t = Date.now();
  const arr = (hits.get(key) || []).filter((x) => t - x < windowMs);
  if (arr.length >= max) fail(429, 'Çok fazla deneme yaptınız, biraz sonra tekrar deneyin');
  arr.push(t);
  hits.set(key, arr);
  next();
};

const num = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) fail(400, 'Geçersiz kimlik numarası');
  return n;
};

// --------------------------------------------------------------- genel
api.get('/health', (_req, res) => res.json({ ok: true, zaman: Date.now() }));

api.get('/meta', (_req, res) => {
  res.json({
    ad: 'Ortak Akıl',
    alanlar: DOMAINS.map(({ id, label }) => ({ id, label })),
    silmeGerekceleri: DELETION_CATEGORIES,
    yapayZeka: ai.aiStatus(),
    kurallar: {
      yeterSayi: config.quorum,
      oylamaDakika: config.pollMinutes,
      yonetmelikOylamaDakika: config.regulationPollMinutes,
      asgariMuzakereDakika: config.minDeliberationMinutes,
      itirazDakika: config.appealMinutes,
      incelemeDakika: config.reviewMinutes,
      minYas: config.minAge,
    },
    demoHizli: config.demoFast,
    demoHesaplar: config.showDemoAccounts ? { parola: DEMO_PASSWORD, ornek: ['ayse', 'zeynep', 'kerem', 'burak', 'emre'] } : null,
  });
});

api.get('/stats', (_req, res) => res.json(svc.stats()));
api.get('/feed', (req, res) => res.json(svc.feed(req.user)));

// --------------------------------------------------------------- üyelik
api.post('/auth/register', limit(20, 10 * 60_000), (req, res) => res.status(201).json(svc.register(req.body)));
api.post('/auth/login', limit(30, 10 * 60_000), (req, res) => res.json(svc.login(req.body?.identifier ?? req.body?.email, req.body?.password)));
api.post('/auth/logout', auth, (req, res) => {
  svc.logout(req.token);
  res.json({ ok: true });
});

api.get('/me', auth, (req, res) => res.json(svc.privateUser(req.user)));
api.put('/me', auth, (req, res) => res.json(svc.updateProfile(req.user, req.body)));
api.get('/me/notifications', auth, (req, res) => res.json(svc.notificationsFor(req.user)));
api.post('/me/notifications/read', auth, (req, res) => {
  svc.markNotificationsRead(req.user);
  res.json({ ok: true });
});
api.get('/me/expert-inbox', auth, (req, res) => res.json(svc.expertInbox(req.user)));

api.get('/users', (req, res) => res.json(svc.searchUsers(req.query.q || '')));
api.get('/users/:id', (req, res) => res.json(svc.userProfile(req.params.id, req.user)));
for (const type of ['takip', 'guven']) {
  api.post(`/users/:id/${type}`, auth, (req, res) => {
    svc.setEdge(req.user, req.params.id, type, true);
    res.json(svc.userProfile(req.params.id, req.user));
  });
  api.delete(`/users/:id/${type}`, auth, (req, res) => {
    svc.setEdge(req.user, req.params.id, type, false);
    res.json(svc.userProfile(req.params.id, req.user));
  });
}

// --------------------------------------------------------------- konular
api.get('/topics', (req, res) => res.json(svc.listTopics({
  status: str(req.query.status, 20), domain: str(req.query.domain, 30), parent: str(req.query.parent, 10), q: str(req.query.q, 80), user: str(req.query.user, 60), limit: req.query.limit,
})));
api.get('/topics/tree', (_req, res) => res.json(svc.topicTree()));
api.post('/topics', auth, (req, res) => res.status(201).json(svc.createTopic(req.user, req.body)));
api.get('/topics/:id', (req, res) => res.json(svc.topicDetail(num(req.params.id), req.user)));
api.get('/topics/:id/messages', (req, res) => res.json(svc.listMessages(num(req.params.id), req.user)));
api.post('/topics/:id/messages', auth, (req, res) => res.status(201).json(svc.postMessage(req.user, num(req.params.id), req.body)));
api.post('/topics/:id/proposals', auth, (req, res) => res.status(201).json(svc.createProposal(req.user, num(req.params.id), req.body)));
api.post('/topics/:id/expert-requests', auth, (req, res) => res.status(201).json(svc.createExpertRequest(req.user, num(req.params.id), req.body)));
api.post('/topics/:id/expert-opinions', auth, (req, res) => res.status(201).json(svc.addExpertOpinion(req.user, num(req.params.id), req.body)));
api.get('/topics/:id/audit', (req, res) => {
  const r = auditTopic(num(req.params.id));
  if (!r) fail(404, 'Konu bulunamadı');
  res.json(r);
});
api.post('/messages/:id/deletion', auth, (req, res) => res.status(201).json(svc.requestDeletion(req.user, num(req.params.id), req.body)));

// --------------------------------------------------------------- oylamalar
api.get('/polls', (req, res) => res.json(svc.listPolls({ status: str(req.query.status, 20), kind: str(req.query.kind, 20), limit: req.query.limit }, req.user)));
api.get('/polls/:id', (req, res) => res.json(svc.pollDetail(num(req.params.id), req.user)));
api.post('/polls/:id/vote', auth, (req, res) => {
  polls.castVote(num(req.params.id), req.user, str(req.body?.choice, 10));
  res.json(svc.pollDetail(num(req.params.id), req.user));
});
api.post('/polls/:id/minority-report', auth, (req, res) => {
  polls.addMinorityReport(num(req.params.id), req.user, req.body?.content);
  res.status(201).json(svc.pollDetail(num(req.params.id), req.user));
});
api.post('/polls/:id/appeal', auth, (req, res) => {
  polls.fileAppeal(num(req.params.id), req.user, req.body?.reason);
  res.status(201).json(svc.pollDetail(num(req.params.id), req.user));
});
api.get('/polls/:id/minority', (req, res) => {
  const p = polls.getPoll(num(req.params.id));
  if (!p) fail(404, 'Oylama bulunamadı');
  res.json(analyzePoll(p));
});
api.post('/appeals/:id/review', auth, (req, res) => {
  const a = polls.reviewAppeal(num(req.params.id), req.user, str(req.body?.decision, 20), req.body?.note);
  res.json(svc.pollDetail(a.poll_id, req.user));
});

// --------------------------------------------------------------- bilirkişi
api.get('/experts', (_req, res) => res.json(svc.listExperts()));
api.post('/experts/apply', auth, (req, res) => res.status(201).json(svc.applyExpert(req.user, req.body)));

// --------------------------------------------------------------- yapay zeka
api.get('/ai/status', (_req, res) => res.json(ai.aiStatus()));
api.post('/ai/classify', auth, async (req, res) => {
  const title = str(req.body?.title, 140);
  const description = str(req.body?.description, 5000);
  if (title.length < 3) fail(400, 'Sınıflandırma için başlık gerekli');
  res.json(await ai.classifyTopic(title, description));
});
api.post('/ai/moderate', auth, async (req, res) => {
  const content = str(req.body?.content, 4000);
  if (!content) fail(400, 'İçerik boş');
  res.json(await ai.moderate(content));
});
api.post('/ai/summarize/:id', async (req, res) => {
  const topic = svc.getTopic(num(req.params.id));
  const messages = svc.listMessages(topic.id, null).map((m) => ({ ...m, content: m.content ?? '' }));
  res.json(await ai.summarizeDiscussion(topic, messages));
});
api.get('/ai/similar', (req, res) => res.json(ai.similarTopics(str(req.query.q, 2000))));

// --------------------------------------------------------------- defter
api.get('/ledger/info', (_req, res) => res.json(ledger.info()));
api.get('/ledger/blocks', (req, res) => {
  if (req.query.latest) return res.json(ledger.latestBlocks(Math.min(Number(req.query.latest) || 50, 500), str(req.query.type, 40) || null));
  res.json(ledger.getBlocks(Math.max(0, Number(req.query.from) || 0), Number(req.query.limit) || 200));
});
api.get('/ledger/verify', (_req, res) => res.json(ledger.verify()));
api.get('/ledger/hashes', (req, res) => res.json(ledger.hashesUpTo(Math.max(0, Number(req.query.upto) || 0))));
api.get('/ledger/merkle', (req, res) => {
  const upto = Math.max(0, Number(req.query.upto) || 0);
  res.json({ upto, merkleKoku: ledger.merkleRoot(ledger.hashesUpTo(upto)) });
});
api.get('/ledger/tally/:pollId', (req, res) => res.json(ledger.tallyFromLedger(num(req.params.pollId))));
api.get('/ledger/consensus', async (_req, res) => res.json(await witnessStatus()));

// --------------------------------------------------------------- ontoloji, denetim, graf
api.get('/ontology', (_req, res) => res.json(ontologyJSON()));
api.get('/ontology.ttl', (req, res) => {
  const withData = req.query.ornekler !== '0';
  res.type('text/turtle; charset=utf-8').send(toTurtle(withData ? svc.ontologyInstances() : {}));
});
api.get('/audit', (_req, res) => res.json(runAudit()));
api.get('/graph', (_req, res) => res.json(buildGraph()));
api.get('/graph.graphml', (_req, res) => res.type('application/xml; charset=utf-8').send(toGraphML(buildGraph())));

api.use((_req, _res) => fail(404, 'API uç noktası bulunamadı'));
