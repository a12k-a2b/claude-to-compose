package com.claude.noteapp.data

import kotlinx.coroutines.flow.Flow

class NoteRepositoryImpl(
    private val noteDao: NoteDao
) : NoteRepository {
    override fun getAllNotes(): Flow<List<NoteEntity>> = noteDao.getAllNotes()

    override fun searchNotes(query: String): Flow<List<NoteEntity>> {
        return if (query.isBlank()) {
            noteDao.getAllNotes()
        } else {
            noteDao.searchNotes(query.trim())
        }
    }

    override suspend fun getNoteById(id: Long): NoteEntity? = noteDao.getNoteById(id)

    override fun observeNoteById(id: Long): Flow<NoteEntity?> = noteDao.observeNoteById(id)

    override suspend fun saveNote(note: NoteEntity): Long = noteDao.insertOrUpdateNote(note)

    override suspend fun deleteNote(id: Long) = noteDao.deleteNoteById(id)

    override suspend fun togglePin(id: Long, isPinned: Boolean) = noteDao.updatePinStatus(id, isPinned)

    override suspend fun getNoteCount(): Int = noteDao.getNoteCount()
}
