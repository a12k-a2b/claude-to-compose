package com.claude.compose

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.view.ViewGroup
import androidx.activity.ComponentActivity
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import com.claude.compose.screen.GeneratedDc1Screen
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
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
@Config(
    sdk = [34],
    qualifiers = "w592dp-h792dp-xhdpi" // 592x792dp @ 2x density = 1184x1584px
)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class InteractionCheckpointTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun verifyDeterministicInteractionCheckpoints() {
        var currentChip = "Footprints"

        composeTestRule.setContent {
            GeneratedDc1Screen(
                onChipSelected = { currentChip = it }
            )
        }

        composeTestRule.waitForIdle()

        // Checkpoint t0: Default state
        assertEquals("Initial state must have 'Footprints' selected", "Footprints", currentChip)
        val bitmapT0 = captureFrame()
        saveFrame("checkpoint_t0_default.png", bitmapT0)

        // Action: Click "Streets" chip to initiate state transition
        composeTestRule.onNodeWithText("Streets").performClick()
        composeTestRule.waitForIdle()

        // Checkpoint t2: Settled state assertion
        assertEquals("Settled state must have 'Streets' selected", "Streets", currentChip)
        val bitmapT2 = captureFrame()
        saveFrame("checkpoint_t2_settled.png", bitmapT2)

        // Deterministic Pixel Delta Check: Verify that the chip row area (y: 1380..1520) changed
        var pixelDifferences = 0
        for (y in 1380 until 1520) {
            for (x in 200 until 1000) {
                if (bitmapT0.getPixel(x, y) != bitmapT2.getPixel(x, y)) {
                    pixelDifferences++
                }
            }
        }

        assertTrue(
            "State transition from Footprints to Streets must produce deterministic visual pixel changes (pixelDifferences = $pixelDifferences)",
            pixelDifferences > 100
        )
    }

    private fun captureFrame(): Bitmap {
        val androidBitmap: Bitmap = try {
            composeTestRule.onRoot().captureToImage().asAndroidBitmap()
        } catch (t: Throwable) {
            captureComposeViewViaSkia()
        }
        return if (androidBitmap.width != 1184 || androidBitmap.height != 1584) {
            Bitmap.createScaledBitmap(androidBitmap, 1184, 1584, true)
        } else {
            androidBitmap
        }
    }

    private fun captureComposeViewViaSkia(): Bitmap {
        val activity = composeTestRule.activity
        val rootLayout = activity.findViewById<ViewGroup>(android.R.id.content)
        val width = 1184
        val height = 1584

        rootLayout.measure(
            View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY)
        )
        rootLayout.layout(0, 0, width, height)

        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(android.graphics.Color.WHITE)
        rootLayout.draw(canvas)
        return bitmap
    }

    private fun saveFrame(filename: String, bitmap: Bitmap) {
        val outputDirs = listOf(
            File("build/outputs/preview"),
            File("app/build/outputs/preview"),
            File("../../output/conformance")
        )
        for (dir in outputDirs) {
            if (dir.exists() || dir.mkdirs()) {
                val file = File(dir, filename)
                FileOutputStream(file).use { out ->
                    bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                }
            }
        }
    }
}
