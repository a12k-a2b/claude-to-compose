package com.claude.noteapp.presentation.list

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.claude.noteapp.data.NoteEntity
import com.claude.noteapp.data.NoteRepository
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@OptIn(ExperimentalCoroutinesApi::class)
class NotesListViewModel(
    private val repository: NoteRepository
) : ViewModel() {

    private val _searchQuery = MutableStateFlow("")
    private val _isSearchActive = MutableStateFlow(false)
    private val _selectedTag = MutableStateFlow<String?>(null)
    private val _isLoading = MutableStateFlow(false)

    private val _notesFlow: Flow<List<NoteEntity>> = combine(
        _searchQuery,
        _selectedTag
    ) { query, tag ->
        Pair(query, tag)
    }.flatMapLatest { (query, tag) ->
        val flow = if (query.isBlank()) {
            repository.getAllNotes()
        } else {
            repository.searchNotes(query)
        }
        flow.map { list ->
            if (tag != null) {
                list.filter { it.tags.contains(tag) }
            } else {
                list
            }
        }
    }

    val uiState: StateFlow<NotesListUiState> = combine(
        _notesFlow,
        _searchQuery,
        _isSearchActive,
        _selectedTag,
        _isLoading
    ) { notes, query, searchActive, tag, loading ->
        val allTags = notes.flatMap { it.tags }.distinct().sorted()
        NotesListUiState(
            notes = notes,
            searchQuery = query,
            isSearchActive = searchActive,
            selectedTagFilter = tag,
            availableTags = allTags,
            isLoading = loading
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = NotesListUiState(isLoading = true)
    )

    fun onAction(action: NotesListAction) {
        when (action) {
            is NotesListAction.OnSearchQueryChanged -> {
                _searchQuery.value = action.query
            }
            is NotesListAction.OnSearchActiveChanged -> {
                _isSearchActive.value = action.active
                if (!action.active) _searchQuery.value = ""
            }
            is NotesListAction.OnClearSearch -> {
                _searchQuery.value = ""
            }
            is NotesListAction.OnTagFilterSelected -> {
                _selectedTag.value = if (_selectedTag.value == action.tag) null else action.tag
            }
            is NotesListAction.OnTogglePin -> {
                viewModelScope.launch {
                    repository.togglePin(action.noteId, !action.currentPinned)
                }
            }
            is NotesListAction.OnDeleteNote -> {
                viewModelScope.launch {
                    repository.deleteNote(action.noteId)
                }
            }
            is NotesListAction.OnAddNoteClicked -> { /* Navigated in UI */ }
            is NotesListAction.OnNoteClicked -> { /* Navigated in UI */ }
        }
    }
}
