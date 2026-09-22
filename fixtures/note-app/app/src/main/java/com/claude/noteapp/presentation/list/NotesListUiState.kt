package com.claude.noteapp.presentation.list

import com.claude.noteapp.data.NoteEntity

data class NotesListUiState(
    val notes: List<NoteEntity> = emptyList(),
    val searchQuery: String = "",
    val isSearchActive: Boolean = false,
    val selectedTagFilter: String? = null,
    val availableTags: List<String> = emptyList(),
    val isLoading: Boolean = false
) {
    val pinnedNotes: List<NoteEntity> get() = notes.filter { it.isPinned }
    val otherNotes: List<NoteEntity> get() = notes.filter { !it.isPinned }
    val isEmpty: Boolean get() = notes.isEmpty() && !isLoading
}
