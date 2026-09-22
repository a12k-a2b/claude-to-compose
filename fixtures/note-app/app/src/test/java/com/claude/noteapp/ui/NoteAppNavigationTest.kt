package com.claude.noteapp.ui

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.navigation.compose.rememberNavController
import com.claude.noteapp.data.NoteEntity
import com.claude.noteapp.data.NoteRepository
import com.claude.noteapp.navigation.NoteNavHost
import com.claude.noteapp.presentation.NoteAppTestTags
import com.claude.noteapp.ui.theme.NoteAppTheme
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class NoteAppNavigationTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<ComponentActivity>()

    private val fakeRepository = MemoryNoteRepository()

    @Test
    fun endToEnd_emptyState_createNote_backToList_notePersisted() {
        composeTestRule.setContent {
            NoteAppTheme {
                val navController = rememberNavController()
                NoteNavHost(navController = navController, repository = fakeRepository)
            }
        }

        // 1. Assert List Screen and Empty View initially displayed
        composeTestRule.onNodeWithTag(NoteAppTestTags.SCREEN_NOTES_LIST).assertIsDisplayed()
        composeTestRule.onNodeWithTag(NoteAppTestTags.EMPTY_STATE_VIEW).assertIsDisplayed()

        // 2. Click FAB to navigate to Editor
        composeTestRule.onNodeWithTag(NoteAppTestTags.ADD_NOTE_FAB).performClick()

        // 3. Assert Editor Screen displayed
        composeTestRule.onNodeWithTag(NoteAppTestTags.SCREEN_NOTE_EDITOR).assertIsDisplayed()

        // 4. Input title and content
        composeTestRule.onNodeWithTag(NoteAppTestTags.EDITOR_TITLE_INPUT).performTextInput("Robolectric Test Note")
        composeTestRule.onNodeWithTag(NoteAppTestTags.EDITOR_CONTENT_INPUT).performTextInput("Verified persistence across navigation.")

        // 5. Press Back Button (INVAR-02 & INVAR-03: Immediate flush save and backstack pop)
        composeTestRule.onNodeWithTag(NoteAppTestTags.EDITOR_BACK_BUTTON).performClick()

        // 6. Assert List Screen displayed again and note item is visible
        composeTestRule.onNodeWithTag(NoteAppTestTags.SCREEN_NOTES_LIST).assertIsDisplayed()
        composeTestRule.onNodeWithText("Robolectric Test Note").assertIsDisplayed()
        composeTestRule.onNodeWithText("Verified persistence across navigation.").assertIsDisplayed()
    }

    @Test
    fun hardwareBackButton_fromEditor_flushesSaveAndPopsToNotesList() {
        composeTestRule.setContent {
            NoteAppTheme {
                val navController = rememberNavController()
                NoteNavHost(navController = navController, repository = fakeRepository)
            }
        }

        // Navigate to editor
        composeTestRule.onNodeWithTag(NoteAppTestTags.ADD_NOTE_FAB).performClick()
        composeTestRule.onNodeWithTag(NoteAppTestTags.SCREEN_NOTE_EDITOR).assertIsDisplayed()

        // Input text
        composeTestRule.onNodeWithTag(NoteAppTestTags.EDITOR_TITLE_INPUT).performTextInput("Hardware Back Note")
        composeTestRule.onNodeWithTag(NoteAppTestTags.EDITOR_CONTENT_INPUT).performTextInput("Preserved via BackHandler.")

        // Dispatch hardware back press via activity onBackPressedDispatcher
        composeTestRule.activity.onBackPressedDispatcher.onBackPressed()

        // Assert returned to notes list and note was persisted
        composeTestRule.onNodeWithTag(NoteAppTestTags.SCREEN_NOTES_LIST).assertIsDisplayed()
        composeTestRule.onNodeWithText("Hardware Back Note").assertIsDisplayed()
        composeTestRule.onNodeWithText("Preserved via BackHandler.").assertIsDisplayed()
    }

    private class MemoryNoteRepository : NoteRepository {
        private val _notes = MutableStateFlow<List<NoteEntity>>(emptyList())
        private var idCounter = 1L

        override fun getAllNotes(): Flow<List<NoteEntity>> = _notes
        override fun searchNotes(query: String): Flow<List<NoteEntity>> = _notes.map { list ->
            list.filter { it.title.contains(query, true) || it.content.contains(query, true) }
        }
        override suspend fun getNoteById(id: Long): NoteEntity? = _notes.value.find { it.id == id }
        override fun observeNoteById(id: Long): Flow<NoteEntity?> = _notes.map { list -> list.find { it.id == id } }
        override suspend fun saveNote(note: NoteEntity): Long {
            val assignedId = if (note.id == 0L) idCounter++ else note.id
            val updated = _notes.value.filter { it.id != assignedId } + note.copy(id = assignedId)
            _notes.value = updated
            return assignedId
        }
        override suspend fun deleteNote(id: Long) {
            _notes.value = _notes.value.filter { it.id != id }
        }
        override suspend fun togglePin(id: Long, isPinned: Boolean) {
            _notes.value = _notes.value.map { if (it.id == id) it.copy(isPinned = isPinned) else it }
        }
        override suspend fun getNoteCount(): Int = _notes.value.size
    }
}
