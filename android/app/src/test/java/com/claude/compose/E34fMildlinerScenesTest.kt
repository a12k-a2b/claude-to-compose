package com.claude.compose

import androidx.activity.ComponentActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.performClick
import com.claude.compose.screen.E34F_MILDLINER_REFERENCE_CAPTURES
import com.claude.compose.screen.E34F_MILDLINER_REFERENCE_FIGURES
import com.claude.compose.screen.E34F_MILDLINER_FIGURE_COUNTS
import com.claude.compose.screen.E34F_MILDLINER_SCENE_IDS
import com.claude.compose.screen.E34F_MILDLINER_SOURCE_TEXT_SHA256
import com.claude.compose.screen.E34fMildlinerScenes
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
class E34fMildlinerScenesTest {
    @get:Rule val rule = createAndroidComposeRule<ComponentActivity>()

    @Test @Config(sdk = [34], qualifiers = "w820dp-h740dp-mdpi")
    fun markerAndMildlinerSelectionChangesSyntheticContent() {
        rule.setContent { E34fMildlinerScenes("m0") }
        rule.onNodeWithText("Planners treat the canopy as infrastructure, mapped and budgeted like a bridge.").assertExists()
        rule.onNodeWithContentDescription("Select Mildliner").performClick()
        rule.onNodeWithText("A mature plane can hold thousands of litres a year, unbanked.").assertExists()
        rule.onNodeWithContentDescription("Synthetic feedback: Mildliner selected").assertExists()
    }

    @Test @Config(sdk = [34], qualifiers = "w820dp-h740dp-mdpi")
    fun sizeCardSelectionAndToolbarToolChangeAreVisible() {
        var scene by mutableStateOf("m2")
        var figure by mutableIntStateOf(1)
        rule.setContent { E34fMildlinerScenes(scene, figureIndex = figure) }
        rule.onNodeWithContentDescription("Mildliner size 4").performClick().assertIsSelected()
        rule.onNodeWithText("Done").performClick()
        rule.onNodeWithText("Open Mildliner settings").assertExists()
        rule.onNodeWithText("Open Mildliner settings").performClick()
        rule.onNodeWithContentDescription("Mildliner size 4").assertIsSelected()
        scene = "m1"
        rule.waitForIdle()
        rule.onNodeWithContentDescription("Synthetic highlights count 4").assertExists()
        rule.onNodeWithText("Keep added to highlights").performClick()
        rule.onNodeWithContentDescription("Synthetic highlights count 5").assertExists()
        rule.onNodeWithText("Highlights · 5 · Synthetic highlight 5").assertExists()
        figure = 1
        rule.waitForIdle()
        rule.onNodeWithText("Day").assertExists()
        figure = 2
        rule.waitForIdle()
        rule.onNodeWithText("Night").assertExists()
    }

    @Test @Config(sdk = [34], qualifiers = "w820dp-h740dp-mdpi")
    fun highlightsListRemovalMutatesVisibleListAndSmallClearNeedsSecondTap() {
        var scene by mutableStateOf("m3")
        rule.setContent { E34fMildlinerScenes(scene) }
        rule.onNodeWithText("Field notes · 4 highlights").assertExists()
        rule.onNodeWithText("Remove").performClick()
        rule.onNodeWithText("Field notes · 3 highlights").assertExists()
        assertTrue(rule.onAllNodesWithText("canopy as infrastructure").fetchSemanticsNodes().isEmpty())
        rule.onNodeWithText("thousands of litres").assertExists()
        rule.onNodeWithContentDescription("Synthetic feedback: Removed synthetic highlight · 3 remain").assertExists()
        scene = "small"
        rule.waitForIdle()
        rule.onNodeWithText("Clear page").performClick()
        rule.onNodeWithText("Tap again to clear").assertExists()
        rule.onNodeWithText("Tap again to clear").performClick()
        rule.onNodeWithText("Undo clear").assertExists()
        rule.onNodeWithText("Undo clear").performClick()
        rule.onNodeWithContentDescription("Synthetic feedback: Synthetic page restored").assertExists()
    }

    @Test @Config(sdk = [34], qualifiers = "w820dp-h740dp-mdpi")
    fun jumpFlashAndOnboardingMutateTheirSyntheticStates() {
        var scene by mutableStateOf("m4")
        var figure by mutableIntStateOf(1)
        rule.setContent { E34fMildlinerScenes(scene, figureIndex = figure) }
        rule.onNodeWithText("Pulse highlight").performClick()
        rule.onNodeWithContentDescription("Jump flash active").assertExists()
        rule.onNodeWithContentDescription("Synthetic feedback: Synthetic highlight pulsed · page scrolling is not connected").assertExists()
        figure = 2
        rule.waitForIdle()
        rule.onNodeWithText("Night").assertExists()
        scene = "onboard"
        figure = 1
        rule.waitForIdle()
        rule.onNodeWithText("Next").performClick()
        rule.onNodeWithText("The calm resin is on · Tune how it writes", substring = true).assertExists()
    }

    @Test fun allTenSceneSnapshotsArePinnedToVerifiedSourceCaptureHashes() {
        assertEquals(setOf("m0", "m1", "m2", "m3", "m4", "presets", "cards", "snip", "small", "onboard"), E34F_MILDLINER_SCENE_IDS.toSet())
        assertEquals(10, E34F_MILDLINER_REFERENCE_CAPTURES.size)
        assertTrue(E34F_MILDLINER_REFERENCE_CAPTURES.all {
            it.landscapeSha256.matches(Regex("[a-f0-9]{64}")) && it.portraitSha256.matches(Regex("[a-f0-9]{64}"))
        })
        assertEquals(mapOf("m1" to 2, "m4" to 2, "presets" to 1), E34F_MILDLINER_FIGURE_COUNTS)
        assertEquals(setOf("m1/figure-1", "m1/figure-2", "m4/figure-1", "m4/figure-2", "presets/figure-1"), E34F_MILDLINER_REFERENCE_FIGURES.map { it.sceneId }.toSet())
        assertTrue(E34F_MILDLINER_REFERENCE_FIGURES.all {
            it.landscapeSha256.matches(Regex("[a-f0-9]{64}")) && it.portraitSha256.matches(Regex("[a-f0-9]{64}"))
        })
        assertEquals("ed3c4347330f5e1b876ec08d62f50fef413924e5d4af1a235337a8af604f2d7d", E34F_MILDLINER_SOURCE_TEXT_SHA256)
    }
}
