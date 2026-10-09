// Yönetmelik ontolojisi: platformdaki kavramlar (sınıflar), ilişkiler (özellikler), alan taksonomisi
// ve yönetmelik maddeleri. Her madde makinece denetlenebilir bir kurala (audit.js) bağlıdır.
// RDF/Turtle olarak dışa aktarılabilir (Protégé vb. araçlarla açılabilir).

export const NS = 'https://ortakakil.org/ontoloji#';

export const DOMAINS = [
  { id: 'egitim', label: 'Eğitim', keywords: ['eğitim', 'okul', 'ders', 'öğrenci', 'kütüphane', 'sınav', 'öğretmen', 'akademik', 'burs', 'müfredat', 'kayıt'] },
  { id: 'saglik', label: 'Sağlık', keywords: ['sağlık', 'hastane', 'beslenme', 'yemek', 'yemekhane', 'menü', 'vegan', 'spor', 'psikolojik', 'gıda', 'diyet'] },
  { id: 'ulasim', label: 'Ulaşım', keywords: ['ulaşım', 'bisiklet', 'otobüs', 'yol', 'trafik', 'servis', 'scooter', 'metro', 'otopark', 'park', 'yaya'] },
  { id: 'cevre', label: 'Çevre', keywords: ['çevre', 'dönüşüm', 'atık', 'ağaç', 'yeşil', 'enerji', 'iklim', 'karbon', 'güneş', 'plastik', 'kompost'] },
  { id: 'hukuk', label: 'Hukuk', keywords: ['hukuk', 'yasa', 'kanun', 'hak', 'dava', 'sözleşme', 'kvkk', 'mevzuat', 'adalet', 'kişisel'] },
  { id: 'ekonomi', label: 'Ekonomi', keywords: ['ekonomi', 'ücret', 'bütçe', 'fiyat', 'maliyet', 'vergi', 'harç', 'para', 'gelir', 'finans', 'ücretlendirme'] },
  { id: 'teknoloji', label: 'Teknoloji', keywords: ['teknoloji', 'yazılım', 'internet', 'wifi', 'veri', 'dijital', 'uygulama', 'yapay', 'açık', 'sistem', 'platform'] },
  { id: 'kultur', label: 'Kültür ve Sanat', keywords: ['kültür', 'sanat', 'festival', 'konser', 'tiyatro', 'etkinlik', 'kulüp', 'müzik', 'sinema', 'sergi'] },
  { id: 'yonetisim', label: 'Yönetişim', keywords: ['yönetmelik', 'yönetim', 'oylama', 'kural', 'şeffaflık', 'katılım', 'karar', 'denetim', 'madde', 'tüzük', 'azınlık'] },
  { id: 'guvenlik', label: 'Güvenlik', keywords: ['güvenlik', 'kamera', 'aydınlatma', 'acil', 'yangın', 'deprem', 'koruma', 'tahliye'] },
  { id: 'sosyal', label: 'Sosyal Politika', keywords: ['sosyal', 'engelli', 'erişilebilirlik', 'eşitlik', 'barınma', 'yurt', 'destek', 'gönüllü', 'kreş'] },
];
export const DOMAIN_IDS = DOMAINS.map((d) => d.id);
export const domainLabel = (id) => DOMAINS.find((d) => d.id === id)?.label ?? id;

export const TOPIC_KINDS = {
  genel: { label: 'Genel konu', threshold: 0.5, strict: true },
  yonetmelik: { label: 'Yönetmelik konusu', threshold: 2 / 3, strict: false },
};

// Silme (gizleme) talebi için geçerli gerekçeler. "Görüş ayrılığı" bilinçli olarak YOKTUR:
// çoğunluk, azınlığın görüşünü sırf katılmadığı için sildiremez (Madde 8).
export const DELETION_CATEGORIES = {
  hakaret: 'Hakaret / nefret söylemi',
  kisisel_veri: 'Kişisel veri ifşası',
  spam: 'Spam / reklam / konu dışı tekrar',
  hukuka_aykiri: 'Hukuka aykırı içerik',
};

export const POLL_KINDS = {
  konu: 'Konu kabulü',
  altkonu: 'Alt konu kabulü',
  duzenleme: 'Düzenleme teklifi',
  silme: 'Mesaj gizleme',
  bilirkisi: 'Bilirkişilik başvurusu',
  itiraz: 'İtiraz üzerine yeniden oylama',
};

export const CLASSES = [
  { id: 'Kisi', label: 'Kişi', parent: null, desc: 'Platformda yer alan gerçek kişi.' },
  { id: 'Uye', label: 'Üye', parent: 'Kisi', desc: 'Kimlik ve adres bilgileri kayıtlı, kamuya takma adla görünen katılımcı.' },
  { id: 'Bilirkisi', label: 'Bilirkişi', parent: 'Uye', desc: 'Bir alanda uzmanlığı topluluk oylamasıyla onaylanmış üye.' },
  { id: 'Oneri', label: 'Öneri', parent: null, desc: 'Oylamaya sunulan her türlü teklif.' },
  { id: 'Konu', label: 'Konu', parent: 'Oneri', desc: 'Kabul edilirse tartışma alanı açılan gündem maddesi.' },
  { id: 'AltKonu', label: 'Alt Konu', parent: 'Konu', desc: 'Kabul edilmiş bir konunun altında açılan konu.' },
  { id: 'YonetmelikKonusu', label: 'Yönetmelik Konusu', parent: 'Konu', desc: 'Yönetmeliği değiştiren, nitelikli çoğunluk gerektiren konu.' },
  { id: 'DuzenlemeTeklifi', label: 'Düzenleme Teklifi', parent: 'Oneri', desc: 'Kabul edilmiş bir konunun metnini değiştirme teklifi.' },
  { id: 'SilmeTalebi', label: 'Gizleme Talebi', parent: 'Oneri', desc: 'Bir tartışma mesajının gizlenmesi teklifi.' },
  { id: 'BilirkisilikBasvurusu', label: 'Bilirkişilik Başvurusu', parent: 'Oneri', desc: 'Bir alanda bilirkişi olarak tanınma başvurusu.' },
  { id: 'Oylama', label: 'Oylama', parent: null, desc: 'Bir önerinin kabulü için yürütülen karar süreci.' },
  { id: 'Oy', label: 'Oy', parent: null, desc: 'Bir üyenin bir oylamadaki tercihi (evet / hayır / çekimser).' },
  { id: 'TartismaMesaji', label: 'Tartışma Mesajı', parent: null, desc: 'Konu altındaki silinemez tartışma kaydı.' },
  { id: 'BilirkisiGorusu', label: 'Bilirkişi Görüşü', parent: null, desc: 'Tavsiye niteliğinde uzman değerlendirmesi.' },
  { id: 'AzinlikSerhi', label: 'Azınlık Şerhi', parent: null, desc: 'Kaybeden tarafın karara düştüğü kalıcı not.' },
  { id: 'Itiraz', label: 'İtiraz', parent: null, desc: 'Azınlığın karara karşı bilirkişi incelemesi talebi.' },
  { id: 'YonetmelikMaddesi', label: 'Yönetmelik Maddesi', parent: null, desc: 'Denetlenebilir kural.' },
  { id: 'Alan', label: 'Alan', parent: null, desc: 'Konuların sınıflandırıldığı ontolojik alan.' },
  { id: 'DefterBlogu', label: 'Defter Bloğu', parent: null, desc: 'Zincirleme özetli değiştirilemez kayıt.' },
];

export const PROPERTIES = [
  { id: 'onerenKisi', label: 'öneren kişi', domain: 'Oneri', range: 'Uye' },
  { id: 'ustKonu', label: 'üst konu', domain: 'AltKonu', range: 'Konu' },
  { id: 'alani', label: 'alanı', domain: 'Konu', range: 'Alan' },
  { id: 'ilgiliMadde', label: 'ilgili madde', domain: 'Konu', range: 'YonetmelikMaddesi' },
  { id: 'oylamasi', label: 'oylaması', domain: 'Oneri', range: 'Oylama' },
  { id: 'oyVeren', label: 'oy veren', domain: 'Oy', range: 'Uye' },
  { id: 'aitOlduguOylama', label: 'ait olduğu oylama', domain: 'Oy', range: 'Oylama' },
  { id: 'yazar', label: 'yazar', domain: 'TartismaMesaji', range: 'Uye' },
  { id: 'tartismasi', label: 'tartışması', domain: 'Konu', range: 'TartismaMesaji' },
  { id: 'hedefMesaj', label: 'hedef mesaj', domain: 'SilmeTalebi', range: 'TartismaMesaji' },
  { id: 'uzmanlikAlani', label: 'uzmanlık alanı', domain: 'Bilirkisi', range: 'Alan' },
  { id: 'gorusVerir', label: 'görüş verir', domain: 'Bilirkisi', range: 'BilirkisiGorusu' },
  { id: 'itirazEdilenOylama', label: 'itiraz edilen oylama', domain: 'Itiraz', range: 'Oylama' },
  { id: 'takipEder', label: 'takip eder', domain: 'Uye', range: 'Uye' },
  { id: 'guvenir', label: 'güvenir', domain: 'Uye', range: 'Uye' },
  { id: 'denetler', label: 'denetler', domain: 'YonetmelikMaddesi', range: 'Oneri' },
  { id: 'defterKaydi', label: 'defter kaydı', domain: 'Oneri', range: 'DefterBlogu' },
];

// Yönetmelik maddeleri — "rule" alanı audit.js içindeki denetim fonksiyonunu adlandırır.
export const ARTICLES = [
  { no: 1, title: 'Katılım hakkı', rule: 'R1', appliesTo: ['Konu', 'DuzenlemeTeklifi'],
    text: 'Kayıtlı her üye konu açabilir ve kabul edilmiş konulara düzenleme teklifi verebilir.' },
  { no: 2, title: 'Kimlik zorunluluğu ve gizlilik', rule: 'R2', appliesTo: ['Uye'],
    text: 'Her üye ad, soyad, doğum tarihi, adres, e-posta, telefon ve takma ad bilgilerini eksiksiz girer. Kamuya yalnızca takma ad gösterilir; kişisel veriler deftere yazılmaz.' },
  { no: 3, title: 'Çoğunluk kabulü', rule: 'R3', appliesTo: ['Konu', 'AltKonu', 'DuzenlemeTeklifi'],
    text: 'Bir öneri, oy kullananların salt çoğunluğunun (yarıdan fazlasının) kabulü ve seçmen kütüğünün en az %30’unun katılımıyla kabul edilir.' },
  { no: 4, title: 'Oylamasız kabul yasağı', rule: 'R4', appliesTo: ['Konu', 'AltKonu'],
    text: 'Hiçbir konu veya alt konu, sonuçlanmış bir oylama olmadan kabul edilmiş sayılamaz.' },
  { no: 5, title: 'Alt konular', rule: 'R5', appliesTo: ['AltKonu'],
    text: 'Alt konu yalnızca kabul edilmiş bir konunun altında önerilebilir ve ayrıca oylanır.' },
  { no: 6, title: 'Ontolojik sınıflandırma', rule: 'R6', appliesTo: ['Konu'],
    text: 'Her konu ontolojideki bir alana bağlanır ve ilgili yönetmelik maddeleriyle etiketlenir; denetim bu bağlar üzerinden yapılır.' },
  { no: 7, title: 'Tartışmaların korunması', rule: 'R7', appliesTo: ['TartismaMesaji'],
    text: 'Tartışma mesajları silinemez ve değiştirilemez; her mesajın özeti deftere işlenir.' },
  { no: 8, title: 'Gizleme oylaması', rule: 'R8', appliesTo: ['SilmeTalebi'],
    text: 'Bir mesaj yalnızca hakaret, kişisel veri, spam veya hukuka aykırılık gerekçesiyle ve 2/3 nitelikli çoğunlukla gizlenebilir. Görüş ayrılığı gizleme gerekçesi olamaz. Gizlenen mesajın kaydı ve özeti korunur.' },
  { no: 9, title: 'Azınlık koruması ve itiraz', rule: 'R9', appliesTo: ['Oylama', 'Itiraz'],
    text: 'Oyların en az 1/3’ü karşı olan ya da topluluk analizinde bir topluluğun belirgin biçimde dışlandığı kararlar itiraz süresine tabidir. İtiraz bilirkişi tarafından incelenir; gerekirse 2/3 nitelikli çoğunlukla yeniden oylanır.' },
  { no: 10, title: 'Seçmen kütüğü', rule: 'R10', appliesTo: ['Oy'],
    text: 'Bir oylamaya yalnızca oylama açıldığı anda kayıtlı olan üyeler katılabilir (sonradan açılan hesaplarla sonuç değiştirilemez).' },
  { no: 11, title: 'Yönetmelik değişikliği', rule: 'R11', appliesTo: ['YonetmelikKonusu'],
    text: 'Yönetmelik türündeki konular 2/3 nitelikli çoğunluk gerektirir.' },
  { no: 12, title: 'Bilirkişilik', rule: 'R12', appliesTo: ['Bilirkisi', 'BilirkisiGorusu'],
    text: 'Bilirkişilik, alanında topluluk oylamasıyla onaylanır. Bilirkişi görüşü yalnızca uzmanlık alanındaki konulara verilir ve tavsiye niteliğindedir.' },
  { no: 13, title: 'Defter bütünlüğü', rule: 'R13', appliesTo: ['DefterBlogu'],
    text: 'Tüm işlemler zincirleme özetli, imzalı deftere işlenir ve bağımsız tanık düğümlerce doğrulanır.' },
  { no: 14, title: 'Azınlık şerhi', rule: 'R14', appliesTo: ['AzinlikSerhi'],
    text: 'Sonuçlanan bir oylamada kaybeden tarafta oy kullanan üye, karara kalıcı bir şerh düşebilir.' },
  { no: 15, title: 'Asgari müzakere süresi', rule: 'R15', appliesTo: ['Oylama'],
    text: 'Tüm seçmenler oy kullanmadıkça hiçbir oylama asgari müzakere süresi dolmadan sonuçlandırılamaz; çoğunluk kararı aceleye getiremez.' },
  { no: 16, title: 'Yaş sınırı', rule: 'R16', appliesTo: ['Uye'],
    text: '18 yaşını doldurmamış kişiler üye olamaz.' },
];

export const ARTICLE_KEYWORDS = {
  1: ['katılım', 'teklif', 'öneri'],
  2: ['kimlik', 'kişisel', 'gizlilik', 'kvkk', 'adres'],
  3: ['çoğunluk', 'kabul', 'oylama', 'oy'],
  5: ['alt konu', 'alt başlık'],
  7: ['tartışma', 'mesaj', 'yorum', 'silme'],
  8: ['silme', 'gizleme', 'hakaret', 'spam', 'moderasyon'],
  9: ['azınlık', 'itiraz', 'hak'],
  11: ['yönetmelik', 'madde', 'tüzük', 'kural'],
  12: ['bilirkişi', 'uzman'],
  13: ['defter', 'blokzincir', 'şeffaflık', 'denetim'],
};

export function ontologyJSON() {
  return {
    namespace: NS,
    siniflar: CLASSES,
    ozellikler: PROPERTIES,
    alanlar: DOMAINS.map(({ id, label }) => ({ id, label })),
    maddeler: ARTICLES,
    silmeGerekceleri: DELETION_CATEGORIES,
    oylamaTurleri: POLL_KINDS,
    konuTurleri: TOPIC_KINDS,
  };
}

const lit = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;
const safeName = (s) => String(s).replace(/[^A-Za-z0-9_]/g, '_');

/** Ontolojiyi ve (isteğe bağlı) örnek verileri Turtle formatında üretir. */
export function toTurtle({ topics = [], experts = [] } = {}) {
  const out = [];
  out.push(`@prefix oa: <${NS}> .`);
  out.push('@prefix owl: <http://www.w3.org/2002/07/owl#> .');
  out.push('@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .');
  out.push('@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .');
  out.push('@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .');
  out.push('');
  out.push(`<${NS.slice(0, -1)}> a owl:Ontology ; rdfs:label ${lit('Ortak Akıl Yönetmelik Ontolojisi')}@tr .`);
  out.push('');
  out.push('# --- Sınıflar ---');
  for (const c of CLASSES) {
    out.push(`oa:${c.id} a owl:Class ; rdfs:label ${lit(c.label)}@tr${c.parent ? ` ; rdfs:subClassOf oa:${c.parent}` : ''} ; rdfs:comment ${lit(c.desc)}@tr .`);
  }
  out.push('');
  out.push('# --- Özellikler ---');
  for (const p of PROPERTIES) {
    out.push(`oa:${p.id} a owl:ObjectProperty ; rdfs:label ${lit(p.label)}@tr ; rdfs:domain oa:${p.domain} ; rdfs:range oa:${p.range} .`);
  }
  out.push('oa:metin a owl:DatatypeProperty ; rdfs:range xsd:string .');
  out.push('oa:denetimKurali a owl:DatatypeProperty ; rdfs:range xsd:string .');
  out.push('oa:durum a owl:DatatypeProperty ; rdfs:range xsd:string .');
  out.push('');
  out.push('# --- Alanlar ---');
  for (const d of DOMAINS) out.push(`oa:alan_${d.id} a oa:Alan ; rdfs:label ${lit(d.label)}@tr .`);
  out.push('');
  out.push('# --- Yönetmelik maddeleri ---');
  for (const a of ARTICLES) {
    const targets = a.appliesTo.map((c) => `oa:${c}`).join(', ');
    out.push(`oa:madde_${a.no} a oa:YonetmelikMaddesi ; rdfs:label ${lit(`Madde ${a.no} — ${a.title}`)}@tr ; oa:metin ${lit(a.text)}@tr ; oa:denetimKurali ${lit(a.rule)} ; oa:denetler ${targets} .`);
  }
  if (topics.length) {
    out.push('');
    out.push('# --- Örnekler: konular ---');
    for (const t of topics) {
      const cls = t.kind === 'yonetmelik' ? 'YonetmelikKonusu' : t.parent_id ? 'AltKonu' : 'Konu';
      const parts = [`oa:konu_${t.id} a oa:${cls}`, `rdfs:label ${lit(t.title)}@tr`, `oa:alani oa:alan_${safeName(t.domain)}`, `oa:durum ${lit(t.status)}`];
      if (t.parent_id) parts.push(`oa:ustKonu oa:konu_${t.parent_id}`);
      for (const no of t.articles || []) parts.push(`oa:ilgiliMadde oa:madde_${Number(no)}`);
      if (t.nickname) parts.push(`oa:onerenKisi oa:uye_${safeName(t.nickname)}`);
      out.push(`${parts.join(' ;\n    ')} .`);
    }
  }
  if (experts.length) {
    out.push('');
    out.push('# --- Örnekler: bilirkişiler (yalnızca takma ad) ---');
    for (const e of experts) out.push(`oa:uye_${safeName(e.nickname)} a oa:Bilirkisi ; rdfs:label ${lit(e.nickname)} ; oa:uzmanlikAlani oa:alan_${safeName(e.domain)} .`);
  }
  return `${out.join('\n')}\n`;
}
