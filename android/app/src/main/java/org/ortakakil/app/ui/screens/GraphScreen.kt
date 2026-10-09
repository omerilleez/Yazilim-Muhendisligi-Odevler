package org.ortakakil.app.ui.screens

import android.graphics.Paint
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.ortakakil.app.data.a
import org.ortakakil.app.data.d
import org.ortakakil.app.data.i
import org.ortakakil.app.data.objects
import org.ortakakil.app.data.s
import org.ortakakil.app.data.strings
import org.ortakakil.app.ui.KeyValue
import org.ortakakil.app.ui.LocalApp
import org.ortakakil.app.ui.LocalNav
import org.ortakakil.app.ui.Loadable
import org.ortakakil.app.ui.Muted
import org.ortakakil.app.ui.ScreenScaffold
import org.ortakakil.app.ui.SectionCard
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

private class GNode(val id: String, val nick: String, val community: Int, val radius: Float, val expert: Boolean, val json: JSONObject) {
    var x = 0f
    var y = 0f
    var vx = 0f
    var vy = 0f
}

private class GEdge(val s: Int, val t: Int, val type: String, val weight: Float)

/** Basit kuvvet yönelimli yerleşim (arka planda hesaplanır). */
private fun layout(nodes: List<GNode>, edges: List<GEdge>) {
    nodes.forEachIndexed { i, n ->
        val angle = i.toFloat() / nodes.size * 2f * Math.PI.toFloat()
        val ring = 120f + (n.community % 3) * 60f
        n.x = cos(angle) * ring
        n.y = sin(angle) * ring
    }
    var alpha = 1f
    repeat(320) {
        for (i in nodes.indices) for (j in i + 1 until nodes.size) {
            val a = nodes[i]
            val b = nodes[j]
            var dx = a.x - b.x
            var dy = a.y - b.y
            val d2 = max(dx * dx + dy * dy, 0.01f)
            val f = 2600f / d2 * alpha
            val d = sqrt(d2)
            dx /= d; dy /= d
            a.vx += dx * f; a.vy += dy * f
            b.vx -= dx * f; b.vy -= dy * f
        }
        for (e in edges) {
            val s = nodes[e.s]
            val t = nodes[e.t]
            val dx = t.x - s.x
            val dy = t.y - s.y
            val d = max(sqrt(dx * dx + dy * dy), 0.01f)
            val target = if (s.community == t.community) 70f else 150f
            val f = (d - target) / d * 0.02f * min(2f, e.weight) * alpha
            s.vx += dx * f; s.vy += dy * f
            t.vx -= dx * f; t.vy -= dy * f
        }
        for (n in nodes) {
            n.vx -= n.x * 0.004f * alpha
            n.vy -= n.y * 0.004f * alpha
            n.vx *= 0.82f; n.vy *= 0.82f
            n.x += n.vx; n.y += n.vy
        }
        alpha *= 0.985f
    }
}

private fun parseColor(hex: String): Color = runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrDefault(Color.Gray)

@Composable
fun GraphScreen() {
    val app = LocalApp.current
    ScreenScaffold("İnsan grafı") { mod ->
        Loadable(key = Unit, load = { app.api.obj("/graph") }) { g, _ -> GraphContent(g, mod) }
    }
}

@Composable
private fun GraphContent(g: JSONObject, mod: Modifier) {
    val nav = LocalNav.current
    val app = LocalApp.current
    val communities = g.a("communities").objects()
    val colors = communities.associate { it.i("id") to parseColor(it.s("color")) }
    var ready by remember { mutableStateOf<Pair<List<GNode>, List<GEdge>>?>(null) }
    var selected by remember { mutableStateOf<GNode?>(null) }
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    val textColor = MaterialTheme.colorScheme.onSurface
    val surface = MaterialTheme.colorScheme.surface

    LaunchedEffect(g) {
        ready = withContext(Dispatchers.Default) {
            val nodes = g.a("nodes").objects().map {
                GNode(it.s("id"), it.s("nickname"), it.i("community"), 9f + sqrt((it.d("pagerank") ?: 0.05).toFloat() * 900f), it.a("expert").length() > 0, it)
            }
            val index = nodes.withIndex().associate { it.value.id to it.index }
            val edges = g.a("edges").objects().mapNotNull { e ->
                val s = index[e.s("source")]
                val t = index[e.s("target")]
                if (s == null || t == null) null else GEdge(s, t, e.s("type"), (e.d("weight") ?: 1.0).toFloat())
            }
            layout(nodes, edges)
            nodes to edges
        }
    }

    Column(mod.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Muted("Üyeler düğüm; takip, güven, oy benzerliği ve yanıtlaşmalar kenar. Topluluklar etiket yayılımıyla, etki PageRank ile hesaplanır. Bu analiz, kararların bir topluluğu dışlayıp dışlamadığını ölçmek için kullanılır. İki parmakla yakınlaştırın, dokunarak seçin.")
        Box(
            Modifier.fillMaxWidth().height(420.dp).clip(RoundedCornerShape(14.dp)).background(surface)
        ) {
            val data = ready
            if (data == null) {
                Text("Yerleşim hesaplanıyor…", modifier = Modifier.align(Alignment.Center))
            } else {
                val (nodes, edges) = data
                Canvas(
                    Modifier.fillMaxSize()
                        .pointerInput(Unit) {
                            detectTransformGestures { _, pan, zoom, _ ->
                                scale = (scale * zoom).coerceIn(0.4f, 3f)
                                offset += pan
                            }
                        }
                        .pointerInput(nodes) {
                            detectTapGestures { p ->
                                val cx = size.width / 2f + offset.x
                                val cy = size.height / 2f + offset.y
                                val k = density * 0.9f * scale
                                selected = nodes.minByOrNull { n ->
                                    val dx = cx + n.x * k - p.x
                                    val dy = cy + n.y * k - p.y
                                    dx * dx + dy * dy
                                }?.takeIf { n ->
                                    val dx = cx + n.x * k - p.x
                                    val dy = cy + n.y * k - p.y
                                    sqrt(dx * dx + dy * dy) < (n.radius + 10) * k
                                }
                            }
                        }
                ) {
                    val k = density * 0.9f * scale
                    val paint = Paint().apply { isAntiAlias = true; textAlign = Paint.Align.CENTER; textSize = 11f * density; color = textColor.toArgb() }
                    withTransform({ translate(size.width / 2f + offset.x, size.height / 2f + offset.y) }) {
                        val focus = selected
                        for (e in edges) {
                            val s = nodes[e.s]
                            val t = nodes[e.t]
                            val active = focus != null && (s === focus || t === focus)
                            val base = when (e.type) {
                                "guven" -> Color(0xFF0F6E66)
                                "oy_benzerligi" -> Color(0xFF4F46E5)
                                "yanit" -> Color(0xFFD97706)
                                else -> Color(0xFF8A93A3)
                            }
                            drawLine(
                                color = base.copy(alpha = if (focus != null && !active) 0.08f else if (e.type == "takip") 0.3f else 0.5f),
                                start = Offset(s.x * k, s.y * k), end = Offset(t.x * k, t.y * k),
                                strokeWidth = (0.6f + e.weight * 0.6f) * density * (if (active) 1.6f else 1f),
                                pathEffect = if (e.type == "oy_benzerligi" || e.type == "yanit") PathEffect.dashPathEffect(floatArrayOf(8f, 8f)) else null,
                            )
                        }
                        for (n in nodes) {
                            val center = Offset(n.x * k, n.y * k)
                            val r = n.radius * k
                            drawCircle(colors[n.community] ?: Color.Gray, r, center)
                            drawCircle(if (n === focus) textColor else surface, r, center, style = Stroke(width = if (n === focus) 3f * density else 1.5f * density))
                            if (n.expert) drawCircle(Color(0xFFD97706), r + 4f * density, center, style = Stroke(width = 1.5f * density))
                            drawContext.canvas.nativeCanvas.drawText(n.nick, center.x, center.y + r + 13f * density, paint)
                        }
                    }
                }
            }
        }
        selected?.let { n ->
            val j = n.json
            val c = communities.firstOrNull { it.i("id") == n.community }
            SectionCard("@${n.nick}") {
                KeyValue("Topluluk", c?.s("label") ?: "—")
                KeyValue("Etki (PageRank)", j.d("pagerank")?.toString() ?: "—")
                KeyValue("Bağlantı", j.i("degree").toString())
                KeyValue("Oy / mesaj / konu", "${j.i("votes")} / ${j.i("messages")} / ${j.i("topics")}")
                val ex = j.a("expert").strings()
                if (ex.isNotEmpty()) KeyValue("Bilirkişilik", ex.joinToString { app.domainLabel(it) })
                TextButton(onClick = { nav.navigate("user/${n.id}") }) { Text("Profili aç →") }
            }
        }
        SectionCard("Topluluklar") {
            communities.forEach { c ->
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 4.dp)) {
                    Box(Modifier.size(12.dp).clip(CircleShape).background(parseColor(c.s("color"))))
                    Spacer(Modifier.width(8.dp))
                    Column {
                        Text("${c.s("label")} · ${c.i("size")} üye", fontWeight = FontWeight.SemiBold)
                        Muted(c.a("onde").strings().joinToString())
                    }
                }
            }
        }
        SectionCard("Kenar türleri") {
            Muted("Gri: takip · Yeşil: güven · Mor kesikli: oy benzerliği · Turuncu kesikli: yanıtlaşma · Turuncu halka: bilirkişi · Düğüm boyutu: etki")
        }
        val blocs = g.a("blocs").objects()
        if (blocs.isNotEmpty()) {
            SectionCard("Sürekli birlikte oy verenler") {
                Muted("En az 6 ortak oylamada hep aynı oyu veren çiftler (bilgilendirme amaçlı).")
                blocs.forEach { Text("${it.a("uyeler").strings().joinToString(" ↔ ")} · ${it.i("ortakOylama")} oylama", style = MaterialTheme.typography.bodySmall) }
            }
        }
    }
}
