import { get, post } from '../api.js';
import { html, $, $$, badge, time, avatar, userLink, tallyBar, toast, errorToast, openModal, empty, loading, shortHash, STANCE, STANCE_CLASS, mount } from '../ui.js';
import { state, requireLogin, navigate } from '../store.js';
import { pollCard, bindVoteButtons } from './polls.js';

const STATUSES = { '': 'Tüm durumlar', oylamada: 'Oylamada', kabul: 'Kabul edildi', itiraz_suresi: 'İtiraz süresinde', askida: 'Askıda', red: 'Reddedildi' };

function domainOptions(selected = '', withAll = true) {
  return html`${withAll ? html`<option value="">Tüm alanlar</option>` : ''}${state.meta.alanlar.map((d) => html`<option value="${d.id}" ${d.id === selected ? 'selected' : ''}>${d.label}</option>`)}`;
}

function topicItem(t) {
  return html`<div class="list-item">
    <div class="main">
      <div class="row" style="margin-bottom:4px">${badge(t.status)}<span class="badge outline">${t.domainLabel}</span>${t.kind === 'yonetmelik' ? html`<span class="badge itiraz_suresi">Yönetmelik</span>` : ''}${t.parent_id ? html`<span class="chip">Alt konu</span>` : ''}</div>
      <h3><a href="#/konu/${t.id}">${t.title}</a></h3>
      <div class="meta-line">${userLink(t.created_by, t.nickname)} · ${time(t.created_at)} · ${t.mesajSayisi} mesaj${t.altKonuSayisi ? ` · ${t.altKonuSayisi} alt konu` : ''}${t.version > 1 ? ` · sürüm ${t.version}` : ''}</div>
      ${t.status === 'oylamada' && t.tally ? tallyBar(t.tally, { compact: true }) : ''}
    </div>
  </div>`;
}

function treeView(nodes) {
  if (!nodes.length) return '';
  return html`<ul class="tree">${nodes.map((t) => html`<li>
    <div class="row"><a href="#/konu/${t.id}"><b>${t.title}</b></a>${badge(t.status)}<span class="chip">${t.domainLabel}</span><small class="muted">${t.mesajSayisi} mesaj</small></div>
    ${treeView(t.children)}
  </li>`)}</ul>`;
}

// ================================================================ konu listesi
export async function list(ctx) {
  const q = ctx.query;
  const view = q.get('gorunum') || 'liste';
  const filters = { status: q.get('durum') || '', domain: q.get('alan') || '', q: q.get('ara') || '' };
  const data = view === 'agac'
    ? await get('/topics/tree')
    : await get(`/topics?status=${filters.status}&domain=${filters.domain}&q=${encodeURIComponent(filters.q)}`);
  ctx.render(html`
    <div class="page-head">
      <div><h1>Konular</h1><p>Herkes konu açabilir; konu, oylamada çoğunluğun kabulüyle gündeme girer. Kabul edilen konulara alt konu ve düzenleme teklifi verilebilir.</p></div>
      <a class="btn primary" href="#/yeni-konu">+ Yeni konu öner</a>
    </div>
    <div class="tabs">
      <button class="${view === 'liste' ? 'on' : ''}" data-view="liste">Liste</button>
      <button class="${view === 'agac' ? 'on' : ''}" data-view="agac">Konu ağacı</button>
    </div>
    ${view === 'liste' ? html`<form class="filters" id="filters">
      <input type="search" name="ara" placeholder="Konularda ara…" value="${filters.q}">
      <select name="alan">${domainOptions(filters.domain)}</select>
      <select name="durum">${Object.entries(STATUSES).map(([k, l]) => html`<option value="${k}" ${k === filters.status ? 'selected' : ''}>${l}</option>`)}</select>
      <button class="btn">Filtrele</button>
    </form>
    <div class="card">${data.length ? data.map(topicItem) : empty('Sonuç bulunamadı.')}</div>`
    : html`<div class="card">${data.length ? treeView(data) : empty('Henüz konu yok.')}<p class="muted" style="margin-top:12px"><small>Reddedilen konular ağaçta gösterilmez.</small></p></div>`}`);
  $$('[data-view]').forEach((b) => (b.onclick = () => (location.hash = `#/konular?gorunum=${b.dataset.view}`)));
  $('#filters')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    location.hash = `#/konular?ara=${encodeURIComponent(f.get('ara'))}&alan=${f.get('alan')}&durum=${f.get('durum')}`;
  });
}

// ================================================================ yeni konu
export async function create(ctx) {
  if (!requireLogin()) return;
  const parentId = ctx.query.get('ust');
  const parent = parentId ? await get(`/topics/${parentId}`) : null;
  ctx.render(html`
    <div class="page-head"><div><h1>${parent ? 'Alt konu öner' : 'Yeni konu öner'}</h1>
      <p>${parent ? html`Üst konu: <a href="#/konu/${parent.id}">${parent.title}</a>. ` : ''}Öneriniz oylamaya girecek; kabul edilirse tartışma alanı açılır. Yönetmelik konuları 2/3 nitelikli çoğunluk gerektirir.</p></div></div>
    <div class="layout-side">
      <form class="card" id="topic-form" novalidate>
        <div class="field"><label for="title">Başlık</label><input type="text" id="title" name="title" maxlength="140" required placeholder="Örn. Kampüse içme suyu sebilleri konulsun"></div>
        <div class="field"><label for="description">Açıklama</label><textarea id="description" name="description" rows="7" required placeholder="Ne öneriyorsunuz, neden, nasıl uygulanacak?"></textarea><div class="hint">En az 20 karakter.</div></div>
        <div class="grid grid-2">
          <div class="field"><label for="domain">Alan (ontoloji)</label><select id="domain" name="domain" required>${domainOptions(parent?.domain || '', false)}</select></div>
          <div class="field"><label for="kind">Tür</label><select id="kind" name="kind"><option value="genel">Genel konu (salt çoğunluk)</option><option value="yonetmelik" ${parent?.kind === 'yonetmelik' ? 'selected' : ''}>Yönetmelik konusu (2/3)</option></select></div>
        </div>
        <div class="field"><label>İlgili yönetmelik maddeleri</label>
          <div class="row" id="articles">${(state.articles || []).map((a) => html`<label class="checkbox chip"><input type="checkbox" name="articles" value="${a.no}" ${[3, 4, 6].includes(a.no) ? 'checked disabled' : ''}> Madde ${a.no}</label>`)}</div>
          <div class="hint">3, 4 ve 6. maddeler her konu için zorunludur. Yapay zeka önerisiyle doldurabilirsiniz.</div>
        </div>
        <div class="row"><button type="button" class="btn" id="classify">✨ Yapay zeka ile sınıflandır</button><button class="btn primary right" type="submit">Oylamaya sun</button></div>
      </form>
      <div class="stack"><div id="ai-box" class="card"><h3>Yapay zeka önerisi</h3><p class="muted">Başlık ve açıklamayı yazıp “sınıflandır”a basın: alan, ilgili maddeler, etiketler ve benzer konular önerilir. Kaynak: ${state.meta.yapayZeka.model}.</p></div>
      <div class="card"><h3>Hatırlatma</h3><ul class="muted" style="padding-left:18px;margin:0"><li>Aynı anda en fazla 5 konunuz oylamada olabilir.</li><li>Oylama süresi ${Math.round(state.meta.kurallar.oylamaDakika / 60)} saat; ilk ${Math.round(state.meta.kurallar.asgariMuzakereDakika / 60)} saat asgari müzakere süresidir.</li><li>Kabul için oy kullananların yarıdan fazlası ve %${Math.round(state.meta.kurallar.yeterSayi * 100)} katılım gerekir.</li></ul></div></div>
    </div>`);
  if (!state.articles) {
    const o = await get('/ontology');
    state.articles = o.maddeler;
    if (ctx.alive()) mount($('#articles'), html`${o.maddeler.map((a) => html`<label class="checkbox chip" title="${a.title}"><input type="checkbox" name="articles" value="${a.no}" ${[3, 4, 6].includes(a.no) ? 'checked disabled' : ''}> Madde ${a.no}</label>`)}`);
  }
  $('#classify').onclick = async () => {
    const title = $('#title').value.trim();
    const description = $('#description').value.trim();
    if (title.length < 3) return errorToast(new Error('Önce bir başlık yazın'));
    const box = $('#ai-box');
    mount(box, html`<h3>Yapay zeka önerisi</h3>${loading()}`);
    try {
      const r = await post('/ai/classify', { title, description });
      mount(box, html`<h3>Yapay zeka önerisi</h3>
        <div class="ai-card"><span class="ai-tag">${r._kaynak}</span>
          <h4>Alan</h4><p>${r.domainLabel}</p>
          <h4>İlgili maddeler</h4><p>${r.articles.map((n) => html`<span class="chip">Madde ${n}</span> `)}</p>
          <h4>Tür</h4><p>${r.kind === 'yonetmelik' ? 'Yönetmelik konusu (2/3)' : 'Genel konu'}</p>
          <h4>Etiketler</h4><p>${r.tags.map((t) => html`<span class="chip">#${t}</span> `)}</p>
          <p class="muted"><small>${r.gerekce}</small></p>
          ${r._uyari ? html`<div class="notice warn">${r._uyari}</div>` : ''}
        </div>
        ${r.benzerKonular?.length ? html`<div class="notice warn" style="margin-top:10px"><b>Benzer konular var:</b><br>${r.benzerKonular.map((s) => html`<a href="#/konu/${s.id}">${s.title}</a> (${Math.round(s.benzerlik * 100)}% benzer)<br>`)}</div>` : ''}
        <button class="btn small primary" id="apply-ai" style="margin-top:10px">Öneriyi uygula</button>`);
      $('#apply-ai').onclick = () => {
        $('#domain').value = r.domain;
        $('#kind').value = r.kind;
        $$('#articles input').forEach((cb) => { if (!cb.disabled) cb.checked = r.articles.includes(Number(cb.value)); });
        toast('Öneri forma uygulandı');
      };
    } catch (err) {
      mount(box, html`<h3>Yapay zeka önerisi</h3><div class="notice bad">${err.message}</div>`);
    }
  };
  $('#topic-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = {
      title: f.get('title'), description: f.get('description'), domain: f.get('domain'), kind: f.get('kind'),
      articles: $$('#articles input:checked').map((c) => Number(c.value)),
      parent_id: parent ? parent.id : undefined,
    };
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const t = await post('/topics', body);
      toast('Konu oylamaya sunuldu ve deftere işlendi');
      navigate(`#/konu/${t.id}`);
    } catch (err) {
      errorToast(err);
      btn.disabled = false;
    }
  };
}

// ================================================================ konu ayrıntısı
function messageView(m, byId) {
  const parent = m.reply_to ? byId.get(m.reply_to) : null;
  return html`<div class="msg ${m.reply_to ? 'reply' : ''}" id="m${m.id}">
    ${avatar(m.nickname)}
    <div>
      <div class="msg-head"><b>${userLink(m.user_id, m.nickname)}</b><small class="muted">${time(m.created_at)}</small><small class="faint">#${m.id}</small>
        ${m.pendingDeletion ? html`<a class="badge oylamada" href="#/oylama/${m.pendingDeletion.poll_id}">Gizleme oylamasında</a>` : ''}
        ${m.aiFlags?.length && !m.hidden ? html`<span class="badge outline" title="${m.aiFlags.map((f) => f.aciklama).join(' · ')}">YZ uyarısı: ${[...new Set(m.aiFlags.map((f) => state.meta.silmeGerekceleri[f.kategori] || f.kategori))].join(', ')}</span>` : ''}
      </div>
      ${parent ? html`<div class="reply-ref">↪ <a href="#m${parent.id}" data-jump="${parent.id}">@${parent.nickname} #${parent.id}</a> mesajına yanıt</div>` : ''}
      ${m.hidden
        ? html`<div class="tombstone">Bu mesaj <a href="#/oylama/${m.hiddenInfo.poll_id}">topluluk oylamasıyla</a> gizlendi (${m.hiddenInfo.categoryLabel || 'gerekçe'}). ${m.wiped ? 'Kişisel veri içerdiği için içeriği boşaltıldı; ' : 'Kaydı korunuyor; '}özeti: <span class="hash">${shortHash(m.content_hash)}</span></div>`
        : html`<div class="msg-body">${m.content}</div>`}
      <div class="msg-actions">
        ${!m.hidden ? html`<button class="btn ghost small" data-reply="${m.id}" data-nick="${m.nickname}">Yanıtla</button>` : ''}
        ${!m.hidden && !m.pendingDeletion ? html`<button class="btn ghost small" data-delete="${m.id}">Gizleme talebi</button>` : ''}
        <span class="hash" title="SHA-256: ${m.content_hash}" style="align-self:center">⛓ ${m.content_hash.slice(0, 8)}</span>
      </div>
    </div>
  </div>`;
}

function opinionView(o) {
  return html`<div class="list-item"><div class="main">
    <div class="row">${avatar(o.nickname)}<b>${userLink(o.expert_id, o.nickname)}</b><span class="badge expert">Bilirkişi</span><span class="badge ${STANCE_CLASS[o.stance]}">${STANCE[o.stance]}</span><small class="muted">${time(o.created_at)}</small></div>
    <p style="margin:8px 0 0;white-space:pre-wrap">${o.content}</p>
  </div></div>`;
}

export async function detail(ctx) {
  const id = ctx.params[0];
  const tab = ctx.query.get('sekme') || 'tartisma';
  const [t, messages] = await Promise.all([get(`/topics/${id}`), get(`/topics/${id}/messages`)]);
  const byId = new Map(messages.map((m) => [m.id, m]));
  const pollTitle = t.status === 'oylamada' ? 'Kabul oylaması' : 'Kabul oylaması (sonuç)';
  const openProposals = t.proposals.filter((p) => p.status === 'oylamada').length;
  const tabs = [
    ['tartisma', 'Tartışma', messages.length],
    ['altkonular', 'Alt konular', t.children.length],
    ['teklifler', 'Düzenleme teklifleri', t.proposals.length],
    ['bilirkisi', 'Bilirkişi', t.expertOpinions.length],
    ['denetim', 'Geçmiş & denetim', null],
  ];
  ctx.render(html`
    <div class="row muted" style="margin-bottom:8px"><a href="#/konular">Konular</a>${t.ancestors.map((a) => html` › <a href="#/konu/${a.id}">${a.title}</a>`)}</div>
    <div class="layout-side">
      <div>
        <div class="card">
          <div class="row">${badge(t.status)}<span class="badge outline">${t.domainLabel}</span>${t.kind === 'yonetmelik' ? html`<span class="badge itiraz_suresi">Yönetmelik konusu · 2/3</span>` : ''}${t.parent_id ? html`<span class="chip">Alt konu</span>` : ''}<span class="chip">Sürüm ${t.version}</span></div>
          <h1 style="margin:12px 0 6px">${t.title}</h1>
          <div class="meta-line">${userLink(t.creator.id, t.creator.nickname)} önerdi · ${time(t.created_at)}${t.decided_at ? html` · karar ${time(t.decided_at)}` : ''}</div>
          <p style="white-space:pre-wrap;margin-top:12px">${t.description}</p>
          <div class="row">${t.articleDetails.map((a) => html`<a class="chip" href="#/yonetmelik?madde=${a.no}" title="${a.text}">Madde ${a.no} · ${a.title}</a>`)}${t.tags.map((g) => html`<span class="chip">#${g}</span>`)}</div>
          ${t.canSubtopic || t.canPropose ? html`<div class="row" style="margin-top:14px">
            ${t.canSubtopic ? html`<a class="btn small" href="#/yeni-konu?ust=${t.id}">+ Alt konu öner</a>` : ''}
            ${t.canPropose ? html`<button class="btn small" id="propose-btn">✎ Düzenleme teklif et</button>` : ''}
          </div>` : ''}
        </div>

        <div class="tabs" style="margin-top:18px">${tabs.map(([k, l, c]) => html`<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}${c !== null ? html`<span class="count">${c}</span>` : ''}</button>`)}</div>
        <div id="tab-body">${tab === 'tartisma' ? html`
          <div class="card">
            <div class="spread"><h3 style="margin:0">Tartışma</h3><button class="btn small" id="summarize">✨ Yapay zeka özeti</button></div>
            <div id="summary"></div>
            <div id="messages">${messages.length ? messages.map((m) => messageView(m, byId)) : empty('Henüz mesaj yok. İlk görüşü siz yazın.')}</div>
            ${state.me ? html`<form class="composer" id="composer">
              <div id="reply-info" class="reply-ref" hidden></div>
              <textarea name="content" id="content" maxlength="4000" placeholder="Görüşünüzü yazın…" required></textarea>
              <div class="spread" style="margin-top:8px"><small class="muted">Mesajlar gönderildikten sonra silinemez ve değiştirilemez (Madde 7).</small>
                <div class="row"><button type="button" class="btn small" id="check-ai">YZ ile kontrol et</button><button class="btn primary small">Gönder</button></div></div>
              <div id="mod-result"></div>
            </form>` : html`<div class="notice" style="margin-top:12px"><a href="#/giris?next=${encodeURIComponent(location.hash)}">Giriş yapın</a> ve tartışmaya katılın.</div>`}
          </div>` : ''}
          ${tab === 'altkonular' ? html`<div class="card">
            <div class="spread"><h3 style="margin:0">Alt konular</h3>${t.canSubtopic ? html`<a class="btn small primary" href="#/yeni-konu?ust=${t.id}">+ Alt konu öner</a>` : ''}</div>
            ${!t.canSubtopic && t.status !== 'kabul' ? html`<p class="muted">Alt konu, yalnızca kabul edilmiş bir konu altında önerilebilir (Madde 5).</p>` : ''}
            ${t.children.length ? t.children.map(topicItem) : empty('Alt konu yok.')}
          </div>` : ''}
          ${tab === 'teklifler' ? html`<div class="card">
            <div class="spread"><h3 style="margin:0">Düzenleme teklifleri</h3>${t.canPropose ? html`<button class="btn small primary" id="propose-btn2">✎ Teklif et</button>` : ''}</div>
            <p class="muted"><small>Kabul edilen teklifler konunun yeni sürümü olur; eski sürümler korunur. ${openProposals ? `${openProposals} teklif oylamada.` : ''}</small></p>
            ${t.proposals.length ? t.proposals.map((p) => html`<div class="list-item"><div class="main">
              <div class="spread"><div class="meta-line">${userLink(p.proposer, p.nickname)} · ${time(p.created_at)}</div>${badge(p.status)}</div>
              <p style="margin:6px 0"><b>Gerekçe:</b> ${p.reason}</p>
              <details><summary>Önerilen metin</summary><div class="diff" style="margin-top:8px"><div class="new"><b>${p.new_title}</b><br><br>${p.new_description}</div></div></details>
              ${p.tally ? tallyBar(p.tally, { compact: true }) : ''}
              <a class="btn small" href="#/oylama/${p.poll_id}">Oylamaya git →</a>
            </div></div>`) : empty('Düzenleme teklifi yok.')}
          </div>` : ''}
          ${tab === 'bilirkisi' ? html`<div class="card">
            <div class="spread"><h3 style="margin:0">Bilirkişi görüşleri</h3><div class="row">
              ${state.me ? html`<button class="btn small" id="ask-expert">Görüş iste</button>` : ''}
              ${t.isExpert ? html`<button class="btn small primary" id="give-opinion">Görüş yaz</button>` : ''}</div></div>
            <p class="muted"><small>Yalnızca ${t.domainLabel} alanında topluluk oylamasıyla onaylanmış bilirkişiler görüş verebilir; görüşler tavsiye niteliğindedir (Madde 12).</small></p>
            ${t.expertOpinions.length ? t.expertOpinions.map(opinionView) : empty('Henüz bilirkişi görüşü yok.')}
            ${t.expertRequests.length ? html`<h4 style="margin-top:16px">Görüş talepleri</h4>${t.expertRequests.map((r) => html`<div class="list-item"><div class="main"><div class="spread"><div class="meta-line">@${r.nickname} · ${time(r.created_at)}</div>${badge(r.status === 'acik' ? 'oylamada' : 'kabul', r.status === 'acik' ? 'Yanıt bekliyor' : 'Yanıtlandı')}</div><p style="margin:4px 0 0">${r.question}</p></div></div>`)}` : ''}
          </div>` : ''}
          ${tab === 'denetim' ? html`<div class="stack">
            <div class="card"><h3>Yönetmelik denetimi (bu konu)</h3><div id="topic-audit">${loading()}</div></div>
            <div class="card"><h3>Sürüm geçmişi</h3>${t.versions.map((v) => html`<div class="list-item"><div class="main"><div class="spread"><b>Sürüm ${v.version}</b><small class="muted">${time(v.created_at)}${v.proposal_id ? ' · düzenleme teklifiyle' : ' · ilk metin'}</small></div><details><summary>${v.title}</summary><p style="white-space:pre-wrap">${v.description}</p></details></div></div>`)}</div>
            <div class="card"><h3>Bu konuyla ilgili oylamalar</h3>${t.polls.map((p) => html`<div class="list-item"><div class="main"><div class="spread"><a href="#/oylama/${p.id}">${p.title}</a>${badge(p.status)}</div><small class="muted">${p.turEtiketi} · ${time(p.opens_at)}</small></div></div>`)}</div>
            ${t.similar.length ? html`<div class="card"><h3>Benzer konular</h3>${t.similar.map((s) => html`<div><a href="#/konu/${s.id}">${s.title}</a> <small class="muted">(${Math.round(s.benzerlik * 100)}% benzer)</small></div>`)}</div>` : ''}
          </div>` : ''}
        </div>
      </div>
      <div class="stack">
        ${pollCard(t.poll, { title: pollTitle })}
        ${t.minorityReports.length ? html`<div class="card"><h3>Azınlık şerhleri</h3>${t.minorityReports.map((r) => html`<div class="list-item"><div class="main"><div class="meta-line">${userLink(r.user_id, r.nickname)} · ${time(r.created_at)}</div><p style="margin:4px 0 0">${r.content}</p><small class="muted">${r.poll_title}</small></div></div>`)}</div>` : ''}
        ${t.deletionRequests.length ? html`<div class="card"><h3>Gizleme talepleri</h3>${t.deletionRequests.map((d) => html`<div class="list-item"><div class="main"><div class="spread"><a href="#/oylama/${d.poll_id}">Mesaj #${d.message_id}</a>${badge(d.status)}</div><small class="muted">${d.categoryLabel} · @${d.nickname} · ${time(d.created_at)}</small></div></div>`)}</div>` : ''}
        <div class="card"><h3>Deftere işlenenler</h3><p class="muted"><small>Bu konunun önerisi, oyları, mesaj özetleri ve kararları zincirleme özetli deftere yazıldı. ${t.messageCount} mesajın hiçbiri silinemez.</small></p><a class="btn small" href="#/defter">Defteri incele →</a></div>
      </div>
    </div>`);

  const root = document.getElementById('app');
  bindVoteButtons(root, () => ctx.reload());
  $$('[data-tab]').forEach((b) => (b.onclick = () => (location.hash = `#/konu/${t.id}?sekme=${b.dataset.tab}`)));
  const propose = () => {
    if (!requireLogin()) return;
    openModal({
      title: 'Düzenleme teklifi',
      wide: true,
      body: html`<p class="muted">Teklifiniz oylamaya girer; kabul edilirse konunun yeni sürümü olur.</p>
        <div class="field"><label>Yeni başlık</label><input type="text" name="new_title" value="${t.title}" maxlength="140"></div>
        <div class="field"><label>Yeni açıklama</label><textarea name="new_description" rows="8">${t.description}</textarea></div>
        <div class="field"><label>Gerekçe</label><textarea name="reason" required placeholder="Neden bu değişikliği öneriyorsunuz?"></textarea></div>`,
      submitText: 'Oylamaya sun',
      onSubmit: async (v) => { await post(`/topics/${t.id}/proposals`, v); toast('Düzenleme teklifi oylamaya sunuldu'); navigate(`#/konu/${t.id}?sekme=teklifler`); },
    });
  };
  $('#propose-btn')?.addEventListener('click', propose);
  $('#propose-btn2')?.addEventListener('click', propose);

  // --- tartışma
  let replyTo = null;
  $$('[data-reply]').forEach((b) => b.addEventListener('click', () => {
    replyTo = Number(b.dataset.reply);
    const info = $('#reply-info');
    if (!info) return requireLogin();
    info.hidden = false;
    mount(info, html`↪ @${b.dataset.nick} #${replyTo} mesajına yanıt veriyorsunuz · <a href="javascript:void 0" id="cancel-reply">vazgeç</a>`);
    $('#cancel-reply').onclick = () => { replyTo = null; info.hidden = true; };
    $('#content').focus();
  }));
  $$('[data-jump]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById(`m${a.dataset.jump}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));
  $$('[data-delete]').forEach((b) => b.addEventListener('click', () => {
    if (!requireLogin()) return;
    const cats = state.meta.silmeGerekceleri;
    openModal({
      title: `Mesaj #${b.dataset.delete} için gizleme talebi`,
      body: html`<div class="notice warn" style="margin-bottom:12px"><b>Madde 8:</b> Görüş ayrılığı gizleme gerekçesi olamaz. Talep, 2/3 nitelikli çoğunluk gerektiren bir oylama başlatır; mesaj silinmez, yalnızca gizlenir ve kaydı korunur.</div>
        <div class="field"><label>Gerekçe</label><select name="category" required>${Object.entries(cats).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></div>
        <div class="field"><label>Açıklama</label><textarea name="explanation" required placeholder="Mesaj neden bu gerekçeye giriyor?"></textarea></div>`,
      submitText: 'Gizleme oylaması başlat',
      danger: true,
      onSubmit: async (v) => {
        const r = await post(`/messages/${b.dataset.delete}/deletion`, v);
        toast('Gizleme oylaması başlatıldı');
        navigate(`#/oylama/${r.poll_id}`);
      },
    });
  }));
  $('#summarize')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    const box = $('#summary');
    mount(box, loading());
    try {
      const s = await post(`/ai/summarize/${t.id}`);
      const list = (title, arr) => (arr?.length ? html`<h4>${title}</h4><ul>${arr.map((x) => html`<li>${x}</li>`)}</ul>` : '');
      mount(box, html`<div class="ai-card" style="margin-top:12px"><span class="ai-tag">YAPAY ZEKA ÖZETİ · ${s._kaynak} · ton: ${s.ton}</span>
        <p style="margin:6px 0 0">${s.ozet}</p>
        ${list('Lehte argümanlar', s.lehte)}${list('Aleyhte argümanlar', s.aleyhte)}${list('Azınlıkta kalan görüşler', s.azinlikGorusleri)}${list('Uzlaşı noktaları', s.uzlasi)}${list('Açık sorular', s.acikSorular)}
        ${s._uyari ? html`<div class="notice warn" style="margin-top:8px">${s._uyari}</div>` : ''}
        <p class="faint" style="margin:8px 0 0"><small>Özet tavsiye niteliğindedir; azınlık görüşlerini de temsil etmesi istenir.</small></p></div>`);
    } catch (err) {
      mount(box, html`<div class="notice bad">${err.message}</div>`);
    } finally {
      e.target.disabled = false;
    }
  });
  $('#check-ai')?.addEventListener('click', async () => {
    const content = $('#content').value.trim();
    if (!content) return;
    const box = $('#mod-result');
    mount(box, loading());
    try {
      const r = await post('/ai/moderate', { content });
      mount(box, html`<div class="notice ${r.uygun ? 'ok' : 'warn'}" style="margin-top:8px">${r.uygun ? '✓ ' : '⚠ '}${r.oneri}${r.riskler.map((x) => html`<br>• ${x.aciklama}`)}<br><small>${r._kaynak}</small></div>`);
    } catch (err) {
      mount(box, html`<div class="notice bad">${err.message}</div>`);
    }
  });
  $('#composer')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = $('#content').value.trim();
    if (!content) return;
    const btn = e.target.querySelector('button.primary');
    btn.disabled = true;
    try {
      await post(`/topics/${t.id}/messages`, { content, reply_to: replyTo });
      toast('Mesajınız eklendi ve özeti deftere işlendi');
      ctx.reload();
    } catch (err) {
      errorToast(err);
      btn.disabled = false;
    }
  });

  // --- bilirkişi
  $('#ask-expert')?.addEventListener('click', () => openModal({
    title: 'Bilirkişi görüşü iste',
    body: html`<p class="muted">${t.domainLabel} alanındaki onaylı bilirkişilere bildirim gider.</p><div class="field"><label>Sorunuz</label><textarea name="question" required></textarea></div>`,
    submitText: 'Talep gönder',
    onSubmit: async (v) => { await post(`/topics/${t.id}/expert-requests`, v); toast('Talep bilirkişilere iletildi'); ctx.reload(); },
  }));
  $('#give-opinion')?.addEventListener('click', () => {
    const open = t.expertRequests.filter((r) => r.status === 'acik');
    openModal({
      title: 'Bilirkişi görüşü',
      body: html`<div class="field"><label>Duruş</label><select name="stance">${Object.entries(STANCE).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></div>
        ${open.length ? html`<div class="field"><label>Yanıtlanan talep (isteğe bağlı)</label><select name="request_id"><option value="">—</option>${open.map((r) => html`<option value="${r.id}">@${r.nickname}: ${r.question.slice(0, 60)}</option>`)}</select></div>` : ''}
        <div class="field"><label>Görüş</label><textarea name="content" rows="6" required></textarea><div class="hint">En az 30 karakter. Görüşünüz deftere işlenir.</div></div>`,
      submitText: 'Görüşü yayımla',
      onSubmit: async (v) => { await post(`/topics/${t.id}/expert-opinions`, v); toast('Görüşünüz yayımlandı'); ctx.reload(); },
    });
  });

  // --- denetim
  if (tab === 'denetim') {
    try {
      const a = await get(`/topics/${t.id}/audit`);
      if (!ctx.alive()) return;
      mount($('#topic-audit'), html`${a.maddeler.map((m) => html`<div class="list-item">
        <span class="status-icon ${m.durum}">${m.durum === 'uyumlu' ? '✓' : m.durum === 'uyari' ? '!' : '✗'}</span>
        <div class="main"><b>Madde ${m.no} · ${m.title}</b><div class="muted"><small>${m.text}</small></div>
          ${[...m.ihlaller, ...m.uyarilar].map((x) => html`<div class="notice ${m.durum === 'ihlal' ? 'bad' : 'warn'}" style="margin-top:6px">${x.detay}</div>`)}</div></div>`)}`);
    } catch (err) {
      mount($('#topic-audit'), html`<div class="notice bad">${err.message}</div>`);
    }
  }
}
