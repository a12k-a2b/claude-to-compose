package com.claude.compose

import androidx.activity.ComponentActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import com.claude.compose.screen.E34F_ROTATION_FIGURES
import com.claude.compose.screen.E34fRotationScene
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Exact v3 live DOM figure capture hashes; these pin sources, not native parity. */
private val pinnedFigures = listOf(
    Triple("5/figure-1", "ba5ff7c79b928bf720d5602be2ebce7a1e90f6236cd388d62d1709f1a34dcde6", "57636497951508b40a3d02fda2a6a1bfa5345edcfd3c925cdf021ca07f8e2d06"),
    Triple("5/figure-2", "90889fb0648406556472966fd0fd9c1e26ab0c1534fb3958f24f1556e956dfc5", "5577e4ab07a5573496357d1260e990617c6cb06a446345d33cc7966d9c3311ba"),
    Triple("5/figure-3", "cc7baf1b028fb30ad75ac3905e3094574f7c41c8a285d16fad607e1a050acf6a", "0b6971949d5fdb6c83529771286fe9da5cbed66d2c657ea33b3dbd2c3362a2cc"),
    Triple("5/figure-4", "b8c4b34c24eaf42f943fa4606bee99991757c5fc168a9441d3ee80effb405cbe", "29fdb6a640617018f9d6340720b672ed2574ca20306a746c186147a48b1846ee"),
    Triple("5/figure-5", "a22f165ae5be32465ca68700ae829aa379bc5c88437ed32d5febdda3b9b1cda6", "179141a24bd379707a4f8f9d89cde33b5058f111597a57f6449723a3531896f4"),
    Triple("5/figure-6", "7b12f4ab6c805809a7b253f19a9a1de843b30662c8fbfc2f38482ea8cd81dce9", "3c070f32335c066672020b0c338cab03ed44fd55a15daf24f7602b7523e6638b"),
)

@RunWith(RobolectricTestRunner::class)
class E34fRotationScenesTest {
    @get:Rule val rule = createAndroidComposeRule<ComponentActivity>()

    @Test fun sourceInventoryPinsSixFiguresAcrossBothCapturedViewports() {
        assertEquals((1..6).toList(), E34F_ROTATION_FIGURES.map { it.index })
        assertEquals(pinnedFigures.map { it.first }, E34F_ROTATION_FIGURES.map { it.sourceId })
        assertEquals(12, pinnedFigures.flatMap { listOf(it.second, it.third) }.distinct().size)
        assertTrue(pinnedFigures.all { it.second.matches(Regex("[0-9a-f]{64}")) && it.third.matches(Regex("[0-9a-f]{64}")) })
        assertEquals(listOf(true, false, false, false, false, false), E34F_ROTATION_FIGURES.map { it.portraitDevice })
        // Source PNG geometry at 2x device scale: portrait 585x812 CSS, landscape 780x617 CSS.
        assertEquals(585f / 812f, 1170f / 1626f, 0.002f)
        assertEquals(780f / 617f, 1560f / 1236f, 0.003f)
    }

    @Test @Config(sdk = [34], qualifiers = "w800dp-h594dp-mdpi")
    fun allSixFiguresExposeTheirOwnNativeLayout() {
        var figure by mutableIntStateOf(1)
        rule.setContent { E34fRotationScene(figure) }
        (1..6).forEach { index ->
            figure = index
            val shape = if (index == 1) "portrait" else "landscape"
            val density = if (index == 1) "compact" else "roomy"
            rule.onNodeWithContentDescription("5/figure-$index native synthetic $shape device; $density layout").assertExists()
            rule.onNodeWithContentDescription("Page 2 of 5").assertExists()
            rule.onNodeWithContentDescription("Synthetic ruled note paper").assertExists()
        }
        rule.onNodeWithContentDescription("Orientation free tool dial; gesture unverified").assertExists()
    }

    @Test @Config(sdk = [34], qualifiers = "w594dp-h800dp-mdpi")
    fun narrowHostUsesCompactLandscapeLayoutAndControlsStillWork() {
        rule.setContent { E34fRotationScene(2) }
        rule.onNodeWithContentDescription("5/figure-2 native synthetic landscape device; compact layout").assertExists()
        rule.onNodeWithContentDescription("Pen control").assertIsSelected()
        rule.onNodeWithContentDescription("Highlighter control").performClick().assertIsSelected()
        rule.onNodeWithContentDescription("New page control").performClick()
        rule.onNodeWithContentDescription("Page 3 of 5").assertExists()
        rule.onNodeWithContentDescription("Hide control").performClick()
        rule.onNodeWithContentDescription("Show toolbar control").performClick()
        rule.onNodeWithContentDescription("Pen control").assertExists()
    }

    @Test @Config(sdk = [34], qualifiers = "w800dp-h594dp-mdpi")
    fun sideRailRemainsSeparateFromNotebookAndDial() {
        var figure by mutableIntStateOf(5)
        rule.setContent { E34fRotationScene(figure) }
        rule.onNodeWithContentDescription("Field notes notebook").performClick()
        rule.onNodeWithContentDescription("Synthetic options open").assertExists()
        rule.onNodeWithContentDescription("Snip control").performClick().assertIsSelected()
        figure = 6
        rule.onNodeWithContentDescription("Orientation free tool dial; gesture unverified").assertExists()
        rule.onNodeWithContentDescription("Field notes notebook").assertExists()
        assertFalse(E34F_ROTATION_FIGURES[5].portraitDevice)
    }
}
