import { get } from '../api.js';
import { html, time, badge, empty, tallyBar, thresholdText } from '../ui.js';
import { state } from '../store.js';
import { bindVoteButtons, voteButtons } from './polls.js';

export async function feed(ctx) {
  const f = await get('/feed');
  const s = f.istatistik;
  const stat = (v, l, href) => html`<a class="stat card-link" href="${href}"><div class="v">${v}</div><div class="l">${l}</div></a>`;
  ctx.render(html`
    <section class="hero">
      <h1>Ortak akılla karar verelim.</h1>
      <p>Herkes konu açabilir; konular çoğunluğun kabulüyle gündeme girer. Tartışmalar silinmez, her işlem dağıtık deftere işlenir ve <b>çoğunluğun azınlığı ezmemesi</b> için itiraz, şerh, bilirkişi incelemesi ve topluluk analizi devrededir.</p>
      <div class="row">${state.me ? html`<a class="btn primary" href="#/yeni-konu">+ Yeni konu öner</a>` : html`<a class="btn primary" href="#/kayit">Kayıt ol ve katıl</a><a class="btn" href="#/giris">Giriş yap</a>`}<a class="btn ghost" href="#/hakkinda">Nasıl çalışır?</a></div>
    </section>
    <div class="stats">
      ${stat(s.uye, 'Üye', '#/graf')}
      ${stat(s.kabulKonu, `Kabul edilen konu / ${s.konu}`, '#/konular')}
      ${stat(s.acikOylama, 'Açık oylama', '#/oylamalar')}
      ${stat(s.mesaj, 'Silinmez mesaj', '#/konular')}
      ${stat(s.bilirkisi, 'Onaylı bilirkişi', '#/bilirkisi')}
      ${stat(s.defterBlok, 'Defter bloğu', '#/defter')}
    </div>
    <div class="layout-side" style="margin-top:8px">
      <div>
        <div class="section-title"><h2>Açık oylamalar</h2><a href="#/oylamalar">Tümü →</a></div>
        <div class="stack">${f.acikOylamalar.length ? f.acikOylamalar.map((p) => html`<div class="card tight">
          <div class="spread"><span class="badge outline">${p.turEtiketi}</span><small class="muted">kapanış ${time(p.closes_at)}</small></div>
          <h3 style="margin:8px 0 2px"><a href="#/oylama/${p.id}">${p.title}</a></h3>
          ${tallyBar(p.tally)}
          <div class="spread"><small class="muted">Eşik: ${thresholdText(p)}</small>${p.canVote ? html`<div style="min-width:240px">${voteButtons(p, true)}</div>` : ''}</div>
        </div>`) : empty('Şu an açık oylama yok.')}</div>
      </div>
      <div class="stack" style="margin-top:58px">
        ${f.itirazlar.length ? html`<div class="card"><h3>İtirazlar</h3>${f.itirazlar.map((a) => html`<div class="list-item"><div class="main"><div class="spread"><a href="#/oylama/${a.poll_id}">${a.poll_title}</a>${badge(a.status)}</div><small class="muted">@${a.nickname} · ${time(a.created_at)}</small></div></div>`)}</div>` : ''}
        <div class="card"><h3>Son kabul edilen konular</h3>${f.sonKabuller.length ? f.sonKabuller.map((t) => html`<div class="list-item"><div class="main"><a href="#/konu/${t.id}"><b>${t.title}</b></a><div class="meta-line"><span class="chip">${t.domainLabel}</span>${time(t.decided_at || t.created_at)}</div></div></div>`) : empty('Henüz yok')}</div>
        <div class="card"><h3>Son mesajlar</h3>${f.sonMesajlar.map((m) => html`<div class="list-item"><div class="main"><div class="meta-line"><b>@${m.nickname}</b> · <a href="#/konu/${m.topic_id}">${m.topic_title}</a> · ${time(m.created_at)}</div><p style="margin:4px 0 0">${m.hidden ? html`<i class="muted">[oylamayla gizlendi]</i>` : m.content}</p></div></div>`)}</div>
      </div>
    </div>`);
  bindVoteButtons(document.getElementById('app'), () => ctx.reload());
}

export async function about(ctx) {
  const k = state.meta.kurallar;
  const h = (m) => (m >= 60 ? `${Math.round(m / 60)} saat` : `${m} dakika`);
  const req = [
    ['Herkes konu açabilir + düzenleme teklifi', 'Kayıtlı her üye konu önerir; kabul edilmiş konulara düzenleme teklifi verir. Kabul edilen teklif konunun yeni sürümü olur, eski sürümler saklanır.', '#/konular'],
    ['Konu kabulü için çoğunluk', `Oy kullananların yarıdan fazlası evet demeli ve seçmen kütüğünün en az %${Math.round(k.yeterSayi * 100)}'i katılmalı.`, '#/oylamalar'],
    ['Kimlik bilgileri + takma ad', 'Ad, soyad, doğum tarihi, e-posta, telefon, il/ilçe/açık adres zorunlu; kamuya yalnızca takma ad görünür. Deftere kişisel veri değil, kimlik özeti yazılır.', '#/kayit'],
    ['Konular oylamaya girer', 'Her konu, alt konu, düzenleme, gizleme ve bilirkişilik başvurusu bir oylamadır.', '#/oylamalar'],
    ['Alt konular da oylanır', 'Kabul edilmiş konuların altında alt konu önerilir ve ayrıca oylanır; konu ağacı oluşur.', '#/konular?gorunum=agac'],
    ['Yönetmelik → denetim (ontoloji)', 'Yönetmelik maddeleri bir ontolojiyle (sınıflar, ilişkiler, alanlar) modellenir; her madde makinece denetlenir. RDF/Turtle olarak dışa aktarılır.', '#/yonetmelik'],
    ['Silinmeyen tartışma alanı', 'Her konunun tartışması vardır; mesajlar veritabanı tetikleyicileriyle silinemez/değiştirilemez ve özetleri deftere yazılır.', '#/konular'],
    ['Silme isteği oylamaya çıkar', 'Gizleme talebi 2/3 nitelikli çoğunluk ister ve yalnızca hakaret, kişisel veri, spam veya hukuka aykırılık gerekçesiyle açılabilir. Gizlenen mesajın kaydı ve özeti kalır.', '#/oylamalar?tur=silme'],
    ['Uygulama + web sitesi', 'Aynı REST API’yi kullanan bu web sitesi ve native Android (Kotlin/Jetpack Compose) uygulaması.', '#/'],
    ['Dağıtık defter', 'Her işlem SHA-256 zincirli, Ed25519 imzalı bloklara yazılır. Bağımsız tanık düğümler zinciri kopyalar ve doğrular; geçmiş değiştirilirse tespit edilir.', '#/defter'],
    ['Bilirkişi entegrasyonu', 'Bilirkişilik topluluk oylamasıyla onaylanır. Bilirkişiler alanlarındaki konulara görüş verir ve itirazları inceler.', '#/bilirkisi'],
    ['Yapay zeka entegrasyonu', `Tartışma özeti (azınlık görüşleri dahil), konu sınıflandırma, moderasyon ve gizleme taleplerinin değerlendirilmesi. Şu an: ${state.meta.yapayZeka.model}. Yapay zeka yalnızca tavsiye verir.`, '#/konular'],
    ['İnsanlar grafta', 'Takip, güven, oy benzerliği ve yanıtlaşmalardan insan grafı kurulur; topluluklar ve etki (PageRank) hesaplanır; GraphML olarak indirilebilir.', '#/graf'],
  ];
  const minority = [
    ['Nitelikli çoğunluk', 'Yıkıcı ya da kalıcı işlemler (mesaj gizleme, yönetmelik değişikliği, itiraz sonrası yeniden oylama) 2/3 ister. Salt çoğunluk yetmez.'],
    ['Anayasal korumalar', '“Görüş ayrılığı” gizleme gerekçesi olarak tanımlı değildir; sistem böyle bir talebi kabul etmez. Bir üyenin mesajlarına aynı anda en fazla 2 gizleme talebi açılabilir (susturma koruması). Mesajlar fiziksel olarak hiç silinmez.'],
    ['Asgari müzakere süresi', `Herkes oy vermedikçe hiçbir oylama ilk ${h(k.asgariMuzakereDakika)} içinde sonuçlanmaz; çoğunluk kararı aceleye getirip azınlığın sesini duyurmasını engelleyemez.`],
    ['Topluluk analizi (insan grafı)', 'Karar geçse bile, graf üzerinde tespit edilen kayda değer bir topluluk büyük ölçüde karşıysa “azınlık uyarısı” üretilir; köprü skoru kararın topluluklar arası desteğini gösterir.'],
    ['İtiraz süresi ve bilirkişi incelemesi', `Oyların en az 1/3'ü karşıysa ya da azınlık uyarısı varsa karar ${h(k.itirazDakika)} itiraz süresine girer. İtiraz kararı askıya alır; bilirkişi ${h(k.incelemeDakika)} içinde kararı onar ya da 2/3 ile yeniden oylatır. Bilirkişi kararı tek başına bozamaz.`],
    ['Azınlık şerhi', 'Kaybeden taraf karara kalıcı şerh düşer; şerhler konu sayfasında ve defterde kalır.'],
    ['Seçmen kütüğü ve gizli oy', 'Oylama açıldıktan sonra açılan hesaplar oy kullanamaz (sahte hesapla çoğunluk üretilemez). Oylar deftere oylamaya özgü takma kimlikle yazılır; kimse kimin ne oy verdiğini göremez ama herkes sonucu defterden yeniden sayabilir.'],
    ['Yapay zekanın rolü', 'Özetlerde azınlık görüşlerinin temsil edilmesi zorunludur; gizleme taleplerinde “bu sadece görüş ayrılığı olabilir” uyarısı verilir.'],
  ];
  ctx.render(html`
    <div class="page-head"><div><h1>Nasıl çalışır?</h1><p>Ders gereksinimlerinin her biri ve “çoğunluk azınlığı tüketebilir” sorununa getirilen çözümler.</p></div></div>
    <h2>Gereksinimler → özellikler</h2>
    <div class="grid grid-2">${req.map(([t, d, href], i) => html`<a class="card card-link" href="${href}"><div class="row"><span class="badge expert">${i + 1}</span><b>${t}</b></div><p class="muted" style="margin:8px 0 0">${d}</p></a>`)}</div>
    <h2 style="margin-top:28px">Çoğunluk azınlığı nasıl tüketemez?</h2>
    <div class="card">${minority.map(([t, d]) => html`<div class="list-item"><span class="status-icon uyumlu">✓</span><div class="main"><b>${t}</b><p class="muted" style="margin:4px 0 0">${d}</p></div></div>`)}</div>
    <h2 style="margin-top:28px">Mimari</h2>
    <div class="card"><dl class="kv">
      <dt>Sunucu</dt><dd>Node.js + Express, SQLite (node:sqlite), REST API</dd>
      <dt>Web</dt><dd>Derleme gerektirmeyen tek sayfa uygulama (ES modülleri)</dd>
      <dt>Mobil</dt><dd>Native Android: Kotlin + Jetpack Compose, aynı REST API</dd>
      <dt>Defter</dt><dd>SHA-256 zincir + Ed25519 imza, Merkle kökü, bağımsız tanık düğümler</dd>
      <dt>Ontoloji</dt><dd>OWL/RDF (Turtle) dışa aktarım, madde başına denetim kuralı</dd>
      <dt>Yapay zeka</dt><dd>Claude API (yapılandırılmış çıktı) · anahtar yoksa yerel kural tabanlı çözümleyici</dd>
      <dt>Graf</dt><dd>Etiket yayılımı ile topluluklar, PageRank, GraphML dışa aktarım</dd>
    </dl></div>`);
}
