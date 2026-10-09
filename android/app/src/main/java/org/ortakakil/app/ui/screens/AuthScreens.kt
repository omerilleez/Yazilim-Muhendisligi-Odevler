package org.ortakakil.app.ui.screens

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.ortakakil.app.data.ApiException
import org.ortakakil.app.data.Session
import org.ortakakil.app.data.a
import org.ortakakil.app.data.o
import org.ortakakil.app.data.s
import org.ortakakil.app.data.strings
import org.ortakakil.app.ui.LocalApp
import org.ortakakil.app.ui.LocalNav
import org.ortakakil.app.ui.Muted
import org.ortakakil.app.ui.Notice
import org.ortakakil.app.ui.NoticeKind
import org.ortakakil.app.ui.ScreenScaffold
import org.ortakakil.app.ui.SectionCard
import org.ortakakil.app.ui.rememberToast
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

// ====================================================================== giriş
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LoginScreen() {
    val app = LocalApp.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val toast = rememberToast()
    var identifier by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun doLogin(id: String, pw: String) {
        scope.launch {
            busy = true
            error = null
            try {
                app.login(id, pw)
                toast("Hoş geldiniz @${app.me?.s("nickname")}")
                nav.popBackStack()
            } catch (e: ApiException) {
                error = e.message
            }
            busy = false
        }
    }

    ScreenScaffold("Giriş yap", back = true) { mod ->
        Column(mod.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(identifier, { identifier = it }, label = { Text("E-posta ya da takma ad") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(
                password, { password = it }, label = { Text("Parola") }, singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                modifier = Modifier.fillMaxWidth(),
            )
            error?.let { Notice(it, NoticeKind.Bad) }
            Button(enabled = !busy, onClick = { doLogin(identifier, password) }, modifier = Modifier.fillMaxWidth()) { Text(if (busy) "Giriş yapılıyor…" else "Giriş") }
            TextButton(onClick = { nav.navigate("register") }) { Text("Hesabınız yok mu? Kayıt olun") }
            app.meta?.o("demoHesaplar")?.let { demo ->
                SectionCard("Demo hesapları") {
                    Muted("Tüm demo hesaplarının parolası aynıdır. Ayşe (eğitim) ve Emre (sağlık) bilirkişidir; Kerem azınlık topluluğundandır.")
                    Spacer(Modifier.height(8.dp))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        demo.a("ornek").strings().forEach { n -> AssistChip(onClick = { doLogin(n, demo.s("parola")) }, label = { Text("@$n") }) }
                    }
                }
            }
            Muted("Sunucu: ${app.session.serverUrl}")
            TextButton(onClick = { nav.navigate("settings") }) { Text("Sunucu ayarları") }
        }
    }
}

// ====================================================================== kayıt
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RegisterScreen() {
    val app = LocalApp.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val toast = rememberToast()
    val fields = remember { mutableStateMapOf<String, String>() }
    val errors = remember { mutableStateMapOf<String, String>() }
    var consent by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var showDate by remember { mutableStateOf(false) }
    val minAge = app.meta?.o("kurallar")?.optInt("minYas") ?: 18

    @Composable
    fun field(key: String, label: String, keyboard: KeyboardType = KeyboardType.Text, password: Boolean = false, lines: Int = 1, hint: String? = null) {
        OutlinedTextField(
            value = fields[key].orEmpty(),
            onValueChange = { fields[key] = it; errors.remove(key) },
            label = { Text(label) },
            singleLine = lines == 1,
            minLines = lines,
            isError = errors.containsKey(key),
            supportingText = (errors[key] ?: hint)?.let { { Text(it) } },
            visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
            keyboardOptions = KeyboardOptions(keyboardType = keyboard),
            modifier = Modifier.fillMaxWidth(),
        )
    }

    ScreenScaffold("Kayıt ol", back = true) { mod ->
        Column(mod.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Muted("Kimlik ve adres bilgileri zorunludur (Madde 2). Bu bilgiler yalnızca size görünür; platformda takma adınızla yer alırsınız. $minAge yaşından küçükler üye olamaz.")
            Section("Kimlik")
            field("first_name", "Ad")
            field("last_name", "Soyad")
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) { field("birth_date", "Doğum tarihi (YYYY-AA-GG)", hint = "Takvimden seçebilirsiniz") }
                TextButton(onClick = { showDate = true }) { Text("Takvim") }
            }
            Section("İletişim")
            field("email", "E-posta", KeyboardType.Email)
            field("phone", "Telefon", KeyboardType.Phone, hint = "05xx xxx xx xx")
            Section("Adres")
            field("city", "İl")
            field("district", "İlçe")
            field("address", "Açık adres", lines = 2, hint = "Mahalle, sokak, bina no, daire")
            field("postal_code", "Posta kodu", KeyboardType.Number)
            Section("Hesap")
            field("nickname", "Takma ad (kamuya görünür)", hint = "3-24 karakter: harf, rakam, _ ve .")
            field("password", "Parola", KeyboardType.Password, password = true, hint = "En az 8 karakter")
            field("bio", "Hakkımda (isteğe bağlı, kamuya açık)")
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(consent, { consent = it })
                Text("Kişisel verilerimin yalnızca üyelik doğrulaması için saklanacağını, kamuya yalnızca takma adımın gösterileceğini ve deftere yalnızca kimlik özetimin yazılacağını kabul ediyorum.", style = MaterialTheme.typography.bodySmall)
            }
            error?.let { Notice(it, NoticeKind.Bad) }
            Button(
                enabled = !busy,
                onClick = {
                    if (!consent) {
                        error = "Devam etmek için aydınlatma metnini onaylayın."
                        return@Button
                    }
                    scope.launch {
                        busy = true
                        error = null
                        errors.clear()
                        try {
                            val body = JSONObject()
                            fields.forEach { (k, v) -> body.put(k, v) }
                            app.register(body)
                            toast("Kaydınız tamamlandı")
                            nav.popBackStack("home", inclusive = false)
                        } catch (e: ApiException) {
                            error = e.message
                            e.body?.optJSONObject("errors")?.let { errs -> errs.keys().forEach { k -> errors[k] = errs.optString(k) } }
                        }
                        busy = false
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (busy) "Kaydediliyor…" else "Kayıt ol") }
            Spacer(Modifier.height(24.dp))
        }
    }

    if (showDate) {
        val state = rememberDatePickerState(yearRange = 1900..2026)
        DatePickerDialog(
            onDismissRequest = { showDate = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let {
                        val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).apply { timeZone = TimeZone.getTimeZone("UTC") }
                        fields["birth_date"] = fmt.format(Date(it))
                        errors.remove("birth_date")
                    }
                    showDate = false
                }) { Text("Seç") }
            },
            dismissButton = { TextButton(onClick = { showDate = false }) { Text("Vazgeç") } },
        ) { DatePicker(state) }
    }
}

@Composable
private fun Section(title: String) {
    Spacer(Modifier.height(8.dp))
    Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
}

// ====================================================================== ayarlar
@Composable
fun SettingsScreen() {
    val app = LocalApp.current
    val nav = LocalNav.current
    val toast = rememberToast()
    var url by rememberSaveable { mutableStateOf(app.session.serverUrl) }
    ScreenScaffold("Sunucu ayarları", back = true) { mod ->
        Column(mod.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(url, { url = it }, label = { Text("Sunucu adresi") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri))
            Muted("Android emülatörü: http://10.0.2.2:3000\nGerçek telefon: bilgisayarın yerel IP adresi (ör. http://192.168.1.20:3000). Sunucu açılırken bu adresleri terminale yazdırır. Telefon ve bilgisayar aynı Wi-Fi ağında olmalıdır.")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = {
                    app.changeServer(url)
                    toast("Sunucu değiştirildi; yeniden giriş yapın")
                    nav.popBackStack()
                }) { Text("Kaydet ve bağlan") }
                OutlinedButton(onClick = { url = Session.DEFAULT_SERVER }) { Text("Varsayılan") }
            }
            app.connectionError?.let { Notice(it, NoticeKind.Bad) }
        }
    }
}
