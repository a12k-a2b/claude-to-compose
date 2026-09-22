package com.claude.noteapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.navigation.compose.rememberNavController
import com.claude.noteapp.navigation.NoteNavHost
import com.claude.noteapp.ui.theme.NoteAppTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as NoteApplication
        setContent {
            NoteAppTheme {
                val navController = rememberNavController()
                NoteNavHost(
                    navController = navController,
                    repository = app.repository
                )
            }
        }
    }
}
