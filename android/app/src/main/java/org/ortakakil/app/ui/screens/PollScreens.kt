package org.ortakakil.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import org.ortakakil.app.data.a
import org.ortakakil.app.data.b
import org.ortakakil.app.data.d
import org.ortakakil.app.data.i
import org.ortakakil.app.data.l
import org.ortakakil.app.data.o
import org.ortakakil.app.data.objects
import org.ortakakil.app.data.s
import org.ortakakil.app.data.strings
import org.ortakakil.app.ui.CHOICE_LABEL
import org.ortakakil.app.ui.FormDialog
import org.ortakakil.app.ui.KeyValue
import org.ortakakil.app.ui.LocalApp
import org.ortakakil.app.ui.LocalNav
import org.ortakakil.app.ui.Loadable
import org.ortakakil.app.ui.Muted
import org.ortakakil.app.ui.Notice
import org.ortakakil.app.ui.NoticeKind
import org.ortakakil.app.ui.ParticipationMeter
import org.ortakakil.app.ui.Pill
import org.ortakakil.app.ui.ScreenScaffold
import org.ortakakil.app.ui.SectionCard
import org.ortakakil.app.ui.StatusBadge
import org.ortakakil.app.ui.TallyBar
import org.ortakakil.app.ui.VoteButtons
import org.ortakakil.app.ui.EmptyText
import org.ortakakil.app.ui.fmtDate
import org.ortakakil.app.ui.openLink
import org.ortakakil.app.ui.pct
import org.ortakakil.app.ui.relTime
import org.ortakakil.app.ui.rememberToast
import org.ortakakil.app.ui.theme.No
import org.ortakakil.app.ui.theme.Purple
import org.ortakakil.app.ui.theme.Yes
import org.ortakakil.app.ui.thresholdText

// ====================================================================== paylaşılan
@Composable
fun AnalysisView(a: JSONObject) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (a.b("azinlikUyarisi")) {
            Notice("Azınlık uyarısı: ${a.a("dislananlar").strings().joinToString()} bu karara büyük ölçüde karşı. Karar itiraz süresine tabi (Madde 9).", NoticeKind.Purple)
        } else if (a.b("kayda_deger_azinlik")) {
            Notice("Oyların en az 1/3'ü karşı: kayda değer azınlık itiraz hakkına sahip (Madde 9).", NoticeKind.Purple)
        }
        a.a("topluluklar").objects().forEach { g ->
            val yes = g.i("evet")
            val no = g.i("hayir")
            val color = runCatching { Color(android.graphics.Color.parseColor(g.s("renk"))) }.getOrDefault(Color.Gray)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(10.dp).clip(CircleShape).background(color))
                Spacer(Modifier.width(6.dp))
                Text("${g.s("etiket")} (${g.i("toplam")})", style = MaterialTheme.typography.bodySmall, modifier = Modifier.width(110.dp))
                Row(Modifier.weight(1f).height(8.dp).clip(RoundedCornerShape(4.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
                    if (yes > 0) Box(Modifier.weight(yes.toFloat()).fillMaxSize().background(Yes))
                    if (no > 0) Box(Modifier.weight(no.toFloat()).fillMaxSize().background(No))
                    if (yes + no == 0) Spacer(Modifier.weight(1f))
                }
                Spacer(Modifier.width(6.dp))
                Muted(pct(g.d("evetOrani")), Modifier.width(48.dp))
            }
        }
        Muted("Köprü skoru (topluluklar arası en düşük destek): ${pct(a.d("kopruSkoru"))} · karşı oy oranı ${pct(a.d("hayirOrani"))}")
    }
}

/** Konu sayfasına gömülen oylama özeti. */
@Composable
fun PollSummaryCard(p: JSONObject, title: String, onChanged: () -> Unit) {
    val nav = LocalNav.current
    SectionCard(title, action = { StatusBadge(p.s("status")) }) {
        Muted("Eşik: ${thresholdText(p)} · " + if (p.s("status") == "acik") "kapanış ${relTime(p.l("closes_at"))}" else "sonuç ${relTime(p.l("decided_at"))}")
        Spacer(Modifier.height(8.dp))
        p.o("tally")?.let { TallyBar(it) }
        Spacer(Modifier.height(6.dp))
        p.o("tally")?.let { ParticipationMeter(it, p.d("quorum") ?: 0.3) }
        if (p.s("status") == "acik" && p.l("serverTime") < p.l("early_after")) {
            Spacer(Modifier.height(8.dp))
            Notice("Asgari müzakere süresi ${relTime(p.l("early_after"))} doluyor; o zamana kadar (herkes oy vermedikçe) karar verilmez.")
        }
        if (p.s("reason").isNotBlank()) {
            Spacer(Modifier.height(8.dp))
            Notice(p.s("reason"), if (p.s("outcome") == "kabul") NoticeKind.Ok else NoticeKind.Bad)
        }
        if (p.s("status") == "itiraz_suresi") {
            Spacer(Modifier.height(8.dp))
            Notice("İtiraz süresi ${relTime(p.l("appeal_until"))} doluyor.", NoticeKind.Purple)
        }
        Spacer(Modifier.height(10.dp))
        VoteButtons(p) { onChanged() }
        p.o("result")?.o("analiz")?.let {
            Spacer(Modifier.height(10.dp))
            HorizontalDivider()
            Spacer(Modifier.height(8.dp))
            Text("Topluluklara göre dağılım", fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(6.dp))
            AnalysisView(it)
        }
        Spacer(Modifier.height(8.dp))
        TextButton(onClick = { nav.navigate("poll/${p.i("id")}") }) { Text("Oylama ayrıntıları →") }
    }
}

@Composable
fun PollListItem(p: JSONObject, onChanged: () -> Unit) {
    val nav = LocalNav.current
    SectionCard(modifier = Modifier.clickable { nav.navigate("poll/${p.i("id")}") }) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Pill(p.s("turEtiketi"), filled = false)
            StatusBadge(p.s("status"))
            if (p.i("minority_alert") == 1) Pill("Azınlık uyarısı", Purple)
        }
        Spacer(Modifier.height(8.dp))
        Text(p.s("title"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(6.dp))
        p.o("tally")?.let { TallyBar(it) }
        Spacer(Modifier.height(4.dp))
        val vote = p.s("myVote")
        Muted("Eşik: ${thresholdText(p)} · " + (if (p.s("status") == "acik") "kapanış ${relTime(p.l("closes_at"))}" else "sonuç ${relTime(p.l("decided_at"))}") + if (vote.isNotBlank()) " · Oyunuz: ${CHOICE_LABEL[vote]}" else "")
        if (p.b("canVote")) {
            Spacer(Modifier.height(8.dp))
            VoteButtons(p) { onChanged() }
        }
    }
}

// ====================================================================== liste
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PollsScreen() {
    val app = LocalApp.current
    var tab by rememberSaveable { mutableStateOf(0) }
    val statuses = listOf("acik", "sonuclanan", "")
    ScreenScaffold("Oylamalar") { mod ->
        Column(mod.fillMaxSize()) {
            TabRow(selectedTabIndex = tab) {
                listOf("Açık", "Sonuçlanan", "Tümü").forEachIndexed { idx, label ->
                    Tab(selected = tab == idx, onClick = { tab = idx }, text = { Text(label) })
                }
            }
            Loadable(key = tab, load = { app.api.arr("/polls?status=${statuses[tab]}") }) { list, reload ->
                var refreshing by remember { mutableStateOf(false) }
                PullToRefreshBox(isRefreshing = refreshing, onRefresh = { refreshing = true; reload(); refreshing = false }) {
                    LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        item {
                            Muted("Salt çoğunluk ve %${((app.meta?.o("kurallar")?.d("yeterSayi") ?: 0.3) * 100).toInt()} katılım gerekir; yönetmelik ve mesaj gizleme için 2/3. Seçmen kütüğü oylama açıldığında dondurulur.")
                        }
                        val polls = list.objects()
                        if (polls.isEmpty()) item { EmptyText("Bu sekmede oylama yok.") }
                        items(polls, key = { it.i("id") }) { p -> PollListItem(p) { reload() } }
                    }
                }
            }
        }
    }
}

// ====================================================================== ayrıntı
@Composable
private fun SubjectCard(s: JSONObject) {
    val nav = LocalNav.current
    when (s.s("tur")) {
        "konu" -> SectionCard {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Pill(s.s("domainLabel"), filled = false)
                if (s.s("kind") == "yonetmelik") Pill("Yönetmelik konusu", Purple)
            }
            Spacer(Modifier.height(8.dp))
            Text(s.s("title"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.clickable { openLink(nav, s.s("link")) })
            Spacer(Modifier.height(6.dp))
            Text(s.s("description"))
        }
        "duzenleme" -> SectionCard("Düzenleme teklifi — @${s.s("oneren")}") {
            Text("Gerekçe: ${s.s("gerekce")}")
            Spacer(Modifier.height(8.dp))
            Text("Mevcut", fontWeight = FontWeight.SemiBold, color = No)
            Text("${s.o("eski")?.s("title")}\n\n${s.o("eski")?.s("description")}", style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(8.dp))
            Text("Önerilen", fontWeight = FontWeight.SemiBold, color = Yes)
            Text("${s.o("yeni")?.s("title")}\n\n${s.o("yeni")?.s("description")}", style = MaterialTheme.typography.bodySmall)
            TextButton(onClick = { openLink(nav, s.s("link")) }) { Text("Konuya git →") }
        }
        "silme" -> SectionCard("Gizleme talebi · ${s.s("gerekceEtiketi")}") {
            Muted("@${s.s("talepEden")}, @${s.s("yazar")} kullanıcısının mesajı için talepte bulundu.")
            Spacer(Modifier.height(8.dp))
            Notice(if (s.b("mesajGizli")) "Mesaj gizlendi; kaydı ve özeti korunuyor." else s.s("mesaj"))
            Spacer(Modifier.height(6.dp))
            Text("Açıklama: ${s.s("aciklama")}")
            s.o("yzDegerlendirmesi")?.let { yz ->
                Spacer(Modifier.height(8.dp))
                Notice(
                    "Yapay zeka tavsiyesi (${yz.s("_kaynak")}): " + (if (yz.b("uygun")) "talep gerekçesiyle uyumlu belirti var. " else "gerekçeye dair belirgin işaret yok. ") +
                        (if (yz.b("gorusAyriligiRiski")) "Görüş ayrılığı riski: mesaj yalnızca farklı bir görüş ifade ediyor olabilir. " else "") + yz.s("aciklama"),
                    NoticeKind.Purple,
                )
            }
            Spacer(Modifier.height(8.dp))
            Muted("Madde 8: gizleme için 2/3 nitelikli çoğunluk gerekir; görüş ayrılığı gerekçe olamaz.")
            TextButton(onClick = { openLink(nav, s.s("link")) }) { Text("Tartışmaya git →") }
        }
        "bilirkisi" -> SectionCard("${s.s("alanEtiketi")} bilirkişiliği başvurusu") {
            Text("Başvuran: @${s.s("basvuran")}", color = MaterialTheme.colorScheme.primary, modifier = Modifier.clickable { nav.navigate("user/${s.s("user_id")}") })
            Spacer(Modifier.height(6.dp))
            Text("Yeterlilik: ${s.s("yeterlilik")}")
        }
        "itiraz" -> SectionCard("İtiraz üzerine yeniden oylama") {
            Text("Asıl karar: ${s.o("asilOylama")?.s("title")}", color = MaterialTheme.colorScheme.primary, modifier = Modifier.clickable { openLink(nav, s.s("link")) })
            s.o("itiraz")?.let {
                Spacer(Modifier.height(6.dp))
                Text("@${it.s("nickname")} itirazı: ${it.s("reason")}")
                Muted("Bilirkişi @${it.s("reviewer", "—")} notu: ${it.s("review_note", "—")}")
            }
            Spacer(Modifier.height(6.dp))
            Notice("Bu oylamada 2/3 sağlanamazsa asıl karar bozulur.")
        }
    }
}

@Composable
fun PollDetailScreen(id: Int) {
    val app = LocalApp.current
    val nav = LocalNav.current
    val toast = rememberToast()
    var dialog by remember { mutableStateOf<String?>(null) }
    var reviewId by remember { mutableStateOf(0) }
    ScreenScaffold("Oylama", back = true) { mod ->
        Loadable(key = id, load = { app.api.obj("/polls/$id") }) { p, reload ->
            Column(mod.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Pill(p.s("turEtiketi"), filled = false)
                    StatusBadge(p.s("status"))
                    if (p.i("minority_alert") == 1) Pill("Azınlık uyarısı", Purple)
                }
                Text(p.s("title"), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                p.o("subject")?.let { SubjectCard(it) }
                SectionCard("Oy durumu") {
                    Muted("Eşik: ${thresholdText(p)}")
                    Spacer(Modifier.height(6.dp))
                    p.o("tally")?.let { TallyBar(it); Spacer(Modifier.height(6.dp)); ParticipationMeter(it, p.d("quorum") ?: 0.3) }
                    if (p.s("reason").isNotBlank()) {
                        Spacer(Modifier.height(8.dp))
                        Notice(p.s("reason"), if (p.s("outcome") == "kabul") NoticeKind.Ok else NoticeKind.Bad)
                    }
                    Spacer(Modifier.height(10.dp))
                    VoteButtons(p) { reload() }
                }
                p.o("result")?.o("analiz")?.let { a -> SectionCard("Azınlık analizi (insan grafı)") { AnalysisView(a) } }
                SectionCard("Azınlık şerhleri", action = {
                    if (p.b("canReport")) OutlinedButton(onClick = { dialog = "report" }) { Text("Şerh düş") }
                }) {
                    Muted("Kaybeden tarafta oy kullananlar karara kalıcı şerh düşebilir (Madde 14).")
                    val reports = p.a("minorityReports").objects()
                    if (reports.isEmpty()) Muted("Şerh yok.")
                    reports.forEach { r ->
                        Spacer(Modifier.height(8.dp))
                        Text("@${r.s("nickname")} · ${CHOICE_LABEL[r.s("side")]} tarafı · ${relTime(r.l("created_at"))}", style = MaterialTheme.typography.labelMedium)
                        Text(r.s("content"))
                    }
                }
                SectionCard("İtirazlar", action = {
                    if (p.b("canAppeal")) OutlinedButton(onClick = { dialog = "appeal" }) { Text("İtiraz et") }
                }) {
                    Muted("Bilirkişi kararı onar ya da 2/3 eşikle yeniden oylamaya gönderir; tek başına bozamaz.")
                    val appeals = p.a("appeals").objects()
                    if (appeals.isEmpty()) Muted("İtiraz yok.")
                    appeals.forEach { a ->
                        Spacer(Modifier.height(8.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("@${a.s("nickname")} · ${relTime(a.l("created_at"))}", style = MaterialTheme.typography.labelMedium, modifier = Modifier.weight(1f))
                            StatusBadge(a.s("status"))
                        }
                        Text(a.s("reason"))
                        if (a.s("review_note").isNotBlank()) Muted("İnceleme (@${a.s("reviewer_nickname", "sistem")}): ${a.s("review_note")}")
                        else Muted("İnceleme son tarihi: ${fmtDate(a.l("review_deadline"))}")
                        if (a.i("revote_poll_id") > 0) TextButton(onClick = { nav.navigate("poll/${a.i("revote_poll_id")}") }) { Text("Yeniden oylamaya git →") }
                        if (p.b("canReview") && a.s("status") == "inceleniyor") {
                            OutlinedButton(onClick = { reviewId = a.i("id"); dialog = "review" }) { Text("Bilirkişi olarak incele") }
                        }
                    }
                }
                SectionCard("Zaman çizelgesi") {
                    KeyValue("Açılış", fmtDate(p.l("opens_at")))
                    KeyValue("Asgari müzakere", fmtDate(p.l("early_after")))
                    KeyValue("Kapanış", fmtDate(p.l("closes_at")))
                    if (p.l("decided_at") > 0) KeyValue("Karar", fmtDate(p.l("decided_at")))
                    if (p.l("appeal_until") > 0) KeyValue("İtiraz sonu", fmtDate(p.l("appeal_until")))
                    KeyValue("Seçmen kütüğü", "${p.i("eligible")} üye (dondurulmuş)")
                }
                p.o("defterSayimi")?.let { d ->
                    val t = p.o("tally")
                    val match = t != null && t.i("evet") == d.i("evet") && t.i("hayir") == d.i("hayir") && t.i("cekimser") == d.i("cekimser")
                    SectionCard("Defterden bağımsız sayım") {
                        Muted("Oylar oylamaya özgü takma kimliklerle deftere yazılır; bu sayım yalnızca defter bloklarından yapılır.")
                        Spacer(Modifier.height(6.dp))
                        KeyValue("Evet / Hayır / Çekimser", "${d.i("evet")} / ${d.i("hayir")} / ${d.i("cekimser")}")
                        KeyValue("Oy bloğu", d.i("blokSayisi").toString())
                        Spacer(Modifier.height(6.dp))
                        Notice(if (match) "✓ Veritabanı sayımıyla birebir uyumlu" else "✗ Veritabanı ile defter uyuşmuyor!", if (match) NoticeKind.Ok else NoticeKind.Bad)
                    }
                }
                Spacer(Modifier.height(16.dp))
            }

            var text by remember(dialog) { mutableStateOf("") }
            var decision by remember(dialog) { mutableStateOf("onayla") }
            when (dialog) {
                "report" -> FormDialog("Azınlık şerhi", "Kaydet", { dialog = null }, {
                    app.api.post("/polls/$id/minority-report", JSONObject().put("content", text)); toast("Şerhiniz kaydedildi"); reload()
                }) {
                    OutlinedTextField(text, { text = it }, label = { Text("Şerhiniz (en az 20 karakter)") }, minLines = 4, modifier = Modifier.fillMaxWidth())
                }
                "appeal" -> FormDialog("Karara itiraz", "İtiraz et", { dialog = null }, {
                    app.api.post("/polls/$id/appeal", JSONObject().put("reason", text)); toast("İtirazınız kaydedildi; karar askıya alındı"); reload()
                }) {
                    Muted("İtiraz, kararı bilirkişi incelemesine kadar askıya alır.")
                    OutlinedTextField(text, { text = it }, label = { Text("Gerekçe (en az 20 karakter)") }, minLines = 4, modifier = Modifier.fillMaxWidth())
                }
                "review" -> FormDialog("İtiraz incelemesi", "Kaydet", { dialog = null }, {
                    app.api.post("/appeals/$reviewId/review", JSONObject().put("decision", decision).put("note", text)); toast("İnceleme kaydedildi"); reload()
                }) {
                    listOf("onayla" to "Kararı onayla", "yeniden_oylama" to "2/3 eşikle yeniden oylamaya gönder").forEach { (k, label) ->
                        Row(Modifier.fillMaxWidth().selectable(decision == k) { decision = k }, verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(selected = decision == k, onClick = { decision = k })
                            Text(label)
                        }
                    }
                    OutlinedTextField(text, { text = it }, label = { Text("İnceleme notu") }, minLines = 3, modifier = Modifier.fillMaxWidth())
                    Muted("Bilirkişi kararı tek başına bozamaz.")
                }
            }
        }
    }
}
