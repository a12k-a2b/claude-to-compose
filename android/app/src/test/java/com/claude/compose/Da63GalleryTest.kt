package com.claude.compose

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.view.ViewGroup
import androidx.activity.ComponentActivity
import androidx.compose.runtime.getValue
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
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.semantics.SemanticsActions
import com.claude.compose.screen.Da63GalleryScreen
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
class Da63GalleryTest {
    @get:Rule val rule = createAndroidComposeRule<ComponentActivity>()

    @Test @Config(sdk = [34], qualifiers = "w600dp-h800dp-mdpi")
    fun portraitFourByThreeGalleryInteractionsAndCapture() {
        rule.setContent { Da63GalleryScreen() }
        rule.onNodeWithContentDescription("Synthetic article backdrop").assertExists()
        rule.onNodeWithContentDescription("Pen tool").assertIsSelected()
        rule.onNodeWithContentDescription("Highlighter tool").performClick().assertIsSelected()
        rule.onNodeWithContentDescription("Eraser tool").performClick().assertIsSelected()
        rule.onNodeWithContentDescription("Pen tool").performClick().assertIsSelected()
        rule.onNodeWithContentDescription("Document options").performClick()
        rule.onNodeWithText("Field notes · synthetic gallery document").assertExists()
        rule.onNodeWithContentDescription("More options").performClick()
        rule.onNodeWithText("Gallery controls · no live note").assertExists()
        capture("portrait_600x800.png", 600, 800)
    }

    @Test @Config(sdk = [34], qualifiers = "w800dp-h600dp-mdpi")
    fun landscapeFourByThreeOpacityAndNegativeControl() {
        var controlColor by mutableStateOf(Color.Transparent)
        rule.setContent { Da63GalleryScreen(proofChromeBackdrop = controlColor) }
        val baseline = capture("landscape_800x600.png", 800, 600)
        controlColor = Color.Magenta
        val wrongToolbar = capture("landscape_bad_toolbar_control.png", 800, 600)
        val chromeDifference = countDifferentPixels(baseline, wrongToolbar, 12, bottom = 152)
        assertTrue("Negative control: deliberately magenta toolbar backdrop must change chrome pixels; actual $chromeDifference", chromeDifference > 0.005)
        controlColor = Color.Transparent
        rule.onNodeWithContentDescription("Opacity options").performClick()
        rule.onNodeWithContentDescription("Opacity slider").performSemanticsAction(SemanticsActions.SetProgress) { it(0.10f) }
        rule.onNodeWithContentDescription("Opacity 10 percent").assertExists()
        val changed = capture("landscape_opacity_10.png", 800, 600)
        val different = countDifferentPixels(baseline, changed, 12)
        assertTrue("Opacity change must alter rendered article pixels; actual $different", different > 0.005)
        rule.onNodeWithContentDescription("Undo").performClick()
        rule.onNodeWithContentDescription("Redo").performClick()
    }

    @Test @Config(sdk = [34], qualifiers = "w1200dp-h860dp-xhdpi")
    fun sourceSizedLandscapeChromeCapture() {
        var controlColor by mutableStateOf(Color.Transparent)
        rule.setContent { Da63GalleryScreen(proofChromeBackdrop = controlColor) }
        val baseline = capture("landscape_source_content_2400x1720.png", 2400, 1720)
        controlColor = Color.Magenta
        val wrong = capture("landscape_source_content_bad_toolbar_2400x1720.png", 2400, 1720)
        assertTrue(countDifferentPixels(baseline, wrong, 12, bottom = 200) > 0.005)
    }

    @Test @Config(sdk = [34], qualifiers = "w900dp-h1160dp-xhdpi")
    fun sourceSizedPortraitChromeCapture() {
        rule.setContent { Da63GalleryScreen() }
        capture("portrait_source_content_1800x2320.png", 1800, 2320)
    }

    private fun capture(name: String, width: Int, height: Int): Bitmap {
        rule.waitForIdle()
        val image = try {
            rule.onRoot().captureToImage().asAndroidBitmap()
        } catch (_: androidx.compose.ui.test.ComposeTimeoutException) {
            val root = rule.activity.findViewById<ViewGroup>(android.R.id.content)
            root.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY))
            root.layout(0, 0, width, height)
            Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { root.draw(Canvas(it)) }
        }
        assertEquals(width, image.width)
        assertEquals(height, image.height)
        val file = File("build/da63-gallery-evidence/$name")
        file.parentFile?.mkdirs()
        FileOutputStream(file).use { image.compress(Bitmap.CompressFormat.PNG, 100, it) }
        assertTrue(file.exists() && file.length() > 0)
        return image
    }

    private fun countDifferentPixels(first: Bitmap, second: Bitmap, threshold: Int, bottom: Int = first.height): Double {
        require(first.width == second.width && first.height == second.height)
        var different = 0
        for (y in 0 until bottom) for (x in 0 until first.width) {
            val a = first.getPixel(x, y)
            val b = second.getPixel(x, y)
            val delta = kotlin.math.abs(android.graphics.Color.red(a) - android.graphics.Color.red(b)) +
                kotlin.math.abs(android.graphics.Color.green(a) - android.graphics.Color.green(b)) +
                kotlin.math.abs(android.graphics.Color.blue(a) - android.graphics.Color.blue(b))
            if (delta > threshold) different++
        }
        return different.toDouble() / (first.width * bottom)
    }
}
