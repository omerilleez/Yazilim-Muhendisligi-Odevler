// Denetim motoru: her yönetmelik maddesi (ontology.js → ARTICLES[].rule) için veritabanı ve defter
// üzerinde makinece kontrol yapar. Sonuç: uyumlu / uyarı / ihlal. Konu bazlı denetim de desteklenir.
import { db } from './db.js';
import * as ledger from './ledger.js';
import { ARTICLES, DOMAIN_IDS, DELETION_CATEGORIES } from './ontology.js';
import { sha256, ageOn, parseJSON, now } from './util.js';
import { config } from './config.js';

const EPS = 1e-9;
const meets = (p, r) => (p.strict ? r > p.threshold + EPS : r >= p.threshold - EPS);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function tallyOf(pollId) {
  const t = { evet: 0, hayir: 0, cekimser: 0 };
  for (const r of db.all('SELECT choice, COUNT(*) AS c FROM votes WHERE poll_id = ? GROUP BY choice', pollId)) t[r.choice] = r.c;
  t.toplam = t.evet + t.hayir + t.cekimser;
  return t;
}

const CHECKS = {
  R1() {
    const v = [];
    const topics = db.all('SELECT t.id, u.id AS uid FROM topics t LEFT JOIN users u ON u.id = t.created_by');
    for (const t of topics) if (!t.uid) v.push({ topic_id: t.id, detay: `Konu #${t.id} kayıtlı bir üyeye bağlı değil` });
    const props = db.all('SELECT p.id, p.topic_id, t.status, u.id AS uid FROM edit_proposals p JOIN topics t ON t.id = p.topic_id LEFT JOIN users u ON u.id = p.proposer');
    for (const p of props) {
      if (!p.uid) v.push({ topic_id: p.topic_id, detay: `Düzenleme teklifi #${p.id} kayıtlı bir üyeye bağlı değil` });
    }
    return { kontrol: topics.length + props.length, ihlaller: v };
  },
  R2() {
    const users = db.all('SELECT * FROM users');
    const v = [];
    for (const u of users) {
      const missing = ['first_name', 'last_name', 'birth_date', 'email', 'phone', 'city', 'district', 'address', 'nickname'].filter((k) => !String(u[k] || '').trim());
      if (missing.length) v.push({ detay: `${u.nickname}: eksik alanlar (${missing.join(', ')})` });
      else if (!EMAIL.test(u.email)) v.push({ detay: `${u.nickname}: geçersiz e-posta biçimi` });
    }
    // Defterde kişisel veri olmamalı: e-posta adresi ya da ad-soyad defter içeriğinde geçmemeli.
    const leaks = [];
    for (const u of users) {
      const hit = db.get('SELECT idx FROM ledger WHERE instr(payload, ?) > 0 LIMIT 1', u.email);
      if (hit) leaks.push({ detay: `Defter bloğu #${hit.idx} bir e-posta adresi içeriyor` });
    }
    return { kontrol: users.length, ihlaller: [...v, ...leaks] };
  },
  R3() {
    const polls = db.all("SELECT * FROM polls WHERE outcome IS NOT NULL AND kind IN ('konu','altkonu','duzenleme','bilirkisi','silme','itiraz')");
    const v = [];
    const w = [];
    for (const p of polls) {
      const t = tallyOf(p.id);
      const decisive = t.evet + t.hayir;
      if (p.outcome === 'kabul') {
        const earlyOk = meets(p, t.evet / p.eligible);
        const finalOk = t.toplam / p.eligible >= p.quorum - EPS && decisive > 0 && meets(p, t.evet / decisive);
        if (!earlyOk && !finalOk) v.push({ topic_id: p.topic_id, poll_id: p.id, detay: `Oylama #${p.id} kabul edilmiş ama oylar eşiği/yeter sayıyı karşılamıyor` });
      }
      const lt = ledger.tallyFromLedger(p.id);
      if (lt.evet !== t.evet || lt.hayir !== t.hayir || lt.cekimser !== t.cekimser) {
        v.push({ topic_id: p.topic_id, poll_id: p.id, detay: `Oylama #${p.id}: veritabanı sayımı (${t.evet}/${t.hayir}/${t.cekimser}) defter sayımıyla (${lt.evet}/${lt.hayir}/${lt.cekimser}) uyuşmuyor` });
      }
      if (!lt.kayitliSonuc) w.push({ topic_id: p.topic_id, poll_id: p.id, detay: `Oylama #${p.id} sonucunun defter kaydı yok` });
    }
    return { kontrol: polls.length, ihlaller: v, uyarilar: w };
  },
  R4() {
    const topics = db.all("SELECT t.id, t.status, p.status AS ps, p.outcome FROM topics t LEFT JOIN polls p ON p.id = t.poll_id");
    const v = [];
    for (const t of topics) {
      if (t.status === 'kabul' && !(t.ps === 'kabul' && t.outcome === 'kabul')) v.push({ topic_id: t.id, detay: `Konu #${t.id} kabul görünüyor ama oylaması kesinleşmiş bir kabul değil` });
      if (!t.ps) v.push({ topic_id: t.id, detay: `Konu #${t.id} için oylama kaydı yok` });
    }
    return { kontrol: topics.length, ihlaller: v };
  },
  R5() {
    const subs = db.all('SELECT s.id, s.created_at, p.id AS pid, p.status AS pstatus, p.decided_at AS pdec FROM topics s LEFT JOIN topics p ON p.id = s.parent_id WHERE s.parent_id IS NOT NULL');
    const v = [];
    for (const s of subs) {
      if (!s.pid) v.push({ topic_id: s.id, detay: `Alt konu #${s.id} var olmayan bir üst konuya bağlı` });
      else if (s.pstatus !== 'kabul' || !s.pdec || s.pdec > s.created_at) v.push({ topic_id: s.id, detay: `Alt konu #${s.id}, üst konu #${s.pid} kabul edilmeden önerilmiş` });
    }
    return { kontrol: subs.length, ihlaller: v };
  },
  R6() {
    const topics = db.all('SELECT id, domain, articles FROM topics');
    const v = [];
    const w = [];
    for (const t of topics) {
      if (!DOMAIN_IDS.includes(t.domain)) v.push({ topic_id: t.id, detay: `Konu #${t.id} ontolojide olmayan bir alana (“${t.domain}”) bağlı` });
      if (!parseJSON(t.articles, []).length) w.push({ topic_id: t.id, detay: `Konu #${t.id} hiçbir yönetmelik maddesiyle etiketlenmemiş` });
    }
    return { kontrol: topics.length, ihlaller: v, uyarilar: w };
  },
  R7() {
    const msgs = db.all('SELECT id, topic_id, content, content_hash, wiped FROM messages');
    const byId = new Map(msgs.map((m) => [m.id, m]));
    const v = [];
    for (const m of msgs) {
      if (!m.wiped && sha256(m.content) !== m.content_hash) v.push({ topic_id: m.topic_id, detay: `Mesaj #${m.id} içeriği kayıtlı özetiyle uyuşmuyor (değiştirilmiş)` });
    }
    const blocks = db.all("SELECT idx, payload FROM ledger WHERE type = 'mesaj'");
    for (const b of blocks) {
      const p = JSON.parse(b.payload);
      const m = byId.get(p.message_id);
      if (!m) v.push({ topic_id: p.topic_id, detay: `Defterdeki mesaj #${p.message_id} veritabanında yok (fiziksel olarak silinmiş)` });
      else if (m.content_hash !== p.icerikOzeti) v.push({ topic_id: m.topic_id, detay: `Mesaj #${m.id} özeti defterdekiyle uyuşmuyor` });
    }
    if (blocks.length < msgs.length) v.push({ detay: `${msgs.length - blocks.length} mesajın defter kaydı yok` });
    return { kontrol: msgs.length, ihlaller: v };
  },
  R8() {
    const hidden = db.all(
      `SELECT m.id, m.topic_id, p.kind, p.status, p.threshold, d.category FROM messages m
       LEFT JOIN polls p ON p.id = m.hidden_poll_id LEFT JOIN deletion_requests d ON d.id = p.target_id
       WHERE m.hidden = 1`
    );
    const v = [];
    for (const h of hidden) {
      if (h.kind !== 'silme' || h.status !== 'kabul') v.push({ topic_id: h.topic_id, detay: `Mesaj #${h.id} kesinleşmiş bir gizleme oylaması olmadan gizlenmiş` });
      else if (h.threshold < 2 / 3 - EPS) v.push({ topic_id: h.topic_id, detay: `Mesaj #${h.id} 2/3'ten düşük eşikle gizlenmiş` });
      else if (!DELETION_CATEGORIES[h.category]) v.push({ topic_id: h.topic_id, detay: `Mesaj #${h.id} geçersiz gerekçeyle (“${h.category}”) gizlenmiş` });
    }
    const reqs = db.all('SELECT id, topic_id, category FROM deletion_requests');
    for (const r of reqs) if (!DELETION_CATEGORIES[r.category]) v.push({ topic_id: r.topic_id, detay: `Gizleme talebi #${r.id} geçersiz gerekçeli` });
    return { kontrol: hidden.length + reqs.length, ihlaller: v };
  },
  R9() {
    const polls = db.all("SELECT * FROM polls WHERE outcome = 'kabul' AND kind != 'itiraz'");
    const v = [];
    for (const p of polls) {
      const a = parseJSON(p.result, {})?.analiz;
      if (a && (a.kayda_deger_azinlik || a.azinlikUyarisi) && !p.appeal_until) {
        v.push({ topic_id: p.topic_id, poll_id: p.id, detay: `Oylama #${p.id}: kayda değer azınlık varken itiraz süresi tanınmamış` });
      }
    }
    const stale = db.all("SELECT id, poll_id FROM appeals WHERE status = 'inceleniyor' AND review_deadline < ?", now());
    const w = stale.map((a) => ({ detay: `İtiraz #${a.id} inceleme süresini aştı (zamanlayıcı bekleniyor)` }));
    return { kontrol: polls.length, ihlaller: v, uyarilar: w };
  },
  R10() {
    const rows = db.all('SELECT v.poll_id, p.topic_id, u.nickname FROM votes v JOIN polls p ON p.id = v.poll_id JOIN users u ON u.id = v.user_id WHERE u.created_at > p.opens_at');
    const total = db.get('SELECT COUNT(*) AS c FROM votes').c;
    return { kontrol: total, ihlaller: rows.map((r) => ({ topic_id: r.topic_id, poll_id: r.poll_id, detay: `${r.nickname}, kaydından önce açılan oylama #${r.poll_id}'de oy kullanmış` })) };
  },
  R11() {
    const rows = db.all("SELECT t.id, p.threshold FROM topics t JOIN polls p ON p.id = t.poll_id WHERE t.kind = 'yonetmelik'");
    return { kontrol: rows.length, ihlaller: rows.filter((r) => r.threshold < 2 / 3 - EPS).map((r) => ({ topic_id: r.id, detay: `Yönetmelik konusu #${r.id} 2/3'ten düşük eşikle oylanmış` })) };
  },
  R12() {
    const ops = db.all(
      `SELECT o.id, o.topic_id, o.domain, t.domain AS tdomain, u.nickname,
              (SELECT COUNT(*) FROM expert_domains e WHERE e.user_id = o.expert_id AND e.domain = o.domain AND e.status = 'onayli') AS ok
       FROM expert_opinions o JOIN topics t ON t.id = o.topic_id JOIN users u ON u.id = o.expert_id`
    );
    const v = [];
    for (const o of ops) {
      if (!o.ok) v.push({ topic_id: o.topic_id, detay: `${o.nickname}, onaylı bilirkişisi olmadığı alanda (#${o.id}) görüş vermiş` });
      else if (o.domain !== o.tdomain) v.push({ topic_id: o.topic_id, detay: `Görüş #${o.id} konunun alanı dışında verilmiş` });
    }
    return { kontrol: ops.length, ihlaller: v };
  },
  R13() {
    const r = ledger.verify();
    return { kontrol: r.length, ihlaller: r.errors.map((e) => ({ detay: `Blok #${e.idx}: ${e.hata}` })) };
  },
  R14() {
    const rows = db.all('SELECT r.id, r.side, p.outcome, p.topic_id, v.choice FROM minority_reports r JOIN polls p ON p.id = r.poll_id LEFT JOIN votes v ON v.poll_id = r.poll_id AND v.user_id = r.user_id');
    const v = [];
    // Şerh yazıldığı andaki kaybeden taraf (side) kaydedilir; karar sonradan itirazla bozulsa bile
    // şerh geçerliliğini korur. Kontrol: yazarın oyu, kaydedilen tarafla aynı olmalı.
    for (const r of rows) {
      if (r.choice !== r.side) v.push({ topic_id: r.topic_id, detay: `Şerh #${r.id} kaybeden tarafta oy kullanmamış biri tarafından yazılmış` });
    }
    return { kontrol: rows.length, ihlaller: v };
  },
  R15() {
    const polls = db.all('SELECT * FROM polls WHERE decided_at IS NOT NULL');
    const v = [];
    for (const p of polls) {
      if (p.decided_at < p.early_after && p.decided_at < p.closes_at) {
        const t = tallyOf(p.id);
        if (t.toplam < p.eligible) v.push({ topic_id: p.topic_id, poll_id: p.id, detay: `Oylama #${p.id} asgari müzakere süresi dolmadan sonuçlandırılmış` });
      }
    }
    return { kontrol: polls.length, ihlaller: v };
  },
  R16() {
    const users = db.all('SELECT nickname, birth_date, created_at FROM users');
    return {
      kontrol: users.length,
      ihlaller: users.filter((u) => ageOn(u.birth_date, u.created_at) < config.minAge).map((u) => ({ detay: `${u.nickname} kayıt tarihinde ${config.minAge} yaşından küçük` })),
    };
  },
};

function statusOf(r) {
  if (r.ihlaller.length) return 'ihlal';
  if ((r.uyarilar || []).length) return 'uyari';
  return 'uyumlu';
}

export function runAudit() {
  const maddeler = ARTICLES.map((a) => {
    let r;
    try {
      r = CHECKS[a.rule]();
    } catch (err) {
      r = { kontrol: 0, ihlaller: [{ detay: `Denetim çalıştırılamadı: ${err.message}` }] };
    }
    return { ...a, kontrol: r.kontrol, ihlaller: r.ihlaller, uyarilar: r.uyarilar || [], durum: statusOf(r) };
  });
  const ozet = { uyumlu: 0, uyari: 0, ihlal: 0 };
  for (const m of maddeler) ozet[m.durum]++;
  return { zaman: now(), ozet, maddeler, defter: ledger.info() };
}

/** Konu bazlı denetim: konunun bağlı olduğu maddeler + her konu için zorunlu maddeler. */
export function auditTopic(topicId, full = runAudit()) {
  const topic = db.get('SELECT * FROM topics WHERE id = ?', topicId);
  if (!topic) return null;
  const nos = new Set([3, 4, 6, 7, ...parseJSON(topic.articles, [])]);
  if (topic.parent_id) nos.add(5);
  if (topic.kind === 'yonetmelik') nos.add(11);
  const maddeler = full.maddeler
    .filter((m) => nos.has(m.no))
    .map((m) => {
      const ihlaller = m.ihlaller.filter((x) => x.topic_id === topicId);
      const uyarilar = m.uyarilar.filter((x) => x.topic_id === topicId);
      return { no: m.no, title: m.title, text: m.text, rule: m.rule, ihlaller, uyarilar, durum: statusOf({ ihlaller, uyarilar }) };
    });
  return { topic_id: topicId, zaman: full.zaman, maddeler };
}
