package com.claude.compose

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.view.ViewGroup
import androidx.activity.ComponentActivity
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onRoot
import com.claude.compose.screen.GeneratedDc1Screen
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
    qualifiers = "w592dp-h792dp-xhdpi" // 592x792dp @ 2x density = 1184x1584px (Daylight DC1 10.5in 4:3 native)
)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class GeneratedScreenScreenshotTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun renderAndExportGeneratedPreviewScreenshot() {
        composeTestRule.setContent {
            GeneratedDc1Screen()
        }

        composeTestRule.waitForIdle()

        val androidBitmap: Bitmap = try {
            composeTestRule.onRoot().captureToImage().asAndroidBitmap()
        } catch (t: Throwable) {
            captureComposeViewViaSkia()
        }

        val scaledBitmap = if (androidBitmap.width != 1184 || androidBitmap.height != 1584) {
            Bitmap.createScaledBitmap(androidBitmap, 1184, 1584, true)
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
            "Rendered generated preview image must contain rendered Compose UI elements (nonWhitePixels = $nonWhitePixels)",
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
            val outputFile = File(dir, "generated_preview.png")
            FileOutputStream(outputFile).use { out ->
                val compressed = scaledBitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                assertTrue("Bitmap compression to PNG failed", compressed)
            }
            if (primaryFile == null && outputFile.exists()) {
                primaryFile = outputFile
            }
        }

        assertTrue("Generated preview image file must exist", primaryFile != null && primaryFile.exists())
        assertTrue("Generated preview image file must not be empty", primaryFile!!.length() > 0)
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
}
