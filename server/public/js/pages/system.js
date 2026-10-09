import { get } from '../api.js';
import { html, $, mount, time, dateTime, loading, shortHash, toast } from '../ui.js';

// ================================================================ dağıtık defter
const TYPE_LABELS = {
  baslangic: 'Başlangıç', uye_kaydi: 'Üye kaydı', konu_onerildi: 'Konu önerisi', oylama_acildi: 'Oylama açıldı', oy: 'Oy', oylama_sonuclandi: 'Oylama sonucu',
  mesaj: 'Mesaj özeti', gizleme_talebi: 'Gizleme talebi', mesaj_gizlendi: 'Mesaj gizlendi', duzenleme_teklifi: 'Düzenleme teklifi', konu_guncellendi: 'Konu güncellendi',
  bilirkisi_basvurusu: 'Bilirkişi başvurusu', bilirkisi_talebi: 'Bilirkişi talebi', bilirkisi_gorusu: 'Bilirkişi görüşü', itiraz: 'İtiraz', itiraz_incelendi: 'İtiraz incelendi',
  itiraz_sonuclandi: 'İtiraz sonuçlandı', karar_kesinlesti: 'Karar kesinleşti', azinlik_serhi: 'Azınlık şerhi', iliski: 'Graf ilişkisi', profil_guncellendi: 'Profil güncellendi',
};

function consensusView(c) {
  const label = { uzlasi: 'Tam uzlaşı', cogunluk_uzlasisi: 'Çoğunluk uzlaşısı', uzlasi_yok: 'Uzlaşı yok', tahrifat: 'TAHRİFAT TESPİT EDİLDİ', tek_dugum: 'Tek düğüm' }[c.uzlasi.durum];
  const cls = { uzlasi: 'ok', cogunluk_uzlasisi: 'warn', uzlasi_yok: 'bad', tahrifat: 'bad', tek_dugum: '' }[c.uzlasi.durum];
  return html`<div class="notice ${cls}"><b>${label}</b> — ${c.uzlasi.uyumlu}/${c.uzlasi.toplam} düğüm aynı zinciri doğruluyor.</div>
    <div class="table-wrap" style="margin-top:10px"><table>
      <thead><tr><th>Düğüm</th><th>Durum</th><th>Uzunluk</th><th>Baş özet</th><th>Uyum</th></tr></thead>
      <tbody>
        <tr><td><b>Birincil</b><br><small class="muted">${c.birincil.dugum}</small></td><td>${c.birincil.kendiDogrulamasi ? '✓ kendi doğrulaması' : '✗ zincir bozuk'}</td><td>${c.birincil.uzunluk}</td><td class="hash">${shortHash(c.birincil.basOzet)}</td><td>${c.birincil.kendiDogrulamasi ? '✓' : '✗'}</td></tr>
        ${c.taniklar.map((w) => html`<tr><td><b>${w.ad || w.url}</b><br><small class="muted">${w.url}</small></td>
          <td>${w.erisilebilir ? html`${w.durum === 'tahrifat' ? html`<span class="badge red">tahrifat</span>` : html`<span class="badge kabul">${w.durum}</span>`}${w.hatalar?.length ? html`<br><small class="muted">${w.hatalar[0].detay}</small>` : ''}` : html`<span class="badge red">erişilemiyor</span>`}</td>
          <td>${w.uzunluk ?? '—'}${w.geride > 0 ? html` <small class="muted">(${w.geride} geride)</small>` : ''}</td><td class="hash">${shortHash(w.basOzet)}</td><td>${w.uyumlu ? '✓' : '✗'}</td></tr>`)}
      </tbody></table></div>
    ${!c.taniklar.length ? html`<p class="muted"><small>Tanık düğüm yapılandırılmamış (AUTO_WITNESSES=0).</small></p>` : ''}`;
}

export async function ledger(ctx) {
  const type = ctx.query.get('tur') || '';
  const [info, blocks, consensus] = await Promise.all([get('/ledger/info'), get(`/ledger/blocks?latest=80&type=${type}`), get('/ledger/consensus')]);
  ctx.render(html`
    <div class="page-head"><div><h1>Dağıtık defter</h1><p>Her işlem, önceki bloğun SHA-256 özetine bağlanan ve düğüm anahtarıyla (Ed25519) imzalanan bir bloğa yazılır. Bağımsız tanık düğümler zinciri kopyalar ve doğrular; geçmiş değiştirilirse — birincil düğüm kendi anahtarıyla yeniden imzalasa bile — Merkle kökü uyuşmazlığından tespit edilir. Kişisel veriler deftere yazılmaz.</p></div>
      <button class="btn primary" id="verify">Zinciri doğrula</button></div>
    <div class="stats">
      <div class="stat"><div class="v">${info.uzunluk}</div><div class="l">Blok</div></div>
      <div class="stat"><div class="v">${consensus.uzlasi.uyumlu}/${consensus.uzlasi.toplam}</div><div class="l">Uzlaşan düğüm</div></div>
      <div class="stat"><div class="v" style="font-size:1rem;padding-top:8px">${info.algoritma}</div><div class="l">Algoritma</div></div>
      <div class="stat"><div class="v" style="font-size:1rem;padding-top:8px">${time(info.sonZaman)}</div><div class="l">Son blok</div></div>
    </div>
    <div id="verify-result" style="margin-top:12px"></div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card"><h3>Birincil düğüm</h3><dl class="kv">
        <dt>Düğüm</dt><dd>${info.dugum}</dd>
        <dt>Baş özet</dt><dd class="hash">${info.basOzet}</dd>
        <dt>Merkle kökü</dt><dd class="hash">${info.merkleKoku}</dd>
      </dl><details style="margin-top:8px"><summary>Açık anahtar</summary><pre class="json">${info.publicKey}</pre></details></div>
      <div class="card"><h3>Tanık düğümler ve uzlaşı</h3><div id="consensus">${consensusView(consensus)}</div></div>
    </div>
    <div class="section-title"><h2>Son bloklar</h2>
      <select id="type" style="width:auto"><option value="">Tüm türler</option>${info.turler.map((t) => html`<option value="${t.type}" ${t.type === type ? 'selected' : ''}>${TYPE_LABELS[t.type] || t.type} (${t.adet})</option>`)}</select></div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Tür</th><th>Zaman</th><th>Özet / önceki</th><th>İçerik</th></tr></thead>
      <tbody>${blocks.map((b) => html`<tr>
        <td><b>${b.idx}</b></td>
        <td>${TYPE_LABELS[b.type] || b.type}<br><small class="muted">${b.actor === 'gizli' ? 'gizli oy' : b.actor === 'sistem' ? 'sistem' : 'üye'}</small></td>
        <td><small>${dateTime(b.ts)}</small></td>
        <td class="hash" title="${b.hash}">${shortHash(b.hash)}<br>↳ ${shortHash(b.prev_hash)}</td>
        <td><details><summary class="muted">göster</summary><pre class="json">${JSON.stringify(JSON.parse(b.payload), null, 2)}</pre></details></td>
      </tr>`)}</tbody></table></div></div>`);
  $('#type').onchange = (e) => (location.hash = `#/defter?tur=${e.target.value}`);
  $('#verify').onclick = async () => {
    const box = $('#verify-result');
    mount(box, loading());
    const r = await get('/ledger/verify');
    mount(box, html`<div class="notice ${r.ok ? 'ok' : 'bad'}">${r.ok ? `✓ ${r.length} bloğun tamamı doğrulandı: özetler, zincir bağları ve imzalar geçerli.` : html`✗ ${r.errors.length} hata bulundu:${r.errors.slice(0, 10).map((e) => html`<br>Blok #${e.idx}: ${e.hata}`)}`}</div>`);
    mount($('#consensus'), consensusView(await get('/ledger/consensus')));
    toast('Doğrulama tamamlandı');
  };
}

// ================================================================ yönetmelik, ontoloji, denetim
export async function regulation(ctx) {
  const focus = Number(ctx.query.get('madde')) || null;
  const [onto, audit] = await Promise.all([get('/ontology'), get('/audit')]);
  const byNo = new Map(audit.maddeler.map((m) => [m.no, m]));
  const children = (pid) => onto.siniflar.filter((c) => c.parent === pid);
  const classTree = (pid) => {
    const list = children(pid);
    return list.length ? html`<ul class="tree">${list.map((c) => html`<li><b>${c.label}</b> <code class="faint">oa:${c.id}</code><div class="muted"><small>${c.desc}</small></div>${classTree(c.id)}</li>`)}</ul>` : '';
  };
  const icon = (d) => html`<span class="status-icon ${d}">${d === 'uyumlu' ? '✓' : d === 'uyari' ? '!' : '✗'}</span>`;
  ctx.render(html`
    <div class="page-head"><div><h1>Yönetmelik &amp; denetim</h1><p>Yönetmelik maddeleri bir ontolojiyle modellenir: her madde hangi kavramları (sınıfları) denetlediğini ve makinece çalışan bir denetim kuralını taşır. Denetim; veritabanını, defteri ve oylama sonuçlarını bu kurallara göre kontrol eder.</p></div>
      <div class="row"><a class="btn" href="/api/ontology.ttl" download="ortak-akil-ontoloji.ttl">Turtle (RDF) indir</a><a class="btn" href="/api/ontology" target="_blank">JSON</a><button class="btn primary" id="rerun">Denetimi yeniden çalıştır</button></div></div>
    <div class="stats">
      <div class="stat"><div class="v" style="color:var(--yes)">${audit.ozet.uyumlu}</div><div class="l">Uyumlu madde</div></div>
      <div class="stat"><div class="v" style="color:var(--warn)">${audit.ozet.uyari}</div><div class="l">Uyarı</div></div>
      <div class="stat"><div class="v" style="color:var(--no)">${audit.ozet.ihlal}</div><div class="l">İhlal</div></div>
      <div class="stat"><div class="v" style="font-size:1rem;padding-top:8px">${dateTime(audit.zaman)}</div><div class="l">Son denetim</div></div>
    </div>
    <div class="layout-side" style="margin-top:16px">
      <div class="card"><h2>Yönetmelik maddeleri</h2>
        ${onto.maddeler.map((a) => {
          const m = byNo.get(a.no);
          return html`<div class="list-item" id="madde-${a.no}" ${focus === a.no ? html`style="background:var(--primary-soft);border-radius:8px;padding:12px"` : ''}>
            ${icon(m.durum)}
            <div class="main">
              <div class="spread"><b>Madde ${a.no} — ${a.title}</b><small class="muted">kural ${a.rule} · ${m.kontrol} kayıt denetlendi</small></div>
              <p style="margin:4px 0">${a.text}</p>
              <div class="row">${a.appliesTo.map((c) => html`<code class="chip">oa:${c}</code>`)}</div>
              ${[...m.ihlaller, ...m.uyarilar].map((x) => html`<div class="notice ${m.durum === 'ihlal' ? 'bad' : 'warn'}" style="margin-top:6px">${x.detay}${x.topic_id ? html` · <a href="#/konu/${x.topic_id}">konu #${x.topic_id}</a>` : ''}</div>`)}
            </div></div>`;
        })}
      </div>
      <div class="stack">
        <div class="card"><h3>Sınıf hiyerarşisi</h3>${classTree(null)}</div>
        <div class="card"><h3>İlişkiler</h3><div class="table-wrap"><table><tbody>${onto.ozellikler.map((p) => html`<tr><td><code>${p.id}</code></td><td><small>${p.domain} → ${p.range}</small></td></tr>`)}</tbody></table></div></div>
        <div class="card"><h3>Alanlar</h3><div class="row">${onto.alanlar.map((d) => html`<span class="chip">${d.label}</span>`)}</div></div>
        <div class="card"><h3>Gizleme gerekçeleri</h3><ul style="padding-left:18px;margin:0">${Object.values(onto.silmeGerekceleri).map((l) => html`<li>${l}</li>`)}</ul><p class="muted" style="margin-top:8px"><small>“Görüş ayrılığı” bilerek listede yoktur (Madde 8).</small></p></div>
      </div>
    </div>`);
  $('#rerun').onclick = () => ctx.reload();
  if (focus) document.getElementById(`madde-${focus}`)?.scrollIntoView({ block: 'center' });
}
