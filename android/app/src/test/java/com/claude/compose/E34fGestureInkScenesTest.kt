package com.claude.compose

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.claude.compose.screen.E34F_GESTURE_INK_REFERENCES
import com.claude.compose.screen.E34fGestureInkScene
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class E34fGestureInkScenesTest {
    @get:Rule val rule = createAndroidComposeRule<ComponentActivity>()

    @Test @Config(sdk = [34], qualifiers = "w820dp-h740dp-mdpi")
    fun gestureHelpAndSelectionChangeObservableSyntheticState() {
        rule.setContent { E34fGestureInkScene("g1") }
        rule.onNodeWithContentDescription("Exploration 1 of 6 · Gesture grammar · native study").assertExists()
        rule.onNodeWithContentDescription("Selected synthetic gesture Correct").assertExists()
        listOf("Correct", "Select", "Step", "Snap", "Summon", "Flip").forEach { gesture ->
            rule.onNodeWithContentDescription("Gesture example $gesture").assertExists()
        }
        listOf("Scribble to erase", "Circle to lasso", "Two fingers back, three forward",
            "Draw rough, hold to true", "Squeeze for the dial", "Double-tap for last tool").forEach { title ->
            rule.onNodeWithText(title).assertExists()
        }
        rule.onNodeWithContentDescription("Gesture example Select").performClick().assertIsSelected()
        rule.onNodeWithContentDescription("Selected synthetic gesture Select").assertExists()
        rule.onNodeWithContentDescription("Gesture example Flip").performScrollTo().performClick().assertIsSelected()
        rule.onNodeWithContentDescription("Selected synthetic gesture Flip").assertExists()
        rule.onNodeWithText("circle + hold").assertExists()
        rule.onNodeWithContentDescription("Gesture help toggle").performClick()
        rule.onNodeWithText("circle + hold").assertDoesNotExist()
        rule.onNodeWithContentDescription("Native behavior and visual parity blocked").assertExists()
    }

    @Test @Config(sdk = [34], qualifiers = "w820dp-h740dp-mdpi")
    fun inkControlsUpdateOneSharedSyntheticPenState() {
        rule.setContent { E34fGestureInkScene("g3") }
        rule.onNodeWithContentDescription("Exploration 3 of 6 · Ink & nib · native study").assertExists()
        rule.onNodeWithContentDescription("Nib Marker").performClick().assertIsSelected()
        rule.onAllNodesWithContentDescription("Ink size 4")[0].performClick().assertIsSelected()
        rule.onAllNodesWithContentDescription("Ink shade 3")[0].performClick().assertIsSelected()
        rule.onNodeWithContentDescription("Synthetic pen Marker size 4 shade 3 pressure 60 percent").assertExists()
        rule.onNodeWithContentDescription("Pen card toggle").performClick()
        rule.onNodeWithText("Pen · quick strip").assertExists()
        rule.onNodeWithContentDescription("Pen card nib Fountain").assertDoesNotExist()
        rule.onNodeWithContentDescription("Native behavior and visual parity blocked").assertExists()
    }

    @Test @Config(sdk = [34], qualifiers = "w820dp-h740dp-mdpi")
    fun unknownSceneDoesNotImpersonateOneOfTheReferences() {
        rule.setContent { E34fGestureInkScene("g9") }
        rule.onNodeWithContentDescription("Gesture and ink scene g9 blocked").assertExists()
        rule.onNodeWithText("Gesture grammar").assertDoesNotExist()
        rule.onNodeWithText("Ink & nib").assertDoesNotExist()
    }

    @Test fun pinnedSourceSectionHashesAreDistinctAndComplete() {
        assertEquals(setOf("g1", "g3"), E34F_GESTURE_INK_REFERENCES.map { it.sceneId }.toSet())
        assertEquals(2, E34F_GESTURE_INK_REFERENCES.map { it.sha256 }.toSet().size)
        assertTrue(E34F_GESTURE_INK_REFERENCES.all { it.sha256.matches(Regex("[a-f0-9]{64}")) })
    }
}
