package com.claude.noteapp.data

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class NoteRepositoryTest {

    private lateinit var database: NoteDatabase
    private lateinit var noteDao: NoteDao
    private lateinit var repository: NoteRepository

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database = Room.inMemoryDatabaseBuilder(context, NoteDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        noteDao = database.noteDao()
        repository = NoteRepositoryImpl(noteDao)
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun repositorySavesAndRetrievesNote() = runBlocking {
        val note = NoteEntity(
            title = "Repository Unit Test",
            content = "Testing NoteRepository implementation",
            timestamp = 1700000000000L
        )
        val id = repository.saveNote(note)
        assertTrue(id > 0)

        val retrieved = repository.getNoteById(id)
        assertNotNull(retrieved)
        assertEquals("Repository Unit Test", retrieved?.title)
        assertEquals("Testing NoteRepository implementation", retrieved?.content)
    }

    @Test
    fun repositorySearchFiltersNotes() = runBlocking {
        repository.saveNote(NoteEntity(title = "Kotlin Architecture", content = "Room Coroutines Flow"))
        repository.saveNote(NoteEntity(title = "Shopping List", content = "Coffee and Milk"))

        val searchResult = repository.searchNotes("Architecture").first()
        assertEquals(1, searchResult.size)
        assertEquals("Kotlin Architecture", searchResult[0].title)

        val emptyQuery = repository.searchNotes("").first()
        assertEquals(2, emptyQuery.size)
    }

    @Test
    fun repositoryDeleteNoteRemovesData() = runBlocking {
        val id = repository.saveNote(NoteEntity(title = "Transient Note", content = ""))
        assertEquals(1, repository.getNoteCount())

        repository.deleteNote(id)
        assertNull(repository.getNoteById(id))
        assertEquals(0, repository.getNoteCount())
    }

    @Test
    fun repositoryTogglePinUpdatesStatus() = runBlocking {
        val id = repository.saveNote(NoteEntity(title = "Pinned Item", content = "", isPinned = false))
        assertFalse(repository.getNoteById(id)!!.isPinned)

        repository.togglePin(id, true)
        assertTrue(repository.getNoteById(id)!!.isPinned)
    }
}
