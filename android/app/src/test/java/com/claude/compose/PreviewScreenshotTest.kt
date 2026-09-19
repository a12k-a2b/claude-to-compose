package com.claude.compose

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.view.ViewGroup
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.dp
import com.claude.compose.screen.ClaudeDesignScreen
import com.claude.compose.screen.ClaudeDesignScreenPreview
import com.claude.compose.theme.AppTheme
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
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PreviewScreenshotTest {

    // Activity test rule providing createComposeRule() contract for headless rendering
    @get:Rule
    val composeTestRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun renderAndExportPreviewScreenshot() {
        composeTestRule.setContent {
            AppTheme(darkTheme = false) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.White)
                ) {
                    ClaudeDesignScreen()
                }
            }
        }

        // Wait for composition, layouts, and animations to stabilize
        composeTestRule.waitForIdle()

        // Capture root node to ImageBitmap -> Android Bitmap
        val imageBitmap = composeTestRule.onRoot().captureToImage()
        val androidBitmap = imageBitmap.asAndroidBitmap()

        // Output destination for verification suite
        val outputDirs = mutableListOf(
            File("build/outputs/preview")
        )
        if (File("app").isDirectory) {
            outputDirs.add(File("app/build/outputs/preview"))
        }

        var primaryFile: File? = null

        for (dir in outputDirs) {
            dir.mkdirs()
            val outputFile = File(dir, "rendered_preview.png")
            FileOutputStream(outputFile).use { out ->
                val compressed = androidBitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                assertTrue("Bitmap compression to PNG failed", compressed)
            }
            if (primaryFile == null && outputFile.exists()) {
                primaryFile = outputFile
            }
        }

        assertTrue("Rendered preview image file must exist", primaryFile != null && primaryFile.exists())
        assertTrue("Rendered preview image file must not be empty", primaryFile!!.length() > 0)
    }

    /**
     * Extension function that renders the Compose root hierarchy into an [ImageBitmap]
     * using Robolectric's native Skia graphics engine. This bypasses the single-threaded
     * looper deadlock in WindowCapture.forceRedraw and delivers 100% reliable headless rendering.
     */
    private fun SemanticsNodeInteraction.captureToImage(): ImageBitmap {
        val activity = composeTestRule.activity
        val composeView = activity.findViewById<ViewGroup>(android.R.id.content)
        val width = composeView.width.coerceAtLeast(1080)
        val height = composeView.height.coerceAtLeast(2400)
        composeView.measure(
            View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY)
        )
        composeView.layout(0, 0, width, height)

        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(android.graphics.Color.WHITE)
        composeView.draw(canvas)
        return bitmap.asImageBitmap()
    }
}
