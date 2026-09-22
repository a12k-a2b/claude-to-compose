package com.claude.noteapp.data

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface NoteDao {
    @Query("SELECT * FROM notes ORDER BY isPinned DESC, timestamp DESC")
    fun getAllNotes(): Flow<List<NoteEntity>>

    @Query("SELECT * FROM notes WHERE title LIKE '%' || :query || '%' OR content LIKE '%' || :query || '%' ORDER BY isPinned DESC, timestamp DESC")
    fun searchNotes(query: String): Flow<List<NoteEntity>>

    @Query("SELECT * FROM notes WHERE id = :id")
    suspend fun getNoteById(id: Long): NoteEntity?

    @Query("SELECT * FROM notes WHERE id = :id")
    fun observeNoteById(id: Long): Flow<NoteEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrUpdateNote(note: NoteEntity): Long

    @Delete
    suspend fun deleteNote(note: NoteEntity)

    @Query("DELETE FROM notes WHERE id = :id")
    suspend fun deleteNoteById(id: Long)

    @Query("UPDATE notes SET isPinned = :isPinned WHERE id = :id")
    suspend fun updatePinStatus(id: Long, isPinned: Boolean)

    @Query("SELECT COUNT(*) FROM notes")
    suspend fun getNoteCount(): Int
}
