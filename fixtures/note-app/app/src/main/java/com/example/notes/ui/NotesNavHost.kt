package com.example.notes.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import com.claude.noteapp.data.NoteRepository
import com.claude.noteapp.navigation.NoteNavHost

/**
 * Compatibility bridge for NotesNavHost adhering to project layout conventions.
 * Delegates directly to the canonical com.claude.noteapp.navigation.NoteNavHost.
 */
@Composable
fun NotesNavHost(
    navController: NavHostController,
    repository: NoteRepository,
    modifier: Modifier = Modifier
) {
    NoteNavHost(
        navController = navController,
        repository = repository,
        modifier = modifier
    )
}
