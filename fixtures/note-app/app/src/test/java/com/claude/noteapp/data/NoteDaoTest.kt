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
class NoteDaoTest {

    private lateinit var database: NoteDatabase
    private lateinit var noteDao: NoteDao

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database = Room.inMemoryDatabaseBuilder(context, NoteDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        noteDao = database.noteDao()
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun insertAndRetrieveNote() = runBlocking {
        val note = NoteEntity(
            title = "Meeting Notes",
            content = "Discuss Q4 objectives",
            timestamp = 1700000000000L,
            tags = listOf("work", "q4"),
            isPinned = false
        )
        val id = noteDao.insertOrUpdateNote(note)
        assertTrue(id > 0)

        val retrieved = noteDao.getNoteById(id)
        assertNotNull(retrieved)
        assertEquals("Meeting Notes", retrieved?.title)
        assertEquals("Discuss Q4 objectives", retrieved?.content)
        assertEquals(listOf("work", "q4"), retrieved?.tags)
        assertFalse(retrieved!!.isPinned)
    }

    @Test
    fun getNotesSortedByPinAndTimestamp() = runBlocking {
        val note1 = NoteEntity(title = "Old unpinned", content = "", timestamp = 100L, isPinned = false)
        val note2 = NoteEntity(title = "New unpinned", content = "", timestamp = 200L, isPinned = false)
        val note3 = NoteEntity(title = "Pinned note", content = "", timestamp = 50L, isPinned = true)

        noteDao.insertOrUpdateNote(note1)
        noteDao.insertOrUpdateNote(note2)
        noteDao.insertOrUpdateNote(note3)

        val all = noteDao.getAllNotes().first()
        assertEquals(3, all.size)
        // INVAR-04: Pinned note must be first
        assertEquals("Pinned note", all[0].title)
        assertTrue(all[0].isPinned)
        // Subsequent notes ordered by timestamp desc
        assertEquals("New unpinned", all[1].title)
        assertEquals("Old unpinned", all[2].title)
    }

    @Test
    fun searchNotesMatchesTitleAndContent() = runBlocking {
        noteDao.insertOrUpdateNote(NoteEntity(title = "Shopping List", content = "Apples, Milk"))
        noteDao.insertOrUpdateNote(NoteEntity(title = "Architecture Spec", content = "Compose state hoisting"))

        val searchApple = noteDao.searchNotes("apple").first()
        assertEquals(1, searchApple.size)
        assertEquals("Shopping List", searchApple[0].title)

        val searchCompose = noteDao.searchNotes("compose").first()
        assertEquals(1, searchCompose.size)
        assertEquals("Architecture Spec", searchCompose[0].title)

        val searchNone = noteDao.searchNotes("nonexistent").first()
        assertTrue(searchNone.isEmpty())
    }

    @Test
    fun deleteNoteRemovesEntry() = runBlocking {
        val id = noteDao.insertOrUpdateNote(NoteEntity(title = "To Delete", content = ""))
        assertEquals(1, noteDao.getNoteCount())

        noteDao.deleteNoteById(id)
        assertNull(noteDao.getNoteById(id))
        assertEquals(0, noteDao.getNoteCount())
    }

    @Test
    fun updatePinStatusTogglesState() = runBlocking {
        val id = noteDao.insertOrUpdateNote(NoteEntity(title = "Toggle Pin", content = "", isPinned = false))
        assertFalse(noteDao.getNoteById(id)!!.isPinned)

        noteDao.updatePinStatus(id, true)
        assertTrue(noteDao.getNoteById(id)!!.isPinned)
    }
}
