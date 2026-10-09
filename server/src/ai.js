// Yapay zeka entegrasyonu. Kimlik bilgisi (ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN /
// ANTHROPIC_PROFILE) varsa Claude kullanılır; yoksa ya da çağrı başarısız olursa yerel, kural tabanlı
// çözümleyiciye düşülür. Yapay zeka yalnızca TAVSİYE verir: hiçbir şeyi silmez, oy kullanmaz.
import Anthropic from '@anthropic-ai/sdk';
import { db } from './db.js';
import { config } from './config.js';
import { sha256, tokenize, jaccard, canonicalJSON, now } from './util.js';
import { DOMAINS, DOMAIN_IDS, ARTICLES, ARTICLE_KEYWORDS, DELETION_CATEGORIES, domainLabel } from './ontology.js';

let client = null;
let lastError = null;

function claudeEnabled() {
  if (config.aiMode === 'yerel') return false;
  if (config.aiMode === 'claude') return true;
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
}

export function aiStatus() {
  const on = claudeEnabled();
  return {
    mod: on ? 'claude' : 'yerel',
    model: on ? config.aiModel : 'yerel kural tabanlı çözümleyici',
    sonHata: lastError,
    aciklama: on
      ? 'Özetleme, sınıflandırma ve moderasyon tavsiyeleri Claude ile üretilir.'
      : 'ANTHROPIC_API_KEY tanımlı değil; yerel kural tabanlı çözümleyici kullanılıyor.',
  };
}

function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'Kimlik doğrulama hatası (API anahtarını kontrol edin)';
  if (err instanceof Anthropic.PermissionDeniedError) return 'Bu model için yetki yok';
  if (err instanceof Anthropic.RateLimitError) return 'Hız sınırı aşıldı, daha sonra tekrar deneyin';
  if (err instanceof Anthropic.BadRequestError) return `Geçersiz istek: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return 'Claude API’ye bağlanılamadı';
  if (err instanceof Anthropic.APIError) return `API hatası ${err.status ?? ''}: ${err.message}`;
  return err?.message || String(err);
}

async function askClaude({ system, prompt, schema, effort = 'low', maxTokens = 8000 }) {
  client ??= new Anthropic();
  // Sunucu tarafı yedekleme (fallbacks: "default"): güvenlik sınıflandırıcısı reddederse istek
  // Anthropic'in önerdiği modelde otomatik yeniden çalışır.
  const response = await client.beta.messages.create({
    model: config.aiModel,
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    output_config: { effort, format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: prompt }],
  });
  if (response.stop_reason === 'refusal') throw new Error('Model isteği yanıtlamayı reddetti');
  if (response.stop_reason === 'max_tokens') throw new Error('Model yanıtı yarıda kesildi');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}

async function run(kind, input, claudeFn, localFn) {
  const key = sha256(`${kind}|${claudeEnabled() ? config.aiModel : 'yerel'}|${canonicalJSON(input)}`);
  const cached = db.get('SELECT value FROM ai_cache WHERE key = ?', key);
  if (cached) return { ...JSON.parse(cached.value), _onbellek: true };
  let result;
  if (claudeEnabled()) {
    try {
      result = { ...(await claudeFn()), _kaynak: `Claude (${config.aiModel})` };
      lastError = null;
    } catch (err) {
      lastError = describeError(err);
      return { ...localFn(), _kaynak: 'yerel (Claude’a ulaşılamadı)', _uyari: lastError };
    }
  } else {
    result = { ...localFn(), _kaynak: 'yerel' };
  }
  db.run('INSERT OR REPLACE INTO ai_cache (key, value, created_at) VALUES (?,?,?)', key, JSON.stringify(result), now());
  return result;
}

const lower = (s) => String(s || '').toLocaleLowerCase('tr-TR');
const clip = (s, n = 180) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ======================================================================= moderasyon
const INSULTS = ['aptal', 'salak', 'gerizekalı', 'geri zekalı', 'ahmak', 'şerefsiz', 'haysiyetsiz', 'dangalak', 'beyinsiz', 'kafasız', 'hödük', 'cahil herif', 'densiz'];
const PII_PATTERNS = [
  { re: /\b[1-9]\d{10}\b/, what: 'TC kimlik numarasına benzeyen 11 haneli sayı' },
  { re: /(\+90|0)?\s?5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/, what: 'cep telefonu numarası' },
  { re: /[\w.+-]+@[\w-]+\.[\w.]+/, what: 'e-posta adresi' },
  { re: /\bTR\s?\d{2}(\s?\d{4}){5}\s?\d{2}\b/i, what: 'IBAN' },
  { re: /(mahallesi|mah\.|sokak|sk\.|caddesi|cad\.)\s*[^,]{0,40}(no|numara)\s*[:.]?\s*\d+/i, what: 'açık adres' },
];
const OPINION_MARKERS = ['bence', 'katılmıyorum', 'katılıyorum', 'karşıyım', 'destekliyorum', 'düşünüyorum', 'olmamalı', 'olmalı', 'yanlış', 'doğru', 'sakıncalı', 'gereksiz'];

export function moderateLocal(content) {
  const text = lower(content);
  const riskler = [];
  const insult = INSULTS.find((w) => text.includes(w));
  if (insult) riskler.push({ kategori: 'hakaret', aciklama: `Hakaret içerebilecek ifade: “${insult}”` });
  for (const p of PII_PATTERNS) if (p.re.test(content)) riskler.push({ kategori: 'kisisel_veri', aciklama: `Olası kişisel veri: ${p.what}` });
  const urls = (content.match(/https?:\/\/\S+/g) || []).length;
  if (urls >= 2 || /(indirim|kampanya|hemen tıkla|kazanmak için|bedava)/i.test(content) || /(.)\1{9,}/.test(content)) {
    riskler.push({ kategori: 'spam', aciklama: 'Reklam/spam örüntüsü' });
  }
  return {
    uygun: riskler.length === 0,
    riskler,
    oneri: riskler.length
      ? 'Mesajınız topluluk tarafından gizleme oylamasına götürülebilir. Gerekirse ifadeyi düzenleyip öyle gönderin (gönderilen mesaj sonradan değiştirilemez).'
      : 'Belirgin bir sorun görünmüyor.',
  };
}

const MODERATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['uygun', 'riskler', 'oneri'],
  properties: {
    uygun: { type: 'boolean' },
    riskler: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kategori', 'aciklama'],
        properties: { kategori: { type: 'string', enum: Object.keys(DELETION_CATEGORIES) }, aciklama: { type: 'string' } },
      },
    },
    oneri: { type: 'string' },
  },
};

export function moderate(content) {
  return run(
    'moderate',
    { content },
    () => askClaude({
      system: 'Bir katılımcı demokrasi platformunun moderasyon danışmanısın. Yalnızca şu kategorilerde risk işaretle: hakaret, kisisel_veri, spam, hukuka_aykiri. Sert eleştiri, muhalif görüş ve azınlık görüşü RİSK DEĞİLDİR; bunları asla işaretleme. Türkçe yanıt ver.',
      prompt: `Gönderilmek üzere olan tartışma mesajını değerlendir:\n<mesaj>\n${content}\n</mesaj>`,
      schema: MODERATION_SCHEMA,
    }),
    () => moderateLocal(content)
  );
}

// ======================================================================= gizleme talebi değerlendirme
const DELETION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['uygun', 'gorusAyriligiRiski', 'aciklama'],
  properties: { uygun: { type: 'boolean' }, gorusAyriligiRiski: { type: 'boolean' }, aciklama: { type: 'string' } },
};

export function assessDeletionLocal(content, category) {
  const m = moderateLocal(content);
  const match = m.riskler.find((r) => r.kategori === category);
  const text = lower(content);
  const opinion = OPINION_MARKERS.some((w) => text.includes(w));
  if (match) return { uygun: true, gorusAyriligiRiski: false, aciklama: `Talep gerekçesiyle uyumlu belirti bulundu: ${match.aciklama}.` };
  return {
    uygun: false,
    gorusAyriligiRiski: opinion,
    aciklama: opinion
      ? 'Mesajda talep edilen gerekçeye dair belirti bulunamadı; mesaj bir görüş ayrılığı ifade ediyor olabilir. Madde 8 uyarınca görüş ayrılığı gizleme gerekçesi değildir.'
      : 'Mesajda talep edilen gerekçeye dair belirgin bir işaret bulunamadı. Oy verirken mesajı kendiniz değerlendirin.',
  };
}

export function assessDeletion(content, category, explanation) {
  return run(
    'deletion',
    { content, category, explanation },
    () => askClaude({
      system: 'Bir katılımcı demokrasi platformunda gizleme taleplerini değerlendiren tarafsız bir danışmansın. Yönetmelik Madde 8: bir mesaj yalnızca hakaret, kişisel veri ifşası, spam veya hukuka aykırılık nedeniyle gizlenebilir; görüş ayrılığı gerekçe olamaz. Çoğunluğun azınlık görüşünü susturma girişimlerine karşı özellikle dikkatli ol. Türkçe yanıt ver.',
      prompt: `Talep gerekçesi: ${category} (${DELETION_CATEGORIES[category]})\nTalep edenin açıklaması: ${explanation}\n<mesaj>\n${content}\n</mesaj>\nBu talep Madde 8'e uygun mu? Mesaj aslında yalnızca bir görüş ayrılığı mı ifade ediyor?`,
      schema: DELETION_SCHEMA,
    }),
    () => assessDeletionLocal(content, category)
  );
}

// ======================================================================= sınıflandırma
const CLASSIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['domain', 'articles', 'tags', 'kind', 'gerekce'],
  properties: {
    domain: { type: 'string', enum: DOMAIN_IDS },
    articles: { type: 'array', items: { type: 'integer' } },
    tags: { type: 'array', items: { type: 'string' } },
    kind: { type: 'string', enum: ['genel', 'yonetmelik'] },
    gerekce: { type: 'string' },
  },
};

// Tek sözcüklü anahtarlar sözcük başına göre, çok sözcüklüler tümcecik olarak aranır
// ("alt" anahtarı "azaltmak" içinde eşleşmesin diye).
function hasKeyword(text, words, k) {
  return k.includes(' ') ? text.includes(k) : words.some((w) => w.startsWith(k));
}

export function classifyLocal(title, description) {
  const t = lower(title);
  const text = `${t} ${lower(description)}`;
  const words = text.split(/[^a-zçğıöşü0-9]+/).filter(Boolean);
  const titleWords = t.split(/[^a-zçğıöşü0-9]+/).filter(Boolean);
  const scored = DOMAINS.map((d) => {
    const hits = d.keywords.filter((k) => hasKeyword(text, words, k));
    return { d, hits, score: hits.reduce((a, k) => a + (hasKeyword(t, titleWords, k) ? 2 : 1), 0) };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0].score > 0 ? scored[0] : { d: DOMAINS.find((d) => d.id === 'yonetisim'), hits: [] };
  const articles = new Set([3, 4, 6]);
  for (const [no, kws] of Object.entries(ARTICLE_KEYWORDS)) if (kws.some((k) => hasKeyword(text, words, k))) articles.add(Number(no));
  const kind = /yönetmelik|madde\s*\d+|tüzük/.test(text) ? 'yonetmelik' : 'genel';
  if (kind === 'yonetmelik') articles.add(11);
  const freq = new Map();
  for (const w of tokenize(`${title} ${title} ${description}`)) freq.set(w, (freq.get(w) || 0) + 1);
  const tags = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w);
  return {
    domain: best.d.id,
    articles: [...articles].sort((a, b) => a - b),
    tags,
    kind,
    gerekce: best.hits.length
      ? `“${best.hits.slice(0, 3).join('”, “')}” ${best.hits.length > 1 ? 'ifadeleri' : 'ifadesi'} ${best.d.label} alanını işaret ediyor.`
      : 'Belirgin bir alan sözcüğü bulunamadı; genel yönetişim alanı önerildi.',
  };
}

export async function classifyTopic(title, description) {
  const articleList = ARTICLES.map((a) => `Madde ${a.no} (${a.title}): ${a.text}`).join('\n');
  const domainList = DOMAINS.map((d) => `${d.id} = ${d.label}`).join(', ');
  const result = await run(
    'classify',
    { title, description },
    () => askClaude({
      system: 'Bir katılımcı karar platformunda yeni konu önerilerini yönetmelik ontolojisine göre sınıflandırıyorsun. Türkçe yanıt ver.',
      prompt: `Alanlar: ${domainList}\n\nYönetmelik maddeleri:\n${articleList}\n\nKonu başlığı: ${title}\nAçıklama: ${description}\n\nEn uygun alanı, konunun denetiminde ilgili olan madde numaralarını, 3-5 kısa etiketi ve konunun yönetmeliğin kendisini değiştirip değiştirmediğini (kind: yonetmelik) belirle.`,
      schema: CLASSIFY_SCHEMA,
    }),
    () => classifyLocal(title, description)
  );
  const validArticles = new Set(ARTICLES.map((a) => a.no));
  return {
    ...result,
    domain: DOMAIN_IDS.includes(result.domain) ? result.domain : 'yonetisim',
    articles: (result.articles || []).filter((n) => validArticles.has(n)),
    domainLabel: domainLabel(result.domain),
    benzerKonular: similarTopics(`${title} ${description}`),
  };
}

export function similarTopics(text, excludeId = null, limit = 3) {
  const q = tokenize(text);
  return db
    .all("SELECT id, title, description, status FROM topics WHERE status != 'red'")
    .filter((t) => t.id !== excludeId)
    .map((t) => ({ id: t.id, title: t.title, status: t.status, benzerlik: Math.round(jaccard(q, tokenize(`${t.title} ${t.description}`)) * 100) / 100 }))
    .filter((t) => t.benzerlik >= 0.12)
    .sort((a, b) => b.benzerlik - a.benzerlik)
    .slice(0, limit);
}

// ======================================================================= tartışma özeti
const SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ozet', 'lehte', 'aleyhte', 'uzlasi', 'acikSorular', 'azinlikGorusleri', 'ton'],
  properties: {
    ozet: { type: 'string' },
    lehte: { type: 'array', items: { type: 'string' } },
    aleyhte: { type: 'array', items: { type: 'string' } },
    uzlasi: { type: 'array', items: { type: 'string' } },
    acikSorular: { type: 'array', items: { type: 'string' } },
    azinlikGorusleri: { type: 'array', items: { type: 'string' } },
    ton: { type: 'string', enum: ['yapıcı', 'karışık', 'gergin'] },
  },
};

const PRO = /(katılıyorum|destekliyorum|faydalı|yararlı|iyi olur|olmalı|harika|gerekli|evet)/i;
const CON = /(katılmıyorum|karşıyım|olmamalı|sakıncalı|zararlı|gereksiz|endişe|maliyet|risk|ama |ancak|fakat)/i;

export function summarizeLocal(topic, messages) {
  const visible = messages.filter((m) => !m.hidden);
  const people = new Set(visible.map((m) => m.nickname));
  const freq = new Map();
  for (const m of visible) for (const w of new Set(tokenize(m.content))) freq.set(w, (freq.get(w) || 0) + 1);
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w);
  const pro = visible.filter((m) => PRO.test(m.content) && !/katılmıyorum/i.test(m.content));
  const con = visible.filter((m) => CON.test(m.content));
  const proWords = new Set(pro.flatMap((m) => tokenize(m.content)));
  const shared = top.filter((w) => proWords.has(w) && con.some((m) => tokenize(m.content).includes(w)));
  const questions = visible.flatMap((m) => (m.content.match(/[^.!?\n]*\?/g) || []).map((q) => `${m.nickname}: ${q.trim()}`)).slice(0, 4);
  const insults = visible.filter((m) => !moderateLocal(m.content).uygun).length;
  const minorityVoices = con.length && con.length < pro.length ? con : pro.length && pro.length < con.length ? pro : [];
  return {
    ozet: visible.length
      ? `“${topic.title}” başlığında ${people.size} katılımcı ${visible.length} mesaj yazdı. Öne çıkan kavramlar: ${top.join(', ') || '—'}.`
      : 'Henüz tartışma yok.',
    lehte: pro.slice(0, 4).map((m) => `${m.nickname}: ${clip(m.content)}`),
    aleyhte: con.slice(0, 4).map((m) => `${m.nickname}: ${clip(m.content)}`),
    uzlasi: shared.length ? [`Her iki taraf da şu kavramlar üzerinde duruyor: ${shared.slice(0, 3).join(', ')}.`] : [],
    acikSorular: questions,
    azinlikGorusleri: minorityVoices.slice(0, 3).map((m) => `${m.nickname}: ${clip(m.content)}`),
    ton: insults > 1 ? 'gergin' : con.length && pro.length ? 'karışık' : 'yapıcı',
  };
}

export function summarizeDiscussion(topic, messages) {
  const visible = messages.filter((m) => !m.hidden);
  const transcript = visible.map((m) => `[#${m.id}] ${m.nickname}${m.reply_to ? ` (yanıt #${m.reply_to})` : ''}: ${m.content}`).join('\n');
  return run(
    'summary',
    { topic: topic.id, version: topic.version, ids: visible.map((m) => m.id) },
    () => askClaude({
      system: 'Tarafsız bir müzakere kolaylaştırıcısısın. Tartışmaları özetlerken azınlıkta kalan görüşleri de mutlaka ve hakkaniyetle temsil et; sayıca az olmaları önemlerini azaltmaz. Kimseyi yargılama, yalnızca argümanları aktar. Türkçe yaz.',
      prompt: `Konu: ${topic.title}\nAçıklama: ${topic.description}\n\nTartışma kaydı:\n<tartisma>\n${transcript || '(boş)'}\n</tartisma>\n\nÖzet, lehte ve aleyhte argümanlar, uzlaşı noktaları, açık sorular ve azınlıkta kalan görüşleri çıkar.`,
      schema: SUMMARY_SCHEMA,
      effort: 'medium',
    }),
    () => summarizeLocal(topic, messages)
  );
}
