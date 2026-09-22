package com.claude.noteapp.data

import kotlinx.coroutines.flow.Flow

interface NoteRepository {
    fun getAllNotes(): Flow<List<NoteEntity>>
    fun searchNotes(query: String): Flow<List<NoteEntity>>
    suspend fun getNoteById(id: Long): NoteEntity?
    fun observeNoteById(id: Long): Flow<NoteEntity?>
    suspend fun saveNote(note: NoteEntity): Long
    suspend fun deleteNote(id: Long)
    suspend fun togglePin(id: Long, isPinned: Boolean)
    suspend fun getNoteCount(): Int
}
