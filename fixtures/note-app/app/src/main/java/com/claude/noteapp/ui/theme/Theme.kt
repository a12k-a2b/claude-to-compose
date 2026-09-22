package com.claude.noteapp.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val LightColorScheme = lightColorScheme(
    primary = Os900,
    onPrimary = Os0,
    primaryContainer = Os50,
    onPrimaryContainer = Os900,
    secondary = Os400,
    onSecondary = Os0,
    background = Os0,
    onBackground = Os900,
    surface = Os0,
    onSurface = Os900,
    surfaceVariant = Os50,
    onSurfaceVariant = Os400,
    outline = Os100
)

private val DarkColorScheme = darkColorScheme(
    primary = Os0,
    onPrimary = Os1000,
    primaryContainer = Os800,
    onPrimaryContainer = Os0,
    secondary = Os300,
    onSecondary = Os1000,
    background = Os1000,
    onBackground = Os0,
    surface = Os900,
    onSurface = Os0,
    surfaceVariant = Os800,
    onSurfaceVariant = Os200,
    outline = Os400
)

@Composable
fun NoteAppTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
