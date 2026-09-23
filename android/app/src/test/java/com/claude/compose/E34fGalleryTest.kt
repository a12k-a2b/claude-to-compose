package com.claude.compose

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.view.ViewGroup
import androidx.activity.ComponentActivity
import androidx.compose.runtime.getValue
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
import com.claude.compose.screen.E34F_SCENES
import com.claude.compose.screen.E34fBandScene
import com.claude.compose.screen.E34fGalleryScreen
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
class E34fGalleryTest {
    @get:Rule val rule = createAndroidComposeRule<ComponentActivity>()

    @Test fun sourceInventoryIsCompleteAndLimitedHonesty() {
        assertEquals(35, E34F_SCENES.size)
        assertEquals(33, E34F_SCENES.sumOf { it.figures })
        assertEquals(35, E34F_SCENES.map { it.id }.toSet().size)
        assertEquals(setOf("6a", "6b", "6c", "6d"), E34F_SCENES.filter { it.implemented }.map { it.id }.toSet())
    }

    @Test @Config(sdk = [34], qualifiers = "w820dp-h740dp-mdpi")
    fun navigationShowsImplementedBandAndBlockedOtherScene() {
        rule.setContent { E34fGalleryScreen() }
        rule.onNodeWithContentDescription("6a toolbar band").assertExists()
        rule.onNodeWithContentDescription("Scene 6d: Bold — the ledger band").performClick()
        rule.onNodeWithContentDescription("6d toolbar band").assertExists()
        rule.onNodeWithContentDescription("Scene 1a: Day — the glass over three worlds").performClick()
        rule.onNodeWithContentDescription("Scene 1a blocked").assertExists()
        rule.onNodeWithContentDescription("Figure 3 of 3").performClick().assertIsSelected()
        rule.onNodeWithText("Source figure 3 of 3 is inventoried only.").assertExists()
    }

    @Test @Config(sdk = [34], qualifiers = "w820dp-h740dp-mdpi")
    fun bandControlsHaveNativeStateAndPageSeam() {
        rule.setContent { E34fBandScene("6a") }
        rule.onNodeWithContentDescription("Pen tool").assertIsSelected()
        rule.onNodeWithContentDescription("Highlighter tool").performClick().assertIsSelected()
        rule.onNodeWithContentDescription("Eraser tool").performClick().assertIsSelected()
        rule.onNodeWithContentDescription("New page").performClick()
        rule.onNodeWithContentDescription("Page 3 of 5").assertExists()
        rule.onNodeWithContentDescription("Field notes; page 3").performClick()
        rule.onNodeWithText("Field notes · synthetic gallery document").assertExists()
        rule.onNodeWithContentDescription("Glass contrast").performClick()
        val beforeContrast = capture("6a_standard_820x740.png", 820, 740)
        rule.onNodeWithContentDescription("Toggle high contrast").performClick()
        rule.onNodeWithText("HIGH").assertExists()
        val afterContrast = capture("6a_high_contrast_820x740.png", 820, 740)
        assertTrue("Contrast control must alter the page itself", changedFraction(beforeContrast, afterContrast, 160, 560) > .001)
        rule.onNodeWithContentDescription("More").performClick()
        rule.onNodeWithText("Gallery options · synthetic note").assertExists()
        rule.onNodeWithContentDescription("Undo").performClick()
        rule.onNodeWithContentDescription("Redo").performClick()
        rule.onNodeWithContentDescription("Hide").performClick()
        rule.onNodeWithContentDescription("Show toolbar").performClick()
        rule.onNodeWithContentDescription("Pen tool").assertExists()
    }

    @Test @Config(sdk = [34], qualifiers = "w820dp-h740dp-mdpi")
    fun sourceSizedBandCapturesAndVisibleNegativeControl() {
        var currentId by mutableStateOf("6a")
        var wrongColor by mutableStateOf<androidx.compose.ui.graphics.Color?>(null)
        rule.setContent { E34fBandScene(currentId, proofBandOverride = wrongColor) }
        for (id in listOf("6a", "6b", "6c", "6d")) {
            currentId = id
            capture("${id}_820x740.png", 820, 740)
        }
        wrongColor = androidx.compose.ui.graphics.Color.Magenta
        val bad = capture("6d_wrong_band_820x740.png", 820, 740)
        wrongColor = null
        val good = capture("6d_820x740_good_again.png", 820, 740)
        assertTrue("Negative control must change the actual toolbar region", changedFraction(good, bad, 80, 140) > .01)
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
        val target = File("build/e34f-gallery-evidence/$name")
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
