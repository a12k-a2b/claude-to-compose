package com.claude.noteapp.presentation

import com.claude.noteapp.data.NoteEntity
import com.claude.noteapp.data.NoteRepository
import com.claude.noteapp.presentation.editor.NoteEditorAction
import com.claude.noteapp.presentation.editor.NoteEditorViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class NoteEditorViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var fakeRepository: FakeNoteRepository

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        fakeRepository = FakeNoteRepository()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun autosaveDebounceSavesAfterDelay() = runTest(testDispatcher) {
        val viewModel = NoteEditorViewModel(fakeRepository, initialNoteId = 0L)
        viewModel.onAction(NoteEditorAction.OnTitleChanged("Draft Title"))
        viewModel.onAction(NoteEditorAction.OnContentChanged("Draft Content"))

        // Before debounce window elapses
        advanceTimeBy(300)
        assertEquals(0, fakeRepository.notes.size)

        // After debounce window elapses (500ms)
        advanceTimeBy(300)
        assertEquals(1, fakeRepository.notes.size)
        assertEquals("Draft Title", fakeRepository.notes[0].title)
        assertEquals("Draft Content", fakeRepository.notes[0].content)
        assertTrue(viewModel.uiState.value.lastSavedTimestamp > 0)
        assertFalse(viewModel.uiState.value.isNewNote)
    }

    @Test
    fun flushPendingSavePersistsImmediatelyWithoutDelay() = runTest(testDispatcher) {
        val viewModel = NoteEditorViewModel(fakeRepository, initialNoteId = 0L)
        viewModel.onAction(NoteEditorAction.OnTitleChanged("Immediate Save"))

        // Call flushPendingSave() immediately
        val savedId = viewModel.flushPendingSave()
        assertNotNull(savedId)
        assertEquals(1, fakeRepository.notes.size)
        assertEquals("Immediate Save", fakeRepository.notes[0].title)
    }

    @Test
    fun emptyNoteDoesNotSave() = runTest(testDispatcher) {
        val viewModel = NoteEditorViewModel(fakeRepository, initialNoteId = 0L)
        advanceTimeBy(1000)
        assertEquals(0, fakeRepository.notes.size)

        val savedId = viewModel.flushPendingSave()
        assertNull(savedId)
        assertEquals(0, fakeRepository.notes.size)
    }

    private class FakeNoteRepository : NoteRepository {
        val notes = mutableListOf<NoteEntity>()
        private var nextId = 1L

        override fun getAllNotes(): Flow<List<NoteEntity>> = flowOf(notes)
        override fun searchNotes(query: String): Flow<List<NoteEntity>> = flowOf(notes)
        override suspend fun getNoteById(id: Long): NoteEntity? = notes.find { it.id == id }
        override fun observeNoteById(id: Long): Flow<NoteEntity?> = flowOf(notes.find { it.id == id })
        override suspend fun saveNote(note: NoteEntity): Long {
            val id = if (note.id == 0L) nextId++ else note.id
            notes.removeAll { it.id == id }
            notes.add(note.copy(id = id))
            return id
        }
        override suspend fun deleteNote(id: Long) { notes.removeAll { it.id == id } }
        override suspend fun togglePin(id: Long, isPinned: Boolean) {
            val index = notes.indexOfFirst { it.id == id }
            if (index >= 0) notes[index] = notes[index].copy(isPinned = isPinned)
        }
        override suspend fun getNoteCount(): Int = notes.size
    }
}
