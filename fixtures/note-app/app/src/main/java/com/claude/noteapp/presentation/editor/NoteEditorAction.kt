package com.claude.noteapp.presentation.editor

sealed interface NoteEditorAction {
    data class OnTitleChanged(val title: String) : NoteEditorAction
    data class OnContentChanged(val content: String) : NoteEditorAction
    data class OnAddTag(val tag: String) : NoteEditorAction
    data class OnRemoveTag(val tag: String) : NoteEditorAction
    data object OnTogglePin : NoteEditorAction
    data object OnManualSave : NoteEditorAction
    data object OnDeleteNote : NoteEditorAction
    data object OnBackClicked : NoteEditorAction
}
