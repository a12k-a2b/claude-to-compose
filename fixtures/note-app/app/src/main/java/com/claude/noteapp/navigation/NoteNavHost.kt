package com.claude.noteapp.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.claude.noteapp.data.NoteRepository
import com.claude.noteapp.presentation.editor.NoteEditorAction
import com.claude.noteapp.presentation.editor.NoteEditorViewModel
import com.claude.noteapp.presentation.list.NotesListAction
import com.claude.noteapp.presentation.list.NotesListViewModel
import com.claude.noteapp.ui.editor.NoteEditorScreen
import com.claude.noteapp.ui.list.NotesListScreen

@Composable
fun NoteNavHost(
    navController: NavHostController,
    repository: NoteRepository,
    modifier: Modifier = Modifier
) {
    NavHost(
        navController = navController,
        startDestination = NoteAppDestination.NotesList.route,
        modifier = modifier
    ) {
        composable(NoteAppDestination.NotesList.route) {
            val viewModel: NotesListViewModel = viewModel(
                factory = object : androidx.lifecycle.ViewModelProvider.Factory {
                    @Suppress("UNCHECKED_CAST")
                    override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                        return NotesListViewModel(repository) as T
                    }
                }
            )
            val uiState by viewModel.uiState.collectAsStateWithLifecycle()
            NotesListScreen(
                uiState = uiState,
                onAction = viewModel::onAction,
                onNavigateToEditor = { noteId ->
                    navController.navigate(NoteAppDestination.NoteEditor.createRoute(noteId))
                }
            )
        }
        composable(
            route = NoteAppDestination.NoteEditor.route,
            arguments = listOf(
                navArgument("noteId") {
                    type = NavType.LongType
                    defaultValue = 0L
                }
            )
        ) { backStackEntry ->
            val noteId = backStackEntry.arguments?.getLong("noteId") ?: 0L
            val viewModel: NoteEditorViewModel = viewModel(
                key = "editor_$noteId",
                factory = object : androidx.lifecycle.ViewModelProvider.Factory {
                    @Suppress("UNCHECKED_CAST")
                    override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                        return NoteEditorViewModel(repository, initialNoteId = noteId) as T
                    }
                }
            )
            val uiState by viewModel.uiState.collectAsStateWithLifecycle()
            NoteEditorScreen(
                uiState = uiState,
                onAction = viewModel::onAction,
                onNavigateBack = {
                    viewModel.onAction(NoteEditorAction.OnBackClicked)
                    navController.popBackStack()
                }
            )
        }
    }
}
