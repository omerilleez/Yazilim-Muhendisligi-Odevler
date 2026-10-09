// Oylama motoru. Kurallar (ontology.js → ARTICLES):
//  - Salt çoğunluk + %30 katılım yeter sayısı (Madde 3); yönetmelik ve gizleme için 2/3 (Madde 8, 11)
//  - Seçmen kütüğü oylama açılınca dondurulur (Madde 10)
//  - Herkes oy vermedikçe asgari müzakere süresi dolmadan erken karar yok (Madde 15)
//  - Kayda değer azınlık / topluluk dışlanması varsa itiraz süresi, bilirkişi incelemesi (Madde 9)
import { db, appSecret } from './db.js';
import * as ledger from './ledger.js';
import { config } from './config.js';
import { now, MINUTE, hmac, fail, parseJSON, str } from './util.js';
import { analyzePoll } from './graph.js';
import { POLL_KINDS } from './ontology.js';

const EPS = 1e-9;
export const CHOICES = ['evet', 'hayir', 'cekimser'];
const pct = (r) => Math.round(r * 1000) / 10;
const thresholdText = (p) => (p.strict ? `%${pct(p.threshold)}'den fazla` : `en az ${p.threshold > 0.66 && p.threshold < 0.67 ? '2/3' : `%${pct(p.threshold)}`}`);

// ---------------------------------------------------------------- bildirimler
export function notify(userId, text, link = '') {
  if (userId) db.run('INSERT INTO notifications (user_id, text, link, created_at) VALUES (?,?,?,?)', userId, text, link, now());
}
export function notifyMany(userIds, text, link = '') {
  for (const id of new Set(userIds)) notify(id, text, link);
}

// ---------------------------------------------------------------- oluşturma
export function createPoll({ kind, targetId, topicId = null, title, threshold = 0.5, strict = true, minutes, minDeliberation, createdBy = null }) {
  if (!POLL_KINDS[kind]) fail(400, 'Geçersiz oylama türü');
  const t = now();
  const duration = minutes ?? config.pollMinutes;
  const deliberation = Math.min(minDeliberation ?? config.minDeliberationMinutes, duration);
  const eligible = db.get('SELECT COUNT(*) AS c FROM users WHERE created_at <= ?', t).c;
  const info = db.run(
    `INSERT INTO polls (kind, target_id, topic_id, title, threshold, strict, quorum, eligible, opens_at, early_after, closes_at, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    kind, targetId, topicId, title, threshold, strict ? 1 : 0, config.quorum, eligible, t, t + deliberation * MINUTE, t + duration * MINUTE, createdBy
  );
  const id = Number(info.lastInsertRowid);
  ledger.append('oylama_acildi', createdBy || 'sistem', {
    poll_id: id, tur: kind, hedef: targetId, konu: topicId, esik: threshold, kati: !!strict,
    yeterSayi: config.quorum, secmenKutugu: eligible, acilis: t, kapanis: t + duration * MINUTE,
  });
  const voters = db.all('SELECT id FROM users WHERE created_at <= ? AND id != ?', t, createdBy || '').map((u) => u.id);
  notifyMany(voters, `Yeni oylama: ${title}`, `#/oylama/${id}`);
  return getPoll(id);
}

export const getPoll = (id) => db.get('SELECT * FROM polls WHERE id = ?', id);

export function tally(poll) {
  const t = { evet: 0, hayir: 0, cekimser: 0 };
  for (const r of db.all('SELECT choice, COUNT(*) AS c FROM votes WHERE poll_id = ? GROUP BY choice', poll.id)) t[r.choice] = r.c;
  const toplam = t.evet + t.hayir + t.cekimser;
  const decisive = t.evet + t.hayir;
  return {
    ...t,
    toplam,
    secmenKutugu: poll.eligible,
    katilim: poll.eligible ? toplam / poll.eligible : 0,
    evetOrani: decisive ? t.evet / decisive : 0,
    gerekenKatilim: Math.ceil(poll.quorum * poll.eligible - EPS),
  };
}

function meets(poll, ratio) {
  return poll.strict ? ratio > poll.threshold + EPS : ratio >= poll.threshold - EPS;
}

/** Karar verilebiliyorsa {outcome, reason}, değilse null döner. */
export function evaluate(poll, t, isFinal) {
  const E = poll.eligible || 1;
  if (!isFinal) {
    const allVoted = t.toplam >= E;
    if (!allVoted && now() < poll.early_after) return null; // asgari müzakere süresi (Madde 15)
    if (!allVoted) {
      if (meets(poll, t.evet / E)) {
        return { outcome: 'kabul', reason: 'Seçmen kütüğünün gerekli çoğunluğu kabul oyu verdi; kalan oylar sonucu değiştiremez.' };
      }
      const remaining = E - t.toplam;
      const best = (t.evet + remaining) / (t.evet + remaining + t.hayir);
      if (!meets(poll, best)) return { outcome: 'red', reason: 'Kalan oyların tamamı kabul olsa bile eşik aşılamıyor.' };
      return null;
    }
  }
  if (t.toplam / E < poll.quorum - EPS) {
    return { outcome: 'red', reason: `Katılım yeter sayısı sağlanamadı (${t.toplam}/${E}, gereken %${pct(poll.quorum)}).` };
  }
  const decisive = t.evet + t.hayir;
  if (!decisive) return { outcome: 'red', reason: 'Hiç kabul ya da ret oyu kullanılmadı.' };
  const r = t.evet / decisive;
  return meets(poll, r)
    ? { outcome: 'kabul', reason: `Oyların %${pct(r)}'i kabul (eşik: ${thresholdText(poll)}).` }
    : { outcome: 'red', reason: `Kabul oranı %${pct(r)}; eşik (${thresholdText(poll)}) aşılamadı.` };
}

// ---------------------------------------------------------------- oy verme
export function castVote(pollId, user, choice) {
  if (!CHOICES.includes(choice)) fail(400, 'Oy evet, hayir veya cekimser olmalı');
  db.tx(() => {
    const poll = getPoll(pollId);
    if (!poll) fail(404, 'Oylama bulunamadı');
    if (poll.status !== 'acik' || now() >= poll.closes_at) fail(409, 'Bu oylama kapanmış');
    if (user.created_at > poll.opens_at) {
      fail(403, 'Seçmen kütüğü oylama açıldığında dondurulur; bu oylama kaydınızdan önce açıldığı için oy kullanamazsınız (Madde 10).');
    }
    db.run(
      `INSERT INTO votes (poll_id, user_id, choice, created_at) VALUES (?,?,?,?)
       ON CONFLICT(poll_id, user_id) DO UPDATE SET choice = excluded.choice, created_at = excluded.created_at`,
      poll.id, user.id, choice, now()
    );
    // Defterde seçmen, oylamaya özgü takma kimlikle yer alır: oylar yeniden sayılabilir ama kimlik açığa çıkmaz.
    ledger.append('oy', 'gizli', { poll_id: poll.id, secmen: hmac(appSecret(), `${poll.id}:${user.id}`).slice(0, 24), secim: choice });
  });
  checkPoll(pollId);
  return getPoll(pollId);
}

export function checkPoll(pollId) {
  const poll = getPoll(pollId);
  if (!poll || poll.status !== 'acik') return null;
  const t = tally(poll);
  const decision = evaluate(poll, t, now() >= poll.closes_at);
  if (decision) finalize(poll, decision.outcome, decision.reason, t);
  return decision;
}

function finalize(poll, outcome, reason, t) {
  db.tx(() => {
    const analysis = analyzePoll(poll);
    const minorityRight = outcome === 'kabul' && poll.kind !== 'itiraz' && (analysis.kayda_deger_azinlik || analysis.azinlikUyarisi);
    const status = outcome === 'red' ? 'red' : minorityRight ? 'itiraz_suresi' : 'kabul';
    const appealUntil = minorityRight ? now() + config.appealMinutes * MINUTE : null;
    let fullReason = reason;
    if (analysis.azinlikUyarisi) fullReason += ` Azınlık uyarısı: ${analysis.dislananlar.join(', ')} büyük ölçüde karşı.`;
    if (minorityRight) fullReason += ' Karar, itiraz süresi dolunca kesinleşecek (Madde 9).';
    db.run(
      'UPDATE polls SET status = ?, outcome = ?, reason = ?, decided_at = ?, result = ?, minority_alert = ?, appeal_until = ? WHERE id = ?',
      status, outcome, fullReason, now(), JSON.stringify({ tally: t, analiz: analysis }), analysis.azinlikUyarisi ? 1 : 0, appealUntil, poll.id
    );
    ledger.append('oylama_sonuclandi', 'sistem', {
      poll_id: poll.id, sonuc: outcome, durum: status, evet: t.evet, hayir: t.hayir, cekimser: t.cekimser,
      secmenKutugu: poll.eligible, azinlikUyarisi: analysis.azinlikUyarisi, kopruSkoru: analysis.kopruSkoru,
    });
    if (status === 'itiraz_suresi') {
      setSubjectStatus(poll, 'itiraz_suresi');
      const losers = db.all("SELECT user_id FROM votes WHERE poll_id = ? AND choice = 'hayir'", poll.id).map((r) => r.user_id);
      notifyMany(losers, `“${poll.title}” kabul edildi. Karşı oy verdiğiniz için itiraz hakkınız ve şerh hakkınız var.`, `#/oylama/${poll.id}`);
    } else {
      applyOutcome(poll, outcome);
    }
    if (poll.created_by) notify(poll.created_by, `“${poll.title}” oylaması sonuçlandı: ${outcome === 'kabul' ? 'KABUL' : 'RET'}`, `#/oylama/${poll.id}`);
  });
}

/** Önerinin kendisinin durumunu (konu, teklif, talep, başvuru) beklemeye alır. */
function setSubjectStatus(poll, status) {
  switch (poll.kind) {
    case 'konu':
    case 'altkonu':
      db.run('UPDATE topics SET status = ? WHERE id = ?', status, poll.target_id);
      break;
    case 'duzenleme':
      db.run('UPDATE edit_proposals SET status = ? WHERE id = ?', status, poll.target_id);
      break;
    case 'silme':
      db.run('UPDATE deletion_requests SET status = ? WHERE id = ?', status, poll.target_id);
      break;
    case 'bilirkisi':
      db.run('UPDATE expert_domains SET status = ? WHERE id = ?', status, poll.target_id);
      break;
    default:
      break;
  }
}

/** Kesinleşen sonucun etkisini uygular. */
function applyOutcome(poll, outcome) {
  const t = now();
  switch (poll.kind) {
    case 'konu':
    case 'altkonu':
      db.run('UPDATE topics SET status = ?, decided_at = ? WHERE id = ?', outcome, t, poll.target_id);
      break;
    case 'duzenleme': {
      db.run('UPDATE edit_proposals SET status = ? WHERE id = ?', outcome, poll.target_id);
      if (outcome === 'kabul') {
        const p = db.get('SELECT * FROM edit_proposals WHERE id = ?', poll.target_id);
        const topic = db.get('SELECT * FROM topics WHERE id = ?', p.topic_id);
        const version = topic.version + 1;
        db.run('UPDATE topics SET title = ?, description = ?, version = ? WHERE id = ?', p.new_title, p.new_description, version, topic.id);
        db.run('INSERT INTO topic_versions (topic_id, version, title, description, proposal_id, created_at) VALUES (?,?,?,?,?,?)', topic.id, version, p.new_title, p.new_description, p.id, t);
        ledger.append('konu_guncellendi', 'sistem', { topic_id: topic.id, surum: version, teklif: p.id, poll_id: poll.id });
      }
      break;
    }
    case 'silme': {
      db.run('UPDATE deletion_requests SET status = ? WHERE id = ?', outcome, poll.target_id);
      if (outcome === 'kabul') {
        const req = db.get('SELECT * FROM deletion_requests WHERE id = ?', poll.target_id);
        if (req.category === 'kisisel_veri') {
          // Kişisel veri: içerik boşaltılır (unutulma hakkı), özet ve kayıt kalır.
          db.run("UPDATE messages SET hidden = 1, hidden_poll_id = ?, wiped = 1, content = '' WHERE id = ?", poll.id, req.message_id);
        } else {
          db.run('UPDATE messages SET hidden = 1, hidden_poll_id = ? WHERE id = ?', poll.id, req.message_id);
        }
        ledger.append('mesaj_gizlendi', 'sistem', { message_id: req.message_id, poll_id: poll.id, gerekce: req.category, icerikBosaltildi: req.category === 'kisisel_veri' });
      }
      break;
    }
    case 'bilirkisi':
      db.run('UPDATE expert_domains SET status = ? WHERE id = ?', outcome === 'kabul' ? 'onayli' : 'red', poll.target_id);
      break;
    case 'itiraz': {
      const original = getPoll(poll.target_id);
      const appeal = db.get('SELECT * FROM appeals WHERE revote_poll_id = ?', poll.id);
      if (outcome === 'kabul') {
        db.run("UPDATE polls SET status = 'kabul' WHERE id = ?", original.id);
        applyOutcome(original, 'kabul');
      } else {
        db.run(
          "UPDATE polls SET status = 'red', outcome = 'red', reason = ? WHERE id = ?",
          `${original.reason || ''} İtiraz üzerine yapılan yeniden oylamada 2/3 nitelikli çoğunluk sağlanamadığı için karar bozuldu.`.trim(), original.id
        );
        applyOutcome(original, 'red');
      }
      if (appeal) db.run('UPDATE appeals SET status = ?, decided_at = ? WHERE id = ?', outcome === 'kabul' ? 'karar_onandi' : 'karar_bozuldu', t, appeal.id);
      ledger.append('itiraz_sonuclandi', 'sistem', { poll_id: original.id, yenidenOylama: poll.id, sonuc: outcome === 'kabul' ? 'karar_onandi' : 'karar_bozuldu' });
      break;
    }
    default:
      break;
  }
}

// ---------------------------------------------------------------- zamanlayıcı
export function tick() {
  const t = now();
  for (const p of db.all("SELECT id FROM polls WHERE status = 'acik' AND (closes_at <= ? OR early_after <= ?)", t, t)) {
    checkPoll(p.id);
  }
  for (const p of db.all("SELECT * FROM polls WHERE status = 'itiraz_suresi' AND appeal_until <= ?", t)) {
    db.tx(() => {
      db.run("UPDATE polls SET status = 'kabul' WHERE id = ?", p.id);
      applyOutcome(p, 'kabul');
      ledger.append('karar_kesinlesti', 'sistem', { poll_id: p.id, gerekce: 'İtiraz süresi itirazsız doldu' });
    });
  }
  for (const a of db.all("SELECT * FROM appeals WHERE status = 'inceleniyor' AND review_deadline <= ?", t)) {
    resolveAppeal(a, null, 'onayla', 'Bilirkişi inceleme süresi doldu; karar kendiliğinden kesinleşti.');
  }
}

// ---------------------------------------------------------------- azınlık hakları
function pollDomain(poll) {
  if (poll.kind === 'bilirkisi') return db.get('SELECT domain FROM expert_domains WHERE id = ?', poll.target_id)?.domain;
  return poll.topic_id ? db.get('SELECT domain FROM topics WHERE id = ?', poll.topic_id)?.domain : null;
}

export function reviewersFor(poll) {
  const domain = pollDomain(poll);
  let experts = db.all("SELECT DISTINCT user_id FROM expert_domains WHERE status = 'onayli' AND domain = ?", domain).map((r) => r.user_id);
  if (!experts.length) experts = db.all("SELECT DISTINCT user_id FROM expert_domains WHERE status = 'onayli'").map((r) => r.user_id);
  return { domain, experts };
}

export function fileAppeal(pollId, user, reasonRaw) {
  const reason = str(reasonRaw, 3000);
  const poll = getPoll(pollId);
  if (!poll) fail(404, 'Oylama bulunamadı');
  if (poll.status !== 'itiraz_suresi') fail(409, 'Bu karar için açık bir itiraz süresi yok');
  const vote = db.get('SELECT choice FROM votes WHERE poll_id = ? AND user_id = ?', poll.id, user.id);
  if (!vote || vote.choice !== 'hayir') fail(403, 'Yalnızca bu oylamada karşı oy kullanan üyeler itiraz edebilir');
  if (reason.length < 20) fail(400, 'İtiraz gerekçesi en az 20 karakter olmalı');
  const id = db.tx(() => {
    const info = db.run(
      'INSERT INTO appeals (poll_id, user_id, reason, review_deadline, created_at) VALUES (?,?,?,?,?)',
      poll.id, user.id, reason, now() + config.reviewMinutes * MINUTE, now()
    );
    db.run("UPDATE polls SET status = 'askida' WHERE id = ?", poll.id);
    setSubjectStatus(poll, 'askida');
    ledger.append('itiraz', user.id, { poll_id: poll.id, appeal_id: Number(info.lastInsertRowid), gerekceOzeti: reason.slice(0, 140) });
    const { experts } = reviewersFor(poll);
    notifyMany(experts.filter((e) => e !== user.id), `İtiraz incelemesi bekliyor: “${poll.title}”`, `#/oylama/${poll.id}`);
    return Number(info.lastInsertRowid);
  });
  return db.get('SELECT * FROM appeals WHERE id = ?', id);
}

export function reviewAppeal(appealId, reviewer, decision, noteRaw) {
  const note = str(noteRaw, 3000);
  const appeal = db.get('SELECT * FROM appeals WHERE id = ?', appealId);
  if (!appeal) fail(404, 'İtiraz bulunamadı');
  if (appeal.status !== 'inceleniyor') fail(409, 'Bu itiraz zaten sonuçlanmış');
  if (!['onayla', 'yeniden_oylama'].includes(decision)) fail(400, 'Karar "onayla" ya da "yeniden_oylama" olmalı');
  if (note.length < 10) fail(400, 'İnceleme notu en az 10 karakter olmalı');
  const poll = getPoll(appeal.poll_id);
  const { experts } = reviewersFor(poll);
  if (!experts.includes(reviewer.id)) fail(403, 'İtirazı yalnızca ilgili alanın onaylı bilirkişileri inceleyebilir');
  if (reviewer.id === appeal.user_id || reviewer.id === poll.created_by) fail(403, 'Çıkar çatışması: itiraz eden ya da öneri sahibi inceleme yapamaz');
  resolveAppeal(appeal, reviewer.id, decision, note);
  return db.get('SELECT * FROM appeals WHERE id = ?', appealId);
}

// Bilirkişi demokratik kararı tek başına bozamaz: ya onar ya da 2/3 eşikli yeniden oylamaya gönderir.
function resolveAppeal(appeal, reviewerId, decision, note) {
  db.tx(() => {
    const poll = getPoll(appeal.poll_id);
    if (decision === 'onayla') {
      db.run("UPDATE appeals SET status = 'onaylandi', reviewer_id = ?, review_note = ?, decided_at = ? WHERE id = ?", reviewerId, note, now(), appeal.id);
      db.run("UPDATE polls SET status = 'kabul' WHERE id = ?", poll.id);
      applyOutcome(poll, 'kabul');
      ledger.append('itiraz_incelendi', reviewerId || 'sistem', { appeal_id: appeal.id, poll_id: poll.id, karar: 'onayla' });
      notify(appeal.user_id, `İtirazınız incelendi: karar onandı. Not: ${note}`, `#/oylama/${poll.id}`);
    } else {
      const revote = createPoll({
        kind: 'itiraz', targetId: poll.id, topicId: poll.topic_id, title: `İtiraz üzerine yeniden oylama: ${poll.title}`,
        threshold: 2 / 3, strict: false, createdBy: reviewerId,
      });
      db.run("UPDATE appeals SET status = 'yeniden_oylama', reviewer_id = ?, review_note = ?, revote_poll_id = ? WHERE id = ?", reviewerId, note, revote.id, appeal.id);
      ledger.append('itiraz_incelendi', reviewerId || 'sistem', { appeal_id: appeal.id, poll_id: poll.id, karar: 'yeniden_oylama', yeniOylama: revote.id });
      notify(appeal.user_id, `İtirazınız kabul edildi: karar 2/3 eşikle yeniden oylanacak.`, `#/oylama/${revote.id}`);
    }
  });
}

export function addMinorityReport(pollId, user, contentRaw) {
  const content = str(contentRaw, 5000);
  const poll = getPoll(pollId);
  if (!poll) fail(404, 'Oylama bulunamadı');
  if (poll.status === 'acik') fail(409, 'Şerh, oylama sonuçlandıktan sonra düşülebilir');
  const outcome = poll.outcome || (poll.status === 'red' ? 'red' : 'kabul');
  const losingChoice = outcome === 'kabul' ? 'hayir' : 'evet';
  const vote = db.get('SELECT choice FROM votes WHERE poll_id = ? AND user_id = ?', poll.id, user.id);
  if (!vote || vote.choice !== losingChoice) fail(403, 'Şerhi yalnızca kaybeden tarafta oy kullanan üyeler düşebilir (Madde 14)');
  if (content.length < 20) fail(400, 'Şerh en az 20 karakter olmalı');
  if (db.get('SELECT 1 FROM minority_reports WHERE poll_id = ? AND user_id = ?', poll.id, user.id)) fail(409, 'Bu oylamaya zaten şerh düştünüz');
  db.tx(() => {
    db.run('INSERT INTO minority_reports (poll_id, user_id, side, content, created_at) VALUES (?,?,?,?,?)', poll.id, user.id, losingChoice, content, now());
    ledger.append('azinlik_serhi', user.id, { poll_id: poll.id, taraf: losingChoice, icerikOzeti: content.slice(0, 140) });
  });
}

// ---------------------------------------------------------------- görünüm
export function pollView(poll, user = null) {
  const t = tally(poll);
  const result = parseJSON(poll.result, null);
  const myVote = user ? db.get('SELECT choice FROM votes WHERE poll_id = ? AND user_id = ?', poll.id, user.id)?.choice ?? null : null;
  let canVote = false;
  let voteBlock = null;
  if (!user) voteBlock = 'Oy vermek için giriş yapın.';
  else if (poll.status !== 'acik') voteBlock = 'Oylama sonuçlandı.';
  else if (user.created_at > poll.opens_at) voteBlock = 'Bu oylama kaydınızdan önce açıldı (seçmen kütüğü dondurulmuştur, Madde 10).';
  else canVote = true;
  const reports = db.all(
    'SELECT r.id, r.side, r.content, r.created_at, u.nickname, u.id AS user_id FROM minority_reports r JOIN users u ON u.id = r.user_id WHERE r.poll_id = ? ORDER BY r.created_at',
    poll.id
  );
  const appeals = db.all(
    `SELECT a.*, u.nickname, rv.nickname AS reviewer_nickname FROM appeals a
     JOIN users u ON u.id = a.user_id LEFT JOIN users rv ON rv.id = a.reviewer_id
     WHERE a.poll_id = ? ORDER BY a.created_at`,
    poll.id
  );
  const outcome = poll.outcome;
  const losingChoice = outcome === 'kabul' ? 'hayir' : outcome === 'red' ? 'evet' : null;
  const reviewers = poll.status === 'askida' ? reviewersFor(poll).experts : [];
  return {
    ...poll,
    strict: !!poll.strict,
    turEtiketi: POLL_KINDS[poll.kind],
    result,
    tally: t,
    myVote,
    canVote,
    voteBlock,
    canAppeal: !!user && poll.status === 'itiraz_suresi' && myVote === 'hayir',
    canReport: !!user && !!losingChoice && myVote === losingChoice && !reports.some((r) => r.user_id === user.id),
    canReview: !!user && reviewers.includes(user.id) && !appeals.some((a) => a.status === 'inceleniyor' && a.user_id === user.id) && poll.created_by !== user.id,
    minorityReports: reports,
    appeals,
    serverTime: now(),
  };
}
