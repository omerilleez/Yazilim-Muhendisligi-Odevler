import { get, post } from '../api.js';
import { html, $, $$, badge, time, dateTime, tallyBar, participationMeter, thresholdText, pct, toast, errorToast, openModal, empty, CHOICE, userLink, STATUS } from '../ui.js';
import { state, requireLogin } from '../store.js';

// ================================================================ paylaşılan bileşenler
export function voteButtons(p, small = false) {
  if (!p.canVote) return p.voteBlock && state.me && p.status === 'acik' ? html`<div class="notice">${p.voteBlock}</div>` : '';
  const b = (choice, cls) => html`<button class="btn ${cls} ${small ? 'small' : ''} ${p.myVote === choice ? 'on' : ''}" data-vote="${choice}" data-poll="${p.id}">${CHOICE[choice]}</button>`;
  return html`<div class="vote-buttons">${b('evet', 'yes')}${b('hayir', 'no')}${b('cekimser', 'abs')}</div>
    ${p.myVote ? html`<small>Oyunuz: <b>${CHOICE[p.myVote]}</b> — oylama açıkken değiştirebilirsiniz. Defterde takma kimlikle kayıtlıdır.</small>` : ''}`;
}

export function bindVoteButtons(root, onDone) {
  $$('[data-vote]', root).forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!requireLogin()) return;
      btn.disabled = true;
      try {
        const p = await post(`/polls/${btn.dataset.poll}/vote`, { choice: btn.dataset.vote });
        toast(p.status === 'acik' ? 'Oyunuz kaydedildi ve deftere işlendi' : `Oylama sonuçlandı: ${STATUS[p.status] || p.status}`);
        onDone?.(p);
      } catch (err) {
        errorToast(err);
        btn.disabled = false;
      }
    });
  });
}

export function analysisView(a) {
  if (!a) return '';
  return html`<div class="stack">
    ${a.azinlikUyarisi ? html`<div class="notice purple"><b>Azınlık uyarısı:</b> ${a.dislananlar.join(', ')} bu karara büyük ölçüde karşı. Karar itiraz süresine tabi tutuldu (Madde 9).</div>` : ''}
    ${a.kayda_deger_azinlik && !a.azinlikUyarisi ? html`<div class="notice purple">Oyların en az 1/3'ü karşı: kayda değer azınlık itiraz hakkına sahip (Madde 9).</div>` : ''}
    <div>${a.topluluklar.map((g) => {
      const d = g.evet + g.hayir;
      return html`<div class="community-row">
        <span><i class="sw" style="background:${g.renk}"></i>${g.etiket} <small>(${g.toplam})</small></span>
        <div class="tally-bar"><span class="y" style="width:${d ? (g.evet / d) * 100 : 0}%"></span><span class="n" style="width:${d ? (g.hayir / d) * 100 : 0}%"></span></div>
        <small>${g.evetOrani === null ? '—' : pct(g.evetOrani)}</small>
      </div>`;
    })}</div>
    <small>Köprü skoru (topluluklar arası en düşük destek): <b>${a.kopruSkoru === null ? '—' : pct(a.kopruSkoru)}</b> · Karşı oy oranı: <b>${pct(a.hayirOrani)}</b></small>
  </div>`;
}

/** Konu sayfasına gömülen oylama kartı. */
export function pollCard(p, { title = 'Oylama' } = {}) {
  if (!p) return '';
  const analysis = p.result?.analiz;
  return html`<div class="card" id="poll-card">
    <div class="spread"><h3 style="margin:0">${title}</h3>${badge(p.status)}</div>
    <p class="muted" style="margin:6px 0 0"><small>Eşik: ${thresholdText(p)} · ${p.status === 'acik' ? html`kapanış ${time(p.closes_at)}` : html`sonuç ${time(p.decided_at)}`}</small></p>
    ${tallyBar(p.tally)}
    ${participationMeter(p.tally, p.quorum)}
    ${p.status === 'acik' && p.serverTime < p.early_after ? html`<div class="notice" style="margin-top:10px">Asgari müzakere süresi ${time(p.early_after)} doluyor; o zamana kadar (herkes oy vermedikçe) karar verilmez.</div>` : ''}
    ${p.reason ? html`<div class="notice ${p.outcome === 'kabul' ? 'ok' : 'bad'}" style="margin-top:10px">${p.reason}</div>` : ''}
    ${p.status === 'itiraz_suresi' ? html`<div class="notice purple" style="margin-top:8px">İtiraz süresi ${time(p.appeal_until)} doluyor.</div>` : ''}
    <div style="margin-top:12px">${voteButtons(p)}</div>
    ${analysis ? html`<hr><h4>Topluluklara göre dağılım</h4>${analysisView(analysis)}` : ''}
    <div class="row" style="margin-top:12px"><a class="btn small" href="#/oylama/${p.id}">Oylama ayrıntıları →</a></div>
  </div>`;
}

function pollItem(p) {
  return html`<div class="card tight">
    <div class="spread">
      <div class="row"><span class="badge outline">${p.turEtiketi}</span>${badge(p.status)}${p.minority_alert ? html`<span class="badge itiraz_suresi">Azınlık uyarısı</span>` : ''}</div>
      <small class="muted">${p.status === 'acik' ? html`kapanış ${time(p.closes_at)}` : html`sonuç ${time(p.decided_at)}`}</small>
    </div>
    <h3 style="margin:8px 0 2px"><a href="#/oylama/${p.id}">${p.title}</a></h3>
    ${tallyBar(p.tally)}
    <div class="spread">
      <div class="meta-line">Eşik: ${thresholdText(p)}${p.myVote ? html` · Oyunuz: <b>${CHOICE[p.myVote]}</b>` : ''}${p.link ? html` · <a href="${p.link}">ilgili sayfa</a>` : ''}</div>
      ${p.canVote ? html`<div style="min-width:240px">${voteButtons(p, true)}</div>` : ''}
    </div>
  </div>`;
}

// ================================================================ oylama listesi
export async function list(ctx) {
  const tab = ctx.query.get('durum') || 'acik';
  const kind = ctx.query.get('tur') || '';
  const items = await get(`/polls?status=${tab === 'tumu' ? '' : tab}&kind=${kind}`);
  const kinds = { '': 'Tüm türler', konu: 'Konu', altkonu: 'Alt konu', duzenleme: 'Düzenleme', silme: 'Mesaj gizleme', bilirkisi: 'Bilirkişilik', itiraz: 'İtiraz' };
  ctx.render(html`
    <div class="page-head"><div><h1>Oylamalar</h1><p>Her öneri oylamaya girer. Salt çoğunluk ve %${Math.round(state.meta.kurallar.yeterSayi * 100)} katılım gerekir; yönetmelik ve mesaj gizleme için 2/3. Seçmen kütüğü oylama açıldığında dondurulur.</p></div></div>
    <div class="tabs">
      ${[['acik', 'Açık'], ['sonuclanan', 'Sonuçlanan'], ['tumu', 'Tümü']].map(([k, l]) => html`<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`)}
    </div>
    <div class="filters"><select id="kind">${Object.entries(kinds).map(([k, l]) => html`<option value="${k}" ${k === kind ? 'selected' : ''}>${l}</option>`)}</select></div>
    <div class="stack">${items.length ? items.map(pollItem) : empty('Bu filtrede oylama yok.')}</div>`);
  $$('[data-tab]').forEach((b) => (b.onclick = () => (location.hash = `#/oylamalar?durum=${b.dataset.tab}&tur=${kind}`)));
  $('#kind').onchange = (e) => (location.hash = `#/oylamalar?durum=${tab}&tur=${e.target.value}`);
  bindVoteButtons(document.getElementById('app'), () => ctx.reload());
}

// ================================================================ oylama ayrıntısı
function subjectView(s) {
  if (!s) return '';
  switch (s.tur) {
    case 'konu':
      return html`<div class="card"><div class="row"><span class="badge outline">${s.domainLabel}</span>${s.kind === 'yonetmelik' ? html`<span class="badge itiraz_suresi">Yönetmelik konusu</span>` : ''}${s.parent_id ? html`<span class="chip">Alt konu</span>` : ''}</div>
        <h2 style="margin-top:10px"><a href="${s.link}">${s.title}</a></h2><p style="white-space:pre-wrap">${s.description}</p></div>`;
    case 'duzenleme':
      return html`<div class="card"><h3>Düzenleme teklifi — @${s.oneren}</h3><p><b>Gerekçe:</b> ${s.gerekce}</p>
        <div class="diff"><div class="old"><b>Mevcut</b><br>${s.eski.title}<br><br>${s.eski.description}</div><div class="new"><b>Önerilen</b><br>${s.yeni.title}<br><br>${s.yeni.description}</div></div>
        <p style="margin-top:10px"><a href="${s.link}">Konuya git →</a></p></div>`;
    case 'silme': {
      const yz = s.yzDegerlendirmesi;
      return html`<div class="card"><h3>Gizleme talebi · ${s.gerekceEtiketi}</h3>
        <p class="muted">@${s.talepEden}, @${s.yazar} kullanıcısının mesajı için talepte bulundu.</p>
        ${s.mesajGizli ? html`<div class="tombstone">Mesaj gizlendi; kaydı ve özeti korunuyor.</div>` : html`<blockquote class="tombstone" style="font-style:normal">${s.mesaj}</blockquote>`}
        <p><b>Açıklama:</b> ${s.aciklama}</p>
        ${yz ? html`<div class="ai-card"><span class="ai-tag">YAPAY ZEKA TAVSİYESİ · ${yz._kaynak || ''}</span>
          <p style="margin:6px 0 0">${yz.uygun ? '✓ Talep gerekçesiyle uyumlu belirti var.' : '✗ Gerekçeye dair belirgin işaret yok.'} ${yz.gorusAyriligiRiski ? html`<b>Görüş ayrılığı riski:</b> mesaj yalnızca farklı bir görüş ifade ediyor olabilir.` : ''}</p>
          <p class="muted" style="margin:4px 0 0">${yz.aciklama}</p></div>` : ''}
        <div class="notice" style="margin-top:10px">Madde 8: gizleme için 2/3 nitelikli çoğunluk gerekir; görüş ayrılığı gerekçe olamaz. Gizlenen mesaj silinmez, kaydı ve özeti kalır.</div>
        <p style="margin-top:10px"><a href="${s.link}">Tartışmaya git →</a></p></div>`;
    }
    case 'bilirkisi':
      return html`<div class="card"><h3>${s.alanEtiketi} bilirkişiliği başvurusu</h3><p>Başvuran: <a href="${s.link}">@${s.basvuran}</a></p><p style="white-space:pre-wrap"><b>Yeterlilik:</b> ${s.yeterlilik}</p></div>`;
    case 'itiraz':
      return html`<div class="card"><h3>İtiraz üzerine yeniden oylama</h3>
        <p>Asıl karar: <a href="${s.link}">${s.asilOylama.title}</a></p>
        ${s.itiraz ? html`<p><b>@${s.itiraz.nickname} itirazı:</b> ${s.itiraz.reason}</p><p><b>Bilirkişi @${s.itiraz.reviewer || '—'} notu:</b> ${s.itiraz.review_note || '—'}</p>` : ''}
        <div class="notice">Bu oylamada 2/3 sağlanamazsa asıl karar bozulur.</div></div>`;
    default:
      return '';
  }
}

export async function detail(ctx) {
  const id = ctx.params[0];
  const p = await get(`/polls/${id}`);
  const analysis = p.result?.analiz;
  const ledgerMatch = p.defterSayimi && p.defterSayimi.evet === p.tally.evet && p.defterSayimi.hayir === p.tally.hayir && p.defterSayimi.cekimser === p.tally.cekimser;
  ctx.render(html`
    <div class="page-head"><div>
      <div class="row"><span class="badge outline">${p.turEtiketi}</span>${badge(p.status)}${p.minority_alert ? html`<span class="badge itiraz_suresi">Azınlık uyarısı</span>` : ''}</div>
      <h1 style="margin-top:8px">${p.title}</h1>
    </div></div>
    <div class="layout-side">
      <div class="stack">
        ${subjectView(p.subject)}
        <div class="card">
          <div class="spread"><h3 style="margin:0">Oy durumu</h3><small class="muted">Eşik: ${thresholdText(p)}</small></div>
          ${tallyBar(p.tally)}
          ${participationMeter(p.tally, p.quorum)}
          ${p.reason ? html`<div class="notice ${p.outcome === 'kabul' ? 'ok' : 'bad'}" style="margin-top:10px">${p.reason}</div>` : ''}
          <div style="margin-top:12px">${voteButtons(p)}</div>
        </div>
        ${analysis ? html`<div class="card"><h3>Azınlık analizi (insan grafı toplulukları)</h3>${analysisView(analysis)}</div>` : ''}
        <div class="card">
          <div class="spread"><h3 style="margin:0">Azınlık şerhleri</h3>${p.canReport ? html`<button class="btn small" id="report-btn">Şerh düş</button>` : ''}</div>
          <p class="muted"><small>Kaybeden tarafta oy kullananlar karara kalıcı şerh düşebilir (Madde 14).</small></p>
          ${p.minorityReports.length ? p.minorityReports.map((r) => html`<div class="list-item"><div class="main"><div class="meta-line">${userLink(r.user_id, r.nickname)} · ${CHOICE[r.side]} tarafı · ${time(r.created_at)}</div><p style="margin:4px 0 0">${r.content}</p></div></div>`) : html`<p class="muted">Şerh yok.</p>`}
        </div>
        <div class="card">
          <div class="spread"><h3 style="margin:0">İtirazlar</h3>${p.canAppeal ? html`<button class="btn small primary" id="appeal-btn">İtiraz et</button>` : ''}</div>
          <p class="muted"><small>Kayda değer azınlık (≥1/3) ya da topluluk dışlanması varsa karar itiraz süresine girer. Bilirkişi kararı onar ya da 2/3 eşikle yeniden oylamaya gönderir; tek başına bozamaz.</small></p>
          ${p.appeals.length ? p.appeals.map((a) => html`<div class="list-item"><div class="main">
            <div class="spread"><div class="meta-line">@${a.nickname} · ${time(a.created_at)}</div>${badge(a.status)}</div>
            <p style="margin:4px 0">${a.reason}</p>
            ${a.review_note ? html`<p class="muted" style="margin:0"><b>İnceleme (@${a.reviewer_nickname || 'sistem'}):</b> ${a.review_note}</p>` : html`<small class="muted">İnceleme son tarihi: ${dateTime(a.review_deadline)}</small>`}
            ${a.revote_poll_id ? html`<p style="margin:4px 0 0"><a href="#/oylama/${a.revote_poll_id}">Yeniden oylamaya git →</a></p>` : ''}
            ${p.canReview && a.status === 'inceleniyor' ? html`<button class="btn small primary" data-review="${a.id}" style="margin-top:8px">Bilirkişi olarak incele</button>` : ''}
          </div></div>`) : html`<p class="muted">İtiraz yok.</p>`}
        </div>
      </div>
      <div class="stack">
        <div class="card"><h3>Zaman çizelgesi</h3><dl class="kv">
          <dt>Açılış</dt><dd>${dateTime(p.opens_at)}</dd>
          <dt>Asgari müzakere</dt><dd>${dateTime(p.early_after)}</dd>
          <dt>Kapanış</dt><dd>${dateTime(p.closes_at)}</dd>
          ${p.decided_at ? html`<dt>Karar</dt><dd>${dateTime(p.decided_at)}</dd>` : ''}
          ${p.appeal_until ? html`<dt>İtiraz sonu</dt><dd>${dateTime(p.appeal_until)}</dd>` : ''}
          <dt>Seçmen kütüğü</dt><dd>${p.eligible} üye (dondurulmuş)</dd>
        </dl></div>
        <div class="card"><h3>Defterden bağımsız sayım</h3>
          <p class="muted"><small>Oylar, oylamaya özgü takma kimliklerle deftere yazılır. Aşağıdaki sayım yalnızca defter bloklarından yapılır.</small></p>
          <dl class="kv"><dt>Evet</dt><dd>${p.defterSayimi.evet}</dd><dt>Hayır</dt><dd>${p.defterSayimi.hayir}</dd><dt>Çekimser</dt><dd>${p.defterSayimi.cekimser}</dd><dt>Oy bloğu</dt><dd>${p.defterSayimi.blokSayisi}</dd></dl>
          <div class="notice ${ledgerMatch ? 'ok' : 'bad'}" style="margin-top:10px">${ledgerMatch ? '✓ Veritabanı sayımıyla birebir uyumlu' : '✗ Veritabanı ile defter uyuşmuyor!'}</div>
        </div>
      </div>
    </div>`);
  const appEl = document.getElementById('app');
  bindVoteButtons(appEl, () => ctx.reload());
  $('#report-btn')?.addEventListener('click', () => openModal({
    title: 'Azınlık şerhi',
    body: html`<div class="field"><label>Şerhiniz</label><textarea name="content" required minlength="20" placeholder="Karara neden katılmadığınızı ve uygulamada nelere dikkat edilmesi gerektiğini yazın."></textarea><div class="hint">Şerh kalıcıdır ve deftere işlenir.</div></div>`,
    submitText: 'Şerhi kaydet',
    onSubmit: async (v) => { await post(`/polls/${p.id}/minority-report`, v); toast('Şerhiniz kaydedildi'); ctx.reload(); },
  }));
  $('#appeal-btn')?.addEventListener('click', () => openModal({
    title: 'Karara itiraz',
    body: html`<p class="muted">İtiraz, kararı bilirkişi incelemesine kadar askıya alır.</p><div class="field"><label>Gerekçe</label><textarea name="reason" required minlength="20"></textarea></div>`,
    submitText: 'İtiraz et',
    onSubmit: async (v) => { await post(`/polls/${p.id}/appeal`, v); toast('İtirazınız kaydedildi, karar askıya alındı'); ctx.reload(); },
  }));
  $$('[data-review]').forEach((b) => b.addEventListener('click', () => openModal({
    title: 'İtiraz incelemesi',
    body: html`<div class="field"><label class="checkbox"><input type="radio" name="decision" value="onayla" checked> Kararı onayla (itirazı yerinde bulmuyorum)</label>
      <label class="checkbox"><input type="radio" name="decision" value="yeniden_oylama"> 2/3 eşikle yeniden oylamaya gönder</label></div>
      <div class="field"><label>İnceleme notu</label><textarea name="note" required minlength="10"></textarea></div>
      <div class="notice">Bilirkişi kararı tek başına bozamaz; yalnızca onar ya da nitelikli çoğunlukla yeniden oylatır.</div>`,
    submitText: 'İncelemeyi kaydet',
    onSubmit: async (v) => { await post(`/appeals/${b.dataset.review}/review`, v); toast('İnceleme kaydedildi'); ctx.reload(); },
  })));
}
