// Görünüm yardımcıları: güvenli HTML şablonu, biçimlendiriciler, rozetler, modal ve bildirimler.

/** Kullanıcı içeriğini kaçışlayan etiketli şablon. Döndürdüğü nesne iç içe kullanılabilir. */
export class Safe {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Safe(String(s ?? ''));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const val = (v) => {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(val).join('');
  return esc(v);
};
export const html = (strings, ...values) => new Safe(strings.reduce((acc, s, i) => acc + s + (i < values.length ? val(values[i]) : ''), ''));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function mount(target, view) {
  target.innerHTML = String(view);
}

// ------------------------------------------------------------- etiketler
export const STATUS = {
  oylamada: 'Oylamada', acik: 'Oylama açık', kabul: 'Kabul edildi', red: 'Reddedildi', itiraz_suresi: 'İtiraz süresinde', askida: 'Askıda · itiraz incelemesi',
  inceleniyor: 'İnceleniyor', onaylandi: 'Karar onandı', yeniden_oylama: 'Yeniden oylamada', karar_onandi: 'Karar onandı', karar_bozuldu: 'Karar bozuldu',
  onayli: 'Onaylı', acik_talep: 'Açık', yanitlandi: 'Yanıtlandı',
};
export const CHOICE = { evet: 'Evet', hayir: 'Hayır', cekimser: 'Çekimser' };
export const STANCE = { destek: 'Destekliyor', karsi: 'Karşı', notr: 'Nötr', sartli: 'Şartlı destek' };
export const STANCE_CLASS = { destek: 'kabul', karsi: 'red', notr: 'outline', sartli: 'itiraz_suresi' };

export const badge = (status, label) => html`<span class="badge ${status}">${label || STATUS[status] || status}</span>`;

// ------------------------------------------------------------- zaman
const rtf = new Intl.RelativeTimeFormat('tr', { numeric: 'auto' });
export function ago(ts) {
  if (!ts) return '';
  const diff = (ts - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return new Date(ts).toLocaleDateString('tr-TR');
}
export const dateTime = (ts) => (ts ? new Date(ts).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const time = (ts) => html`<time title="${dateTime(ts)}">${ago(ts)}</time>`;
export const pct = (x) => `%${Math.round((x || 0) * 1000) / 10}`;

// ------------------------------------------------------------- bileşenler
const COLORS = ['#0f766e', '#4f46e5', '#db2777', '#d97706', '#059669', '#7c3aed', '#0891b2', '#dc2626', '#65a30d', '#c026d3'];
export function colorFor(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}
export const avatar = (nick) => html`<span class="avatar" style="background:${colorFor(nick)}">${String(nick || '?').slice(0, 1).toLocaleUpperCase('tr-TR')}</span>`;
export const userLink = (id, nick) => html`<a href="#/uye/${id}">@${nick}</a>`;

export function thresholdText(p) {
  if (!p) return '';
  if (p.strict) return `yarıdan fazla (>${Math.round(p.threshold * 100)}%)`;
  return p.threshold > 0.66 && p.threshold < 0.67 ? 'en az 2/3' : `en az ${pct(p.threshold)}`;
}

export function tallyBar(t, { compact = false } = {}) {
  if (!t) return '';
  const total = t.toplam || 0;
  const w = (n) => (total ? (n / total) * 100 : 0);
  return html`<div class="tally">
    <div class="tally-bar" title="Evet ${t.evet} · Hayır ${t.hayir} · Çekimser ${t.cekimser}">
      <span class="y" style="width:${w(t.evet)}%"></span><span class="n" style="width:${w(t.hayir)}%"></span><span class="a" style="width:${w(t.cekimser)}%"></span>
    </div>
    <div class="tally-legend">
      <span><i class="sw" style="background:var(--yes)"></i>Evet <b>${t.evet}</b></span>
      <span><i class="sw" style="background:var(--no)"></i>Hayır <b>${t.hayir}</b></span>
      <span><i class="sw" style="background:var(--abstain)"></i>Çekimser <b>${t.cekimser}</b></span>
      ${compact ? '' : html`<span>Katılım <b>${total}/${t.secmenKutugu}</b> (${pct(t.katilim)})</span>`}
    </div>
  </div>`;
}

export function participationMeter(t, quorum) {
  return html`<div class="meter" title="Katılım ve %${Math.round(quorum * 100)} yeter sayı çizgisi">
    <span style="width:${Math.min(100, (t.katilim || 0) * 100)}%"></span><i style="left:${quorum * 100}%"></i>
  </div><small>Katılım ${pct(t.katilim)} · yeter sayı %${Math.round(quorum * 100)} (${t.gerekenKatilim} oy)</small>`;
}

export const empty = (text) => html`<div class="empty">${text}</div>`;
export const loading = () => html`<div class="loading"><span class="spinner"></span> Yükleniyor…</div>`;
export const shortHash = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : '');

// ------------------------------------------------------------- bildirim & modal
export function toast(message, type = 'info') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 6000 : 3500);
}

export function errorToast(err) {
  toast(err?.message || String(err), 'error');
}

/**
 * Form içeren modal. onSubmit(values) bir Promise döndürür; başarılıysa modal kapanır,
 * hata fırlatırsa mesaj modal içinde gösterilir.
 */
export function openModal({ title, body, submitText = 'Gönder', onSubmit, danger = false, wide = false }) {
  const root = document.getElementById('modal-root');
  root.innerHTML = String(html`<div class="modal-backdrop">
    <form class="modal" ${wide ? raw('style="width:min(760px,100%)"') : ''} novalidate>
      <h2>${title}</h2>
      <div class="modal-body">${body}</div>
      <div class="notice bad modal-error" hidden></div>
      <div class="modal-actions">
        <button type="button" class="btn ghost" data-close>Vazgeç</button>
        ${onSubmit ? html`<button type="submit" class="btn ${danger ? 'danger' : 'primary'}">${submitText}</button>` : ''}
      </div>
    </form>
  </div>`);
  const form = root.querySelector('form');
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  root.querySelector('.modal-backdrop').addEventListener('mousedown', (e) => { if (e.target.classList.contains('modal-backdrop')) close(); });
  root.querySelector('[data-close]').addEventListener('click', close);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!onSubmit) return close();
    const btn = form.querySelector('[type=submit]');
    const errBox = form.querySelector('.modal-error');
    btn.disabled = true;
    errBox.hidden = true;
    try {
      const values = Object.fromEntries(new FormData(form).entries());
      await onSubmit(values, form);
      close();
    } catch (err) {
      errBox.textContent = err.message || String(err);
      errBox.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });
  setTimeout(() => form.querySelector('input, textarea, select')?.focus(), 30);
  return { close, form };
}

export function confirmDialog(title, text, okText = 'Onayla') {
  return new Promise((resolve) => {
    let ok = false;
    const m = openModal({ title, body: html`<p>${text}</p>`, submitText: okText, onSubmit: async () => { ok = true; } });
    const obs = new MutationObserver(() => {
      if (!document.body.contains(m.form)) { obs.disconnect(); resolve(ok); }
    });
    obs.observe(document.getElementById('modal-root'), { childList: true });
  });
}
