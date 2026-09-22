package com.claude.noteapp.navigation

sealed class NoteAppDestination(val route: String) {
    data object NotesList : NoteAppDestination("notes_list")
    data object NoteEditor : NoteAppDestination("note_editor/{noteId}") {
        fun createRoute(noteId: Long = 0L) = "note_editor/$noteId"
    }
}
