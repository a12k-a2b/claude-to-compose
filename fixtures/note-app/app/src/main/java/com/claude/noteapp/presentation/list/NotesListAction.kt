package com.claude.noteapp.presentation.list

sealed interface NotesListAction {
    data class OnSearchQueryChanged(val query: String) : NotesListAction
    data class OnSearchActiveChanged(val active: Boolean) : NotesListAction
    data object OnClearSearch : NotesListAction
    data class OnTagFilterSelected(val tag: String?) : NotesListAction
    data class OnTogglePin(val noteId: Long, val currentPinned: Boolean) : NotesListAction
    data class OnDeleteNote(val noteId: Long) : NotesListAction
    data object OnAddNoteClicked : NotesListAction
    data class OnNoteClicked(val noteId: Long) : NotesListAction
}
