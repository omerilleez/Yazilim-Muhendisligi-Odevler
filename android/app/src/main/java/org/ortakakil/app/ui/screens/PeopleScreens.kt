package org.ortakakil.app.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
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
import org.ortakakil.app.ui.Avatar
import org.ortakakil.app.ui.EmptyText
import org.ortakakil.app.ui.FormDialog
import org.ortakakil.app.ui.KeyValue
import org.ortakakil.app.ui.LocalApp
import org.ortakakil.app.ui.LocalNav
import org.ortakakil.app.ui.Loadable
import org.ortakakil.app.ui.Muted
import org.ortakakil.app.ui.Notice
import org.ortakakil.app.ui.NoticeKind
import org.ortakakil.app.ui.Pill
import org.ortakakil.app.ui.ScreenScaffold
import org.ortakakil.app.ui.SectionCard
import org.ortakakil.app.ui.StatusBadge
import org.ortakakil.app.ui.fmtDate
import org.ortakakil.app.ui.relTime
import org.ortakakil.app.ui.rememberToast

// ====================================================================== bilirkişiler
@Composable
fun ExpertsScreen() {
    val app = LocalApp.current
    val nav = LocalNav.current
    val toast = rememberToast()
    var applying by remember { mutableStateOf(false) }
    ScreenScaffold("Bilirkişiler", back = true, actions = {
        if (app.me != null) androidx.compose.material3.TextButton(onClick = { applying = true }) { Text("Başvur") }
    }) { mod ->
        Loadable(key = app.me?.s("id"), load = {
            JSONObject().put("list", app.api.obj("/experts")).put("inbox", if (app.me != null) app.api.obj("/me/expert-inbox") else JSONObject())
        }) { data, reload ->
            val list = data.getJSONObject("list")
            val inbox = data.getJSONObject("inbox")
            Column(mod.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Muted("Bilirkişilik bir alanda topluluk oylamasıyla onaylanır. Bilirkişiler tavsiye niteliğinde görüş verir ve azınlık itirazlarını inceler; kararı tek başına bozamazlar.")
                if (inbox.a("alanlar").length() > 0) {
                    SectionCard("Gelen kutunuz") {
                        Muted("Alanlarınız: " + inbox.a("alanlar").objects().joinToString { it.s("label") })
                        Spacer(Modifier.height(6.dp))
                        Text("Görüş talepleri", fontWeight = FontWeight.SemiBold)
                        val reqs = inbox.a("talepler").objects()
                        if (reqs.isEmpty()) Muted("Açık talep yok.")
                        reqs.forEach { r ->
                            Column(Modifier.fillMaxWidth().clickable { nav.navigate("topic/${r.i("topic_id")}") }.padding(vertical = 6.dp)) {
                                Text(r.s("topic_title"), fontWeight = FontWeight.SemiBold)
                                Text(r.s("question"), style = MaterialTheme.typography.bodySmall)
                                Muted("@${r.s("nickname")} · ${relTime(r.l("created_at"))}")
                            }
                        }
                        Spacer(Modifier.height(6.dp))
                        Text("İncelenecek itirazlar", fontWeight = FontWeight.SemiBold)
                        val apps = inbox.a("itirazlar").objects()
                        if (apps.isEmpty()) Muted("Bekleyen itiraz yok.")
                        apps.forEach { a ->
                            Column(Modifier.fillMaxWidth().clickable { nav.navigate("poll/${a.i("poll_id")}") }.padding(vertical = 6.dp)) {
                                Text(a.s("poll_title"), fontWeight = FontWeight.SemiBold)
                                Text(a.s("reason"), style = MaterialTheme.typography.bodySmall)
                                Muted("@${a.s("nickname")} · son tarih ${fmtDate(a.l("review_deadline"))}")
                            }
                        }
                    }
                }
                val approved = list.a("onayli").objects().groupBy { it.s("domain") }
                if (approved.isEmpty()) EmptyText("Henüz onaylı bilirkişi yok.")
                approved.forEach { (domain, experts) ->
                    SectionCard(app.domainLabel(domain)) {
                        experts.forEach { e ->
                            Row(Modifier.fillMaxWidth().clickable { nav.navigate("user/${e.s("user_id")}") }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                Avatar(e.s("nickname"), 32)
                                Spacer(Modifier.width(8.dp))
                                Column(Modifier.weight(1f)) {
                                    Text("@${e.s("nickname")}", fontWeight = FontWeight.SemiBold)
                                    Muted(e.s("bio"), maxLines = 2)
                                }
                                Muted("${e.i("gorusSayisi")} görüş")
                            }
                        }
                    }
                }
                Text("Değerlendirmedeki başvurular", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                val pending = list.a("basvurular").objects()
                if (pending.isEmpty()) EmptyText("Bekleyen başvuru yok.")
                pending.forEach { e ->
                    SectionCard(modifier = Modifier.clickable { if (e.i("poll_id") > 0) nav.navigate("poll/${e.i("poll_id")}") }) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("@${e.s("nickname")} — ${e.s("domainLabel")}", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                            StatusBadge(e.s("status"))
                        }
                        Spacer(Modifier.height(4.dp))
                        Text(e.s("credentials"), style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            if (applying) {
                var domain by remember { mutableStateOf(app.domains().firstOrNull()?.first ?: "") }
                var credentials by remember { mutableStateOf("") }
                FormDialog("Bilirkişilik başvurusu", "Başvur", { applying = false }, {
                    val r = app.api.post("/experts/apply", JSONObject().put("domain", domain).put("credentials", credentials))
                    toast("Başvurunuz oylamaya sunuldu")
                    reload()
                    nav.navigate("poll/${r.i("poll_id")}")
                }) {
                    Text("Alan", style = MaterialTheme.typography.labelLarge)
                    app.domains().forEach { (k, label) ->
                        Row(Modifier.fillMaxWidth().selectable(domain == k) { domain = k }, verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(selected = domain == k, onClick = { domain = k })
                            Text(label)
                        }
                    }
                    OutlinedTextField(credentials, { credentials = it }, label = { Text("Yeterlilik (eğitim, deneyim, belgeler)") }, minLines = 4, modifier = Modifier.fillMaxWidth())
                    Muted("Başvurunuz topluluk oylamasına sunulur (Madde 12).")
                }
            }
        }
    }
}

// ====================================================================== hesabım
@Composable
fun ProfileScreen() {
    val app = LocalApp.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val toast = rememberToast()
    val me = app.me
    if (me == null) {
        ScreenScaffold("Hesabım", back = true) { mod ->
            Column(mod.padding(16.dp)) {
                Notice("Giriş yapmadınız.")
                Spacer(Modifier.height(8.dp))
                Button(onClick = { nav.navigate("login") }) { Text("Giriş yap") }
            }
        }
        return
    }
    var phone by remember(me) { mutableStateOf(me.s("phone")) }
    var city by remember(me) { mutableStateOf(me.s("city")) }
    var district by remember(me) { mutableStateOf(me.s("district")) }
    var address by remember(me) { mutableStateOf(me.s("address")) }
    var postal by remember(me) { mutableStateOf(me.s("postal_code")) }
    var bio by remember(me) { mutableStateOf(me.s("bio")) }
    var busy by remember { mutableStateOf(false) }
    ScreenScaffold("Hesabım", back = true) { mod ->
        Column(mod.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Notice("Kimlik ve adres bilgileriniz yalnızca size görünür. Kamuya takma adınız (@${me.s("nickname")}) gösterilir; deftere yalnızca kimlik özetiniz yazılmıştır.")
            SectionCard("Kimlik (değiştirilemez)") {
                KeyValue("Ad Soyad", "${me.s("first_name")} ${me.s("last_name")}")
                KeyValue("Doğum tarihi", "${me.s("birth_date")} (${me.i("age")} yaş)")
                KeyValue("E-posta", me.s("email"))
                KeyValue("Takma ad", "@${me.s("nickname")}")
                KeyValue("Üyelik", fmtDate(me.l("created_at")))
            }
            SectionCard("İletişim ve adres") {
                OutlinedTextField(phone, { phone = it }, label = { Text("Telefon") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(city, { city = it }, label = { Text("İl") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(district, { district = it }, label = { Text("İlçe") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(address, { address = it }, label = { Text("Açık adres") }, minLines = 2, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(postal, { postal = it }, label = { Text("Posta kodu") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(bio, { bio = it }, label = { Text("Hakkımda (kamuya açık)") }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                Button(enabled = !busy, onClick = {
                    scope.launch {
                        busy = true
                        try {
                            app.api.put("/me", JSONObject().put("phone", phone).put("city", city).put("district", district).put("address", address).put("postal_code", postal).put("bio", bio))
                            app.refreshMe()
                            toast("Bilgileriniz güncellendi")
                        } catch (e: ApiException) {
                            toast(e.message ?: "Hata")
                        }
                        busy = false
                    }
                }) { Text("Kaydet") }
            }
            SectionCard("Bilirkişilik") {
                val list = me.a("uzmanlik").objects()
                if (list.isEmpty()) Muted("Bilirkişilik başvurunuz yok.")
                list.forEach { e -> Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { Pill(e.s("label"), MaterialTheme.colorScheme.primary); StatusBadge(e.s("status")) } }
                OutlinedButton(onClick = { nav.navigate("experts") }) { Text("Bilirkişi sayfası") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { nav.navigate("user/${me.s("id")}") }) { Text("Kamuya açık profilim") }
                OutlinedButton(onClick = { app.logout(); nav.popBackStack() }) { Text("Çıkış yap") }
            }
        }
    }
}

// ====================================================================== üye profili
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun UserScreen(id: String) {
    val app = LocalApp.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val toast = rememberToast()
    ScreenScaffold("Üye", back = true) { mod ->
        Loadable(key = id, load = { app.api.obj("/users/$id") }) { u, reload ->
            val self = app.me?.s("id") == u.s("id")
            Column(mod.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Avatar(u.s("nickname"), 48)
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text("@${u.s("nickname")}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                            Muted("${relTime(u.l("created_at"))} katıldı")
                        }
                    }
                    if (u.s("bio").isNotBlank()) { Spacer(Modifier.height(8.dp)); Text(u.s("bio")) }
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        u.a("uzmanlik").objects().forEach { Pill("Bilirkişi · ${it.s("label")}", MaterialTheme.colorScheme.primary) }
                    }
                    Spacer(Modifier.height(8.dp))
                    val st = u.o("istatistik")
                    if (st != null) Muted("${st.i("konu")} konu · ${st.i("mesaj")} mesaj · ${st.i("oy")} oy · ${st.i("takipci")} takipçi · ${st.i("guvenen")} güvenen")
                }
                if (!self && app.me != null) {
                    SectionCard("İlişki") {
                        Muted("Takip ve güven ilişkileri insan grafını oluşturur; güven kenarları topluluk tespitinde daha ağır basar.")
                        Spacer(Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            listOf("takip" to (u.b("takipEdiyorum") to ("✓ Takip ediliyor" to "+ Takip et")), "guven" to (u.b("guveniyorum") to ("✓ Güveniyorum" to "+ Güven"))).forEach { (type, info) ->
                                val (on, labels) = info
                                val action: () -> Unit = {
                                    scope.launch {
                                        try {
                                            if (on) app.api.delete("/users/${u.s("id")}/$type") else app.api.post("/users/${u.s("id")}/$type")
                                            reload()
                                        } catch (e: ApiException) {
                                            toast(e.message ?: "Hata")
                                        }
                                    }
                                }
                                if (on) Button(onClick = action) { Text(labels.first) } else OutlinedButton(onClick = action) { Text(labels.second) }
                            }
                        }
                    }
                }
                if (self) Notice("Bu sizin kamuya açık profiliniz; kişisel bilgileriniz burada görünmez.", NoticeKind.Info)
                SectionCard("Önerdiği konular") {
                    val topics = u.a("konular").objects()
                    if (topics.isEmpty()) Muted("Henüz konu önermedi.")
                    topics.forEach { t ->
                        Row(Modifier.fillMaxWidth().clickable { nav.navigate("topic/${t.i("id")}") }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(t.s("title"), fontWeight = FontWeight.SemiBold)
                                Muted("${app.domainLabel(t.s("domain"))} · ${relTime(t.l("created_at"))}")
                            }
                            StatusBadge(t.s("status"))
                        }
                    }
                }
            }
        }
    }
}
