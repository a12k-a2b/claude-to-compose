package com.claude.compose

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import com.claude.compose.screen.ClaudeDesignScreen
import com.claude.compose.screen.Da63DesignScreen
import com.claude.compose.screen.DaylightDc1Screen
import com.claude.compose.screen.DaylightOnboardingScreen
import com.claude.compose.screen.E34fDesignScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val screen = intent.getStringExtra("screen") ?: "dc1"
        setContent {
            when (screen) {
                "e34f" -> E34fDesignScreen(modifier = Modifier.fillMaxSize())
                "da63" -> Da63DesignScreen(modifier = Modifier.fillMaxSize())
                "claude" -> ClaudeDesignScreen(modifier = Modifier.fillMaxSize())
                "onboarding" -> DaylightOnboardingScreen(modifier = Modifier.fillMaxSize())
                else -> DaylightDc1Screen(modifier = Modifier.fillMaxSize())
            }
        }
    }
}
