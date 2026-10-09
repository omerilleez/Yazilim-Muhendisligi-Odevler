// Çekirdek kuralların testleri: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { initDb, db, closeDb } from '../src/db.js';
import * as ledger from '../src/ledger.js';
import * as svc from '../src/services.js';
import * as polls from '../src/polls.js';
import { runAudit } from '../src/audit.js';
import { setClock, resetClock, now, HOUR, DAY } from '../src/util.js';
import { HttpError } from '../src/util.js';

const base = (n) => ({
  first_name: `Ad${n}`, last_name: `Soyad${n}`, birth_date: '1990-01-01', email: `u${n}@test.local`, phone: '0555 000 00 0' + (n % 10),
  city: 'Ankara', district: 'Çankaya', address: `Deneme Mah. Test Sk. No:${n}`, nickname: `uye${n}`, password: 'parola123',
});
const users = [];
let clock;
const advance = (ms) => { clock += ms; setClock(clock); };

const expectHttp = (fn, status, re) => {
  assert.throws(fn, (err) => err instanceof HttpError && err.status === status && (!re || re.test(err.message)));
};

before(() => {
  config.aiMode = 'yerel';
  config.autoWitnesses = 0;
  Object.assign(config, { pollMinutes: 72 * 60, regulationPollMinutes: 120 * 60, minDeliberationMinutes: 24 * 60, appealMinutes: 24 * 60, reviewMinutes: 48 * 60 });
  initDb(':memory:');
  clock = Date.now() - 30 * DAY;
  setClock(clock);
  ledger.initLedger();
  for (let i = 1; i <= 9; i++) {
    advance(60_000);
    users.push(svc.getUser(svc.register(base(i)).user.id));
  }
});

after(() => {
  resetClock();
  closeDb();
});

test('kayıt: zorunlu alanlar, yaş sınırı ve deftere kişisel veri yazılmaması', () => {
  expectHttp(() => svc.register({ ...base(50), city: '' }), 400);
  expectHttp(() => svc.register({ ...base(51), birth_date: '2015-05-05' }), 400);
  expectHttp(() => svc.register({ ...base(52), nickname: 'uye1' }), 400);
  const leak = db.get('SELECT COUNT(*) AS c FROM ledger WHERE payload LIKE ? OR payload LIKE ?', '%u1@test.local%', '%Soyad1%').c;
  assert.equal(leak, 0);
  const pub = svc.publicUser(users[0]);
  assert.equal(pub.email, undefined);
  assert.equal(pub.address, undefined);
});

test('konu: asgari müzakere süresinden önce erken karar yok, sonra çoğunlukla kabul', () => {
  const t = svc.createTopic(users[0], { title: 'Test konusu bir', description: 'Bu konu test amaçlı oluşturulmuş bir açıklamadır.', domain: 'egitim' });
  const pollId = t.poll.id;
  for (const u of users.slice(0, 6)) polls.castVote(pollId, u, 'evet'); // 6/9 > yarı
  assert.equal(polls.getPoll(pollId).status, 'acik', 'müzakere süresi dolmadan karar verilmemeli');
  advance(25 * HOUR);
  polls.tick();
  const p = polls.getPoll(pollId);
  assert.equal(p.status, 'kabul');
  assert.equal(svc.getTopic(t.id).status, 'kabul');
});

test('seçmen kütüğü: oylamadan sonra kaydolan üye oy kullanamaz', () => {
  const t = svc.createTopic(users[1], { title: 'Test konusu iki', description: 'Seçmen kütüğü testine ait açıklama metni.', domain: 'cevre' });
  advance(60_000);
  const late = svc.getUser(svc.register(base(20)).user.id);
  expectHttp(() => polls.castVote(t.poll.id, late, 'evet'), 403, /Seçmen kütüğü/);
  users.push(late);
});

test('herkes oy verirse müzakere süresi beklenmeden karar verilir; yeter sayı kuralı', () => {
  const t = svc.createTopic(users[2], { title: 'Test konusu üç', description: 'Herkesin oy verdiği durumun testi açıklaması.', domain: 'kultur' });
  const eligible = polls.getPoll(t.poll.id).eligible;
  const voters = users.filter((u) => u.created_at <= polls.getPoll(t.poll.id).opens_at).slice(0, eligible);
  voters.forEach((u, i) => polls.castVote(t.poll.id, u, i % 2 ? 'hayir' : 'evet'));
  assert.notEqual(polls.getPoll(t.poll.id).status, 'acik');
});

test('alt konu yalnızca kabul edilmiş konunun altında önerilebilir', () => {
  const open = db.get("SELECT id FROM topics WHERE status = 'oylamada' LIMIT 1");
  expectHttp(() => svc.createTopic(users[0], { parent_id: open.id, title: 'Alt konu deneme', description: 'Kabul edilmemiş konuya alt konu denemesi.', domain: 'egitim' }), 409);
  const accepted = db.get("SELECT id FROM topics WHERE status = 'kabul' LIMIT 1");
  const sub = svc.createTopic(users[0], { parent_id: accepted.id, title: 'Geçerli alt konu', description: 'Kabul edilmiş konunun altında alt konu.', domain: 'egitim' });
  assert.equal(sub.poll.kind, 'altkonu');
});

test('tartışma mesajları veritabanı düzeyinde silinemez ve değiştirilemez', () => {
  const topic = db.get("SELECT id FROM topics WHERE status = 'kabul' LIMIT 1");
  const m = svc.postMessage(users[3], topic.id, { content: 'Silinmemesi gereken bir mesaj.' });
  assert.throws(() => db.run('DELETE FROM messages WHERE id = ?', m.id), /silinemez/);
  assert.throws(() => db.run("UPDATE messages SET content = 'değişti' WHERE id = ?", m.id), /değiştirilemez/);
  assert.throws(() => db.run('UPDATE messages SET hidden = 1 WHERE id = ?', m.id), /oylamayla/);
  assert.throws(() => db.run('DELETE FROM ledger WHERE idx = 1'), /silinemez/);
});

test('gizleme: görüş ayrılığı gerekçe olamaz, 2/3 gerekir, kişisel veri boşaltılır', () => {
  const topic = db.get("SELECT id FROM topics WHERE status = 'kabul' LIMIT 1");
  advance(10_000);
  const m = svc.postMessage(users[4], topic.id, { content: 'Bana 0532 111 22 33 numarasından ulaşın.' });
  assert.ok(m.aiFlags.some((f) => f.kategori === 'kisisel_veri'));
  expectHttp(() => svc.requestDeletion(users[0], m.id, { category: 'gorus_ayriligi', explanation: 'Bu görüşe katılmıyorum.' }), 400, /Görüş ayrılığı/);
  const req = svc.requestDeletion(users[0], m.id, { category: 'kisisel_veri', explanation: 'Telefon numarası içeriyor.' });
  const p = polls.getPoll(req.poll_id);
  assert.ok(p.threshold > 0.66);
  for (const u of users.slice(0, 7)) polls.castVote(p.id, u, 'evet'); // 7/10 ≥ 2/3
  advance(25 * HOUR);
  polls.tick();
  const row = db.get('SELECT * FROM messages WHERE id = ?', m.id);
  assert.equal(row.hidden, 1);
  assert.equal(row.wiped, 1);
  assert.equal(row.content, '');
  assert.ok(row.content_hash.length === 64, 'özet korunmalı');
});

test('azınlık koruması: topluluk uyarısı → itiraz → bilirkişi → 2/3 yeniden oylama → karar bozulur', () => {
  const [a, b, c, d, e, f, g, h, i] = users;
  // İki sosyal topluluk: {a..f} ve {g,h,i}
  for (const x of [a, b, c, d, e, f]) for (const y of [a, b, c, d, e, f]) if (x !== y) svc.setEdge(x, y.id, 'guven', true);
  for (const x of [g, h, i]) for (const y of [g, h, i]) if (x !== y) svc.setEdge(x, y.id, 'guven', true);
  // h hukuk bilirkişisi olsun
  const app = svc.applyExpert(users[9], { domain: 'hukuk', credentials: 'Yirmi yıllık avukat, idare hukuku ve kişisel veri koruma uzmanı.' });
  for (const u of [a, b, c, d, e, f, g]) polls.castVote(app.poll_id, u, 'evet');
  advance(25 * HOUR);
  polls.tick();
  const reviewer = users[9];
  assert.equal(db.get('SELECT status FROM expert_domains WHERE id = ?', app.id).status, 'onayli');

  const t = svc.createTopic(a, { title: 'Azınlık testi konusu', description: 'Topluluk dışlanması senaryosunun açıklaması.', domain: 'hukuk' });
  for (const u of [a, b, c, d, e, f]) polls.castVote(t.poll.id, u, 'evet');
  for (const u of [g, h, i]) polls.castVote(t.poll.id, u, 'hayir');
  advance(25 * HOUR);
  polls.tick();
  let p = polls.getPoll(t.poll.id);
  assert.equal(p.outcome, 'kabul');
  assert.equal(p.status, 'itiraz_suresi', 'kayda değer azınlık itiraz süresi doğurmalı');
  expectHttp(() => polls.fileAppeal(p.id, a, 'Evet oyu verenin itirazı reddedilmeli, bu bir testtir.'), 403);
  polls.addMinorityReport(p.id, g, 'Bu karar azınlık topluluğunun kaygılarını dikkate almadı, şerhimdir.');
  polls.fileAppeal(p.id, g, 'Karar topluluğumuzu dışlıyor, bilirkişi incelemesi talep ediyorum.');
  assert.equal(polls.getPoll(p.id).status, 'askida');
  assert.equal(svc.getTopic(t.id).status, 'askida');
  const appeal = db.get('SELECT * FROM appeals WHERE poll_id = ?', p.id);
  expectHttp(() => polls.reviewAppeal(appeal.id, b, 'yeniden_oylama', 'Bilirkişi olmayan inceleyemez.'), 403);
  polls.reviewAppeal(appeal.id, reviewer, 'yeniden_oylama', 'Gerekçeler ciddi; 2/3 ile yeniden oylansın.');
  const revote = polls.getPoll(db.get('SELECT revote_poll_id AS r FROM appeals WHERE id = ?', appeal.id).r);
  assert.equal(revote.kind, 'itiraz');
  for (const u of [a, b, c, d]) polls.castVote(revote.id, u, 'evet');
  for (const u of [g, h, i, e]) polls.castVote(revote.id, u, 'hayir');
  advance(73 * HOUR);
  polls.tick();
  p = polls.getPoll(t.poll.id);
  assert.equal(p.status, 'red', '2/3 sağlanamayınca karar bozulmalı');
  assert.equal(svc.getTopic(t.id).status, 'red');
  assert.equal(db.get('SELECT status FROM appeals WHERE id = ?', appeal.id).status, 'karar_bozuldu');
});

test('defter: zincir doğrulanır, oylar defterden yeniden sayılabilir, kurcalama yakalanır', () => {
  const v = ledger.verify();
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  const anyPoll = db.get("SELECT id FROM polls WHERE status != 'acik' LIMIT 1");
  const fromLedger = ledger.tallyFromLedger(anyPoll.id);
  const t = polls.tally(polls.getPoll(anyPoll.id));
  assert.deepEqual([fromLedger.evet, fromLedger.hayir, fromLedger.cekimser], [t.evet, t.hayir, t.cekimser]);
  const blocks = db.all('SELECT * FROM ledger ORDER BY idx');
  const forged = blocks.map((b) => ({ ...b }));
  forged[5].payload = forged[5].payload.replace(/"secim":"evet"/, '"secim":"hayir"') + ' ';
  const check = ledger.verifyChain(forged, ledger.publicKeyPem());
  assert.equal(check.ok, false);
  assert.equal(check.errors[0].idx, 5);
});

test('denetim: tüm yönetmelik maddeleri uyumlu', () => {
  const r = runAudit();
  const bad = r.maddeler.filter((m) => m.durum === 'ihlal');
  assert.deepEqual(bad.map((m) => `${m.no}: ${JSON.stringify(m.ihlaller)}`), []);
  assert.ok(now() > 0);
});
