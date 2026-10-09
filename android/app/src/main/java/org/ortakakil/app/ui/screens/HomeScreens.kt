package org.ortakakil.app.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.ortakakil.app.data.ApiException
import org.ortakakil.app.data.a
import org.ortakakil.app.data.i
import org.ortakakil.app.data.l
import org.ortakakil.app.data.o
import org.ortakakil.app.data.objects
import org.ortakakil.app.data.s
import org.ortakakil.app.ui.EmptyText
import org.ortakakil.app.ui.LocalApp
import org.ortakakil.app.ui.LocalNav
import org.ortakakil.app.ui.Loadable
import org.ortakakil.app.ui.Muted
import org.ortakakil.app.ui.Notice
import org.ortakakil.app.ui.NoticeKind
import org.ortakakil.app.ui.ScreenScaffold
import org.ortakakil.app.ui.SectionCard
import org.ortakakil.app.ui.StatusBadge
import org.ortakakil.app.ui.openLink
import org.ortakakil.app.ui.relTime

// ====================================================================== akış
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen() {
    val app = LocalApp.current
    val nav = LocalNav.current
    ScreenScaffold(
        "Ortak Akıl",
        actions = {
            if (app.me != null) {
                IconButton(onClick = { nav.navigate("notifications") }) {
                    BadgedBox(badge = { if (app.unread > 0) Badge { Text(if (app.unread > 9) "9+" else app.unread.toString()) } }) {
                        Icon(Icons.Filled.Notifications, "Bildirimler")
                    }
                }
                IconButton(onClick = { nav.navigate("profile") }) { Icon(Icons.Filled.AccountCircle, "Hesabım") }
            } else {
                androidx.compose.material3.TextButton(onClick = { nav.navigate("login") }) { Text("Giriş") }
            }
        },
    ) { mod ->
        Loadable(key = app.me?.s("id"), load = { app.api.obj("/feed") }) { f, reload ->
            var refreshing by remember { mutableStateOf(false) }
            PullToRefreshBox(isRefreshing = refreshing, onRefresh = { refreshing = true; reload(); refreshing = false }, modifier = mod) {
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    item {
                        SectionCard {
                            Text("Ortak akılla karar verelim.", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(6.dp))
                            Muted("Herkes konu açabilir; konular çoğunluğun kabulüyle gündeme girer. Tartışmalar silinmez, her işlem dağıtık deftere işlenir. Çoğunluğun azınlığı ezmemesi için itiraz, şerh, bilirkişi incelemesi ve topluluk analizi devrede.")
                            if (app.me == null) {
                                Spacer(Modifier.height(10.dp))
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Button(onClick = { nav.navigate("register") }) { Text("Kayıt ol") }
                                    OutlinedButton(onClick = { nav.navigate("login") }) { Text("Giriş yap") }
                                }
                            }
                        }
                    }
                    item { StatsGrid(f.o("istatistik")) }
                    item { Text("Açık oylamalar", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
                    val polls = f.a("acikOylamalar").objects()
                    if (polls.isEmpty()) item { EmptyText("Şu an açık oylama yok.") }
                    items(polls, key = { "p" + it.i("id") }) { PollListItem(it) { reload() } }
                    val appeals = f.a("itirazlar").objects()
                    if (appeals.isNotEmpty()) item {
                        SectionCard("İtirazlar") {
                            appeals.forEach { a ->
                                Row(Modifier.fillMaxWidth().clickable { nav.navigate("poll/${a.i("poll_id")}") }.padding(vertical = 6.dp)) {
                                    Column(Modifier.weight(1f)) {
                                        Text(a.s("poll_title"), fontWeight = FontWeight.SemiBold)
                                        Muted("@${a.s("nickname")} · ${relTime(a.l("created_at"))}")
                                    }
                                    StatusBadge(a.s("status"))
                                }
                            }
                        }
                    }
                    item {
                        SectionCard("Son kabul edilen konular") {
                            val list = f.a("sonKabuller").objects()
                            if (list.isEmpty()) Muted("Henüz yok.")
                            list.forEach { t ->
                                Column(Modifier.fillMaxWidth().clickable { nav.navigate("topic/${t.i("id")}") }.padding(vertical = 6.dp)) {
                                    Text(t.s("title"), fontWeight = FontWeight.SemiBold)
                                    Muted("${t.s("domainLabel")} · ${relTime(t.l("decided_at").takeIf { it > 0 } ?: t.l("created_at"))}")
                                }
                            }
                        }
                    }
                    item {
                        SectionCard("Son mesajlar") {
                            f.a("sonMesajlar").objects().forEach { m ->
                                Column(Modifier.fillMaxWidth().clickable { nav.navigate("topic/${m.i("topic_id")}") }.padding(vertical = 6.dp)) {
                                    Muted("@${m.s("nickname")} · ${m.s("topic_title")} · ${relTime(m.l("created_at"))}")
                                    Text(if (m.i("hidden") == 1) "[oylamayla gizlendi]" else m.s("content"), maxLines = 3)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StatsGrid(s: org.json.JSONObject?) {
    if (s == null) return
    val nav = LocalNav.current
    val cells = listOf(
        Triple(s.i("uye").toString(), "Üye", "graph"),
        Triple("${s.i("kabulKonu")}/${s.i("konu")}", "Kabul edilen konu", "topics"),
        Triple(s.i("acikOylama").toString(), "Açık oylama", "polls"),
        Triple(s.i("mesaj").toString(), "Silinmez mesaj", "topics"),
        Triple(s.i("bilirkisi").toString(), "Bilirkişi", "experts"),
        Triple(s.i("defterBlok").toString(), "Defter bloğu", "ledger"),
    )
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        cells.chunked(3).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { (v, l, route) ->
                    SectionCard(modifier = Modifier.weight(1f).clickable { nav.navigate(route) }) {
                        Text(v, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        Muted(l, maxLines = 1)
                    }
                }
            }
        }
    }
}

// ====================================================================== bildirimler
@Composable
fun NotificationsScreen() {
    val app = LocalApp.current
    val nav = LocalNav.current
    ScreenScaffold("Bildirimler", back = true) { mod ->
        Loadable(key = Unit, load = { app.api.obj("/me/notifications") }) { n, _ ->
            LaunchedEffect(Unit) {
                if (n.i("okunmamis") > 0) {
                    try {
                        app.api.post("/me/notifications/read")
                        app.unread = 0
                    } catch (_: ApiException) {
                    }
                }
            }
            val list = n.a("liste").objects()
            LazyColumn(mod.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (list.isEmpty()) item { EmptyText("Bildirim yok.") }
                items(list, key = { it.i("id") }) { x ->
                    SectionCard(modifier = Modifier.clickable { openLink(nav, x.s("link")) }) {
                        Text(x.s("text"), fontWeight = if (x.i("is_read") == 0) FontWeight.Bold else FontWeight.Normal)
                        Muted(relTime(x.l("created_at")))
                    }
                }
            }
        }
    }
}

// ====================================================================== daha fazla
@Composable
fun MoreScreen() {
    val app = LocalApp.current
    val nav = LocalNav.current
    ScreenScaffold("Daha fazla") { mod ->
        Column(mod.fillMaxSize().verticalScroll(rememberScrollState())) {
            app.me?.let {
                ListItem(
                    headlineContent = { Text("@${it.s("nickname")}") },
                    supportingContent = { Text("${it.s("first_name")} ${it.s("last_name")} · hesabım") },
                    leadingContent = { Icon(Icons.Filled.AccountCircle, null) },
                    modifier = Modifier.clickable { nav.navigate("profile") },
                )
                HorizontalDivider()
            }
            MoreItem(Icons.Filled.Lock, "Dağıtık defter", "Zincir, imzalar ve tanık düğümler") { nav.navigate("ledger") }
            MoreItem(Icons.Filled.CheckCircle, "Yönetmelik & denetim", "Ontoloji ve madde bazlı denetim") { nav.navigate("regulation") }
            MoreItem(Icons.Filled.Star, "Bilirkişiler", "Uzmanlar, başvurular, gelen kutusu") { nav.navigate("experts") }
            MoreItem(Icons.Filled.Info, "Nasıl çalışır?", "Gereksinimler ve azınlık koruması") { nav.navigate("about") }
            MoreItem(Icons.Filled.Settings, "Sunucu ayarları", app.session.serverUrl) { nav.navigate("settings") }
            HorizontalDivider()
            if (app.me != null) MoreItem(Icons.AutoMirrored.Filled.ExitToApp, "Çıkış yap", null) { app.logout() }
            else MoreItem(Icons.Filled.AccountCircle, "Giriş yap / Kayıt ol", null) { nav.navigate("login") }
            Spacer(Modifier.height(12.dp))
            Muted("Yapay zeka: ${app.meta?.o("yapayZeka")?.s("model")}", Modifier.padding(horizontal = 16.dp))
        }
    }
}

@Composable
private fun MoreItem(icon: ImageVector, title: String, subtitle: String?, onClick: () -> Unit) {
    ListItem(
        headlineContent = { Text(title) },
        supportingContent = subtitle?.let { { Text(it) } },
        leadingContent = { Icon(icon, null) },
        modifier = Modifier.clickable(onClick = onClick),
    )
}

// ====================================================================== hakkında
@Composable
fun AboutScreen() {
    val app = LocalApp.current
    val k = app.meta?.o("kurallar")
    fun h(m: Int) = if (m >= 60) "${m / 60} saat" else "$m dakika"
    val reqs = listOf(
        "Herkes konu açabilir + düzenleme teklifi" to "Kabul edilmiş konulara düzenleme teklifi verilir; kabul edilen teklif yeni sürüm olur.",
        "Konu kabulü için çoğunluk" to "Oy kullananların yarıdan fazlası ve seçmen kütüğünün en az %${((k?.optDouble("yeterSayi") ?: 0.3) * 100).toInt()}'i katılmalı.",
        "Kimlik bilgileri + takma ad" to "Ad, soyad, doğum tarihi, e-posta, telefon ve adres zorunlu; kamuya yalnızca takma ad görünür.",
        "Konular ve alt konular oylanır" to "Konu, alt konu, düzenleme, gizleme ve bilirkişilik başvurusu birer oylamadır.",
        "Yönetmelik → denetim (ontoloji)" to "Yönetmelik maddeleri ontolojiyle modellenir; her madde makinece denetlenir.",
        "Silinmeyen tartışma" to "Mesajlar silinemez/değiştirilemez; gizleme için 2/3 oylama gerekir ve kaydı kalır.",
        "Dağıtık defter" to "SHA-256 zincir + Ed25519 imza; tanık düğümler geçmişin değiştirilmesini yakalar.",
        "Bilirkişi ve yapay zeka" to "Bilirkişiler oylamayla onaylanır; yapay zeka özet, sınıflandırma ve moderasyon tavsiyesi verir.",
        "İnsan grafı" to "Takip, güven, oy benzerliği ve yanıtlaşmalardan topluluklar çıkarılır.",
    )
    val minority = listOf(
        "Nitelikli çoğunluk" to "Gizleme, yönetmelik değişikliği ve itiraz sonrası yeniden oylama 2/3 ister.",
        "Anayasal korumalar" to "Görüş ayrılığı gizleme gerekçesi değildir; bir üyenin mesajlarına aynı anda en fazla 2 gizleme talebi açılabilir.",
        "Asgari müzakere süresi" to "Herkes oy vermedikçe hiçbir oylama ilk ${h(k?.optInt("asgariMuzakereDakika") ?: 1440)} içinde sonuçlanmaz.",
        "Topluluk analizi" to "Karar bir topluluğu dışlıyorsa azınlık uyarısı üretilir.",
        "İtiraz ve bilirkişi" to "≥1/3 karşı oy ya da azınlık uyarısında ${h(k?.optInt("itirazDakika") ?: 1440)} itiraz süresi; bilirkişi onar ya da 2/3 ile yeniden oylatır, tek başına bozamaz.",
        "Azınlık şerhi" to "Kaybeden taraf karara kalıcı şerh düşer.",
        "Seçmen kütüğü ve gizli oy" to "Oylama açıldıktan sonra açılan hesaplar oy kullanamaz; oylar deftere takma kimlikle yazılır.",
    )
    ScreenScaffold("Nasıl çalışır?", back = true) { mod ->
        Column(mod.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            SectionCard("Gereksinimler → özellikler") {
                reqs.forEachIndexed { i, (t, d) ->
                    if (i > 0) HorizontalDivider(Modifier.padding(vertical = 6.dp))
                    Text("${i + 1}. $t", fontWeight = FontWeight.SemiBold)
                    Muted(d)
                }
            }
            SectionCard("Çoğunluk azınlığı nasıl tüketemez?") {
                minority.forEachIndexed { i, (t, d) ->
                    if (i > 0) HorizontalDivider(Modifier.padding(vertical = 6.dp))
                    Row {
                        Text("✓", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.width(8.dp))
                        Column { Text(t, fontWeight = FontWeight.SemiBold); Muted(d) }
                    }
                }
            }
            Notice("Mobil uygulama ve web sitesi aynı REST API'yi ve aynı veritabanını kullanır.", NoticeKind.Info)
        }
    }
}
