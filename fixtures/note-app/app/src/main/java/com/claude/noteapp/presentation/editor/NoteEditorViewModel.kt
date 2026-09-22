package com.claude.noteapp.presentation.editor

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.claude.noteapp.data.NoteEntity
import com.claude.noteapp.data.NoteRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class NoteEditorViewModel(
    private val repository: NoteRepository,
    savedStateHandle: SavedStateHandle? = null,
    initialNoteId: Long = 0L
) : ViewModel() {

    private val noteIdFromNav: Long = savedStateHandle?.get<Long>("noteId") ?: initialNoteId

    private val _uiState = MutableStateFlow(
        NoteEditorUiState(
            noteId = noteIdFromNav,
            isNewNote = noteIdFromNav == 0L
        )
    )
    val uiState: StateFlow<NoteEditorUiState> = _uiState.asStateFlow()

    private var autosaveJob: Job? = null
    private val debounceMs: Long = 500L

    init {
        if (noteIdFromNav > 0L) {
            loadExistingNote(noteIdFromNav)
        }
    }

    private fun loadExistingNote(id: Long) {
        viewModelScope.launch {
            val note = repository.getNoteById(id)
            if (note != null) {
                _uiState.update {
                    it.copy(
                        noteId = note.id,
                        title = note.title,
                        content = note.content,
                        tags = note.tags,
                        isPinned = note.isPinned,
                        lastSavedTimestamp = note.timestamp,
                        isNewNote = false
                    )
                }
            }
        }
    }

    fun onAction(action: NoteEditorAction) {
        when (action) {
            is NoteEditorAction.OnTitleChanged -> {
                _uiState.update { it.copy(title = action.title) }
                scheduleAutosave()
            }
            is NoteEditorAction.OnContentChanged -> {
                _uiState.update { it.copy(content = action.content) }
                scheduleAutosave()
            }
            is NoteEditorAction.OnAddTag -> {
                val trimmed = action.tag.trim()
                if (trimmed.isNotEmpty() && !_uiState.value.tags.contains(trimmed)) {
                    _uiState.update { it.copy(tags = it.tags + trimmed) }
                    scheduleAutosave()
                }
            }
            is NoteEditorAction.OnRemoveTag -> {
                _uiState.update { it.copy(tags = it.tags.filter { t -> t != action.tag }) }
                scheduleAutosave()
            }
            is NoteEditorAction.OnTogglePin -> {
                val newPinned = !_uiState.value.isPinned
                _uiState.update { it.copy(isPinned = newPinned) }
                scheduleAutosave()
            }
            is NoteEditorAction.OnManualSave -> {
                viewModelScope.launch {
                    flushPendingSave()
                }
            }
            is NoteEditorAction.OnDeleteNote -> {
                val currentId = _uiState.value.noteId
                if (currentId > 0L) {
                    viewModelScope.launch {
                        autosaveJob?.cancel()
                        repository.deleteNote(currentId)
                        _uiState.update { it.copy(isDeleted = true) }
                    }
                } else {
                    _uiState.update { it.copy(isDeleted = true) }
                }
            }
            is NoteEditorAction.OnBackClicked -> {
                viewModelScope.launch {
                    flushPendingSave()
                }
            }
        }
    }

    private fun scheduleAutosave() {
        autosaveJob?.cancel()
        autosaveJob = viewModelScope.launch {
            delay(debounceMs)
            executeSave()
        }
    }

    suspend fun flushPendingSave(): Long? {
        autosaveJob?.cancel()
        return executeSave()
    }

    private suspend fun executeSave(): Long? {
        val currentState = _uiState.value
        if (!currentState.canSave || currentState.isDeleted) return null

        _uiState.update { it.copy(isSaving = true) }
        val now = System.currentTimeMillis()
        val entity = NoteEntity(
            id = currentState.noteId,
            title = currentState.title.trim(),
            content = currentState.content.trim(),
            timestamp = now,
            tags = currentState.tags,
            isPinned = currentState.isPinned
        )
        val savedId = repository.saveNote(entity)
        _uiState.update {
            it.copy(
                noteId = savedId,
                isSaving = false,
                lastSavedTimestamp = now,
                isNewNote = false
            )
        }
        return savedId
    }
}
