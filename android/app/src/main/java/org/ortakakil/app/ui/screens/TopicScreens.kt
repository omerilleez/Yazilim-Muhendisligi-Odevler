package org.ortakakil.app.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.exclude
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import org.ortakakil.app.data.Api
import org.ortakakil.app.data.ApiException
import org.ortakakil.app.data.a
import org.ortakakil.app.data.b
import org.ortakakil.app.data.d
import org.ortakakil.app.data.i
import org.ortakakil.app.data.ints
import org.ortakakil.app.data.l
import org.ortakakil.app.data.o
import org.ortakakil.app.data.objects
import org.ortakakil.app.data.s
import org.ortakakil.app.data.strings
import org.ortakakil.app.ui.Avatar
import org.ortakakil.app.ui.EmptyText
import org.ortakakil.app.ui.FormDialog
import org.ortakakil.app.ui.LocalApp
import org.ortakakil.app.ui.LocalNav
import org.ortakakil.app.ui.Loadable
import org.ortakakil.app.ui.Muted
import org.ortakakil.app.ui.Notice
import org.ortakakil.app.ui.NoticeKind
import org.ortakakil.app.ui.Pill
import org.ortakakil.app.ui.STANCE_LABEL
import org.ortakakil.app.ui.ScreenScaffold
import org.ortakakil.app.ui.SectionCard
import org.ortakakil.app.ui.StatusBadge
import org.ortakakil.app.ui.TallyBar
import org.ortakakil.app.ui.relTime
import org.ortakakil.app.ui.rememberToast
import org.ortakakil.app.ui.statusColor
import org.ortakakil.app.ui.theme.Accent
import org.ortakakil.app.ui.theme.Purple

private val TOPIC_STATUSES = listOf("" to "Tümü", "oylamada" to "Oylamada", "kabul" to "Kabul", "itiraz_suresi" to "İtiraz süresi", "askida" to "Askıda", "red" to "Red")

@Composable
fun TopicRow(t: JSONObject) {
    val nav = LocalNav.current
    SectionCard(modifier = Modifier.clickable { nav.navigate("topic/${t.i("id")}") }) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            StatusBadge(t.s("status"))
            Pill(t.s("domainLabel"), filled = false)
            if (t.s("kind") == "yonetmelik") Pill("Yönetmelik", Purple)
            if (t.i("parent_id") > 0) Pill("Alt konu", filled = false)
        }
        Spacer(Modifier.height(8.dp))
        Text(t.s("title"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(4.dp))
        Muted("@${t.s("nickname")} · ${relTime(t.l("created_at"))} · ${t.i("mesajSayisi")} mesaj" + (if (t.i("altKonuSayisi") > 0) " · ${t.i("altKonuSayisi")} alt konu" else "") + (if (t.i("version") > 1) " · sürüm ${t.i("version")}" else ""))
        if (t.s("status") == "oylamada") t.o("tally")?.let { Spacer(Modifier.height(6.dp)); TallyBar(it, compact = true) }
    }
}

// ====================================================================== konu listesi
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TopicsScreen() {
    val app = LocalApp.current
    val nav = LocalNav.current
    var query by rememberSaveable { mutableStateOf("") }
    var submitted by rememberSaveable { mutableStateOf("") }
    var status by rememberSaveable { mutableStateOf("") }
    var domain by rememberSaveable { mutableStateOf("") }
    ScreenScaffold(
        "Konular",
        floatingActionButton = {
            ExtendedFloatingActionButton(onClick = { if (app.me == null) nav.navigate("login") else nav.navigate("newTopic") }, icon = { Icon(Icons.Filled.Add, null) }, text = { Text("Yeni konu") })
        },
    ) { mod ->
        Column(mod.fillMaxSize()) {
            OutlinedTextField(
                query, { query = it },
                placeholder = { Text("Konularda ara…") },
                singleLine = true,
                trailingIcon = { IconButton(onClick = { submitted = query }) { Icon(Icons.Filled.Search, "Ara") } },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = androidx.compose.foundation.text.KeyboardActions(onSearch = { submitted = query }),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
            )
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                TOPIC_STATUSES.forEach { (k, label) -> FilterChip(selected = status == k, onClick = { status = k }, label = { Text(label) }) }
            }
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(selected = domain.isEmpty(), onClick = { domain = "" }, label = { Text("Tüm alanlar") })
                app.domains().forEach { (k, label) -> FilterChip(selected = domain == k, onClick = { domain = k }, label = { Text(label) }) }
            }
            Loadable(key = Triple(submitted, status, domain), load = {
                app.api.arr("/topics?status=$status&domain=$domain&q=${Api.enc(submitted)}")
            }) { list, reload ->
                var refreshing by remember { mutableStateOf(false) }
                PullToRefreshBox(isRefreshing = refreshing, onRefresh = { refreshing = true; reload(); refreshing = false }) {
                    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp, 6.dp, 12.dp, 90.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        val items = list.objects()
                        if (items.isEmpty()) item { EmptyText("Sonuç bulunamadı.") }
                        items(items, key = { it.i("id") }) { TopicRow(it) }
                    }
                }
            }
        }
    }
}

// ====================================================================== yeni konu
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun NewTopicScreen(parentId: Int) {
    val app = LocalApp.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val toast = rememberToast()
    if (app.me == null) {
        ScreenScaffold("Yeni konu", back = true) { mod ->
            Column(mod.padding(16.dp)) {
                Notice("Konu önermek için giriş yapmalısınız.")
                Spacer(Modifier.height(10.dp))
                Button(onClick = { nav.navigate("login") }) { Text("Giriş yap") }
            }
        }
        return
    }
    var title by rememberSaveable { mutableStateOf("") }
    var description by rememberSaveable { mutableStateOf("") }
    var domain by rememberSaveable { mutableStateOf("") }
    var kind by rememberSaveable { mutableStateOf("genel") }
    var articles by remember { mutableStateOf(setOf<Int>()) }
    var suggestion by remember { mutableStateOf<JSONObject?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var parent by remember { mutableStateOf<JSONObject?>(null) }
    var domainMenu by remember { mutableStateOf(false) }

    androidx.compose.runtime.LaunchedEffect(parentId) {
        if (parentId > 0) {
            try {
                val p = app.api.obj("/topics/$parentId")
                parent = p
                if (domain.isEmpty()) domain = p.s("domain")
                kind = p.s("kind", "genel")
            } catch (_: ApiException) {
            }
        }
    }

    ScreenScaffold(if (parentId > 0) "Alt konu öner" else "Yeni konu öner", back = true) { mod ->
        Column(mod.fillMaxSize().verticalScroll(rememberScrollState()).padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            parent?.let { Notice("Üst konu: ${it.s("title")}") }
            Muted("Öneriniz oylamaya girer; kabul edilirse tartışma alanı açılır. Yönetmelik konuları 2/3 nitelikli çoğunluk gerektirir.")
            OutlinedTextField(title, { title = it }, label = { Text("Başlık") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(description, { description = it }, label = { Text("Açıklama (en az 20 karakter)") }, minLines = 5, modifier = Modifier.fillMaxWidth())
            Column {
                Text("Alan (ontoloji)", style = MaterialTheme.typography.labelLarge)
                OutlinedButton(onClick = { domainMenu = true }, modifier = Modifier.fillMaxWidth()) {
                    Text(if (domain.isEmpty()) "Alan seçin" else app.domainLabel(domain))
                }
                DropdownMenu(expanded = domainMenu, onDismissRequest = { domainMenu = false }) {
                    app.domains().forEach { (k, label) -> DropdownMenuItem(text = { Text(label) }, onClick = { domain = k; domainMenu = false }) }
                }
            }
            Column {
                Text("Tür", style = MaterialTheme.typography.labelLarge)
                listOf("genel" to "Genel konu (salt çoğunluk)", "yonetmelik" to "Yönetmelik konusu (2/3)").forEach { (k, label) ->
                    Row(Modifier.fillMaxWidth().selectable(kind == k) { kind = k }, verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = kind == k, onClick = { kind = k })
                        Text(label)
                    }
                }
            }
            if (articles.isNotEmpty()) {
                Text("İlgili yönetmelik maddeleri", style = MaterialTheme.typography.labelLarge)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    articles.sorted().forEach { Pill("Madde $it", Accent) }
                }
            }
            OutlinedButton(
                enabled = !busy,
                onClick = {
                    scope.launch {
                        busy = true
                        error = null
                        try {
                            val r = app.api.post("/ai/classify", JSONObject().put("title", title).put("description", description))
                            suggestion = r
                        } catch (e: ApiException) {
                            error = e.message
                        }
                        busy = false
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("✨ Yapay zeka ile sınıflandır") }
            suggestion?.let { r ->
                SectionCard("Yapay zeka önerisi") {
                    Muted(r.s("_kaynak"))
                    Spacer(Modifier.height(6.dp))
                    Text("Alan: ${r.s("domainLabel")}")
                    Text("Tür: " + if (r.s("kind") == "yonetmelik") "Yönetmelik konusu" else "Genel konu")
                    Text("Maddeler: " + r.a("articles").ints().joinToString { "Madde $it" })
                    Text("Etiketler: " + r.a("tags").strings().joinToString { "#$it" })
                    Muted(r.s("gerekce"))
                    val similar = r.a("benzerKonular").objects()
                    if (similar.isNotEmpty()) {
                        Spacer(Modifier.height(6.dp))
                        Notice("Benzer konular var: " + similar.joinToString { "${it.s("title")} (%${((it.d("benzerlik") ?: 0.0) * 100).toInt()})" }, NoticeKind.Warn)
                    }
                    if (r.s("_uyari").isNotBlank()) Notice(r.s("_uyari"), NoticeKind.Warn)
                    TextButton(onClick = {
                        domain = r.s("domain")
                        kind = r.s("kind")
                        articles = r.a("articles").ints().toSet()
                        toast("Öneri uygulandı")
                    }) { Text("Öneriyi uygula") }
                }
            }
            error?.let { Notice(it, NoticeKind.Bad) }
            Button(
                enabled = !busy,
                onClick = {
                    scope.launch {
                        busy = true
                        error = null
                        try {
                            val body = JSONObject().put("title", title).put("description", description).put("domain", domain).put("kind", kind)
                                .put("articles", JSONArray(articles.toList()))
                            if (parentId > 0) body.put("parent_id", parentId)
                            val t = app.api.post("/topics", body)
                            toast("Konu oylamaya sunuldu ve deftere işlendi")
                            nav.popBackStack()
                            nav.navigate("topic/${t.i("id")}")
                        } catch (e: ApiException) {
                            error = e.message
                        }
                        busy = false
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Oylamaya sun") }
            Spacer(Modifier.height(24.dp))
        }
    }
}

// ====================================================================== konu ayrıntısı
private val TOPIC_TABS = listOf("Tartışma", "Alt konular", "Teklifler", "Bilirkişi", "Denetim")

@Composable
fun TopicDetailScreen(id: Int) {
    val app = LocalApp.current
    var tab by rememberSaveable { mutableStateOf(0) }
    var replyTo by remember { mutableStateOf<JSONObject?>(null) }
    var draft by rememberSaveable { mutableStateOf("") }
    var reloadKey by remember { mutableStateOf(0) }
    val scope = rememberCoroutineScope()
    val toast = rememberToast()
    var sending by remember { mutableStateOf(false) }

    ScreenScaffold(
        "Konu",
        back = true,
        bottomBar = {
            if (tab == 0 && app.me != null) {
                Surface(tonalElevation = 3.dp, modifier = Modifier.windowInsetsPadding(WindowInsets.ime.exclude(WindowInsets.navigationBars))) {
                    Column(Modifier.padding(horizontal = 10.dp, vertical = 6.dp)) {
                        replyTo?.let {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Muted("↪ @${it.s("nickname")} #${it.i("id")} mesajına yanıt", Modifier.weight(1f))
                                TextButton(onClick = { replyTo = null }) { Text("Vazgeç") }
                            }
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            OutlinedTextField(draft, { draft = it }, placeholder = { Text("Görüşünüzü yazın…") }, maxLines = 4, modifier = Modifier.weight(1f))
                            IconButton(enabled = !sending && draft.isNotBlank(), onClick = {
                                scope.launch {
                                    sending = true
                                    try {
                                        val body = JSONObject().put("content", draft)
                                        replyTo?.let { body.put("reply_to", it.i("id")) }
                                        app.api.post("/topics/$id/messages", body)
                                        draft = ""
                                        replyTo = null
                                        toast("Mesajınız eklendi; özeti deftere işlendi")
                                        reloadKey++
                                    } catch (e: ApiException) {
                                        toast(e.message ?: "Hata")
                                    }
                                    sending = false
                                }
                            }) { Icon(Icons.AutoMirrored.Filled.Send, "Gönder") }
                        }
                        Muted("Mesajlar gönderildikten sonra silinemez ve değiştirilemez (Madde 7).")
                    }
                }
            }
        },
    ) { mod ->
        Loadable(key = id to reloadKey, load = {
            JSONObject().put("topic", app.api.obj("/topics/$id")).put("messages", app.api.arr("/topics/$id/messages"))
        }) { data, reload ->
            val t = data.getJSONObject("topic")
            val messages = data.getJSONArray("messages").objects()
            LazyColumn(mod.fillMaxSize(), contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item { TopicHeader(t, reload) }
                t.o("poll")?.let { p -> item { PollSummaryCard(p, if (t.s("status") == "oylamada") "Kabul oylaması" else "Kabul oylaması (sonuç)") { reload() } } }
                item {
                    ScrollableTabRow(selectedTabIndex = tab, edgePadding = 0.dp) {
                        TOPIC_TABS.forEachIndexed { i, label ->
                            val count = when (i) { 0 -> messages.size; 1 -> t.a("children").length(); 2 -> t.a("proposals").length(); 3 -> t.a("expertOpinions").length(); else -> -1 }
                            Tab(selected = tab == i, onClick = { tab = i }, text = { Text(if (count >= 0) "$label ($count)" else label) })
                        }
                    }
                }
                when (tab) {
                    0 -> {
                        item { SummaryBox(id) }
                        if (messages.isEmpty()) item { EmptyText("Henüz mesaj yok. İlk görüşü siz yazın.") }
                        val byId = messages.associateBy { it.i("id") }
                        items(messages, key = { it.i("id") }) { m -> MessageItem(m, byId[m.i("reply_to")], onReply = { replyTo = m }, onChanged = reload) }
                    }
                    1 -> item { SubtopicsTab(t) }
                    2 -> item { ProposalsTab(t) }
                    3 -> item { ExpertTab(t, reload) }
                    else -> item { AuditTab(t) }
                }
                item { Spacer(Modifier.height(20.dp)) }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TopicHeader(t: JSONObject, reload: () -> Unit) {
    val nav = LocalNav.current
    val app = LocalApp.current
    var proposing by remember { mutableStateOf(false) }
    SectionCard {
        val ancestors = t.a("ancestors").objects()
        if (ancestors.isNotEmpty()) {
            Muted(ancestors.joinToString(" › ") { it.s("title") } + " ›")
            Spacer(Modifier.height(4.dp))
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            StatusBadge(t.s("status"))
            Pill(t.s("domainLabel"), filled = false)
            if (t.s("kind") == "yonetmelik") Pill("Yönetmelik · 2/3", Purple)
            Pill("Sürüm ${t.i("version")}", filled = false)
        }
        Spacer(Modifier.height(8.dp))
        Text(t.s("title"), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Muted("@${t.o("creator")?.s("nickname")} önerdi · ${relTime(t.l("created_at"))}" + if (t.l("decided_at") > 0) " · karar ${relTime(t.l("decided_at"))}" else "")
        Spacer(Modifier.height(8.dp))
        Text(t.s("description"))
        Spacer(Modifier.height(8.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            t.a("articleDetails").objects().forEach { a -> Pill("Madde ${a.i("no")} · ${a.s("title")}", Accent) }
            t.a("tags").strings().forEach { Pill("#$it", filled = false) }
        }
        if (t.b("canSubtopic") || t.b("canPropose")) {
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (t.b("canSubtopic")) OutlinedButton(onClick = { nav.navigate("newTopic?parent=${t.i("id")}") }) { Text("+ Alt konu") }
                if (t.b("canPropose")) OutlinedButton(onClick = { proposing = true }) { Text("✎ Düzenleme teklifi") }
            }
        }
    }
    if (proposing) {
        var newTitle by remember { mutableStateOf(t.s("title")) }
        var newDesc by remember { mutableStateOf(t.s("description")) }
        var reason by remember { mutableStateOf("") }
        FormDialog("Düzenleme teklifi", "Oylamaya sun", { proposing = false }, {
            app.api.post("/topics/${t.i("id")}/proposals", JSONObject().put("new_title", newTitle).put("new_description", newDesc).put("reason", reason))
            reload()
        }) {
            Muted("Teklifiniz oylamaya girer; kabul edilirse konunun yeni sürümü olur.")
            OutlinedTextField(newTitle, { newTitle = it }, label = { Text("Yeni başlık") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(newDesc, { newDesc = it }, label = { Text("Yeni açıklama") }, minLines = 4, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(reason, { reason = it }, label = { Text("Gerekçe") }, minLines = 2, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun SummaryBox(topicId: Int) {
    val app = LocalApp.current
    val scope = rememberCoroutineScope()
    var summary by remember { mutableStateOf<JSONObject?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    Column {
        OutlinedButton(enabled = !busy, onClick = {
            scope.launch {
                busy = true
                error = null
                try {
                    summary = app.api.post("/ai/summarize/$topicId")
                } catch (e: ApiException) {
                    error = e.message
                }
                busy = false
            }
        }, modifier = Modifier.fillMaxWidth()) { Text(if (busy) "Özetleniyor…" else "✨ Yapay zeka ile tartışmayı özetle") }
        error?.let { Notice(it, NoticeKind.Bad) }
        summary?.let { s ->
            Spacer(Modifier.height(8.dp))
            SectionCard("Yapay zeka özeti") {
                Muted("${s.s("_kaynak")} · ton: ${s.s("ton")}")
                Spacer(Modifier.height(6.dp))
                Text(s.s("ozet"))
                listOf("lehte" to "Lehte argümanlar", "aleyhte" to "Aleyhte argümanlar", "azinlikGorusleri" to "Azınlıkta kalan görüşler", "uzlasi" to "Uzlaşı noktaları", "acikSorular" to "Açık sorular").forEach { (k, label) ->
                    val list = s.a(k).strings()
                    if (list.isNotEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        Text(label, fontWeight = FontWeight.SemiBold)
                        list.forEach { Text("• $it", style = MaterialTheme.typography.bodySmall) }
                    }
                }
                if (s.s("_uyari").isNotBlank()) Notice(s.s("_uyari"), NoticeKind.Warn)
                Spacer(Modifier.height(6.dp))
                Muted("Özet tavsiye niteliğindedir; azınlık görüşlerini de temsil etmesi istenir.")
            }
        }
    }
}

@Composable
private fun MessageItem(m: JSONObject, parent: JSONObject?, onReply: () -> Unit, onChanged: () -> Unit) {
    val app = LocalApp.current
    val nav = LocalNav.current
    val toast = rememberToast()
    var deleting by remember { mutableStateOf(false) }
    SectionCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(m.s("nickname"), 32)
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) {
                Text("@${m.s("nickname")}", fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable { nav.navigate("user/${m.s("user_id")}") })
                Muted("${relTime(m.l("created_at"))} · #${m.i("id")}")
            }
            m.o("pendingDeletion")?.let { pd ->
                Pill("Gizleme oylamasında", statusColor("oylamada"))
                Spacer(Modifier.width(4.dp))
                TextButton(onClick = { nav.navigate("poll/${pd.i("poll_id")}") }) { Text("Oyla") }
            }
        }
        parent?.let { Muted("↪ @${it.s("nickname")} #${it.i("id")} mesajına yanıt") }
        Spacer(Modifier.height(6.dp))
        if (m.b("hidden")) {
            val info = m.o("hiddenInfo")
            Notice(
                "Bu mesaj topluluk oylamasıyla gizlendi (${info?.s("categoryLabel")}). " +
                    (if (m.b("wiped")) "Kişisel veri içerdiği için içeriği boşaltıldı; " else "Kaydı korunuyor; ") + "özeti: ${m.s("content_hash").take(12)}…"
            )
        } else {
            Text(m.s("content"))
            val flags = m.a("aiFlags").objects()
            if (flags.isNotEmpty()) {
                Spacer(Modifier.height(4.dp))
                Pill("YZ uyarısı: " + flags.map { it.s("kategori") }.distinct().joinToString { app.deletionCategories().toMap()[it] ?: it }, statusColor("uyari"))
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (!m.b("hidden")) {
                TextButton(onClick = { if (app.me == null) nav.navigate("login") else onReply() }) { Text("Yanıtla") }
                if (m.o("pendingDeletion") == null) TextButton(onClick = { if (app.me == null) nav.navigate("login") else deleting = true }) { Text("Gizleme talebi") }
            }
            Spacer(Modifier.weight(1f))
            Muted("⛓ ${m.s("content_hash").take(8)}")
        }
    }
    if (deleting) {
        val cats = app.deletionCategories()
        var category by remember { mutableStateOf(cats.firstOrNull()?.first ?: "") }
        var explanation by remember { mutableStateOf("") }
        FormDialog("Mesaj #${m.i("id")} için gizleme talebi", "Oylama başlat", { deleting = false }, {
            val r = app.api.post("/messages/${m.i("id")}/deletion", JSONObject().put("category", category).put("explanation", explanation))
            toast("Gizleme oylaması başlatıldı")
            onChanged()
            nav.navigate("poll/${r.i("poll_id")}")
        }) {
            Notice("Madde 8: Görüş ayrılığı gizleme gerekçesi olamaz. Talep 2/3 nitelikli çoğunluk gerektiren bir oylama başlatır; mesaj silinmez, yalnızca gizlenir.", NoticeKind.Warn)
            cats.forEach { (k, label) ->
                Row(Modifier.fillMaxWidth().selectable(category == k) { category = k }, verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(selected = category == k, onClick = { category = k })
                    Text(label)
                }
            }
            OutlinedTextField(explanation, { explanation = it }, label = { Text("Açıklama") }, minLines = 2, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun SubtopicsTab(t: JSONObject) {
    val nav = LocalNav.current
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (t.b("canSubtopic")) Button(onClick = { nav.navigate("newTopic?parent=${t.i("id")}") }, modifier = Modifier.fillMaxWidth()) { Text("+ Alt konu öner") }
        else if (t.s("status") != "kabul") Notice("Alt konu yalnızca kabul edilmiş bir konunun altında önerilebilir (Madde 5).")
        val children = t.a("children").objects()
        if (children.isEmpty()) EmptyText("Alt konu yok.")
        children.forEach { TopicRow(it) }
    }
}

@Composable
private fun ProposalsTab(t: JSONObject) {
    val nav = LocalNav.current
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Muted("Kabul edilen teklifler konunun yeni sürümü olur; eski sürümler korunur.")
        val proposals = t.a("proposals").objects()
        if (proposals.isEmpty()) EmptyText("Düzenleme teklifi yok.")
        proposals.forEach { p ->
            SectionCard(modifier = Modifier.clickable { nav.navigate("poll/${p.i("poll_id")}") }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("@${p.s("nickname")} · ${relTime(p.l("created_at"))}", style = MaterialTheme.typography.labelMedium, modifier = Modifier.weight(1f))
                    StatusBadge(p.s("status"))
                }
                Spacer(Modifier.height(4.dp))
                Text("Gerekçe: ${p.s("reason")}")
                Spacer(Modifier.height(4.dp))
                Muted("Önerilen: ${p.s("new_title")} — ${p.s("new_description")}", maxLines = 4)
                p.o("tally")?.let { Spacer(Modifier.height(6.dp)); TallyBar(it, compact = true) }
            }
        }
        if (t.b("canPropose")) Muted("Yeni teklif için yukarıdaki “Düzenleme teklifi” düğmesini kullanın.")
    }
}

@Composable
private fun ExpertTab(t: JSONObject, reload: () -> Unit) {
    val app = LocalApp.current
    val toast = rememberToast()
    var dialog by remember { mutableStateOf<String?>(null) }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Muted("Yalnızca ${t.s("domainLabel")} alanında topluluk oylamasıyla onaylanmış bilirkişiler görüş verebilir; görüşler tavsiye niteliğindedir (Madde 12).")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (app.me != null) OutlinedButton(onClick = { dialog = "ask" }) { Text("Görüş iste") }
            if (t.b("isExpert")) Button(onClick = { dialog = "give" }) { Text("Görüş yaz") }
        }
        val ops = t.a("expertOpinions").objects()
        if (ops.isEmpty()) EmptyText("Henüz bilirkişi görüşü yok.")
        ops.forEach { o ->
            SectionCard {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Avatar(o.s("nickname"), 28)
                    Text("@${o.s("nickname")}", fontWeight = FontWeight.SemiBold)
                    Pill("Bilirkişi", MaterialTheme.colorScheme.primary)
                    Pill(STANCE_LABEL[o.s("stance")] ?: o.s("stance"), statusColor(o.s("stance")))
                }
                Spacer(Modifier.height(6.dp))
                Text(o.s("content"))
                Muted(relTime(o.l("created_at")))
            }
        }
        val reqs = t.a("expertRequests").objects()
        if (reqs.isNotEmpty()) {
            Text("Görüş talepleri", fontWeight = FontWeight.SemiBold)
            reqs.forEach { r ->
                SectionCard {
                    Row { Muted("@${r.s("nickname")} · ${relTime(r.l("created_at"))}", Modifier.weight(1f)); StatusBadge(if (r.s("status") == "acik") "oylamada" else "kabul", if (r.s("status") == "acik") "Yanıt bekliyor" else "Yanıtlandı") }
                    Text(r.s("question"))
                }
            }
        }
    }
    var text by remember(dialog) { mutableStateOf("") }
    var stance by remember(dialog) { mutableStateOf("destek") }
    var requestId by remember(dialog) { mutableStateOf(0) }
    when (dialog) {
        "ask" -> FormDialog("Bilirkişi görüşü iste", "Gönder", { dialog = null }, {
            app.api.post("/topics/${t.i("id")}/expert-requests", JSONObject().put("question", text)); toast("Talep bilirkişilere iletildi"); reload()
        }) {
            Muted("${t.s("domainLabel")} alanındaki onaylı bilirkişilere bildirim gider.")
            OutlinedTextField(text, { text = it }, label = { Text("Sorunuz") }, minLines = 3, modifier = Modifier.fillMaxWidth())
        }
        "give" -> FormDialog("Bilirkişi görüşü", "Yayımla", { dialog = null }, {
            val body = JSONObject().put("stance", stance).put("content", text)
            if (requestId > 0) body.put("request_id", requestId)
            app.api.post("/topics/${t.i("id")}/expert-opinions", body); toast("Görüşünüz yayımlandı"); reload()
        }) {
            STANCE_LABEL.forEach { (k, label) ->
                Row(Modifier.fillMaxWidth().selectable(stance == k) { stance = k }, verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(selected = stance == k, onClick = { stance = k }); Text(label)
                }
            }
            val open = t.a("expertRequests").objects().filter { it.s("status") == "acik" }
            if (open.isNotEmpty()) {
                HorizontalDivider()
                Text("Yanıtlanan talep (isteğe bağlı)", style = MaterialTheme.typography.labelLarge)
                (listOf(0 to "—") + open.map { it.i("id") to "@${it.s("nickname")}: ${it.s("question").take(50)}" }).forEach { (rid, label) ->
                    Row(Modifier.fillMaxWidth().selectable(requestId == rid) { requestId = rid }, verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = requestId == rid, onClick = { requestId = rid }); Text(label, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            OutlinedTextField(text, { text = it }, label = { Text("Görüş (en az 30 karakter)") }, minLines = 4, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun AuditTab(t: JSONObject) {
    val app = LocalApp.current
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Yönetmelik denetimi (bu konu)", fontWeight = FontWeight.SemiBold)
        Loadable(key = t.i("id"), load = { app.api.obj("/topics/${t.i("id")}/audit") }) { a, _ ->
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                a.a("maddeler").objects().forEach { m -> ArticleStatusRow(m) }
            }
        }
        Text("Sürüm geçmişi", fontWeight = FontWeight.SemiBold)
        t.a("versions").objects().forEach { v ->
            SectionCard {
                Text("Sürüm ${v.i("version")} · ${relTime(v.l("created_at"))}" + if (v.i("proposal_id") > 0) " · düzenleme teklifiyle" else " · ilk metin", style = MaterialTheme.typography.labelMedium)
                Text(v.s("title"), fontWeight = FontWeight.SemiBold)
                Muted(v.s("description"), maxLines = 5)
            }
        }
        val similar = t.a("similar").objects()
        if (similar.isNotEmpty()) {
            Text("Benzer konular", fontWeight = FontWeight.SemiBold)
            similar.forEach { Muted("${it.s("title")} (%${((it.d("benzerlik") ?: 0.0) * 100).toInt()} benzer)") }
        }
    }
}

@Composable
fun ArticleStatusRow(m: JSONObject) {
    val status = m.s("durum")
    SectionCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Pill(when (status) { "uyumlu" -> "✓ Uyumlu"; "uyari" -> "! Uyarı"; else -> "✗ İhlal" }, statusColor(status))
            Spacer(Modifier.width(8.dp))
            Text("Madde ${m.i("no")} · ${m.s("title")}", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        }
        Spacer(Modifier.height(4.dp))
        Muted(m.s("text"))
        (m.a("ihlaller").objects() + m.a("uyarilar").objects()).forEach {
            Spacer(Modifier.height(4.dp))
            Notice(it.s("detay"), if (status == "ihlal") NoticeKind.Bad else NoticeKind.Warn)
        }
    }
}
