package com.claude.noteapp

import android.app.Application
import com.claude.noteapp.data.NoteDatabase
import com.claude.noteapp.data.NoteRepository
import com.claude.noteapp.data.NoteRepositoryImpl

class NoteApplication : Application() {
    val database: NoteDatabase by lazy { NoteDatabase.getInstance(this) }
    val repository: NoteRepository by lazy { NoteRepositoryImpl(database.noteDao()) }
}
