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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import com.claude.compose.screen.E34fFloatingScene
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

// The packet's LANDSCAPE references are specific live DOM captures, not generic screenshots.
private val reference = linkedMapOf(
        "3a" to ("10-3a.png" to "2c87d1f43eaacebd4bb81a2d7110f55c6c932baca59db94bd1fd31cd75b20682"),
        "3a/figure-1" to ("10-3a-figure-1.png" to "44a24c25d1c5b0a2476c6cdfa44a2bf4a5a55b82cd7063570ffa6703a0f0d2e5"),
        "3a/figure-2" to ("10-3a-figure-2.png" to "7a5e03effffb2eb3847a21327eb4e80b27d803a1485a194e8a83095140936bd8"),
        "3b" to ("11-3b.png" to "abccf61fe3fd03648172f34c1e93e0131551617b5c246a656edb909f03b87c70"),
        "3b/figure-1" to ("11-3b-figure-1.png" to "025e5f7474feba83ce3fefa3c21926bd31dd55f9fac7f0879ba11a146d1d8493"),
        "3b/figure-2" to ("11-3b-figure-2.png" to "cfe8f401acbde1a28eb012e6439d419bd4d39bdc0c21d29654179f5a54afbdae"),
        "3c" to ("12-3c.png" to "e83c37021b45ebdbf01a5daf1c629f77004acd5213b3bb8f7831ed3ae1e04c0c"),
        "3c/figure-1" to ("12-3c-figure-1.png" to "31cd843da240f765a58880598d2a4cab3a53e018a4b7547bc741b92d4b85fa69"),
        "3c/figure-2" to ("12-3c-figure-2.png" to "5a0b3ca4ac880c4a8ab1491de8c5ef94bf3b88033affd5744aa1a9c6edc252ac"),
        "4a" to ("14-4a.png" to "a28004649abd23b09f04ea1193101ca673e012db387cba54be4fc38d3c9dccb4"),
        "4b" to ("15-4b.png" to "61535ffb9136da873894f8b2e8ab0c1e9ccb539aabda8e297b3362ce6f6388bf"),
        "4c" to ("16-4c.png" to "2979ca085695bfe8cb83ad6019927a55fcc772cf6656efad80045ced18775602")
)

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class E34fFloatingScenesTest {
    @get:Rule val rule = createAndroidComposeRule<ComponentActivity>()

    @Test fun frozenPacketInventoryIsWellFormed() {
        assertEquals(12, reference.size)
        assertEquals(6, reference.keys.count { it.contains("/figure-") })
        assertEquals(setOf("3a", "3b", "3c", "4a", "4b", "4c"),
            reference.keys.filterNot { it.contains("/figure-") }.toSet())
        assertTrue(reference.values.all { (path, sha) -> path.endsWith(".png") && sha.matches(Regex("[0-9a-f]{64}")) })
    }

    @Test @Config(sdk = [34], qualifiers = "w800dp-h594dp-mdpi")
    fun sourceFigureStatesRenderAsNativeScreens() {
        var id by mutableStateOf("3a")
        var figure by mutableIntStateOf(1)
        rule.setContent { E34fFloatingScene(id, figure) }
        for (scene in listOf("3a", "3b", "3c")) {
            id = scene
            for (variant in 1..2) {
                figure = variant
                when (scene) {
                    "3a", "3b" -> if (variant == 1) rule.onNodeWithContentDescription("Pen card").assertExists()
                        else rule.onNodeWithContentDescription("Synthetic ruled paper").assertExists()
                    "3c" -> rule.onNodeWithContentDescription("Tool dial open; motion BLOCKED").assertExists()
                }
                capture("${scene}_figure_${variant}_800x594.png")
            }
        }
        for (scene in listOf("4a", "4b", "4c")) {
            id = scene
            figure = 1
            rule.onNodeWithContentDescription("Pen control").assertIsSelected()
            capture("${scene}_800x594.png")
        }
    }

    @Test @Config(sdk = [34], qualifiers = "w800dp-h594dp-mdpi")
    fun looseCoinsAndSideRailExposeWorkingControls() {
        var id by mutableStateOf("4a")
        rule.setContent { E34fFloatingScene(id) }
        rule.onNodeWithContentDescription("Highlighter control").performClick().assertIsSelected()
        rule.onNodeWithContentDescription("New page control").performClick()
        rule.onNodeWithContentDescription("Page 3 of 5").assertExists()
        rule.onNodeWithContentDescription("Field notes notebook").performClick()
        rule.onNodeWithText("Field notes · synthetic notebook").assertExists()
        rule.onNodeWithContentDescription("Glass control").performClick()
        rule.onNodeWithContentDescription("Glass 100 percent option").performClick().assertIsSelected()
        id = "4c"
        rule.onNodeWithContentDescription("Eraser control").performClick().assertIsSelected()
        rule.onNodeWithContentDescription("More control").performClick()
        rule.onNodeWithText("Gallery options · synthetic note").assertExists()
        rule.onNodeWithContentDescription("Hide control").performClick()
        rule.onNodeWithContentDescription("Show toolbar control").performClick()
        rule.onNodeWithContentDescription("Pen control").assertExists()
    }

    @Test @Config(sdk = [34], qualifiers = "w800dp-h594dp-mdpi")
    fun floatingPenCardSizeShadeAndDialHaveNativeState() {
        var id by mutableStateOf("3a")
        rule.setContent { E34fFloatingScene(id, 1) }
        rule.onNodeWithContentDescription("Pen size 3").assertIsSelected()
        rule.onNodeWithContentDescription("Pen size 5").performClick().assertIsSelected()
        rule.onNodeWithContentDescription("Pen shade 2").performClick().assertIsSelected()
        id = "3c"
        rule.onNodeWithContentDescription("Tool dial open; motion BLOCKED").assertExists()
        rule.onNodeWithContentDescription("Pen control").performClick()
        rule.onNodeWithContentDescription("Tool dial closed; motion BLOCKED").assertExists()
        rule.onNodeWithContentDescription("Pen control").performClick()
        rule.onNodeWithContentDescription("Tool dial open; motion BLOCKED").assertExists()
    }

    @Test @Config(sdk = [34], qualifiers = "w800dp-h594dp-mdpi")
    fun deliberateWrongChromeChangesToolbarPixels() {
        var wrong by mutableStateOf<Color?>(null)
        rule.setContent { E34fFloatingScene("3a", 2, proofChromeOverride = wrong) }
        val good = capture("3a_chrome_control_good.png")
        wrong = Color.Magenta
        val bad = capture("3a_chrome_control_wrong.png")
        assertTrue("The negative control must visibly change floating chrome",
            changedFraction(good, bad, 10, 100) > .01)
    }

    private fun capture(name: String): Bitmap {
        rule.waitForIdle()
        val width = 800
        val height = 594
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
        val target = File("build/e34f-floating-evidence/$name")
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
