package org.ortakakil.app.ui

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.ortakakil.app.AppViewModel
import org.ortakakil.app.data.ApiException
import org.ortakakil.app.data.b
import org.ortakakil.app.data.d
import org.ortakakil.app.data.i
import org.ortakakil.app.data.s
import org.ortakakil.app.ui.theme.Abstain
import org.ortakakil.app.ui.theme.No
import org.ortakakil.app.ui.theme.Orange
import org.ortakakil.app.ui.theme.Purple
import org.ortakakil.app.ui.theme.Warn
import org.ortakakil.app.ui.theme.Yes
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

val LocalApp = staticCompositionLocalOf<AppViewModel> { error("AppViewModel sağlanmadı") }
val LocalNav = staticCompositionLocalOf<NavHostController> { error("NavController sağlanmadı") }

// ------------------------------------------------------------------ etiketler
val STATUS_LABEL = mapOf(
    "oylamada" to "Oylamada", "acik" to "Oylama açık", "kabul" to "Kabul edildi", "red" to "Reddedildi",
    "itiraz_suresi" to "İtiraz süresinde", "askida" to "Askıda", "inceleniyor" to "İnceleniyor",
    "onaylandi" to "Karar onandı", "yeniden_oylama" to "Yeniden oylamada", "karar_onandi" to "Karar onandı",
    "karar_bozuldu" to "Karar bozuldu", "onayli" to "Onaylı", "yanitlandi" to "Yanıtlandı",
)
val CHOICE_LABEL = mapOf("evet" to "Evet", "hayir" to "Hayır", "cekimser" to "Çekimser")
val STANCE_LABEL = mapOf("destek" to "Destekliyor", "karsi" to "Karşı", "notr" to "Nötr", "sartli" to "Şartlı destek")

fun statusColor(status: String): Color = when (status) {
    "oylamada", "acik" -> Warn
    "kabul", "onayli", "onaylandi", "karar_onandi", "destek", "uyumlu" -> Yes
    "red", "karar_bozuldu", "karsi", "ihlal" -> No
    "itiraz_suresi", "yeniden_oylama", "sartli" -> Purple
    "askida", "inceleniyor", "uyari" -> Orange
    else -> Abstain
}

// ------------------------------------------------------------------ biçimlendirme
private val trLocale = Locale.forLanguageTag("tr-TR")

fun relTime(ts: Long): String {
    if (ts <= 0) return ""
    val diff = ts - System.currentTimeMillis()
    val future = diff > 0
    val s = abs(diff) / 1000
    val text = when {
        s < 60 -> return if (future) "birazdan" else "az önce"
        s < 3600 -> "${s / 60} dakika"
        s < 86400 -> "${s / 3600} saat"
        s < 86400 * 30 -> "${s / 86400} gün"
        else -> return fmtDate(ts)
    }
    return if (future) "$text sonra" else "$text önce"
}

fun fmtDate(ts: Long): String = if (ts <= 0) "—" else SimpleDateFormat("d MMM yyyy HH:mm", trLocale).format(Date(ts))
fun pct(x: Double?): String = if (x == null) "—" else "%" + ((x * 1000).roundToInt() / 10.0).toString().removeSuffix(".0")

fun thresholdText(p: JSONObject): String {
    val t = p.d("threshold") ?: 0.5
    return if (p.b("strict")) "yarıdan fazla" else if (t > 0.66 && t < 0.67) "en az 2/3" else "en az ${pct(t)}"
}

@Composable
fun rememberToast(): (String) -> Unit {
    val ctx = LocalContext.current
    return remember(ctx) { { msg: String -> Toast.makeText(ctx, msg, Toast.LENGTH_LONG).show() } }
}

// ------------------------------------------------------------------ küçük bileşenler
@Composable
fun Pill(text: String, color: Color = MaterialTheme.colorScheme.onSurfaceVariant, filled: Boolean = true) {
    Box(
        Modifier
            .clip(RoundedCornerShape(50))
            .background(if (filled) color.copy(alpha = 0.14f) else Color.Transparent)
            .border(1.dp, if (filled) Color.Transparent else MaterialTheme.colorScheme.outline, RoundedCornerShape(50))
            .padding(horizontal = 9.dp, vertical = 3.dp)
    ) {
        Text(text, color = color, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

@Composable
fun StatusBadge(status: String, label: String? = null) = Pill(label ?: STATUS_LABEL[status] ?: status, statusColor(status))

@Composable
fun Avatar(nick: String, size: Int = 36) {
    val palette = listOf(0xFF0F766E, 0xFF4F46E5, 0xFFDB2777, 0xFFD97706, 0xFF059669, 0xFF7C3AED, 0xFF0891B2, 0xFFDC2626)
    var h = 0
    nick.forEach { h = h * 31 + it.code }
    Box(
        Modifier.size(size.dp).clip(CircleShape).background(Color(palette[abs(h) % palette.size])),
        contentAlignment = Alignment.Center
    ) {
        Text(nick.take(1).uppercase(trLocale), color = Color.White, fontWeight = FontWeight.Bold, fontSize = (size * 0.42).sp)
    }
}

@Composable
fun SectionCard(
    title: String? = null,
    modifier: Modifier = Modifier,
    action: (@Composable RowScope.() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(14.dp),
    ) {
        Column(Modifier.padding(16.dp)) {
            if (title != null || action != null) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    if (title != null) Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    action?.invoke(this)
                }
                Spacer(Modifier.height(8.dp))
            }
            content()
        }
    }
}

enum class NoticeKind { Info, Ok, Warn, Bad, Purple }

@Composable
fun Notice(text: String, kind: NoticeKind = NoticeKind.Info, modifier: Modifier = Modifier) {
    val color = when (kind) {
        NoticeKind.Info -> MaterialTheme.colorScheme.onSurfaceVariant
        NoticeKind.Ok -> Yes
        NoticeKind.Warn -> Warn
        NoticeKind.Bad -> No
        NoticeKind.Purple -> Purple
    }
    Box(
        modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(color.copy(alpha = 0.10f)).padding(10.dp)
    ) {
        Text(text, color = color, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
fun Muted(text: String, modifier: Modifier = Modifier, maxLines: Int = Int.MAX_VALUE) {
    Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall, modifier = modifier, maxLines = maxLines, overflow = TextOverflow.Ellipsis)
}

@Composable
fun EmptyText(text: String) {
    Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { Muted(text) }
}

@Composable
fun LoadingBox() {
    Box(Modifier.fillMaxSize().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
}

@Composable
fun ErrorBox(message: String, onRetry: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text("Bir sorun oluştu", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(6.dp))
        Muted(message)
        Spacer(Modifier.height(12.dp))
        OutlinedButton(onClick = onRetry) { Text("Yeniden dene") }
    }
}

// ------------------------------------------------------------------ yükleme yardımcısı
sealed interface LoadState<out T> {
    data object Loading : LoadState<Nothing>
    data class Ok<T>(val value: T) : LoadState<T>
    data class Err(val message: String) : LoadState<Nothing>
}

/** Veriyi yükler; yeniden yüklemede eski veriyi göstermeye devam eder (titreme olmaz). */
@Composable
fun <T> Loadable(key: Any?, load: suspend () -> T, content: @Composable (T, () -> Unit) -> Unit) {
    var state by remember(key) { mutableStateOf<LoadState<T>>(LoadState.Loading) }
    var version by remember(key) { mutableIntStateOf(0) }
    LaunchedEffect(key, version) {
        state = try {
            LoadState.Ok(load())
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            LoadState.Err(e.message ?: "Bilinmeyen hata")
        }
    }
    when (val s = state) {
        is LoadState.Loading -> LoadingBox()
        is LoadState.Err -> ErrorBox(s.message) { state = LoadState.Loading; version++ }
        is LoadState.Ok -> content(s.value) { version++ }
    }
}

// ------------------------------------------------------------------ iskelet ve diyalog
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScreenScaffold(
    title: String,
    back: Boolean = false,
    actions: @Composable RowScope.() -> Unit = {},
    floatingActionButton: @Composable () -> Unit = {},
    bottomBar: @Composable () -> Unit = {},
    content: @Composable (Modifier) -> Unit,
) {
    val nav = LocalNav.current
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = {
                    if (back) IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Geri") }
                },
                actions = actions,
            )
        },
        floatingActionButton = floatingActionButton,
        bottomBar = bottomBar,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        content(Modifier.padding(padding))
    }
}

/** Form diyaloğu: onConfirm hata fırlatırsa mesaj diyalog içinde gösterilir. */
@Composable
fun FormDialog(
    title: String,
    confirmText: String = "Gönder",
    onDismiss: () -> Unit,
    onConfirm: suspend () -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(title) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                content()
                error?.let { Notice(it, NoticeKind.Bad) }
            }
        },
        confirmButton = {
            TextButton(enabled = !busy, onClick = {
                scope.launch {
                    busy = true
                    error = null
                    try {
                        onConfirm()
                        onDismiss()
                    } catch (e: ApiException) {
                        error = e.message
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        error = e.message
                    }
                    busy = false
                }
            }) { Text(if (busy) "Gönderiliyor…" else confirmText) }
        },
        dismissButton = { TextButton(enabled = !busy, onClick = onDismiss) { Text("Vazgeç") } },
    )
}

// ------------------------------------------------------------------ oylama çubukları
@Composable
fun TallyBar(t: JSONObject, compact: Boolean = false) {
    val yes = t.i("evet")
    val no = t.i("hayir")
    val abs = t.i("cekimser")
    Column {
        Row(Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(5.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
            if (yes > 0) Box(Modifier.weight(yes.toFloat()).fillMaxSize().background(Yes))
            if (no > 0) Box(Modifier.weight(no.toFloat()).fillMaxSize().background(No))
            if (abs > 0) Box(Modifier.weight(abs.toFloat()).fillMaxSize().background(Abstain.copy(alpha = 0.5f)))
            if (yes + no + abs == 0) Spacer(Modifier.weight(1f))
        }
        Spacer(Modifier.height(4.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Muted("Evet $yes")
            Muted("Hayır $no")
            Muted("Çekimser $abs")
            if (!compact) Muted("Katılım ${t.i("toplam")}/${t.i("secmenKutugu")} (${pct(t.d("katilim"))})")
        }
    }
}

@Composable
fun ParticipationMeter(t: JSONObject, quorum: Double) {
    val part = (t.d("katilim") ?: 0.0).toFloat().coerceIn(0f, 1f)
    Column {
        Box(Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
            Box(Modifier.fillMaxWidth(part).fillMaxSize().background(MaterialTheme.colorScheme.secondary))
        }
        Spacer(Modifier.height(3.dp))
        Muted("Katılım ${pct(t.d("katilim"))} · yeter sayı ${pct(quorum)} (${t.i("gerekenKatilim")} oy)")
    }
}

/** Oy butonları: oy verildiğinde sunucudan dönen güncel oylamayı onVoted ile bildirir. */
@Composable
fun VoteButtons(poll: JSONObject, onVoted: (JSONObject) -> Unit) {
    val app = LocalApp.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val toast = rememberToast()
    var busy by remember { mutableStateOf(false) }
    if (!poll.b("canVote")) {
        val block = poll.s("voteBlock")
        if (block.isNotBlank() && poll.s("status") == "acik") {
            if (app.me == null) {
                OutlinedButton(onClick = { nav.navigate("login") }, modifier = Modifier.fillMaxWidth()) { Text("Oy vermek için giriş yapın") }
            } else Notice(block)
        }
        return
    }
    val mine = poll.s("myVote")
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        listOf("evet" to Yes, "hayir" to No, "cekimser" to Abstain).forEach { (choice, color) ->
            val selected = mine == choice
            OutlinedButton(
                onClick = {
                    scope.launch {
                        busy = true
                        try {
                            val r = app.api.post("/polls/${poll.i("id")}/vote", JSONObject().put("choice", choice))
                            toast(if (r.s("status") == "acik") "Oyunuz kaydedildi ve deftere işlendi" else "Oylama sonuçlandı: ${STATUS_LABEL[r.s("status")] ?: r.s("status")}")
                            onVoted(r)
                        } catch (e: ApiException) {
                            toast(e.message ?: "Hata")
                        }
                        busy = false
                    }
                },
                enabled = !busy,
                modifier = Modifier.weight(1f),
                border = androidx.compose.foundation.BorderStroke(if (selected) 2.dp else 1.dp, if (selected) color else MaterialTheme.colorScheme.outline),
                colors = androidx.compose.material3.ButtonDefaults.outlinedButtonColors(
                    containerColor = if (selected) color.copy(alpha = 0.12f) else Color.Transparent,
                    contentColor = if (selected) color else MaterialTheme.colorScheme.onSurface,
                ),
            ) { Text(CHOICE_LABEL[choice] ?: choice, maxLines = 1) }
        }
    }
    if (mine.isNotBlank()) {
        Spacer(Modifier.height(4.dp))
        Muted("Oyunuz: ${CHOICE_LABEL[mine]} · oylama açıkken değiştirebilirsiniz. Defterde takma kimlikle kayıtlı.")
    }
}

@Composable
fun KeyValue(key: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Text(key, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.width(130.dp))
        Text(value, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
    }
}
