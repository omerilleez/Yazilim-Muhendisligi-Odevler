import { get, post, put, del, setToken } from '../api.js';
import { html, $, $$, mount, badge, time, avatar, toast, errorToast, openModal, empty, dateTime } from '../ui.js';
import { state, refreshMe, requireLogin, navigate, domainLabel } from '../store.js';
import { createGraphView } from '../graph-view.js';

// ================================================================ insan grafı
const EDGE_LABELS = { takip: 'Takip', guven: 'Güven', oy_benzerligi: 'Oy benzerliği', yanit: 'Yanıtlaşma' };

export async function graph(ctx) {
  const g = await get('/graph');
  ctx.render(html`
    <div class="page-head"><div><h1>İnsan grafı</h1><p>Üyeler düğüm; takip, güven, oy benzerliği ve yanıtlaşmalar kenar. Topluluklar etiket yayılımıyla, etki PageRank ile hesaplanır. Bu analiz, kararların bir topluluğu dışlayıp dışlamadığını ölçmek için kullanılır.</p></div>
      <a class="btn" href="/api/graph.graphml" download="insan-grafi.graphml">GraphML indir</a></div>
    <div class="layout-side">
      <div class="stack">
        <div class="graph-wrap"><canvas id="graph-canvas"></canvas></div>
        <div class="row legend">${Object.entries(EDGE_LABELS).map(([k, l]) => html`<label class="checkbox chip"><input type="checkbox" data-edge="${k}" checked> ${l}</label>`)}<span class="chip">◯ turuncu halka = bilirkişi</span><span class="chip">düğüm boyutu = etki</span></div>
      </div>
      <div class="stack">
        <div class="card" id="node-panel"><h3>Bir düğüme tıklayın</h3><p class="muted">Sürükleyerek taşıyın, boş alanı sürükleyerek kaydırın, tekerlekle yakınlaştırın.</p></div>
        <div class="card"><h3>Topluluklar</h3>${g.communities.map((c) => html`<div class="list-item"><i class="sw" style="background:${c.color};width:14px;height:14px"></i><div class="main"><b>${c.label}</b> <small class="muted">${c.size} üye</small><div class="meta-line">${c.onde.join(', ')}</div></div></div>`)}</div>
        <div class="card"><h3>Sürekli birlikte oy verenler</h3><p class="muted"><small>En az 6 ortak oylamada hep aynı oyu veren çiftler. Bilgilendirme amaçlıdır; koordineli sahte hesapları fark etmeye yardım eder.</small></p>
          ${g.blocs.length ? g.blocs.map((b) => html`<div class="chip" style="margin:3px">${b.uyeler.join(' ↔ ')} · ${b.ortakOylama}</div>`) : html`<p class="muted">Yok.</p>`}</div>
      </div>
    </div>`);
  const panel = $('#node-panel');
  const view = createGraphView($('#graph-canvas'), g, {
    onSelect: (n) => {
      if (!n) return mount(panel, html`<h3>Bir düğüme tıklayın</h3><p class="muted">Ayrıntılar burada görünür.</p>`);
      const c = g.communities.find((x) => x.id === n.community);
      mount(panel, html`<div class="row">${avatar(n.nickname)}<h3 style="margin:0">@${n.nickname}</h3></div>
        <dl class="kv" style="margin-top:12px">
          <dt>Topluluk</dt><dd><i class="sw" style="background:${c?.color}"></i>${c?.label}</dd>
          <dt>Etki (PageRank)</dt><dd>${n.pagerank}</dd>
          <dt>Bağlantı</dt><dd>${n.degree}</dd>
          <dt>Oy / mesaj / konu</dt><dd>${n.votes} / ${n.messages} / ${n.topics}</dd>
          <dt>Bilirkişilik</dt><dd>${n.expert.length ? n.expert.map((d) => html`<span class="badge expert">${domainLabel(d)}</span> `) : '—'}</dd>
        </dl>
        <div class="row" style="margin-top:12px"><a class="btn small primary" href="#/uye/${n.id}">Profili aç</a></div>`);
    },
  });
  $$('[data-edge]').forEach((cb) => cb.addEventListener('change', () => view.setEdgeTypes(new Set($$('[data-edge]').filter((x) => x.checked).map((x) => x.dataset.edge)))));
  window.addEventListener('hashchange', () => view.destroy(), { once: true });
}

// ================================================================ bilirkişiler
export async function experts(ctx) {
  const [list, inbox] = await Promise.all([get('/experts'), state.me ? get('/me/expert-inbox') : Promise.resolve(null)]);
  const groups = new Map();
  for (const e of list.onayli) {
    if (!groups.has(e.domain)) groups.set(e.domain, []);
    groups.get(e.domain).push(e);
  }
  ctx.render(html`
    <div class="page-head"><div><h1>Bilirkişiler</h1><p>Bilirkişilik bir alanda topluluk oylamasıyla onaylanır. Bilirkişiler konulara tavsiye niteliğinde görüş verir ve azınlık itirazlarını inceler; demokratik kararı tek başına bozamazlar.</p></div>
      ${state.me ? html`<button class="btn primary" id="apply">Bilirkişilik başvurusu</button>` : ''}</div>
    ${inbox && inbox.alanlar.length ? html`<div class="card" style="margin-bottom:16px"><h2>Bilirkişi gelen kutunuz</h2>
      <p class="muted">Alanlarınız: ${inbox.alanlar.map((a) => html`<span class="badge expert">${a.label}</span> `)}</p>
      <div class="grid grid-2">
        <div><h3>Görüş talepleri</h3>${inbox.talepler.length ? inbox.talepler.map((r) => html`<div class="list-item"><div class="main"><a href="#/konu/${r.topic_id}?sekme=bilirkisi"><b>${r.topic_title}</b></a><p style="margin:4px 0 0">${r.question}</p><small class="muted">@${r.nickname} · ${time(r.created_at)}</small></div></div>`) : html`<p class="muted">Açık talep yok.</p>`}</div>
        <div><h3>İncelenecek itirazlar</h3>${inbox.itirazlar.length ? inbox.itirazlar.map((a) => html`<div class="list-item"><div class="main"><a href="#/oylama/${a.poll_id}"><b>${a.poll_title}</b></a><p style="margin:4px 0 0">${a.reason}</p><small class="muted">@${a.nickname} · son tarih ${dateTime(a.review_deadline)}</small></div></div>`) : html`<p class="muted">Bekleyen itiraz yok.</p>`}</div>
      </div></div>` : ''}
    <div class="grid grid-3">${[...groups.entries()].map(([d, arr]) => html`<div class="card"><h3>${domainLabel(d)}</h3>${arr.map((e) => html`<div class="list-item">${avatar(e.nickname)}<div class="main"><a href="#/uye/${e.user_id}"><b>@${e.nickname}</b></a><div class="muted"><small>${e.bio}</small></div><small class="faint">${e.gorusSayisi} görüş</small></div></div>`)}</div>`)}</div>
    ${!groups.size ? empty('Henüz onaylı bilirkişi yok.') : ''}
    <div class="section-title"><h2>Değerlendirmedeki başvurular</h2></div>
    <div class="card">${list.basvurular.length ? list.basvurular.map((e) => html`<div class="list-item"><div class="main"><div class="spread"><b>@${e.nickname} — ${e.domainLabel}</b>${badge(e.status)}</div><p style="margin:4px 0">${e.credentials}</p>${e.poll_id ? html`<a class="btn small" href="#/oylama/${e.poll_id}">Oylamaya git →</a>` : ''}</div></div>`) : empty('Bekleyen başvuru yok.')}</div>`);
  $('#apply')?.addEventListener('click', () => openModal({
    title: 'Bilirkişilik başvurusu',
    body: html`<div class="field"><label>Alan</label><select name="domain">${state.meta.alanlar.map((d) => html`<option value="${d.id}">${d.label}</option>`)}</select></div>
      <div class="field"><label>Yeterlilik</label><textarea name="credentials" rows="5" required placeholder="Eğitiminiz, deneyiminiz, belgeleriniz…"></textarea><div class="hint">Başvurunuz topluluk oylamasına sunulur (Madde 12).</div></div>`,
    submitText: 'Başvur',
    onSubmit: async (v) => { const r = await post('/experts/apply', v); toast('Başvurunuz oylamaya sunuldu'); navigate(`#/oylama/${r.poll_id}`); },
  }));
}

// ================================================================ üye profili (kamuya açık)
export async function user(ctx) {
  const u = await get(`/users/${encodeURIComponent(ctx.params[0])}`);
  const self = state.me && state.me.id === u.id;
  ctx.render(html`
    <div class="layout-side">
      <div class="card">
        <div class="row">${avatar(u.nickname)}<div><h1 style="margin:0">@${u.nickname}</h1><small class="muted">${time(u.created_at)} katıldı</small></div></div>
        ${u.bio ? html`<p style="margin-top:12px">${u.bio}</p>` : ''}
        <div class="row">${u.uzmanlik.map((e) => html`<span class="badge expert">Bilirkişi · ${e.label}</span>`)}</div>
        <div class="stats" style="margin-top:16px">
          ${[['Konu', u.istatistik.konu], ['Mesaj', u.istatistik.mesaj], ['Oy', u.istatistik.oy], ['Takipçi', u.istatistik.takipci], ['Güvenen', u.istatistik.guvenen]].map(([l, v]) => html`<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`)}
        </div>
        <h3 style="margin-top:20px">Önerdiği konular</h3>
        ${u.konular.length ? u.konular.map((t) => html`<div class="list-item"><div class="main"><a href="#/konu/${t.id}">${t.title}</a> ${badge(t.status)}<div class="meta-line">${domainLabel(t.domain)} · ${time(t.created_at)}</div></div></div>`) : empty('Henüz konu önermedi.')}
      </div>
      <div class="stack">
        <div class="card"><h3>İlişki</h3>
          ${self ? html`<p class="muted">Bu sizin kamuya açık profiliniz. Kişisel bilgileriniz burada görünmez.</p><a class="btn small" href="#/profil">Hesabım</a>`
            : state.me ? html`<p class="muted"><small>Takip ve güven ilişkileri insan grafını oluşturur; güven kenarları topluluk tespitinde daha ağır basar.</small></p>
              <div class="row"><button class="btn small ${u.takipEdiyorum ? 'primary' : ''}" data-edge="takip" data-on="${u.takipEdiyorum ? 1 : 0}">${u.takipEdiyorum ? '✓ Takip ediliyor' : '+ Takip et'}</button>
              <button class="btn small ${u.guveniyorum ? 'primary' : ''}" data-edge="guven" data-on="${u.guveniyorum ? 1 : 0}">${u.guveniyorum ? '✓ Güveniyorum' : '+ Güven'}</button></div>`
            : html`<a href="#/giris">Giriş yapın</a>`}
        </div>
        <div class="card"><h3>Grafta gör</h3><a class="btn small" href="#/graf">İnsan grafı →</a></div>
      </div>
    </div>`);
  $$('[data-edge]').forEach((b) => b.addEventListener('click', async () => {
    try {
      const path = `/users/${u.id}/${b.dataset.edge}`;
      if (b.dataset.on === '1') await del(path);
      else await post(path);
      ctx.reload();
    } catch (err) {
      errorToast(err);
    }
  }));
}

// ================================================================ hesabım (özel bilgiler)
export async function profile(ctx) {
  if (!requireLogin()) return;
  const me = await refreshMe();
  const myTopics = await get(`/topics?user=${me.id}`);
  ctx.render(html`
    <div class="page-head"><div><h1>Hesabım</h1><p>Kimlik ve adres bilgileriniz yalnızca size görünür. Kamuya takma adınız (@${me.nickname}) gösterilir; deftere yalnızca kimlik özetiniz yazılmıştır.</p></div>
      <a class="btn" href="#/uye/${me.id}">Kamuya açık profilim</a></div>
    <div class="layout-side">
      <form class="card" id="profile-form">
        <h3>Kimlik (değiştirilemez)</h3>
        <dl class="kv"><dt>Ad Soyad</dt><dd>${me.first_name} ${me.last_name}</dd><dt>Doğum tarihi</dt><dd>${me.birth_date} (${me.age} yaş)</dd><dt>E-posta</dt><dd>${me.email}</dd><dt>Takma ad</dt><dd>@${me.nickname}</dd><dt>Üyelik</dt><dd>${dateTime(me.created_at)}</dd></dl>
        <hr><h3>İletişim ve adres</h3>
        <div class="grid grid-2">
          <div class="field"><label>Telefon</label><input type="tel" name="phone" value="${me.phone}" required></div>
          <div class="field"><label>Posta kodu</label><input type="text" name="postal_code" value="${me.postal_code}"></div>
          <div class="field"><label>İl</label><input type="text" name="city" value="${me.city}" required></div>
          <div class="field"><label>İlçe</label><input type="text" name="district" value="${me.district}" required></div>
        </div>
        <div class="field"><label>Açık adres</label><textarea name="address" rows="2" required>${me.address}</textarea></div>
        <div class="field"><label>Hakkımda (kamuya açık)</label><textarea name="bio" rows="2">${me.bio}</textarea></div>
        <button class="btn primary">Kaydet</button>
      </form>
      <div class="stack">
        <div class="card"><h3>Bilirkişilik</h3>${me.uzmanlik.length ? me.uzmanlik.map((e) => html`<div class="row" style="margin:4px 0"><span class="badge expert">${e.label}</span>${badge(e.status)}</div>`) : html`<p class="muted">Bilirkişilik başvurunuz yok.</p>`}<a class="btn small" href="#/bilirkisi">Bilirkişi sayfası →</a></div>
        <div class="card"><h3>Konularım</h3>${myTopics.length ? myTopics.map((t) => html`<div class="list-item"><div class="main"><a href="#/konu/${t.id}">${t.title}</a> ${badge(t.status)}</div></div>`) : empty('Henüz konu önermediniz.')}</div>
      </div>
    </div>`);
  $('#profile-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await put('/me', Object.fromEntries(new FormData(e.target).entries()));
      await refreshMe();
      toast('Bilgileriniz güncellendi');
    } catch (err) {
      errorToast(err);
    }
  };
}

// ================================================================ giriş & kayıt
export async function login(ctx) {
  const next = ctx.query.get('next') || '#/';
  const demo = state.meta.demoHesaplar;
  ctx.render(html`
    <div style="max-width:440px;margin:30px auto">
      <form class="card" id="login-form">
        <h1>Giriş yap</h1>
        <div class="field"><label>E-posta ya da takma ad</label><input type="text" name="identifier" autocomplete="username" required></div>
        <div class="field"><label>Parola</label><input type="password" name="password" autocomplete="current-password" required></div>
        <button class="btn primary" style="width:100%">Giriş</button>
        <p class="muted" style="margin-top:14px">Hesabınız yok mu? <a href="#/kayit">Kayıt olun</a></p>
      </form>
      ${demo ? html`<div class="card" style="margin-top:14px"><h3>Demo hesapları</h3><p class="muted"><small>Tüm demo hesaplarının parolası: <code>${demo.parola}</code>. Ayşe (eğitim) ve Emre (sağlık) bilirkişidir; Kerem azınlık topluluğundandır.</small></p>
        <div class="row">${demo.ornek.map((n) => html`<button class="btn small" data-demo="${n}">@${n}</button>`)}</div></div>` : ''}
    </div>`);
  const form = $('#login-form');
  const submit = async (identifier, password) => {
    try {
      const r = await post('/auth/login', { identifier, password });
      setToken(r.token);
      await refreshMe();
      toast(`Hoş geldiniz @${r.user.nickname}`);
      navigate(next);
    } catch (err) {
      errorToast(err);
    }
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(form);
    submit(f.get('identifier'), f.get('password'));
  };
  $$('[data-demo]').forEach((b) => (b.onclick = () => submit(b.dataset.demo, demo.parola)));
}

export async function register(ctx) {
  const k = state.meta.kurallar;
  ctx.render(html`
    <div style="max-width:760px;margin:10px auto">
      <form class="card" id="reg-form" novalidate>
        <h1>Kayıt ol</h1>
        <p class="muted">Kimlik ve adres bilgileri zorunludur (Madde 2). Bu bilgiler yalnızca size görünür; platformda takma adınızla yer alırsınız. ${k.minYas} yaşından küçükler üye olamaz.</p>
        <fieldset><legend>Kimlik</legend><div class="grid grid-2">
          <div class="field"><label>Ad</label><input type="text" name="first_name" autocomplete="given-name" required><div class="err" data-err="first_name"></div></div>
          <div class="field"><label>Soyad</label><input type="text" name="last_name" autocomplete="family-name" required><div class="err" data-err="last_name"></div></div>
          <div class="field"><label>Doğum tarihi</label><input type="date" name="birth_date" required><div class="err" data-err="birth_date"></div></div>
        </div></fieldset>
        <fieldset><legend>İletişim</legend><div class="grid grid-2">
          <div class="field"><label>E-posta</label><input type="email" name="email" autocomplete="email" required><div class="err" data-err="email"></div></div>
          <div class="field"><label>Telefon</label><input type="tel" name="phone" autocomplete="tel" placeholder="05xx xxx xx xx" required><div class="err" data-err="phone"></div></div>
        </div></fieldset>
        <fieldset><legend>Adres</legend><div class="grid grid-2">
          <div class="field"><label>İl</label><input type="text" name="city" required><div class="err" data-err="city"></div></div>
          <div class="field"><label>İlçe</label><input type="text" name="district" required><div class="err" data-err="district"></div></div>
        </div>
          <div class="field"><label>Açık adres</label><textarea name="address" rows="2" required placeholder="Mahalle, sokak, bina no, daire"></textarea><div class="err" data-err="address"></div></div>
          <div class="field" style="max-width:200px"><label>Posta kodu</label><input type="text" name="postal_code"></div>
        </fieldset>
        <fieldset><legend>Hesap</legend><div class="grid grid-2">
          <div class="field"><label>Takma ad (kamuya görünür)</label><input type="text" name="nickname" autocomplete="username" required><div class="hint">3-24 karakter: harf, rakam, _ ve .</div><div class="err" data-err="nickname"></div></div>
          <div class="field"><label>Parola</label><input type="password" name="password" autocomplete="new-password" required><div class="hint">En az 8 karakter</div><div class="err" data-err="password"></div></div>
        </div>
          <div class="field"><label>Hakkımda (isteğe bağlı, kamuya açık)</label><input type="text" name="bio" maxlength="500"></div>
        </fieldset>
        <label class="checkbox field"><input type="checkbox" name="kvkk" required> Kişisel verilerimin yalnızca üyelik doğrulaması için saklanacağını, kamuya yalnızca takma adımın gösterileceğini ve deftere yalnızca kimlik özetimin yazılacağını okudum, kabul ediyorum.</label>
        <div class="notice bad" id="reg-error" hidden></div>
        <button class="btn primary" style="margin-top:8px">Kayıt ol</button>
      </form>
    </div>`);
  const form = $('#reg-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    $$('[data-err]').forEach((x) => (x.textContent = ''));
    const box = $('#reg-error');
    box.hidden = true;
    const values = Object.fromEntries(new FormData(form).entries());
    if (!values.kvkk) {
      box.textContent = 'Devam etmek için aydınlatma metnini onaylayın.';
      box.hidden = false;
      return;
    }
    try {
      const r = await post('/auth/register', values);
      setToken(r.token);
      await refreshMe();
      toast('Kaydınız tamamlandı ve deftere (yalnızca kimlik özeti) işlendi');
      navigate('#/');
    } catch (err) {
      const errors = err.data?.errors || {};
      for (const [k2, msg] of Object.entries(errors)) { const el = form.querySelector(`[data-err="${k2}"]`); if (el) el.textContent = msg; }
      box.textContent = err.message;
      box.hidden = false;
    }
  };
}
