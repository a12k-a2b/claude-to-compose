package com.claude.noteapp.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "notes")
data class NoteEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,
    val title: String,
    val content: String,
    val timestamp: Long = System.currentTimeMillis(),
    val tags: List<String> = emptyList(),
    val isPinned: Boolean = false
)
