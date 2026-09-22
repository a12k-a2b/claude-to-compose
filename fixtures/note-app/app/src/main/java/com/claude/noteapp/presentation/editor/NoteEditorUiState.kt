package com.claude.noteapp.presentation.editor

data class NoteEditorUiState(
    val noteId: Long = 0L,
    val title: String = "",
    val content: String = "",
    val tags: List<String> = emptyList(),
    val isPinned: Boolean = false,
    val isSaving: Boolean = false,
    val lastSavedTimestamp: Long = 0L,
    val isNewNote: Boolean = true,
    val isDeleted: Boolean = false
) {
    val canSave: Boolean get() = title.isNotBlank() || content.isNotBlank()
}
