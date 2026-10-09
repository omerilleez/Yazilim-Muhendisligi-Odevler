# Ortak Akıl — katılımcı karar platformu (web + Android)

Herkesin konu açabildiği, konuların çoğunluk oyuyla kabul edildiği, tartışmaların silinmediği ve
**çoğunluğun azınlığı ezemediği** bir karar platformu.

```
server/   Node.js + Express + SQLite API, web sitesi (public/), dağıtık defter tanık düğümleri
android/  Native Android uygulaması (Kotlin + Jetpack Compose), aynı API'yi kullanır
docs/     Yazılım mühendisliği ilkeleri ve tasarım desenleri raporu
OrtakAkil.apk  Derlenmiş Android uygulaması
```

📄 [Yazılım Mühendisliği İlkeleri ve Tasarım Desenleri Raporu](docs/YAZILIM_MUHENDISLIGI_RAPORU.md)

## Çalıştırma

```bash
cd server
npm install
npm start          # http://localhost:3000  (ilk açılışta demo verisi yüklenir)
npm run demo       # aynı şey, oylama süreleri kısaltılmış (sınıfta sunum için)
npm test           # çekirdek kural testleri
npm run seed       # veritabanını sıfırla ve demo verisini yeniden yükle
```

Demo hesapları: `ayse`, `zeynep`, `emre`, `kerem`, `burak` … parola `demo1234`
(emre sağlık bilirkişisidir, vegan menü kararındaki itirazı inceleyebilir).

**Android:** `OrtakAkil.apk` dosyasını telefona kurun. Emülatörde sunucu adresi `http://10.0.2.2:3000`,
gerçek telefonda bilgisayarın yerel IP'si (sunucu açılırken terminale yazar; aynı Wi-Fi gerekli).
Kaynaktan derlemek için `android/` klasörünü Android Studio ile açın ya da `./gradlew assembleDebug`.

**Yapay zeka:** `ANTHROPIC_API_KEY` tanımlıysa Claude (`claude-opus-5-5`) kullanılır; yoksa yerel
kural tabanlı çözümleyici devreye girer, uygulama anahtarsız da çalışır.

## Gereksinimler → çözüm

| # | Gereksinim | Uygulama |
|---|---|---|
| 1 | Herkes konu açabilir + düzenleme teklifi | Kabul edilen konuya düzenleme teklifi → oylama → yeni sürüm (eski sürümler saklanır) |
| 2 | Kabul için çoğunluk | Oy kullananların yarıdan fazlası + seçmen kütüğünün %30'u katılım |
| 3 | Kimlik bilgileri + takma ad | Ad, soyad, doğum tarihi, e-posta, telefon, il/ilçe/adres zorunlu; kamuya yalnızca takma ad; 18 yaş sınırı |
| 4 | Konular oylamaya girer | Konu, alt konu, düzenleme, gizleme, bilirkişilik başvurusu: hepsi oylama |
| 5 | Alt konular da oylanır | Yalnızca kabul edilmiş konunun altında; konu ağacı |
| 6 | Yönetmelik → denetim (ontoloji) | 16 madde, sınıf/ilişki ontolojisi, her madde için otomatik denetim kuralı, RDF/Turtle dışa aktarım |
| 7 | Silinmeyen tartışma | Veritabanı tetikleyicileri silmeyi/değiştirmeyi engeller; her mesajın özeti deftere yazılır |
| 8 | Silme oylamaya çıkar | 2/3 nitelikli çoğunluk, yalnızca hakaret / kişisel veri / spam / hukuka aykırılık; mesaj gizlenir, kaydı kalır |
| – | Dağıtık defter | SHA-256 zincir + Ed25519 imza + Merkle kökü; 2 bağımsız tanık düğüm geçmişin değiştirilmesini yakalar |
| – | Bilirkişi | Topluluk oylamasıyla onaylanır; görüş verir, itirazları inceler |
| – | Yapay zeka | Tartışma özeti (azınlık görüşleri dahil), konu sınıflandırma, moderasyon, gizleme talebi değerlendirmesi |
| – | İnsanlar grafta | Takip/güven/oy benzerliği/yanıt kenarları, topluluk tespiti, PageRank, GraphML |

## "Çoğunluk azınlığı tüketebilir" — çözümler

1. **Nitelikli çoğunluk:** gizleme, yönetmelik değişikliği ve itiraz sonrası yeniden oylama 2/3 ister.
2. **Anayasal korumalar:** "görüş ayrılığı" gizleme gerekçesi değildir; bir üyenin mesajlarına aynı anda en fazla 2 gizleme talebi açılabilir; mesajlar fiziksel olarak hiç silinmez.
3. **Asgari müzakere süresi:** herkes oy vermedikçe hiçbir oylama ilk 24 saatte sonuçlanmaz.
4. **Topluluk analizi:** karar geçse bile insan grafındaki bir topluluk büyük ölçüde karşıysa "azınlık uyarısı".
5. **İtiraz + bilirkişi:** ≥1/3 karşı oy ya da azınlık uyarısında karar itiraz süresine girer; bilirkişi kararı onar ya da 2/3 ile yeniden oylatır, tek başına bozamaz.
6. **Azınlık şerhi:** kaybeden taraf karara kalıcı şerh düşer.
7. **Seçmen kütüğü + gizli oy:** oylama açıldıktan sonra açılan hesaplar oy veremez; oylar deftere takma kimlikle yazılır, herkes defterden yeniden sayabilir.
