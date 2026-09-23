package com.claude.compose

import androidx.activity.ComponentActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import com.claude.compose.screen.E34F_JOURNEY_REFERENCE_IMAGES
import com.claude.compose.screen.E34fFirstStrokeTimeline
import com.claude.compose.screen.E34fJourneyScenes
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
class E34fJourneyScenesTest {
    @get:Rule val rule = createAndroidComposeRule<ComponentActivity>()

    @Test @Config(sdk = [34], qualifiers = "w820dp-h740dp-mdpi")
    fun glassSceneExposesThreeModesAndOpacityStates() {
        var figure by mutableIntStateOf(1)
        rule.setContent { E34fJourneyScenes("g2", figureIndex = figure) }
        rule.onNodeWithContentDescription("Glass mode Trace").assertIsSelected()
        rule.onNodeWithContentDescription("Glass mode Annotate").performClick().assertIsSelected()
        rule.onNodeWithContentDescription("Glass opacity 72 percent").performClick().assertIsSelected()
        figure = 3
        rule.waitForIdle()
        rule.onNodeWithContentDescription("Glass mode Page").assertIsSelected()
        rule.onNodeWithContentDescription("Glass opacity 100 percent").assertIsSelected()
        rule.onNodeWithText("the world is gone, just paper").assertExists()
    }

    @Test @Config(sdk = [34], qualifiers = "w820dp-h740dp-mdpi")
    fun selectionActionsApplyToSyntheticSelectedRegion() {
        var figure by mutableIntStateOf(1)
        rule.setContent { E34fJourneyScenes("g4", figureIndex = figure) }
        rule.onNodeWithText("Permutation 1 · selected ink and verb-at-tap").assertExists()
        rule.onNodeWithContentDescription("Selected ink region").assertExists()
        rule.onNodeWithContentDescription("Selection action Copy").performClick()
        rule.onNodeWithContentDescription("Synthetic selection copies 2").assertExists()
        rule.onNodeWithContentDescription("Selection action Crop").performClick()
        rule.onNodeWithContentDescription("Selected ink region cropped").assertExists()
        rule.onNodeWithContentDescription("Selection action Text").performClick()
        rule.onNodeWithContentDescription("Synthetic note City shade added").assertExists()
        rule.onNodeWithContentDescription("Selection action Delete").performClick()
        rule.onNodeWithContentDescription("Synthetic ink deleted").assertExists()
        figure = 2
        rule.waitForIdle()
        rule.onNodeWithText("Permutation 2 · selected ink and verb-at-tap").assertExists()
        rule.onNodeWithContentDescription("Selection action Copy").performClick()
        rule.onNodeWithContentDescription("Synthetic selection copies 2").assertExists()
    }

    @Test @Config(sdk = [34], qualifiers = "w820dp-h740dp-mdpi")
    fun thumbnailRailCanNavigateAndAppend() {
        rule.setContent { E34fJourneyScenes("g5") }
        rule.onNodeWithContentDescription("Select page 2").assertIsSelected()
        rule.onNodeWithContentDescription("Select page 4").performClick().assertIsSelected()
        rule.onNodeWithContentDescription("Current page 4 of 5").assertExists()
        rule.onNodeWithContentDescription("Add page").performClick()
        rule.onNodeWithContentDescription("Current page 6 of 6").assertExists()
        rule.onNodeWithContentDescription("Select page 6").assertIsSelected()
    }

    @Test @Config(sdk = [34], qualifiers = "w820dp-h740dp-mdpi")
    fun firstStrokeUsesInjectedClockForPromptFade() {
        var now by mutableLongStateOf(1_000L)
        rule.setContent { E34fJourneyScenes("g6", clockMillis = now, figureIndex = 2) }
        rule.onNodeWithContentDescription("Empty page canvas").assertExists()
        rule.onNodeWithContentDescription("First stroke prompt alpha 100 percent").assertExists()
        rule.onNodeWithContentDescription("Empty page canvas").performTouchInput {
            down(center)
            moveTo(center + androidx.compose.ui.geometry.Offset(90f, 24f))
            up()
        }
        rule.onNodeWithContentDescription("Page canvas with first stroke").assertExists()
        rule.onNodeWithContentDescription("First stroke prompt alpha 100 percent").assertExists()
        now = 1_160L
        rule.waitForIdle()
        rule.onNodeWithContentDescription("First stroke prompt alpha 50 percent").assertExists()
        now = 1_320L
        rule.waitForIdle()
        rule.onNodeWithContentDescription("First stroke prompt alpha 0 percent").assertExists()
        rule.onNodeWithContentDescription("Paper choice Dots").performClick().assertIsSelected()
    }

    @Test @Config(sdk = [34], qualifiers = "w820dp-h740dp-mdpi")
    fun defaultRuntimeClockDrivesFirstStrokeFadeWithoutInjection() {
        rule.setContent { E34fJourneyScenes("g6", figureIndex = 2) }
        rule.onNodeWithContentDescription("Empty page canvas").performTouchInput {
            down(center)
            moveTo(center + androidx.compose.ui.geometry.Offset(90f, 24f))
            up()
        }
        rule.waitForIdle()
        rule.onNodeWithContentDescription("Page canvas with first stroke").assertExists()
        rule.onNodeWithContentDescription("First stroke prompt alpha 0 percent").assertExists()
    }

    @Test @Config(sdk = [34], qualifiers = "w820dp-h740dp-mdpi")
    fun quietInvitationFigureDoesNotRunContactFade() {
        var now by mutableLongStateOf(1_000L)
        rule.setContent { E34fJourneyScenes("g6", clockMillis = now, figureIndex = 1) }
        rule.onNodeWithContentDescription("Empty page canvas").performTouchInput {
            down(center)
            moveTo(center + androidx.compose.ui.geometry.Offset(90f, 24f))
            up()
        }
        now = 10_000L
        rule.waitForIdle()
        rule.onNodeWithContentDescription("First stroke prompt alpha 100 percent").assertExists()
    }

    @Test @Config(sdk = [34], qualifiers = "w820dp-h740dp-mdpi")
    fun unimplementedExplorationsStayExplicitlyBlocked() {
        var id by mutableStateOf("g1")
        rule.setContent { E34fJourneyScenes(id) }
        rule.onNodeWithContentDescription("Scene g1 blocked").assertExists()
        id = "g3"
        rule.waitForIdle()
        rule.onNodeWithContentDescription("Scene g3 blocked").assertExists()
    }

    @Test fun firstStrokeTimelineIsDeterministicForBoundariesAndClockSkew() {
        val timeline = E34fFirstStrokeTimeline(strokeStartedAtMillis = 1_000L)
        assertEquals(1f, timeline.promptAlpha(900L), 0f)
        assertEquals(.5f, timeline.promptAlpha(1_160L), .0001f)
        assertEquals(0f, timeline.promptAlpha(1_320L), 0f)
        assertTrue(E34fFirstStrokeTimeline(null).promptAlpha(1_000_000L) == 1f)
    }

    @Test fun sceneReferencesMatchEightPinnedVerifiedV3Figures() {
        assertEquals(8, E34F_JOURNEY_REFERENCE_IMAGES.size)
        assertEquals(8, E34F_JOURNEY_REFERENCE_IMAGES.map { it.sceneId }.toSet().size)
        assertTrue(E34F_JOURNEY_REFERENCE_IMAGES.all { it.sha256.matches(Regex("[a-f0-9]{64}")) })
        assertEquals(setOf("g2/figure-1", "g2/figure-2", "g2/figure-3", "g4/figure-1", "g4/figure-2", "g5/figure-1", "g6/figure-1", "g6/figure-2"),
            E34F_JOURNEY_REFERENCE_IMAGES.map { it.sceneId }.toSet())
    }
}
