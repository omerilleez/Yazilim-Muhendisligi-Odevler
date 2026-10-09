// Demo verisi: son üç haftalık kurgusal bir müzakere geçmişi üretir. Tüm işlemler gerçek iş
// kurallarından (services/polls) geçer; saat geriye alınarak geçmiş tarihli olarak işlenir.
// Kullanım: npm run seed   (veritabanını sıfırlar ve yeniden doldurur)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { initDb, db, closeDb } from './db.js';
import { initLedger } from './ledger.js';
import * as svc from './services.js';
import * as polls from './polls.js';
import { setClock, resetClock, MINUTE, HOUR, DAY } from './util.js';
import { USERS, GROUPS, BRIDGES, DEMO_PASSWORD } from './seed-data.js';

export function seedDemo() {
  const NOW = Date.now();
  const saved = { ...config };
  // Tohum verisi, demo hızından bağımsız olarak gerçekçi sürelerle üretilir.
  Object.assign(config, { pollMinutes: 72 * 60, regulationPollMinutes: 120 * 60, minDeliberationMinutes: 24 * 60, appealMinutes: 24 * 60, reviewMinutes: 48 * 60 });
  let cursor = NOW - 22 * DAY;
  const at = (t) => {
    cursor = Math.max(cursor, t);
    setClock(cursor);
  };
  const step = (ms = MINUTE) => at(cursor + ms);
  const u = {};
  const vote = (pollId, map) => {
    for (const [choice, names] of Object.entries(map)) {
      for (const n of names) {
        step(3 * MINUTE);
        polls.castVote(pollId, u[n], choice);
      }
    }
  };
  const msg = (topicId, nick, content, replyTo = null, gap = 13 * MINUTE) => {
    step(gap);
    return svc.postMessage(u[nick], topicId, { content, reply_to: replyTo, _seed: true });
  };
  const topic = (nick, data) => svc.createTopic(u[nick], data);
  const pollOf = (topicId) => svc.getTopic(topicId).poll_id;

  try {
    // ------------------------------------------------------------ üyeler ve insan grafı
    at(NOW - 21 * DAY);
    initLedger();
    for (const d of USERS) {
      step(5 * MINUTE);
      const r = svc.register({ ...d, email: `${d.nickname}@ortakakil.test`, password: DEMO_PASSWORD });
      u[d.nickname] = svc.getUser(r.user.id);
    }
    step(HOUR);
    for (const [g, members] of Object.entries(GROUPS)) {
      members.forEach((a, i) => {
        for (const b of members) if (a !== b) svc.setEdge(u[a], u[b].id, 'takip', true);
        const trusted = g === 'C' ? members.filter((b) => b !== a) : [members[(i + 1) % members.length], members[(i + 2) % members.length]];
        for (const b of trusted) svc.setEdge(u[a], u[b].id, 'guven', true);
      });
    }
    for (const [a, b, type] of BRIDGES) svc.setEdge(u[a], u[b].id, type, true);

    const A = GROUPS.A;
    const B = GROUPS.B;
    const C = GROUPS.C;

    // ------------------------------------------------------------ bilirkişi başvuruları
    at(NOW - 20 * DAY);
    const expertApps = [
      ['ayse', 'egitim', '15 yıllık eğitim bilimleri akademisyeni; üniversite kütüphaneleri ve öğrenme ortamları üzerine yayınları var.'],
      ['zeynep', 'hukuk', 'Baroya kayıtlı avukat, kişisel verilerin korunması ve idare hukuku alanında 12 yıllık deneyim.'],
      ['emre', 'saglik', 'Halk sağlığı uzmanı hekim; toplu beslenme hizmetleri ve kurum yemekhaneleri denetimi deneyimi.'],
      ['deniz', 'ulasim', 'Şehir ve bölge planlama doktoru; sürdürülebilir kampüs ulaşımı projelerinde danışmanlık.'],
      ['mehmet', 'yonetisim', 'Kamu yönetimi uzmanı; katılımcı bütçe ve yerel yönetişim süreçleri tasarımı.'],
    ];
    const appPolls = expertApps.map(([n, domain, credentials]) => {
      step(20 * MINUTE);
      return svc.applyExpert(u[n], { domain, credentials }).poll_id;
    });
    for (const p of appPolls) vote(p, { evet: [...A, ...B], cekimser: C });
    at(NOW - 19 * DAY + HOUR);
    polls.tick();

    // ------------------------------------------------------------ ilk konular
    at(NOW - 18 * DAY);
    const t1 = topic('deniz', {
      title: 'Kampüs içi bisiklet yolu ağı kurulsun',
      description: 'Ana kapıdan fakültelere, kütüphaneye ve yurtlara uzanan, araç trafiğinden fiziksel olarak ayrılmış 6 km uzunluğunda bir bisiklet yolu ağı kurulmasını öneriyorum. Proje kampüs içi araç trafiğini azaltacak, ulaşımı ucuzlatacak ve karbon salımını düşürecek.',
      domain: 'ulasim',
    }).id;
    step(30 * MINUTE);
    const t5 = topic('burak', {
      title: 'Kampüs otoparkı ücretli olsun',
      description: 'Otopark kapasitesi yetersiz. Saatlik düşük bir ücret alınsın, elde edilen gelir toplu taşıma ve bisiklet altyapısına aktarılsın. Ücretlendirme boş yer arama trafiğini de azaltacaktır.',
      domain: 'ekonomi',
    }).id;
    step(30 * MINUTE);
    const t6 = topic('can', {
      title: 'Ders kayıt istatistikleri açık veri olarak yayımlansın',
      description: 'Derslerin kontenjan, doluluk ve bekleme listesi verileri anonim ve makinece okunabilir biçimde (CSV/JSON) her dönem yayımlansın. Böylece öğrenciler planlamalarını veriye dayalı yapabilir.',
      domain: 'teknoloji',
    }).id;

    const m1 = msg(t1, 'deniz', 'Ölçümlerimize göre kampüs içi yolculukların yaklaşık %60’ı 2 km’den kısa. Ayrık bir bisiklet yolu bu yolculuklar için en hızlı ve en ucuz seçenek olur.');
    msg(t1, 'mehmet', 'Destekliyorum. Ama yokuşlu bölgeler için elektrikli bisiklet paylaşım istasyonları da düşünülmeli.');
    const m3 = msg(t1, 'kerem', 'Bütçe nereden gelecek? Aynı parayla servis sefer sayısı artırılabilir. Bence önce ayrıntılı bir maliyet analizi yapılmalı.');
    msg(t1, 'zeynep', 'Belediyenin sürdürülebilir ulaşım fonuna başvurulabilir; maliyetin büyük kısmı hibeyle karşılanabilir.', m3.id);
    msg(t5, 'burak', 'Ücretlendirme talebi dengeler, boş yer bulma süresi kısalır. Toplanan gelir yine ulaşıma döner.');
    msg(t5, 'elif', 'Katılmıyorum; maddi durumu iyi olmayan öğrenciler ve düşük ücretli personel için adaletsiz olur.');
    msg(t6, 'can', 'Öğrenciler hangi derslerin hızla dolduğunu görürse dönem planlamasını buna göre yapabilir.');
    const m8 = msg(t6, 'zeynep', 'Kişisel veri içermediği sürece hukuken sorun yok; ama küçük gruplarda kimlik çıkarımı riskine dikkat etmeliyiz.');

    vote(pollOf(t1), { evet: [...A, ...B, 'irem'], hayir: ['kerem', 'nil'], cekimser: ['ozan'] });
    vote(pollOf(t5), { evet: ['burak', 'ece', 'deniz'], hayir: [...A, ...C, 'selin', 'emre'] });
    vote(pollOf(t6), { evet: [...A, ...B, 'ozan', 'irem'], hayir: ['kerem', 'nil'] });

    msg(t1, 'ece', 'Gece kullanımı için aydınlatma şart, yoksa ciddi bir güvenlik sorunu olur.', m1.id, 2 * HOUR);
    msg(t1, 'irem', 'Yaya yollarıyla kesişen noktalarda kazalardan endişeliyim; hız sınırı konulmalı mı?');
    msg(t5, 'nil', 'Engelli ve gece vardiyasında çalışan personel için muafiyet olmadan bu öneri kabul edilemez.');
    msg(t5, 'ece', 'Muafiyetlerle birlikte düşünülebilir ama şu haliyle sakıncalı.');
    msg(t6, 'ozan', 'Açık veri iyi fikir ama formatı ve güncelleme sıklığı da yazılı hale getirilmeli.', m8.id);

    at(NOW - 17 * DAY + 2 * HOUR);
    polls.tick();

    // ------------------------------------------------------------ alt konu ve kişisel veri gizleme
    at(NOW - 16 * DAY);
    msg(t6, 'mehmet', 'Katılıyorum; dönem başında ve kayıt haftası sonunda olmak üzere iki kez yayımlanabilir.');
    const leak = msg(t6, 'irem', 'Veri setini hazırlamaya gönüllüyüm, bana 0532 123 45 67 numarasından ya da irem.polat@ornek.com adresinden ulaşabilirsiniz.');
    step(HOUR);
    const t11 = topic('selin', {
      parent_id: t1,
      title: 'Fakülte girişlerine kapalı bisiklet parkları',
      description: 'Her fakülte girişine en az 30 bisiklet kapasiteli, üstü kapalı ve kameralı park alanı yapılsın. Hırsızlık korkusu bisiklet kullanımının önündeki en büyük engel.',
      domain: 'ulasim',
    }).id;
    msg(t11, 'selin', 'Hırsızlık en büyük caydırıcı; kapalı ve kameralı park şart.');
    msg(t11, 'can', 'Destekliyorum, park alanlarının çatısı yağmur suyu toplayacak şekilde de tasarlanabilir.');
    step(HOUR);
    const delB = svc.requestDeletion(u.zeynep, leak.id, {
      category: 'kisisel_veri',
      explanation: 'Mesaj açık telefon numarası ve e-posta adresi içeriyor; üyenin kendi iyiliği için gizlenmeli.',
      _seed: true,
    });
    msg(t6, 'irem', 'Haklısınız, telefonumu yazmamalıydım. Gizleme oylamasında ben de evet oyu vereceğim.');
    vote(pollOf(t11), { evet: [...A, ...B, 'irem', 'ozan'], cekimser: ['kerem'] });
    vote(delB.poll_id, { evet: [...A, ...B, 'irem', 'ozan'] });
    at(NOW - 15 * DAY + 4 * HOUR);
    polls.tick();

    // ------------------------------------------------------------ düzenleme teklifi (kabul)
    at(NOW - 14 * DAY);
    const p1 = svc.createProposal(u.ayse, t1, {
      new_title: 'Kampüs içi bisiklet yolu ağı kurulsun',
      new_description: 'Ana kapıdan fakültelere, kütüphaneye ve yurtlara uzanan, araç trafiğinden fiziksel olarak ayrılmış 6 km uzunluğunda bir bisiklet yolu ağı kurulmasını öneriyorum. Yol boyunca LED aydınlatma yapılacak, yaya geçitleriyle kesişen noktalarda hız kesici ve uyarı levhaları bulunacaktır. Proje kampüs içi araç trafiğini azaltacak, ulaşımı ucuzlatacak ve karbon salımını düşürecek.',
      reason: 'Tartışmada dile getirilen gece güvenliği ve yaya güvenliği kaygılarını metne yansıtmak için.',
    });
    vote(p1.poll_id, { evet: [...A, ...B], hayir: ['kerem'] });
    at(NOW - 13 * DAY + HOUR);
    polls.tick();

    at(NOW - 11 * DAY);
    msg(t1, 'deniz', 'Düzenleme kabul edildi; aydınlatma ve hız kesiciler artık önerinin parçası. Teşekkürler!');
    msg(t11, 'ozan', 'Park alanlarının yanına küçük bir tamir istasyonu da eklenebilir.', null, 3 * HOUR);
    at(NOW - 6 * DAY);
    msg(t6, 'can', 'İlk veri seti taslağını hazırladık; ders kodu, kontenjan, doluluk ve bekleme listesi sütunları var.');
    msg(t6, 'zeynep', 'Taslağı inceledim; 5 kişiden küçük gruplar için ek önlem gerekiyor.');

    // ------------------------------------------------------------ güncel konular (açık oylamalar)
    at(NOW - 30 * HOUR);
    const t3 = topic('ayse', {
      title: 'Kütüphane sınav dönemlerinde 7/24 açık olsun',
      description: 'Vize ve final haftalarında merkez kütüphanenin en az bir katı 7 gün 24 saat açık kalsın; gece güvenliği ve temizlik için ek personel planlansın.',
      domain: 'egitim',
    }).id;
    step(6 * MINUTE);
    const t2 = topic('elif', {
      title: 'Yemekhanede her gün vegan menü seçeneği',
      description: 'Yemekhanede her öğünde en az bir tam vegan ana yemek seçeneği sunulsun; menüler diyetisyen onayıyla hazırlansın ve besin değerleri yayımlansın.',
      domain: 'saglik',
    }).id;
    msg(t2, 'elif', 'Vegan ve laktoz intoleransı olan arkadaşlarımız şu an yalnızca salata yiyebiliyor. Bu bir eşitlik meselesi.', null, 3 * MINUTE);
    msg(t2, 'ayse', 'Destekliyorum; yeterli protein için diyetisyen onayı şartı çok yerinde.', null, 3 * MINUTE);
    msg(t2, 'kerem', 'Mutfak kapasitesi sınırlı. Her öğün ayrı vegan yemek çıkarmak ana menünün kalitesini düşürür ve maliyet öğrenciye yansır.', null, 3 * MINUTE);
    const nilMsg = msg(t2, 'nil', 'Ben de karşıyım: haftanın üç günü vegan seçenek daha gerçekçi. Her gün zorunlu tutmak yemekhane çalışanlarına ağır yük getirir.', null, 3 * MINUTE);
    step(5 * MINUTE);
    const delC = svc.requestDeletion(u.can, nilMsg.id, {
      category: 'spam',
      explanation: 'Aynı itirazı tekrar tekrar yazıyor, tartışmayı sabote ediyor.',
      _seed: true,
    });
    vote(pollOf(t3), { evet: ['ayse', 'selin', 'mehmet', 'can', 'elif'], hayir: ['kerem'] });
    vote(pollOf(t2), { evet: [...A, 'burak', 'deniz', 'selin', 'ece'], hayir: C });
    vote(delC.poll_id, { hayir: [...C, 'emre', 'ayse', 'zeynep', 'mehmet'], evet: ['can', 'burak'] });
    msg(t2, 'burak', 'Üç gün bir başlangıç olabilir ama ihtiyaç her gün var.', nilMsg.id, 40 * MINUTE);
    msg(t2, 'ozan', 'Maliyet tablosu paylaşılmadan oylama yapılması doğru değil?');
    msg(t3, 'ayse', 'Yurtlarda sessiz çalışma alanı yok; sınav haftalarında kütüphane gece yarısı kapanınca öğrenciler kafelere dağılıyor.');
    msg(t3, 'selin', 'Enerji tüketimi için yalnızca bir katın açık olması iyi bir uzlaşı.');
    msg(t3, 'deniz', 'Gece ulaşımı da planlanmalı; saat 02.00’den sonra servis yok.');

    at(NOW - 22 * HOUR);
    msg(t2, 'emre', 'Beslenme açısından iyi planlanmış vegan menü sağlıklıdır; B12 ve protein dengesine dikkat edilmeli.');
    at(NOW - 20 * HOUR);
    svc.addExpertOpinion(u.emre, t2, {
      stance: 'sartli',
      content: 'İyi planlanmış vegan menüler yetişkinler için beslenme açısından yeterlidir; ancak B12, demir ve protein dengesi diyetisyen tarafından haftalık olarak denetlenmelidir. Her gün seçenek sunulması sağlık açısından olumludur. Maliyet ve mutfak kapasitesi benim uzmanlık alanımın dışındadır; bu konuda ayrıca inceleme yapılması önerilir.',
    });
    step(10 * MINUTE);
    const t4 = topic('zeynep', {
      title: 'Madde 8 güncellemesi: gizleme oylamasında mesaj sahibine savunma hakkı',
      description: 'Yönetmelik Madde 8’e şu fıkra eklensin: Gizleme oylaması açılan mesajın sahibine, oylamanın ilk 24 saatinde oylama sayfasında yayımlanacak bir savunma metni yazma hakkı tanınır. Savunma metni de Madde 7 kapsamında silinemez.',
      domain: 'yonetisim',
      kind: 'yonetmelik',
    }).id;
    msg(t4, 'zeynep', 'Hukukun temel ilkesi: kimse dinlenmeden yargılanmamalı. Azınlık korumasını güçlendiren bir değişiklik.');
    msg(t4, 'mehmet', 'Yönetmelik değişikliği olduğu için 2/3 gerekiyor; geniş bir uzlaşı arıyoruz, lütfen görüşlerinizi yazın.');
    const q4 = msg(t4, 'irem', 'Savunma metni için bir karakter sınırı olacak mı? Bunu netleştirelim.');
    msg(t4, 'zeynep', 'İyi soru: 2000 karakter makul görünüyor, teklif metnine ekleyebiliriz.', q4.id);
    vote(pollOf(t4), { evet: ['zeynep', 'mehmet', 'ayse', 'can'] });

    at(NOW - 18 * HOUR);
    svc.addExpertOpinion(u.deniz, t1, {
      stance: 'destek',
      content: 'Avrupa’daki üniversite kampüslerinde ayrık bisiklet yolları kampüs içi araç trafiğini %20-30 oranında azaltmıştır. Kesişim noktalarında hız kesici ve görsel uyarı önerilir; mevcut düzenlenmiş metin bu öneriyi karşılıyor.',
    });

    at(NOW - 10 * HOUR);
    const t12 = topic('can', {
      parent_id: t1,
      title: 'Bisiklet yollarında elektrikli scooter kuralları',
      description: 'Bisiklet yollarında elektrikli scooterlar için 15 km/s hız sınırı ve kask zorunluluğu getirilsin; kurallara uymayanlar için uyarı sistemi kurulsun.',
      domain: 'ulasim',
    }).id;
    vote(pollOf(t12), { evet: ['can', 'deniz'] });
    msg(t12, 'deniz', 'Hız sınırı için yol üzerine radar tabelası yeterli olabilir.');

    at(NOW - 8 * HOUR);
    const ozanApp = svc.applyExpert(u.ozan, { domain: 'cevre', credentials: 'Orman mühendisiyim; kampüs ağaçlandırma ve atık yönetimi projelerinde 6 yıl görev aldım. Belgelerimi paylaşabilirim.' });
    vote(ozanApp.poll_id, { evet: ['ozan', 'kerem', 'selin'] });

    at(NOW - 7 * HOUR);
    const insult = msg(t3, 'ozan', 'Bu saçma öneriyi savunanlar aptal, gece kütüphanede kim çalışacak?');
    at(NOW - 6.5 * HOUR);
    const delA = svc.requestDeletion(u.burak, insult.id, {
      category: 'hakaret',
      explanation: 'Öneriyi destekleyenleri doğrudan aşağılayan bir ifade içeriyor.',
      _seed: true,
    });
    vote(delA.poll_id, { evet: ['burak', 'ayse', 'selin', 'ece'], hayir: ['ozan'] });
    msg(t3, 'kerem', 'Personelin gece çalışma koşulları ve ek ücreti netleşmeden destek vermem zor.');

    at(NOW - 5.8 * HOUR);
    polls.tick(); // vegan menü: kabul + azınlık uyarısı → itiraz süresi
    at(NOW - 5.4 * HOUR);
    polls.tick(); // "spam" gerekçeli gizleme girişimi reddedilir

    at(NOW - 5 * HOUR);
    const p6 = svc.createProposal(u.mehmet, t6, {
      new_title: 'Ders kayıt istatistikleri açık veri olarak yayımlansın',
      new_description: 'Derslerin kontenjan, doluluk ve bekleme listesi verileri anonim ve makinece okunabilir biçimde (CSV/JSON) her dönem iki kez (dönem başı ve kayıt haftası sonu) yayımlansın. Kimlik çıkarımını önlemek için 5 kişiden küçük gruplar birleştirilerek yayımlanır.',
      reason: 'Tartışmada dile getirilen küçük grup kimlik çıkarımı riskini gidermek ve yayım sıklığını netleştirmek için.',
    });
    vote(p6.poll_id, { evet: ['mehmet', 'zeynep', 'can'] });

    at(NOW - 4 * HOUR);
    polls.fileAppeal(pollOf(t2), u.kerem, 'Karar, bir topluluğun tamamının karşı olduğu ve maliyet verisi paylaşılmadan alındı. Mutfak kapasitesine dair bilirkişi incelemesi ve gerekirse 2/3 ile yeniden oylama talep ediyorum.');
    step(10 * MINUTE);
    polls.addMinorityReport(pollOf(t2), u.nil, 'Vegan seçeneğe karşı değiliz; her gün zorunluluğu mutfak kapasitesini aşıyor. Haftada üç günle başlanıp kapasite ölçülerek artırılmasını öneriyoruz. Bu şerhin uygulama planında dikkate alınmasını talep ediyoruz.');
    step(10 * MINUTE);
    polls.addMinorityReport(pollOf(t1), u.kerem, 'Bisiklet yolu fikrine karşı değilim; ancak maliyet analizi yapılmadan kabul edilmesi hatalıdır. Uygulama aşamasında bütçenin şeffaf biçimde paylaşılmasını talep ediyorum.');

    at(NOW - 3 * HOUR);
    const req3 = svc.createExpertRequest(u.kerem, t3, { question: 'Gece açık kalan kütüphanelerin öğrenci başarısına etkisi ve personel planlaması konusunda bilimsel bir değerlendirme rica ediyorum.' });
    at(NOW - 2 * HOUR);
    svc.addExpertOpinion(u.ayse, t3, {
      request_id: req3.id,
      stance: 'sartli',
      content: 'Sınav dönemlerinde uzatılmış çalışma saatleri öğrenci başarısıyla olumlu ilişkilidir; ancak gece personelinin gönüllülük ve ek ücret esasıyla çalışması, güvenlik planı ve gece ulaşımı şart koşulmalıdır. Öneri bu koşullarla desteklenebilir.',
    });
    step(15 * MINUTE);
    svc.addExpertOpinion(u.mehmet, t4, {
      stance: 'destek',
      content: 'Savunma hakkı, gizleme oylamalarında azınlık korumasını güçlendirir ve kararların meşruiyetini artırır. Savunma metninin Madde 7 kapsamında silinemez olması ve 2000 karakter sınırı uygun görünmektedir.',
    });
    at(NOW - 1 * HOUR);
    msg(t2, 'selin', 'İtiraz süreci işliyor; bilirkişi incelemesinin sonucunu bekleyelim. Maliyet tablosunu da talep ettim.');
    msg(t3, 'elif', 'Bilirkişi görüşündeki şartları öneriye eklemek için kabul sonrası bir düzenleme teklifi verebiliriz.');
  } finally {
    resetClock();
    Object.assign(config, saved);
  }
  db.run('DELETE FROM notifications');
  for (const n of Object.values(u)) {
    db.run('INSERT INTO notifications (user_id, text, link, created_at) VALUES (?,?,?,?)', n.id, 'Ortak Akıl’a hoş geldiniz! Açık oylamalara göz atın.', '#/oylamalar', Date.now());
  }
  return { users: Object.keys(u).length };
}

/** Tanık düğüm kopyalarını siler (yeni bir zincir başlarken eski kopyalar tahrifat sanılmasın). */
export function removeWitnessFiles(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) if (/^tanik-.*\.db(-wal|-shm)?$/.test(f)) fs.rmSync(path.join(dir, f), { force: true });
}

export function removeDataFiles(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
  removeWitnessFiles(path.dirname(dbPath));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  removeDataFiles(config.dbPath);
  initDb(config.dbPath);
  const r = seedDemo();
  const c = (sql) => db.get(sql).c;
  console.log(`Demo verisi yüklendi: ${r.users} üye, ${c('SELECT COUNT(*) AS c FROM topics')} konu, ${c('SELECT COUNT(*) AS c FROM polls')} oylama, ${c('SELECT COUNT(*) AS c FROM messages')} mesaj, ${c('SELECT COUNT(*) AS c FROM ledger')} defter bloğu.`);
  console.log(`Tüm demo hesaplarının parolası: ${DEMO_PASSWORD}`);
  closeDb();
}
