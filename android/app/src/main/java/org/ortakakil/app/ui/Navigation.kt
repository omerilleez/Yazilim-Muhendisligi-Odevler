package org.ortakakil.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import org.ortakakil.app.AppViewModel
import org.ortakakil.app.ui.screens.AboutScreen
import org.ortakakil.app.ui.screens.ExpertsScreen
import org.ortakakil.app.ui.screens.GraphScreen
import org.ortakakil.app.ui.screens.HomeScreen
import org.ortakakil.app.ui.screens.LedgerScreen
import org.ortakakil.app.ui.screens.LoginScreen
import org.ortakakil.app.ui.screens.MoreScreen
import org.ortakakil.app.ui.screens.NewTopicScreen
import org.ortakakil.app.ui.screens.NotificationsScreen
import org.ortakakil.app.ui.screens.PollDetailScreen
import org.ortakakil.app.ui.screens.PollsScreen
import org.ortakakil.app.ui.screens.ProfileScreen
import org.ortakakil.app.ui.screens.RegisterScreen
import org.ortakakil.app.ui.screens.RegulationScreen
import org.ortakakil.app.ui.screens.SettingsScreen
import org.ortakakil.app.ui.screens.TopicDetailScreen
import org.ortakakil.app.ui.screens.TopicsScreen
import org.ortakakil.app.ui.screens.UserScreen

private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val TABS = listOf(
    Tab("home", "Akış", Icons.Filled.Home),
    Tab("topics", "Konular", Icons.AutoMirrored.Filled.List),
    Tab("polls", "Oylamalar", Icons.Filled.CheckCircle),
    Tab("graph", "Graf", Icons.Filled.Share),
    Tab("more", "Daha fazla", Icons.Filled.Menu),
)

@Composable
fun OrtakAkilApp() {
    val app: AppViewModel = viewModel()
    val nav = rememberNavController()
    CompositionLocalProvider(LocalApp provides app, LocalNav provides nav) {
        when {
            app.meta == null && app.booting -> Splash()
            app.meta == null -> ConnectionScreen(app)
            else -> MainNavigation()
        }
    }
}

@Composable
private fun Splash() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Ortak Akıl", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(16.dp))
            CircularProgressIndicator()
        }
    }
}

@Composable
private fun ConnectionScreen(app: AppViewModel) {
    var url by remember { mutableStateOf(app.session.serverUrl) }
    Column(
        Modifier.fillMaxSize().safeDrawingPadding().padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Ortak Akıl", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(8.dp))
        Text("Sunucuya bağlanılamadı", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(4.dp))
        Muted(app.connectionError ?: "")
        Spacer(Modifier.height(16.dp))
        OutlinedTextField(url, { url = it }, label = { Text("Sunucu adresi") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(6.dp))
        Muted("Emülatör: http://10.0.2.2:3000 · Telefon: bilgisayarınızın yerel IP adresi, ör. http://192.168.1.20:3000 (sunucu açılışta adresi yazdırır).")
        Spacer(Modifier.height(16.dp))
        Button(onClick = { app.changeServer(url) }, modifier = Modifier.fillMaxWidth()) { Text("Bağlan") }
    }
}

@Composable
private fun MainNavigation() {
    val nav = LocalNav.current
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    Scaffold(
        bottomBar = {
            if (TABS.any { it.route == route }) {
                NavigationBar {
                    TABS.forEach { tab ->
                        NavigationBarItem(
                            selected = route == tab.route,
                            onClick = {
                                nav.navigate(tab.route) {
                                    popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(tab.icon, tab.label) },
                            label = { Text(tab.label, maxLines = 1) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(nav, startDestination = "home", modifier = Modifier.padding(bottom = padding.calculateBottomPadding())) {
            composable("home") { HomeScreen() }
            composable("topics") { TopicsScreen() }
            composable("polls") { PollsScreen() }
            composable("graph") { GraphScreen() }
            composable("more") { MoreScreen() }
            composable("topic/{id}", arguments = listOf(navArgument("id") { type = NavType.IntType })) {
                TopicDetailScreen(it.arguments?.getInt("id") ?: 0)
            }
            composable("poll/{id}", arguments = listOf(navArgument("id") { type = NavType.IntType })) {
                PollDetailScreen(it.arguments?.getInt("id") ?: 0)
            }
            composable("user/{id}") { UserScreen(it.arguments?.getString("id").orEmpty()) }
            composable(
                "newTopic?parent={parent}",
                arguments = listOf(navArgument("parent") { type = NavType.IntType; defaultValue = 0 }),
            ) { NewTopicScreen(it.arguments?.getInt("parent") ?: 0) }
            composable("ledger") { LedgerScreen() }
            composable("regulation") { RegulationScreen() }
            composable("experts") { ExpertsScreen() }
            composable("profile") { ProfileScreen() }
            composable("notifications") { NotificationsScreen() }
            composable("login") { LoginScreen() }
            composable("register") { RegisterScreen() }
            composable("settings") { SettingsScreen() }
            composable("about") { AboutScreen() }
        }
    }
}

/** Bir oylamanın ilgili sayfasını (konu, oylama) açar. */
fun openLink(nav: androidx.navigation.NavController, link: String) {
    val clean = link.removePrefix("#/")
    val parts = clean.split("/")
    when (parts.getOrNull(0)) {
        "konu" -> parts.getOrNull(1)?.substringBefore('?')?.toIntOrNull()?.let { nav.navigate("topic/$it") }
        "oylama" -> parts.getOrNull(1)?.toIntOrNull()?.let { nav.navigate("poll/$it") }
        "uye" -> parts.getOrNull(1)?.let { nav.navigate("user/$it") }
        "oylamalar" -> nav.navigate("polls")
        else -> Unit
    }
}
