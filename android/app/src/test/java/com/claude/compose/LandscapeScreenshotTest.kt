package com.claude.compose

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.view.ViewGroup
import androidx.activity.ComponentActivity
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import com.claude.compose.screen.GeneratedDc1LandscapeScreen
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
    qualifiers = "w792dp-h592dp-xhdpi" // 792x592dp @ 2x density = 1584x1184px (Daylight DC1 10.5in Landscape)
)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class LandscapeScreenshotTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun renderAndExportLandscapePreviewScreenshot() {
        composeTestRule.setContent {
            GeneratedDc1LandscapeScreen()
        }

        composeTestRule.waitForIdle()

        val androidBitmap: Bitmap = try {
            composeTestRule.onRoot().captureToImage().asAndroidBitmap()
        } catch (t: Throwable) {
            captureComposeViewViaSkia()
        }

        val scaledBitmap = if (androidBitmap.width != 1584 || androidBitmap.height != 1184) {
            Bitmap.createScaledBitmap(androidBitmap, 1584, 1184, true)
        } else {
            androidBitmap
        }

        var nonWhitePixels = 0
        for (y in 0 until scaledBitmap.height) {
            for (x in 0 until scaledBitmap.width) {
                val pixel = scaledBitmap.getPixel(x, y)
                val r = (pixel shr 16) and 0xFF
                val g = (pixel shr 8) and 0xFF
                val b = pixel and 0xFF
                if (r < 250 || g < 250 || b < 250) {
                    nonWhitePixels++
                }
            }
        }
        assertTrue(
            "Rendered landscape preview image must contain rendered Compose UI elements (nonWhitePixels = $nonWhitePixels)",
            nonWhitePixels > 1000
        )

        val outputDirs = mutableListOf(
            File("build/outputs/preview")
        )
        if (File("app").isDirectory) {
            outputDirs.add(File("app/build/outputs/preview"))
        }

        var primaryFile: File? = null

        for (dir in outputDirs) {
            dir.mkdirs()
            val outputFile = File(dir, "landscape_preview.png")
            FileOutputStream(outputFile).use { out ->
                val compressed = scaledBitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                assertTrue("Bitmap compression to PNG failed", compressed)
            }
            if (primaryFile == null && outputFile.exists()) {
                primaryFile = outputFile
            }
        }

        // Also save to output/conformance
        val conformanceDir = File("../../output/conformance")
        if (conformanceDir.exists() || conformanceDir.mkdirs()) {
            val confFile = File(conformanceDir, "landscape_preview.png")
            FileOutputStream(confFile).use { out ->
                scaledBitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
            }
        }

        assertTrue("Landscape preview image file must exist", primaryFile != null && primaryFile.exists())
        assertTrue("Landscape preview image file must not be empty", primaryFile!!.length() > 0)
    }

    private fun captureComposeViewViaSkia(): Bitmap {
        val activity = composeTestRule.activity
        val rootLayout = activity.findViewById<ViewGroup>(android.R.id.content)
        val width = 1584
        val height = 1184

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
}
