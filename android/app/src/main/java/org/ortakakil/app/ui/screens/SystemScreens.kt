package org.ortakakil.app.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.ortakakil.app.data.ApiException
import org.ortakakil.app.data.a
import org.ortakakil.app.data.b
import org.ortakakil.app.data.i
import org.ortakakil.app.data.l
import org.ortakakil.app.data.o
import org.ortakakil.app.data.objects
import org.ortakakil.app.data.s
import org.ortakakil.app.ui.KeyValue
import org.ortakakil.app.ui.LocalApp
import org.ortakakil.app.ui.Loadable
import org.ortakakil.app.ui.Muted
import org.ortakakil.app.ui.Notice
import org.ortakakil.app.ui.NoticeKind
import org.ortakakil.app.ui.Pill
import org.ortakakil.app.ui.ScreenScaffold
import org.ortakakil.app.ui.SectionCard
import org.ortakakil.app.ui.fmtDate
import org.ortakakil.app.ui.statusColor

private val BLOCK_TYPES = mapOf(
    "baslangic" to "Başlangıç", "uye_kaydi" to "Üye kaydı", "konu_onerildi" to "Konu önerisi", "oylama_acildi" to "Oylama açıldı", "oy" to "Oy",
    "oylama_sonuclandi" to "Oylama sonucu", "mesaj" to "Mesaj özeti", "gizleme_talebi" to "Gizleme talebi", "mesaj_gizlendi" to "Mesaj gizlendi",
    "duzenleme_teklifi" to "Düzenleme teklifi", "konu_guncellendi" to "Konu güncellendi", "bilirkisi_basvurusu" to "Bilirkişi başvurusu",
    "bilirkisi_talebi" to "Bilirkişi talebi", "bilirkisi_gorusu" to "Bilirkişi görüşü", "itiraz" to "İtiraz", "itiraz_incelendi" to "İtiraz incelendi",
    "itiraz_sonuclandi" to "İtiraz sonuçlandı", "karar_kesinlesti" to "Karar kesinleşti", "azinlik_serhi" to "Azınlık şerhi", "iliski" to "Graf ilişkisi",
    "profil_guncellendi" to "Profil güncellendi",
)

private fun short(h: String) = if (h.length > 20) "${h.take(10)}…${h.takeLast(6)}" else h

// ====================================================================== defter
@Composable
fun LedgerScreen() {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var type by rememberSaveable { mutableStateOf("") }
    var verifyResult by remember { mutableStateOf<JSONObject?>(null) }
    var verifying by remember { mutableStateOf(false) }
    ScreenScaffold("Dağıtık defter", back = true) { mod ->
        Loadable(key = type, load = {
            JSONObject()
                .put("info", app.api.obj("/ledger/info"))
                .put("consensus", app.api.obj("/ledger/consensus"))
                .put("blocks", app.api.arr("/ledger/blocks?latest=60&type=$type"))
        }) { data, reload ->
            val info = data.getJSONObject("info")
            val c = data.getJSONObject("consensus")
            val blocks = data.getJSONArray("blocks").objects()
            LazyColumn(mod.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item {
                    Muted("Her işlem, önceki bloğun SHA-256 özetine bağlanan ve düğüm anahtarıyla (Ed25519) imzalanan bir bloğa yazılır. Tanık düğümler zinciri kopyalar ve doğrular; geçmiş değiştirilirse tespit edilir. Kişisel veriler deftere yazılmaz.")
                }
                item {
                    SectionCard("Birincil düğüm") {
                        KeyValue("Düğüm", info.s("dugum"))
                        KeyValue("Blok sayısı", info.i("uzunluk").toString())
                        KeyValue("Algoritma", info.s("algoritma"))
                        KeyValue("Son blok", fmtDate(info.l("sonZaman")))
                        KeyValue("Baş özet", short(info.s("basOzet")))
                        KeyValue("Merkle kökü", short(info.s("merkleKoku")))
                        Spacer(Modifier.height(8.dp))
                        Button(enabled = !verifying, onClick = {
                            scope.launch {
                                verifying = true
                                verifyResult = try { app.api.obj("/ledger/verify") } catch (e: ApiException) { JSONObject().put("hata", e.message) }
                                verifying = false
                                reload()
                            }
                        }) { Text(if (verifying) "Doğrulanıyor…" else "Zinciri doğrula") }
                        verifyResult?.let { r ->
                            Spacer(Modifier.height(8.dp))
                            if (r.has("hata")) Notice(r.s("hata"), NoticeKind.Bad)
                            else if (r.b("ok")) Notice("✓ ${r.i("length")} bloğun tamamı doğrulandı: özetler, zincir bağları ve imzalar geçerli.", NoticeKind.Ok)
                            else Notice("✗ ${r.a("errors").length()} hata: " + r.a("errors").objects().take(5).joinToString { "#${it.i("idx")} ${it.s("hata")}" }, NoticeKind.Bad)
                        }
                    }
                }
                item {
                    val u = c.o("uzlasi")
                    val durum = u?.s("durum").orEmpty()
                    SectionCard("Tanık düğümler ve uzlaşı") {
                        val label = mapOf("uzlasi" to "Tam uzlaşı", "cogunluk_uzlasisi" to "Çoğunluk uzlaşısı", "uzlasi_yok" to "Uzlaşı yok", "tahrifat" to "TAHRİFAT TESPİT EDİLDİ", "tek_dugum" to "Tek düğüm")[durum] ?: durum
                        Notice("$label — ${u?.i("uyumlu")}/${u?.i("toplam")} düğüm aynı zinciri doğruluyor.", if (durum == "uzlasi") NoticeKind.Ok else if (durum == "cogunluk_uzlasisi") NoticeKind.Warn else NoticeKind.Bad)
                        c.a("taniklar").objects().forEach { w ->
                            Spacer(Modifier.height(8.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(w.s("ad", w.s("url")), fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                                Pill(if (!w.b("erisilebilir")) "erişilemiyor" else w.s("durum"), if (w.b("uyumlu")) statusColor("kabul") else statusColor("red"))
                            }
                            if (w.b("erisilebilir")) Muted("${w.i("uzunluk")} blok · baş ${short(w.s("basOzet"))}" + if (w.i("geride") > 0) " · ${w.i("geride")} geride" else "")
                            w.a("hatalar").objects().firstOrNull()?.let { Muted(it.s("detay")) }
                        }
                    }
                }
                item {
                    Text("Son bloklar", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        FilterChip(selected = type.isEmpty(), onClick = { type = "" }, label = { Text("Tümü") })
                        info.a("turler").objects().forEach { t ->
                            FilterChip(selected = type == t.s("type"), onClick = { type = t.s("type") }, label = { Text("${BLOCK_TYPES[t.s("type")] ?: t.s("type")} (${t.i("adet")})") })
                        }
                    }
                }
                items(blocks, key = { it.i("idx") }) { b -> BlockItem(b) }
            }
        }
    }
}

@Composable
private fun BlockItem(b: JSONObject) {
    var open by remember { mutableStateOf(false) }
    SectionCard(modifier = Modifier.clickable { open = !open }) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("#${b.i("idx")}", fontWeight = FontWeight.Bold)
            Spacer(Modifier.padding(4.dp))
            Text(BLOCK_TYPES[b.s("type")] ?: b.s("type"), modifier = Modifier.weight(1f))
            Muted(fmtDate(b.l("ts")))
        }
        Text("özet ${short(b.s("hash"))}\n↳ önceki ${short(b.s("prev_hash"))}", fontFamily = FontFamily.Monospace, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (open) {
            Spacer(Modifier.height(6.dp))
            val pretty = runCatching { JSONObject(b.s("payload")).toString(2) }.getOrDefault(b.s("payload"))
            Text(pretty, fontFamily = FontFamily.Monospace, fontSize = 11.sp)
            Muted("imza: ${b.s("signature").take(32)}…")
        }
    }
}

// ====================================================================== yönetmelik & denetim
@Composable
fun RegulationScreen() {
    val app = LocalApp.current
    ScreenScaffold("Yönetmelik & denetim", back = true) { mod ->
        Loadable(key = Unit, load = { JSONObject().put("audit", app.api.obj("/audit")).put("onto", app.api.obj("/ontology")) }) { data, reload ->
            val audit = data.getJSONObject("audit")
            val onto = data.getJSONObject("onto")
            val ozet = audit.o("ozet")
            LazyColumn(mod.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item {
                    Muted("Yönetmelik maddeleri bir ontolojiyle modellenir: her madde hangi kavramları denetlediğini ve makinece çalışan bir denetim kuralını taşır. Denetim; veritabanını, defteri ve oylama sonuçlarını bu kurallara göre kontrol eder.")
                }
                item {
                    SectionCard("Denetim özeti") {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Pill("✓ ${ozet?.i("uyumlu")} uyumlu", statusColor("uyumlu"))
                            Pill("! ${ozet?.i("uyari")} uyarı", statusColor("uyari"))
                            Pill("✗ ${ozet?.i("ihlal")} ihlal", statusColor("ihlal"))
                        }
                        Spacer(Modifier.height(6.dp))
                        Muted("Son denetim: ${fmtDate(audit.l("zaman"))}")
                        Spacer(Modifier.height(6.dp))
                        Button(onClick = reload) { Text("Denetimi yeniden çalıştır") }
                    }
                }
                items(audit.a("maddeler").objects(), key = { it.i("no") }) { m -> ArticleStatusRow(m) }
                item {
                    SectionCard("Ontoloji sınıfları") {
                        onto.a("siniflar").objects().forEach { c ->
                            Text("${c.s("label")}  ·  oa:${c.s("id")}" + if (c.s("parent").isNotBlank()) "  ⊂ oa:${c.s("parent")}" else "", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall)
                            Muted(c.s("desc"))
                            Spacer(Modifier.height(4.dp))
                        }
                    }
                }
                item {
                    SectionCard("İlişkiler") {
                        onto.a("ozellikler").objects().forEach { p -> Muted("${p.s("id")}: ${p.s("domain")} → ${p.s("range")}") }
                    }
                }
                item {
                    SectionCard("Gizleme gerekçeleri") {
                        val cats = onto.o("silmeGerekceleri")
                        cats?.keys()?.forEach { k -> Text("• ${cats.s(k)}") }
                        Spacer(Modifier.height(4.dp))
                        Muted("“Görüş ayrılığı” bilerek listede yoktur (Madde 8).")
                    }
                }
                item { Spacer(Modifier.fillMaxWidth().height(12.dp)) }
            }
        }
    }
}
