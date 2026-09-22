package com.claude.noteapp.ui

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import com.claude.noteapp.data.NoteEntity
import com.claude.noteapp.ui.components.NoteCard
import com.claude.noteapp.ui.theme.NoteAppTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class NoteAccessibilityTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun noteCardHasAccessibleContentDescription() {
        val testNote = NoteEntity(
            id = 42L,
            title = "Accessible Task Note",
            content = "Validating contentDescription semantics",
            timestamp = 1700000000000L,
            isPinned = true
        )
        composeTestRule.setContent {
            NoteAppTheme {
                NoteCard(
                    note = testNote,
                    onClick = {},
                    onTogglePin = {}
                )
            }
        }

        // Verify that pin toggle icon has accessible content description
        composeTestRule.onNodeWithContentDescription("Unpin Note").assertIsDisplayed()
    }
}
