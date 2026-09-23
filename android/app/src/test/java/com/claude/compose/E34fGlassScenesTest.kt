package com.claude.compose

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.view.ViewGroup
import androidx.activity.ComponentActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.semantics.SemanticsActions
import com.claude.compose.screen.E34fGlassScene
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.io.FileOutputStream

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class E34fGlassScenesTest {
    @get:Rule val rule = createAndroidComposeRule<ComponentActivity>()

    @Test @Config(sdk = [34], qualifiers = "w640dp-h515dp-mdpi")
    fun sourceFigureInventoryAndNativeCapture() {
        var scene by mutableStateOf("1a")
        var figure by mutableIntStateOf(1)
        var wrongVeil by mutableStateOf<androidx.compose.ui.graphics.Color?>(null)
        rule.setContent { E34fGlassScene(scene, figure, proofVeilOverride = wrongVeil) }
        for (id in listOf("1a", "1b")) {
            scene = id
            for (variant in 1..3) {
                figure = variant
                val expected = listOf(42, 79, 100)[variant - 1]
                rule.onNodeWithContentDescription("Glass surface $expected percent").assertExists()
                if (variant == 3) rule.onNodeWithContentDescription("Synthetic source snip from The Meridian").assertExists()
                capture("${id}_figure_${variant}_640x515.png", 640, 515)
            }
        }
        scene = "2a"
        for (variant in 1..2) {
            figure = variant
            capture("2a_figure_${variant}_640x515.png", 640, 515)
        }
        scene = "tb"
        figure = 1
        rule.onNodeWithText("HIGH CONTRAST · BORDERS REPLACE THE FROST").assertExists()
        capture("tb_640x515.png", 640, 515)
        scene = "1a"
        figure = 2
        val baseline = capture("1a_control_baseline_640x515.png", 640, 515)
        wrongVeil = androidx.compose.ui.graphics.Color.Magenta
        val bad = capture("1a_wrong_veil_control_640x515.png", 640, 515)
        assertTrue("Deliberately wrong glass veil must change scene pixels",
            changedFraction(baseline, bad, 90, 430) > .20)
    }

    @Test @Config(sdk = [34], qualifiers = "w640dp-h515dp-mdpi")
    fun glassSliderChangesSurfaceAndControlsHaveState() {
        rule.setContent { E34fGlassScene("1a", 2) }
        rule.onNodeWithContentDescription("Pen tool").assertIsSelected()
        rule.onNodeWithContentDescription("Highlighter tool").performClick().assertIsSelected()
        rule.onNodeWithContentDescription("New page").performClick()
        rule.onNodeWithContentDescription("Page 3 of 5").assertExists()
        rule.onNodeWithContentDescription("Glass adjustment").performClick()
        val before = capture("1a_before_adjustment_640x515.png", 640, 515)
        rule.onNodeWithContentDescription("Glass opacity slider")
            .performSemanticsAction(SemanticsActions.SetProgress) { it(.18f) }
        rule.onNodeWithContentDescription("Glass surface 18 percent").assertExists()
        val after = capture("1a_after_adjustment_640x515.png", 640, 515)
        assertTrue("Changing opacity must alter the rendered surface", changedFraction(before, after, 160, 400) > .005)
        rule.onNodeWithContentDescription("Undo").performClick()
        rule.onNodeWithContentDescription("Redo").performClick()
        rule.onNodeWithContentDescription("Hide").performClick()
        rule.onNodeWithContentDescription("Show toolbar").performClick()
        rule.onNodeWithContentDescription("Pen tool").assertExists()
    }

    @Test @Config(sdk = [34], qualifiers = "w640dp-h515dp-mdpi")
    fun sunBloomCollapsesAndNativeOpacityChanges() {
        rule.setContent { E34fGlassScene("2a", 1) }
        rule.onNodeWithContentDescription("Bloom Pen").assertIsSelected()
        rule.onNodeWithContentDescription("Bloom glass opacity slider")
            .performSemanticsAction(SemanticsActions.SetProgress) { it(.42f) }
        rule.onNodeWithContentDescription("Glass surface 42 percent").assertExists()
        rule.onNodeWithContentDescription("Sun bloom expanded; motion BLOCKED").performClick()
        rule.onNodeWithContentDescription("Sun bloom collapsed; motion BLOCKED").assertExists()
        rule.onNodeWithContentDescription("Sun bloom collapsed; motion BLOCKED").performClick()
        rule.onNodeWithContentDescription("Bloom Eraser").performClick().assertIsSelected()
        rule.onNodeWithText("MOTION BLOCKED", substring = true).assertExists()
    }

    private fun capture(name: String, width: Int, height: Int): Bitmap {
        rule.waitForIdle()
        val bitmap = try { rule.onRoot().captureToImage().asAndroidBitmap() }
        catch (_: androidx.compose.ui.test.ComposeTimeoutException) {
            val root = rule.activity.findViewById<ViewGroup>(android.R.id.content)
            root.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY))
            root.layout(0, 0, width, height)
            Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { root.draw(Canvas(it)) }
        }
        assertEquals(width, bitmap.width)
        assertEquals(height, bitmap.height)
        val target = File("build/e34f-glass-evidence/$name")
        target.parentFile?.mkdirs()
        FileOutputStream(target).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        assertTrue(target.exists() && target.length() > 0)
        return bitmap
    }

    private fun changedFraction(first: Bitmap, second: Bitmap, top: Int, bottom: Int): Double {
        var changed = 0
        for (y in top until bottom) for (x in 0 until first.width) {
            val a = first.getPixel(x, y)
            val b = second.getPixel(x, y)
            val delta = kotlin.math.abs(android.graphics.Color.red(a) - android.graphics.Color.red(b)) +
                kotlin.math.abs(android.graphics.Color.green(a) - android.graphics.Color.green(b)) +
                kotlin.math.abs(android.graphics.Color.blue(a) - android.graphics.Color.blue(b))
            if (delta > 12) changed++
        }
        return changed.toDouble() / (first.width * (bottom - top))
    }
}
