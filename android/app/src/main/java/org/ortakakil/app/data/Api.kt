package org.ortakakil.app.data

import android.content.Context
import androidx.core.content.edit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/** Sunucu adresi ve oturum anahtarı (SharedPreferences). */
class Session(context: Context) {
    private val prefs = context.getSharedPreferences("ortak_akil", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = prefs.getString("server", DEFAULT_SERVER) ?: DEFAULT_SERVER
        set(value) = prefs.edit { putString("server", value.trim().trimEnd('/')) }

    var token: String?
        get() = prefs.getString("token", null)
        set(value) = prefs.edit { if (value == null) remove("token") else putString("token", value) }

    companion object {
        /** Android emülatöründen bilgisayardaki sunucuya erişim adresi. */
        const val DEFAULT_SERVER = "http://10.0.2.2:3000"
    }
}

class ApiException(val status: Int, message: String, val body: JSONObject? = null) : Exception(message)

/** Web sitesiyle aynı REST API'yi kullanan küçük HTTP istemcisi. */
class Api(private val session: Session) {

    suspend fun obj(path: String): JSONObject = request("GET", path, null) as? JSONObject ?: JSONObject()
    suspend fun arr(path: String): JSONArray = request("GET", path, null) as? JSONArray ?: JSONArray()
    suspend fun post(path: String, body: JSONObject = JSONObject()): JSONObject = request("POST", path, body) as? JSONObject ?: JSONObject()
    suspend fun put(path: String, body: JSONObject): JSONObject = request("PUT", path, body) as? JSONObject ?: JSONObject()
    suspend fun delete(path: String): JSONObject = request("DELETE", path, null) as? JSONObject ?: JSONObject()

    private suspend fun request(method: String, path: String, body: JSONObject?): Any = withContext(Dispatchers.IO) {
        val base = session.serverUrl.trimEnd('/')
        val conn = try {
            URL("$base/api$path").openConnection() as HttpURLConnection
        } catch (e: Exception) {
            throw ApiException(0, "Geçersiz sunucu adresi: $base")
        }
        try {
            conn.requestMethod = method
            conn.connectTimeout = 8000
            conn.readTimeout = 60000
            conn.setRequestProperty("Accept", "application/json")
            session.token?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            val trimmed = text.trimStart()
            val parsed: Any = when {
                trimmed.isEmpty() -> JSONObject()
                trimmed.startsWith("[") -> JSONArray(text)
                trimmed.startsWith("{") -> JSONObject(text)
                else -> JSONObject().put("text", text)
            }
            if (code !in 200..299) {
                val o = parsed as? JSONObject
                if (code == 401 && path != "/auth/login") session.token = null
                val msg = o?.optString("error").orEmpty().ifBlank { "Hata $code" }
                throw ApiException(code, msg, o)
            }
            parsed
        } catch (e: IOException) {
            throw ApiException(0, "Sunucuya ulaşılamadı ($base). Ayarlardan sunucu adresini kontrol edin.")
        } finally {
            conn.disconnect()
        }
    }

    companion object {
        fun enc(s: String): String = URLEncoder.encode(s, "UTF-8")
    }
}

// ------------------------------------------------------------------ JSON yardımcıları
fun JSONObject.s(key: String, def: String = ""): String = if (!has(key) || isNull(key)) def else optString(key, def)
fun JSONObject.i(key: String, def: Int = 0): Int = if (!has(key) || isNull(key)) def else optInt(key, def)
fun JSONObject.l(key: String): Long = if (!has(key) || isNull(key)) 0L else optLong(key, 0L)
fun JSONObject.d(key: String): Double? = if (!has(key) || isNull(key)) null else optDouble(key)
fun JSONObject.b(key: String): Boolean = optBoolean(key, false)
fun JSONObject.o(key: String): JSONObject? = if (!has(key) || isNull(key)) null else optJSONObject(key)
fun JSONObject.a(key: String): JSONArray = optJSONArray(key) ?: JSONArray()
fun JSONArray.objects(): List<JSONObject> = (0 until length()).mapNotNull { optJSONObject(it) }
fun JSONArray.strings(): List<String> = (0 until length()).map { optString(it) }
fun JSONArray.ints(): List<Int> = (0 until length()).map { optInt(it) }

fun jsonOf(vararg pairs: Pair<String, Any?>): JSONObject = JSONObject().apply {
    pairs.forEach { (k, v) -> put(k, v ?: JSONObject.NULL) }
}
