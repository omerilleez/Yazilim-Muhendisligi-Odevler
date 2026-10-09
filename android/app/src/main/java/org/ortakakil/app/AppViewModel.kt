package org.ortakakil.app

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.ortakakil.app.data.Api
import org.ortakakil.app.data.ApiException
import org.ortakakil.app.data.Session
import org.ortakakil.app.data.a
import org.ortakakil.app.data.i
import org.ortakakil.app.data.o
import org.ortakakil.app.data.objects
import org.ortakakil.app.data.s

/** Uygulama genelindeki durum: sunucu meta bilgisi, oturum açmış üye, bildirim sayısı. */
class AppViewModel(app: Application) : AndroidViewModel(app) {
    val session = Session(app)
    val api = Api(session)

    var meta by mutableStateOf<JSONObject?>(null)
        private set
    var me by mutableStateOf<JSONObject?>(null)
        private set
    var unread by mutableIntStateOf(0)
    var booting by mutableStateOf(true)
        private set
    var connectionError by mutableStateOf<String?>(null)
        private set

    init {
        boot()
        viewModelScope.launch {
            while (true) {
                delay(30_000)
                refreshNotifications()
            }
        }
    }

    fun boot() {
        viewModelScope.launch {
            booting = true
            try {
                meta = api.obj("/meta")
                connectionError = null
                if (session.token != null) refreshMe()
                refreshNotifications()
            } catch (e: ApiException) {
                connectionError = e.message
            }
            booting = false
        }
    }

    suspend fun refreshMe() {
        me = try {
            api.obj("/me")
        } catch (e: ApiException) {
            null
        }
    }

    suspend fun refreshNotifications() {
        if (me == null) return
        try {
            unread = api.obj("/me/notifications").i("okunmamis")
        } catch (_: ApiException) {
        }
    }

    suspend fun login(identifier: String, password: String) {
        val r = api.post("/auth/login", JSONObject().put("identifier", identifier).put("password", password))
        session.token = r.s("token")
        me = r.o("user")
        refreshMe()
        refreshNotifications()
    }

    suspend fun register(body: JSONObject) {
        val r = api.post("/auth/register", body)
        session.token = r.s("token")
        me = r.o("user")
    }

    fun logout() {
        viewModelScope.launch {
            try {
                api.post("/auth/logout")
            } catch (_: ApiException) {
            }
            session.token = null
            me = null
            unread = 0
        }
    }

    fun changeServer(url: String) {
        session.serverUrl = url
        session.token = null
        me = null
        boot()
    }

    fun domainLabel(id: String): String =
        meta?.a("alanlar")?.objects()?.firstOrNull { it.s("id") == id }?.s("label") ?: id

    fun domains(): List<Pair<String, String>> =
        meta?.a("alanlar")?.objects()?.map { it.s("id") to it.s("label") } ?: emptyList()

    fun deletionCategories(): List<Pair<String, String>> {
        val o = meta?.o("silmeGerekceleri") ?: return emptyList()
        return o.keys().asSequence().map { it to o.s(it) }.toList()
    }
}
