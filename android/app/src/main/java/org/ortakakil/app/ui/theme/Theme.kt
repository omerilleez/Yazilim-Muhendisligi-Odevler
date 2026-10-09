package org.ortakakil.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Teal = Color(0xFF0F6E66)
val TealLight = Color(0xFF2BB3A6)
val Yes = Color(0xFF16803C)
val No = Color(0xFFC2412D)
val Abstain = Color(0xFF8A93A3)
val Warn = Color(0xFFB45309)
val Purple = Color(0xFF7C3AED)
val Orange = Color(0xFFC2410C)
val Accent = Color(0xFF4F46E5)

private val LightColors = lightColorScheme(
    primary = Teal,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD5EFEC),
    onPrimaryContainer = Color(0xFF00201D),
    secondary = Accent,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFE4E3FF),
    onSecondaryContainer = Color(0xFF15124B),
    background = Color(0xFFF5F6F8),
    surface = Color.White,
    surfaceVariant = Color(0xFFF0F2F5),
    onSurfaceVariant = Color(0xFF5D6573),
    outline = Color(0xFFD5DAE1),
    outlineVariant = Color(0xFFE2E5EA),
    error = No,
)

private val DarkColors = darkColorScheme(
    primary = TealLight,
    onPrimary = Color(0xFF04201D),
    primaryContainer = Color(0xFF12312E),
    onPrimaryContainer = Color(0xFFB4ECE5),
    secondary = Color(0xFF8B85FF),
    background = Color(0xFF0F1216),
    surface = Color(0xFF171B21),
    surfaceVariant = Color(0xFF1F242C),
    onSurfaceVariant = Color(0xFFA2AAB7),
    outline = Color(0xFF3A414C),
    outlineVariant = Color(0xFF2B313B),
    error = Color(0xFFF07A63),
)

@Composable
fun OrtakAkilTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) DarkColors else LightColors, content = content)
}
