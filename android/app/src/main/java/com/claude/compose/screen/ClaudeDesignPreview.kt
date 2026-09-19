package com.claude.compose.screen

import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Devices
import androidx.compose.ui.tooling.preview.Preview
import com.claude.compose.theme.AppTheme
import com.claude.compose.theme.ClaudeDesignTheme

@Preview(
    name = "Light Theme",
    showBackground = true,
    widthDp = 390,
    heightDp = 844,
    uiMode = Configuration.UI_MODE_NIGHT_NO
)
@Composable
fun ClaudeDesignScreenLightPreview() {
    ClaudeDesignTheme(darkTheme = false) {
        ClaudeDesignScreen()
    }
}

@Preview(
    name = "Dark Theme",
    showBackground = true,
    widthDp = 390,
    heightDp = 844,
    uiMode = Configuration.UI_MODE_NIGHT_YES
)
@Composable
fun ClaudeDesignScreenDarkPreview() {
    ClaudeDesignTheme(darkTheme = true) {
        ClaudeDesignScreen()
    }
}

@Preview(
    name = "Mobile Pixel 7",
    device = Devices.PIXEL_7,
    showSystemUi = true
)
@Composable
fun ClaudeDesignScreenPixel7Preview() {
    ClaudeDesignTheme {
        ClaudeDesignScreen()
    }
}

@Preview(
    name = "Tablet Landscape",
    widthDp = 1280,
    heightDp = 800,
    showBackground = true
)
@Composable
fun ClaudeDesignScreenTabletPreview() {
    AppTheme {
        ClaudeDesignScreen()
    }
}

@Preview(
    name = "Claude Design Screen Preview",
    showBackground = true
)
@Composable
fun ClaudeDesignScreenPreview() {
    ClaudeDesignTheme {
        ClaudeDesignScreen()
    }
}
